"use client";

import Link from "next/link";
import { PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { M03GoogleResourcePicker, M03MetaResourcePicker, M03TikTokResourcePicker } from "@/components/change-control/m03-resource-pickers";
import { M03_META_CHANGE_FIELDS } from "@/lib/change-control/meta-capability-registry";
import { M03_GOOGLE_CHANGE_FIELDS } from "@/lib/change-control/google-capability-registry";
import { M03_TIKTOK_CHANGE_FIELDS } from "@/lib/change-control/tiktok-capability-registry";
import { buildGoogleManagementChangeItem, refreshGoogleManagementFormFromResource, validateGoogleManagementRequestForm, type M03GoogleManagementResource } from "@/lib/change-control/google-management-builder";
import {
  buildMetaManagementChangeItem,
  refreshMetaManagementFormFromResource,
  validateMetaManagementRequestForm,
  type M03MetaManagementResource,
} from "@/lib/change-control/meta-management-builder";
import {
  buildTikTokManagementChangeItem,
  refreshTikTokManagementFormFromResource,
  validateTikTokManagementRequestForm,
  type M03TikTokManagementResource,
} from "@/lib/change-control/tiktok-management-builder";
import { createEmptyM03ChangeItem, validateM03RequestFormValues, type M03EditorReconciliation, type M03RequestForm, type M03WorkspaceScope } from "@/lib/change-control/workspace";
import type { M03ChangeItemInput, M03ChangeRequestSummary, M03Platform } from "@/lib/change-control/types";

export type M03RequestEditorProps = {
  form: M03RequestForm;
  setForm: React.Dispatch<React.SetStateAction<M03RequestForm>>;
  editing: M03ChangeRequestSummary | null;
  reconciliation?: M03EditorReconciliation | null;
  scope?: M03WorkspaceScope;
  busy: boolean;
  canSave: boolean;
  sourceEvidenceError?: string | null;
  baselineConflict?: boolean;
  onClose: () => void;
  onReloadLatest: () => void;
  onSave: () => void;
  metaManagement?: M03MetaManagementEditorContext;
  googleManagement?: M03GoogleManagementEditorContext;
  tiktokManagement?: M03TikTokManagementEditorContext;
};

export type M03MetaManagementEditorContext = {
  accountIdentity: string;
  accountName: string;
  resource: M03MetaManagementResource | null;
  resourceIssue?: string | null;
  onRefreshOfficialData: () => M03MetaManagementResource | null | Promise<M03MetaManagementResource | null>;
};

export type M03GoogleManagementEditorContext = {
  accountIdentity: string;
  accountName: string;
  resource: M03GoogleManagementResource | null;
  resourceIssue?: string | null;
  onRefreshOfficialData: () => M03GoogleManagementResource | null | Promise<M03GoogleManagementResource | null>;
};

export type M03TikTokManagementEditorContext = {
  accountIdentity: string;
  accountName: string;
  resource: M03TikTokManagementResource | null;
  resourceIssue?: string | null;
  onRefreshOfficialData: () => M03TikTokManagementResource | null | Promise<M03TikTokManagementResource | null>;
};

export function M03RequestEditor({ form, setForm, editing, reconciliation, scope = {}, busy, canSave, sourceEvidenceError, baselineConflict = false, onClose, onReloadLatest, onSave, metaManagement, googleManagement, tiktokManagement }: M03RequestEditorProps) {
  const set = <K extends keyof M03RequestForm>(key: K, value: M03RequestForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const updateItem = (index: number, patch: Partial<M03ChangeItemInput>) => setForm((current) => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
  const fixedIdentity = Boolean(editing);
  const metaIssues = metaManagement ? validateMetaManagementRequestForm(form, { officialResource: metaManagement.resource }) : [];
  const googleIssues = googleManagement ? validateGoogleManagementRequestForm(form, googleManagement.resource) : [];
  const tiktokIssues = tiktokManagement ? validateTikTokManagementRequestForm(form, tiktokManagement.resource) : [];
  const editorIssues = [...metaIssues, ...googleIssues, ...tiktokIssues, ...validateM03RequestFormValues(form)].filter((issue, index, issues) => issues.indexOf(issue) === index);
  const managed = Boolean(metaManagement || googleManagement || tiktokManagement);
  const managedResource = metaManagement?.resource ?? googleManagement?.resource ?? tiktokManagement?.resource;
  const baselineUnavailable = Boolean(metaManagement?.resourceIssue || googleManagement?.resourceIssue || tiktokManagement?.resourceIssue) || [...metaIssues, ...googleIssues, ...tiktokIssues].some((issue) => issue.includes("Official baseline unavailable"));

  function addItem() {
    if (!managed) {
      setForm((current) => ({ ...current, items: [...current.items, createEmptyM03ChangeItem()] }));
      return;
    }
    const resource = managedResource;
    if (!resource) return;
    const used = new Set(form.items.map((item) => item.field_path));
    const registry = metaManagement ? M03_META_CHANGE_FIELDS : googleManagement ? M03_GOOGLE_CHANGE_FIELDS : M03_TIKTOK_CHANGE_FIELDS;
    const field = registry.find((candidate) => candidate.entity_type === resource.entityType && !used.has(candidate.field_path))
      ?? registry.find((candidate) => candidate.entity_type === resource.entityType);
    if (!field) return;
    const item = metaManagement
      ? buildMetaManagementChangeItem({ ...metaManagement, resource: resource as M03MetaManagementResource, fieldPath: field.field_path })
      : googleManagement
        ? buildGoogleManagementChangeItem({ ...googleManagement, resource: resource as M03GoogleManagementResource, fieldPath: field.field_path })
        : buildTikTokManagementChangeItem({ ...tiktokManagement!, resource: resource as M03TikTokManagementResource, fieldPath: field.field_path });
    setForm((current) => ({ ...current, items: [...current.items, item] }));
  }

  function changeItemField(index: number, fieldPath: string, valueType: M03ChangeItemInput["value_type"]) {
    if (!managed) {
      updateItem(index, { field_path: fieldPath, value_type: valueType });
      return;
    }
    const resource = managedResource;
    if (!resource) return;
    const item = metaManagement
      ? buildMetaManagementChangeItem({ ...metaManagement, resource: resource as M03MetaManagementResource, fieldPath })
      : googleManagement
        ? buildGoogleManagementChangeItem({ ...googleManagement, resource: resource as M03GoogleManagementResource, fieldPath })
        : buildTikTokManagementChangeItem({ ...tiktokManagement!, resource: resource as M03TikTokManagementResource, fieldPath });
    setForm((current) => ({ ...current, items: current.items.map((currentItem, itemIndex) => itemIndex === index ? item : currentItem) }));
  }

  async function refreshOfficialData() {
    const context = metaManagement ?? googleManagement ?? tiktokManagement;
    if (!context) return;
    const resource = await context.onRefreshOfficialData();
    if (!resource) return;
    setForm((current) => metaManagement
      ? refreshMetaManagementFormFromResource(current, { accountIdentity: metaManagement.accountIdentity, accountName: metaManagement.accountName, resource: resource as M03MetaManagementResource })
      : googleManagement
        ? refreshGoogleManagementFormFromResource(current, { accountIdentity: googleManagement.accountIdentity, accountName: googleManagement.accountName, resource: resource as M03GoogleManagementResource })
        : refreshTikTokManagementFormFromResource(current, { accountIdentity: tiktokManagement!.accountIdentity, accountName: tiktokManagement!.accountName, resource: resource as M03TikTokManagementResource }));
  }

  return <Card className="bg-white"><CardHeader className="border-b"><div className="flex items-start justify-between"><div><CardTitle>{editing ? "Edit change request" : "New change request"}</CardTitle><CardDescription>{editing ? "Only draft requests can be edited; identity stays fixed." : "Create a reviewed provider-ready request. Nothing is sent while execution is locked."}</CardDescription></div><Button size="icon" variant="ghost" onClick={onClose}><XIcon /><span className="sr-only">Close</span></Button></div></CardHeader><CardContent className="space-y-5">
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-950"><p className="font-medium">Post-launch changes only</p><p className="mt-1">Enter both M04 IDs for an exact verified launch handoff. Leave both blank only to adopt an existing provider campaign after a fresh official baseline check. New campaigns belong in <Link href="/campaigns" className="font-semibold underline">Campaign Planning &amp; Launch</Link>.</p></div>
    {reconciliation ? <div role="alert" className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">A newer request version must be reconciled</p><p className="mt-1">{reconciliation.message} Your unsaved form and original version {reconciliation.originalLockVersion} are preserved. Saving is blocked until you reload the latest version.</p><Button className="mt-3" size="sm" variant="outline" disabled={busy} onClick={onReloadLatest}>Reload latest version</Button><p className="mt-2 text-xs">Reloading discards all unsaved form changes and replaces them with the latest server version.</p></div> : null}
    {sourceEvidenceError ? <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{sourceEvidenceError}</p> : null}
    {baselineConflict && managed ? <div role="alert" className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-3 text-sm text-amber-950"><p className="font-semibold">Official provider data changed</p><p className="mt-1">Refresh official data and review every read-only baseline. Your title, reason, proposed values, and M04 evidence remain in the form.</p><Button className="mt-3" type="button" size="sm" variant="outline" disabled={busy} onClick={() => void refreshOfficialData()}>Refresh official data</Button></div> : null}
    {editorIssues.length ? <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950"><p className="font-semibold">Complete the request before saving</p><ul className="mt-2 list-disc space-y-1 pl-5">{editorIssues.map((issue, index) => <li key={`${issue}:${index}`}>{issue}</li>)}</ul>{baselineUnavailable ? <Button className="mt-3" type="button" size="sm" variant="outline" disabled={busy} onClick={() => void refreshOfficialData()}>Refresh official data</Button> : null}</div> : null}
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Field label="Platform"><select disabled={fixedIdentity || Boolean(scope.platform)} value={form.platform} onChange={(event) => set("platform", event.target.value as M03Platform)} className="h-9 w-full rounded-md border bg-white px-3 text-sm disabled:bg-muted"><option value="google">Google Ads</option><option value="meta">Meta Ads</option><option value="tiktok">TikTok Ads</option></select></Field>
      <Field label="Account identity"><Input disabled={fixedIdentity || Boolean(scope.accountIdentity)} className="bg-white disabled:bg-muted" value={form.accountIdentity} onChange={(event) => set("accountIdentity", event.target.value)} /></Field>
      <Field label="Campaign identity"><Input disabled={fixedIdentity || Boolean(scope.campaignIdentity)} className="bg-white disabled:bg-muted" value={form.campaignIdentity} onChange={(event) => set("campaignIdentity", event.target.value)} /></Field>
      <Field label="Request title"><Input className="bg-white" value={form.title} onChange={(event) => set("title", event.target.value)} /></Field>
      <Field label="M04 plan ID (optional)"><Input disabled={fixedIdentity} className="bg-white disabled:bg-muted" inputMode="numeric" value={form.sourceM04PlanId} onChange={(event) => set("sourceM04PlanId", event.target.value)} /></Field>
      <Field label="M04 revision ID (optional)"><Input disabled={fixedIdentity} className="bg-white disabled:bg-muted" inputMode="numeric" value={form.sourceM04RevisionId} onChange={(event) => set("sourceM04RevisionId", event.target.value)} /></Field>
      <div className="md:col-span-2"><Field label="Reason"><Textarea className="min-h-24 resize-none bg-white" value={form.reason} onChange={(event) => set("reason", event.target.value)} /></Field></div>
    </div>
    {!editing && !managed ? <ResourcePicker form={form} setForm={setForm} /> : null}
    <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">Field changes</h3><Button size="sm" variant="outline" disabled={Boolean(managed && !managedResource)} onClick={addItem}><PlusIcon /> Add field</Button></div>
      {form.items.map((item, index) => <div key={index} className="grid gap-3 rounded-xl border bg-slate-50 p-4 md:grid-cols-2 lg:grid-cols-4">
        <Field label="Entity"><Input disabled={managed} className="bg-white disabled:bg-muted" value={item.entity_type} onChange={(event) => updateItem(index, { entity_type: event.target.value })} /></Field>
        <Field label="Entity identity"><Input disabled={managed} className="bg-white disabled:bg-muted" value={item.entity_identity} onChange={(event) => updateItem(index, { entity_identity: event.target.value })} /></Field>
        <Field label="Field path"><FieldPathSelect platform={form.platform} item={item} entityType={managedResource?.entityType ?? (managed ? item.entity_type : undefined)} disabled={Boolean(managed && !managedResource)} onChange={(fieldPath, valueType) => changeItemField(index, fieldPath, valueType)} /></Field>
        <Field label="Value type"><select disabled={managed} value={item.value_type} onChange={(event) => updateItem(index, { value_type: event.target.value as M03ChangeItemInput["value_type"] })} className="h-9 w-full rounded-md border bg-white px-3 text-sm disabled:bg-muted"><option>string</option><option>number</option><option>boolean</option><option>json</option><option>null</option></select></Field>
        <div className="lg:col-span-2"><Field label={managed ? "Official baseline (read-only)" : "Baseline value"}><Textarea readOnly={managed} className="h-24 resize-none bg-white read-only:bg-muted" value={displayEditorValue(item.baseline_value)} onChange={(event) => updateItem(index, { baseline_value: event.target.value })} /></Field></div>
        <div className="lg:col-span-2"><Field label="Proposed value"><Textarea className="h-24 resize-none bg-white" value={displayEditorValue(item.proposed_value)} onChange={(event) => updateItem(index, { proposed_value: event.target.value })} /></Field></div>
        <ResourceMappingFields platform={form.platform} accountIdentity={form.accountIdentity} item={item} readOnly={managed} onChange={(mapping) => updateItem(index, { platform_resource_mapping: mapping })} />
        {form.items.length > 1 ? <Button variant="ghost" className="text-red-700" onClick={() => setForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))}>Remove field</Button> : null}
      </div>)}
    </div>
    <div className="flex justify-end gap-2 border-t pt-5"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy || !canSave} onClick={onSave}>{editing ? "Save draft changes" : "Create change request"}</Button></div>
  </CardContent></Card>;
}

function ResourcePicker({ form, setForm }: { form: M03RequestForm; setForm: React.Dispatch<React.SetStateAction<M03RequestForm>> }) {
  if (form.platform === "google") return <M03GoogleResourcePicker accountIdentity={form.accountIdentity} campaignIdentity={form.campaignIdentity} onSelect={(resource) => setForm((current) => ({ ...current, campaignIdentity: resource.campaign_id, items: current.items.map((item, index) => index === 0 ? { ...item, entity_type: resource.type, entity_identity: resource.id, platform_resource_mapping: { ...item.platform_resource_mapping, customer_id: current.accountIdentity, campaign_id: resource.campaign_id, ...(resource.type === "ad_group" ? { ad_group_id: resource.id } : {}), ...(resource.type === "ad" && resource.parent_id ? { ad_group_id: resource.parent_id, ad_id: resource.id } : {}) } } : item) }))} />;
  if (form.platform === "meta") return <M03MetaResourcePicker accountIdentity={form.accountIdentity} campaignIdentity={form.campaignIdentity} onSelect={(resource) => setForm((current) => ({ ...current, campaignIdentity: resource.type === "campaign" ? resource.id : current.campaignIdentity, items: current.items.map((item, index) => index === 0 ? { ...item, entity_type: resource.type === "ad_set" ? "ad_set" : resource.type, entity_identity: resource.id, platform_resource_mapping: { ...item.platform_resource_mapping, account_id: current.accountIdentity.replace(/^act_/, ""), ...(resource.type === "ad_set" ? { ad_set_id: resource.id } : {}), ...(resource.type === "ad" && resource.parent_id ? { ad_set_id: resource.parent_id } : {}) } } : item) }))} />;
  return <M03TikTokResourcePicker accountIdentity={form.accountIdentity} campaignIdentity={form.campaignIdentity} onSelect={(resource) => setForm((current) => ({ ...current, campaignIdentity: resource.type === "campaign" ? resource.id : current.campaignIdentity, items: current.items.map((item, index) => index === 0 ? { ...item, entity_type: resource.type === "ad_group" ? "ad_group" : resource.type, entity_identity: resource.id, platform_resource_mapping: { ...item.platform_resource_mapping, advertiser_id: current.accountIdentity, ...(resource.type === "ad_group" ? { adgroup_id: resource.id } : {}), ...(resource.type === "ad" && resource.parent_id ? { adgroup_id: resource.parent_id } : {}), ...(resource.type === "identity" ? { identity_id: resource.id } : {}), ...(resource.type === "video" ? { video_id: resource.id } : {}), ...(resource.type === "pixel" ? { pixel_code: resource.id } : {}) } } : item) }))} />;
}

function FieldPathSelect({ platform, item, entityType, disabled = false, onChange }: { platform: M03Platform; item: M03ChangeItemInput; entityType?: string; disabled?: boolean; onChange: (fieldPath: string, valueType: M03ChangeItemInput["value_type"]) => void }) {
  if (platform === "meta") {
    const entities = entityType ? [entityType] : ["campaign", "ad_set", "ad"];
    return <select disabled={disabled} className="h-9 w-full rounded-md border bg-white px-3 text-sm disabled:bg-muted" value={item.field_path} onChange={(event) => { const field = M03_META_CHANGE_FIELDS.find((candidate) => candidate.field_path === event.target.value); onChange(event.target.value, field?.value_type ?? "string"); }}><option value="">Select a supported Meta field</option>{entities.map((entity) => <optgroup key={entity} label={entity.replaceAll("_", " ")}>{M03_META_CHANGE_FIELDS.filter((field) => field.entity_type === entity).map((field) => <option key={field.field_path} value={field.field_path}>{field.label} · {field.field_path}</option>)}</optgroup>)}</select>;
  }
  if (platform === "google") {
    const fields = entityType ? M03_GOOGLE_CHANGE_FIELDS.filter((field) => field.entity_type === entityType) : M03_GOOGLE_CHANGE_FIELDS;
    return <select disabled={disabled} className="h-9 w-full rounded-md border bg-white px-3 text-sm disabled:bg-muted" value={item.field_path} onChange={(event) => { const field = M03_GOOGLE_CHANGE_FIELDS.find((candidate) => candidate.field_path === event.target.value); onChange(event.target.value, field?.value_type ?? "string"); }}><option value="">Select a supported Google field</option>{fields.map((field) => <option key={field.field_path} value={field.field_path}>{field.label} · {field.field_path}</option>)}</select>;
  }
  const fields = entityType ? M03_TIKTOK_CHANGE_FIELDS.filter((field) => field.entity_type === entityType) : M03_TIKTOK_CHANGE_FIELDS;
  return <select disabled={disabled} className="h-9 w-full rounded-md border bg-white px-3 text-sm disabled:bg-muted" value={item.field_path} onChange={(event) => { const field = M03_TIKTOK_CHANGE_FIELDS.find((candidate) => candidate.field_path === event.target.value); onChange(event.target.value, field?.value_type ?? "string"); }}><option value="">Select a supported TikTok field</option>{fields.map((field) => <option key={field.field_path} value={field.field_path}>{field.label} · {field.field_path}</option>)}</select>;
}

function ResourceMappingFields({ platform, accountIdentity, item, readOnly = false, onChange }: { platform: M03Platform; accountIdentity: string; item: M03ChangeItemInput; readOnly?: boolean; onChange: (mapping: Record<string, unknown>) => void }) {
  const mapping = item.platform_resource_mapping ?? {};
  if (platform === "meta" && isCreativeField(item.field_path)) return <div className="grid gap-3 md:col-span-2 lg:col-span-4 md:grid-cols-3"><Field label="Meta ad set ID"><Input readOnly={readOnly} className="bg-white read-only:bg-muted" value={String(mapping.ad_set_id ?? "")} onChange={(event) => onChange({ ...mapping, account_id: accountIdentity.replace(/^act_/, ""), ad_set_id: event.target.value })} /></Field><Field label="Facebook Page ID"><Input readOnly={readOnly} className="bg-white read-only:bg-muted" value={String(mapping.page_id ?? "")} onChange={(event) => onChange({ ...mapping, page_id: event.target.value })} /></Field><Field label="Instagram identity ID (optional)"><Input readOnly={readOnly} className="bg-white read-only:bg-muted" value={String(mapping.instagram_actor_id ?? "")} onChange={(event) => onChange({ ...mapping, instagram_actor_id: event.target.value })} /></Field></div>;
  if (platform === "tiktok" && isCreativeField(item.field_path)) return <div className="grid gap-3 md:col-span-2 lg:col-span-4 md:grid-cols-4"><Field label="TikTok ad group ID"><Input readOnly={readOnly} className="bg-white read-only:bg-muted" value={String(mapping.adgroup_id ?? "")} onChange={(event) => onChange({ ...mapping, advertiser_id: accountIdentity, adgroup_id: event.target.value })} /></Field><Field label="Identity ID"><Input readOnly={readOnly} className="bg-white read-only:bg-muted" value={String(mapping.identity_id ?? "")} onChange={(event) => onChange({ ...mapping, identity_id: event.target.value })} /></Field><Field label="Video ID"><Input readOnly={readOnly} className="bg-white read-only:bg-muted" value={String(mapping.video_id ?? "")} onChange={(event) => onChange({ ...mapping, video_id: event.target.value })} /></Field><Field label="Approved final status"><select disabled={readOnly} className="h-9 w-full rounded-md border bg-white px-3 text-sm disabled:bg-muted" value={String(mapping.intended_status ?? "DISABLE")} onChange={(event) => onChange({ ...mapping, creative_mode: "REGULAR", intended_status: event.target.value })}><option value="DISABLE">Disabled</option><option value="ENABLE">Enabled</option></select></Field></div>;
  return null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function displayEditorValue(value: unknown) { return typeof value === "string" ? value : JSON.stringify(value, null, 2); }
function isCreativeField(path: string) { return path.startsWith("ad.copy.") || path.startsWith("ad.creative."); }
