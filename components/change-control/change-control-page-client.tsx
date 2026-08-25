"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangleIcon, CheckCircle2Icon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CircleSlash2Icon, PencilIcon, PlusIcon, RefreshCwIcon, Settings2Icon, ShieldCheckIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ReportShell } from "@/components/reporting/report-shell";
import { useWorkflowPolicies } from "@/components/workflow-settings/use-workflow-policies";
import { M03_STATUSES, type M03ChangeItemInput, type M03ChangeRequestDetail, type M03ChangeRequestSummary, type M03Platform, type M03RequestListPayload, type M03Status, type WorkflowSetting, type WorkflowSettingKind, type WorkflowSettingModule, type WorkflowSettingsPayload } from "@/lib/change-control/types";
import type { AuthRole } from "@/lib/auth/roles";
import type { M03ProviderWorkflowPreview } from "@/lib/change-control/provider-workflow";
import { approvalRequired } from "@/lib/workflow-settings/policy";
import type { MetaSynchronizedResource, MetaSynchronizedResourceType } from "@/lib/change-control/meta-resource-discovery";

const emptyItem = (): M03ChangeItemInput => ({ entity_type: "campaign", entity_identity: "", field_path: "", value_type: "string", baseline_value: "", proposed_value: "", evidence: {}, platform_resource_mapping: {} });
const emptyForm = () => ({ platform: "google" as M03Platform, title: "", reason: "", client_id: "", account_identity: "", campaign_identity: "", source_m04_plan_id: "", source_m04_revision_id: "", items: [emptyItem()] });
type RequestForm = ReturnType<typeof emptyForm>;

export function ChangeControlPageClient({ initialRole }: { initialRole: AuthRole }) {
  const workflowPolicies = useWorkflowPolicies();
  const m03ApprovalRequired = approvalRequired(workflowPolicies, "m03_change_control_approval");
  const [payload, setPayload] = useState<M03RequestListPayload | null>(null);
  const [detail, setDetail] = useState<M03ChangeRequestDetail | null>(null);
  const [providerPreview, setProviderPreview] = useState<M03ProviderWorkflowPreview | null>(null);
  const [providerPreviewError, setProviderPreviewError] = useState<string | null>(null);
  const [platform, setPlatform] = useState("all"); const [status, setStatus] = useState("all"); const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState<M03ChangeRequestSummary | null>(null); const [form, setForm] = useState<RequestForm>(emptyForm);
  const [settings, setSettings] = useState<WorkflowSettingsPayload | null>(null); const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const query = new URLSearchParams({ page: String(page) }); if (platform !== "all") query.set("platform", platform); if (status !== "all") query.set("status", status);
    try { setPayload(await api<M03RequestListPayload>(`/api/change-control/requests?${query}`)); }
    catch (caught) { setError(message(caught)); }
  }, [page, platform, status]);
  useEffect(() => { void load(); }, [load]);

  async function selectRequest(request: M03ChangeRequestSummary) {
    if (detail?.request.id === request.id) { setDetail(null); setProviderPreview(null); setProviderPreviewError(null); return; }
    setFormOpen(false); setEditing(null); setError(null);
    try {
      setProviderPreview(null); setProviderPreviewError(null);
      setDetail(await api<M03ChangeRequestDetail>(`/api/change-control/requests/${request.id}`));
      try { setProviderPreview(await api<M03ProviderWorkflowPreview>(`/api/change-control/requests/${request.id}/provider-preview`)); }
      catch (caught) { setProviderPreviewError(message(caught)); }
    } catch (caught) { setError(message(caught)); }
  }
  function openNew() { setDetail(null); setProviderPreview(null); setEditing(null); setForm(emptyForm()); setFormOpen((value) => !value); }
  function openEdit(request: M03ChangeRequestSummary) {
    if (!detail || detail.request.id !== request.id) return;
    setEditing(request); setFormOpen(true); setForm({
      platform: request.platform, title: request.title, reason: request.reason, client_id: request.client_id ?? "",
      account_identity: request.account_identity, campaign_identity: request.campaign_identity,
      source_m04_plan_id: request.source_m04_plan_id?.toString() ?? "", source_m04_revision_id: request.source_m04_revision_id?.toString() ?? "",
      items: detail.items.map((item) => ({ entity_type: item.entity_type, entity_identity: item.entity_identity, field_path: item.field_path, value_type: item.value_type, baseline_value: displayValue(item.baseline_value), proposed_value: displayValue(item.proposed_value), evidence: item.evidence, platform_resource_mapping: item.platform_resource_mapping })),
    });
  }
  async function saveRequest() {
    setBusy(true); setError(null);
    const body = serializeForm(form);
    try {
      const result = editing
        ? await api<{ request_id: string }>(`/api/change-control/requests/${editing.id}`, { method: "PATCH", body: JSON.stringify({ title: body.title, reason: body.reason, source_m04_plan_id: body.source_m04_plan_id, source_m04_revision_id: body.source_m04_revision_id, rollback_of_request_id: null, supersedes_request_id: null, items: body.items, expected_lock_version: editing.lock_version, idempotency_key: crypto.randomUUID() }) })
        : await api<{ request_id: string }>("/api/change-control/requests", { method: "POST", body: JSON.stringify({ ...body, workflow_mode: "mock", idempotency_key: crypto.randomUUID() }) });
      setFormOpen(false); setEditing(null); await load(); setDetail(await api<M03ChangeRequestDetail>(`/api/change-control/requests/${result.request_id}`));
    } catch (caught) { setError(message(caught)); } finally { setBusy(false); }
  }
  async function action(name: "validate" | "approve" | "cancel") {
    if (!detail) return; setBusy(true); setError(null);
    try { await api(`/api/change-control/requests/${detail.request.id}/${name}`, { method: "POST", body: JSON.stringify({ idempotency_key: crypto.randomUUID() }) }); setDetail(await api(`/api/change-control/requests/${detail.request.id}`)); await load(); }
    catch (caught) { setError(message(caught)); } finally { setBusy(false); }
  }
  async function loadSettings() { setSettingsOpen((value) => !value); if (!settings) try { setSettings(await api("/api/change-control/settings")); } catch (caught) { setError(message(caught)); } }

  return <ReportShell title="Change Control" dateLabel="M03 Provider-Ready Workflow" reportReady initialRole={initialRole}>
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <span className="flex items-center gap-2"><CircleSlash2Icon className="size-4" /> Provider publishing, retry, verification, and rollback remain locked.</span>
        <Link href="/campaigns" className="font-semibold underline underline-offset-4">Initial campaign setup →</Link>
      </div>
      {error ? <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
      <Summary payload={payload} />
      <Card className="gap-4 bg-white">
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><CardTitle>Change requests</CardTitle><CardDescription>Review cross-platform post-launch changes. Provider execution remains locked.</CardDescription></div>
            <div className="flex flex-wrap gap-2">
              <select aria-label="Platform filter" value={platform} onChange={(event) => { setPlatform(event.target.value); setPage(1); }} className="h-9 rounded-md border bg-white px-3 text-sm"><option value="all">All platforms</option><option value="google">Google</option><option value="meta">Meta</option><option value="tiktok">TikTok</option></select>
              <select aria-label="Status filter" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-9 rounded-md border bg-white px-3 text-sm"><option value="all">All statuses</option>{M03_STATUSES.map((value) => <option key={value}>{value}</option>)}</select>
              <Button variant="outline" onClick={() => void load()}><RefreshCwIcon /> Refresh</Button>
              <Button onClick={openNew}><PlusIcon /> New change request</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {payload?.requests.length ? payload.requests.map((request) => <div key={request.id} className="space-y-3">
            <button type="button" onClick={() => void selectRequest(request)} className={`grid w-full gap-3 rounded-xl border p-4 text-left transition hover:border-red-300 md:grid-cols-[1fr_auto] ${detail?.request.id === request.id ? "border-red-400 bg-red-50/30" : "bg-white"}`}>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{request.title}</span><Badge variant="outline">{request.platform.toUpperCase()}</Badge><StatusBadge status={request.status} /></div><p className="mt-1 text-sm text-muted-foreground">{request.account_identity} · {request.campaign_identity}</p><p className="mt-2 line-clamp-2 text-sm">{request.reason}</p></div>
              <div className="text-right text-xs text-muted-foreground"><p>Version {request.lock_version}</p><p>{formatTime(request.updated_at)}</p></div>
            </button>
            {detail?.request.id === request.id ? <RequestDetail detail={detail} providerPreview={providerPreview} providerPreviewError={providerPreviewError} busy={busy} approvalRequired={m03ApprovalRequired} onEdit={() => openEdit(request)} onAction={action} /> : null}
          </div>) : <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No change requests match these filters.</div>}
          <div className="flex items-center justify-between border-t pt-4 text-sm"><span>{payload?.pagination.total ?? 0} requests · up to 10 per page</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={!payload || page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeftIcon /> Previous</Button><span>Page {payload?.pagination.page ?? 1} of {payload?.pagination.total_pages ?? 1}</span><Button size="sm" variant="outline" disabled={!payload || page >= payload.pagination.total_pages} onClick={() => setPage((value) => value + 1)}>Next <ChevronRightIcon /></Button></div></div>
        </CardContent>
      </Card>
      {formOpen ? <RequestEditor form={form} setForm={setForm} editing={editing} busy={busy} onClose={() => { setFormOpen(false); setEditing(null); }} onSave={() => void saveRequest()} /> : null}
      <Collapsible open={settingsOpen} onOpenChange={() => void loadSettings()}>
        <Card className="gap-0 bg-white"><CollapsibleTrigger asChild><button className="flex w-full items-center justify-between px-6 py-5 text-left"><span><span className="flex items-center gap-2 font-semibold"><Settings2Icon className="size-4" /> Workflow access settings</span><span className="mt-1 block text-sm text-muted-foreground">Admin recovery controls for M03/M04 domains and trusted networks.</span></span><ChevronDownIcon className={`size-5 transition ${settingsOpen ? "rotate-180" : ""}`} /></button></CollapsibleTrigger><CollapsibleContent><CardContent className="border-t pt-5">{settings ? <SettingsPanel settings={settings} onChanged={async () => setSettings(await api("/api/change-control/settings"))} /> : <p className="text-sm text-muted-foreground">Loading settings…</p>}</CardContent></CollapsibleContent></Card>
      </Collapsible>
    </div>
  </ReportShell>;
}

function Summary({ payload }: { payload: M03RequestListPayload | null }) {
  const cards = [["All requests", payload?.summary.all ?? 0], ["Draft", payload?.summary.draft ?? 0], ["Awaiting approval", payload?.summary.awaiting_approval ?? 0], ["Approved", payload?.summary.approved ?? 0], ["Cancelled", payload?.summary.cancelled ?? 0]];
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{cards.map(([label, value]) => <Card key={String(label)} size="sm" className="gap-1 bg-white"><CardContent><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>)}</div>;
}

function RequestEditor({ form, setForm, editing, busy, onClose, onSave }: { form: RequestForm; setForm: React.Dispatch<React.SetStateAction<RequestForm>>; editing: M03ChangeRequestSummary | null; busy: boolean; onClose: () => void; onSave: () => void }) {
  const set = (key: keyof RequestForm, value: RequestForm[keyof RequestForm]) => setForm((current) => ({ ...current, [key]: value }));
  const updateItem = (index: number, patch: Partial<M03ChangeItemInput>) => setForm((current) => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
  return <Card className="bg-white"><CardHeader className="border-b"><div className="flex items-start justify-between"><div><CardTitle>{editing ? "Edit change request" : "New change request"}</CardTitle><CardDescription>{editing ? "Only draft requests can be edited; identity stays fixed." : "Create a reviewed provider-ready request. Nothing is sent while execution is locked."}</CardDescription></div><Button size="icon" variant="ghost" onClick={onClose}><XIcon /><span className="sr-only">Close</span></Button></div></CardHeader><CardContent className="space-y-5">
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-950"><p className="font-medium">Post-launch changes only</p><p className="mt-1">Enter both M04 IDs for an exact verified launch handoff. Leave both blank only to adopt an existing provider campaign after a fresh official baseline check. New campaigns belong in <Link href="/campaigns" className="font-semibold underline">Campaign Planning &amp; Launch</Link>.</p></div>
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Field label="Platform"><select disabled={Boolean(editing)} value={form.platform} onChange={(event) => set("platform", event.target.value)} className="h-9 w-full rounded-md border bg-white px-3 text-sm disabled:bg-muted"><option value="google">Google Ads</option><option value="meta">Meta Ads</option><option value="tiktok">TikTok Ads</option></select></Field>
      <Field label="Account identity"><Input disabled={Boolean(editing)} className="bg-white disabled:bg-muted" value={form.account_identity} onChange={(event) => set("account_identity", event.target.value)} /></Field>
      <Field label="Campaign identity"><Input disabled={Boolean(editing)} className="bg-white disabled:bg-muted" value={form.campaign_identity} onChange={(event) => set("campaign_identity", event.target.value)} /></Field>
      <Field label="Request title"><Input className="bg-white" value={form.title} onChange={(event) => set("title", event.target.value)} /></Field>
      <Field label="M04 plan ID (optional)"><Input className="bg-white" inputMode="numeric" value={form.source_m04_plan_id} onChange={(event) => set("source_m04_plan_id", event.target.value)} /></Field>
      <Field label="M04 revision ID (optional)"><Input className="bg-white" inputMode="numeric" value={form.source_m04_revision_id} onChange={(event) => set("source_m04_revision_id", event.target.value)} /></Field>
      <div className="md:col-span-2"><Field label="Reason"><Textarea className="min-h-24 resize-none bg-white" value={form.reason} onChange={(event) => set("reason", event.target.value)} /></Field></div>
    </div>
    {form.platform === "meta" && !editing ? <MetaResourcePicker accountIdentity={form.account_identity} campaignIdentity={form.campaign_identity} onSelect={(resource) => {
      setForm((current) => ({ ...current, campaign_identity: resource.type === "campaign" ? resource.id : current.campaign_identity, items: current.items.map((item, index) => index === 0 ? { ...item, entity_type: resource.type === "ad_set" ? "ad_set" : resource.type, entity_identity: resource.id, platform_resource_mapping: { ...item.platform_resource_mapping, account_id: current.account_identity.replace(/^act_/, ""), ...(resource.type === "ad_set" ? { ad_set_id: resource.id } : {}), ...(resource.type === "ad" && resource.parent_id ? { ad_set_id: resource.parent_id } : {}) } } : item) }));
    }} /> : null}
    <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">Field changes</h3><Button size="sm" variant="outline" onClick={() => setForm((current) => ({ ...current, items: [...current.items, emptyItem()] }))}><PlusIcon /> Add field</Button></div>{form.items.map((item, index) => <div key={index} className="grid gap-3 rounded-xl border bg-slate-50 p-4 md:grid-cols-2 lg:grid-cols-4">
      <Field label="Entity"><Input className="bg-white" value={item.entity_type} onChange={(event) => updateItem(index, { entity_type: event.target.value })} /></Field><Field label="Entity identity"><Input className="bg-white" value={item.entity_identity} onChange={(event) => updateItem(index, { entity_identity: event.target.value })} /></Field><Field label="Field path">{form.platform === "meta" ? <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={item.field_path} onChange={(event) => updateItem(index, { field_path: event.target.value, value_type: metaFieldValueType(event.target.value) })}><option value="">Select a supported Meta field</option>{META_FIELD_OPTIONS.map(([group, fields]) => <optgroup key={group} label={group}>{fields.map((field) => <option key={field} value={field}>{field}</option>)}</optgroup>)}</select> : <Input className="bg-white" value={item.field_path} onChange={(event) => updateItem(index, { field_path: event.target.value })} />}</Field><Field label="Value type"><select value={item.value_type} onChange={(event) => updateItem(index, { value_type: event.target.value as M03ChangeItemInput["value_type"] })} className="h-9 w-full rounded-md border bg-white px-3 text-sm"><option>string</option><option>number</option><option>boolean</option><option>json</option><option>null</option></select></Field><div className="lg:col-span-2"><Field label="Baseline value"><Textarea className="h-24 resize-none bg-white" value={String(item.baseline_value ?? "")} onChange={(event) => updateItem(index, { baseline_value: event.target.value })} /></Field></div><div className="lg:col-span-2"><Field label="Proposed value"><Textarea className="h-24 resize-none bg-white" value={String(item.proposed_value ?? "")} onChange={(event) => updateItem(index, { proposed_value: event.target.value })} /></Field></div>{form.platform === "meta" && (item.field_path.startsWith("ad.copy.") || item.field_path.startsWith("ad.creative.")) ? <div className="grid gap-3 md:col-span-2 lg:col-span-4 md:grid-cols-3"><Field label="Meta ad set ID"><Input className="bg-white" value={String(item.platform_resource_mapping?.ad_set_id ?? "")} onChange={(event) => updateItem(index, { platform_resource_mapping: { ...item.platform_resource_mapping, account_id: form.account_identity.replace(/^act_/, ""), ad_set_id: event.target.value } })} /></Field><Field label="Facebook Page ID"><Input className="bg-white" value={String(item.platform_resource_mapping?.page_id ?? "")} onChange={(event) => updateItem(index, { platform_resource_mapping: { ...item.platform_resource_mapping, page_id: event.target.value } })} /></Field><Field label="Instagram identity ID (optional)"><Input className="bg-white" value={String(item.platform_resource_mapping?.instagram_actor_id ?? "")} onChange={(event) => updateItem(index, { platform_resource_mapping: { ...item.platform_resource_mapping, instagram_actor_id: event.target.value } })} /></Field></div> : null}{form.items.length > 1 ? <Button variant="ghost" className="text-red-700" onClick={() => setForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))}>Remove field</Button> : null}
    </div>)}</div>
    <div className="flex justify-end gap-2 border-t pt-5"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={onSave}>{editing ? "Save draft changes" : "Create change request"}</Button></div>
  </CardContent></Card>;
}

function MetaResourcePicker({ accountIdentity, campaignIdentity, onSelect }: { accountIdentity: string; campaignIdentity: string; onSelect: (resource: MetaSynchronizedResource) => void }) {
  const [type, setType] = useState<MetaSynchronizedResourceType>("campaign");
  const [parentIdentity, setParentIdentity] = useState("");
  const [search, setSearch] = useState("");
  const [resources, setResources] = useState<MetaSynchronizedResource[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function loadResources() {
    setBusy(true); setError(null);
    try {
      const query = new URLSearchParams({ account_identity: accountIdentity, type });
      if (search.trim()) query.set("search", search.trim());
      if (type !== "campaign" && (parentIdentity.trim() || campaignIdentity)) query.set("parent_identity", parentIdentity.trim() || campaignIdentity);
      const payload = await api<{ resources: MetaSynchronizedResource[] }>(`/api/change-control/meta/resources?${query}`);
      setResources(payload.resources);
    } catch (caught) { setError(message(caught)); } finally { setBusy(false); }
  }
  return <div className="rounded-xl border border-red-200 bg-red-50/40 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">Synchronized Meta resources</h3><p className="text-sm text-muted-foreground">Read official Meta identities and select the exact entity to change. This performs GET requests only.</p></div><Badge variant="outline">Provider mutations locked</Badge></div><div className="mt-4 grid gap-3 md:grid-cols-[160px_1fr_1fr_auto]"><select className="h-9 rounded-md border bg-white px-3 text-sm" value={type} onChange={(event) => setType(event.target.value as MetaSynchronizedResourceType)}><option value="campaign">Campaigns</option><option value="ad_set">Ad sets</option><option value="ad">Ads</option><option value="creative">Creatives</option></select><Input className="bg-white" placeholder="Search name or ID" value={search} onChange={(event) => setSearch(event.target.value)} /><Input className="bg-white" disabled={type === "campaign"} placeholder={type === "ad" ? "Ad set ID (optional)" : "Campaign ID (optional)"} value={parentIdentity} onChange={(event) => setParentIdentity(event.target.value)} /><Button variant="outline" disabled={busy || !accountIdentity.trim()} onClick={() => void loadResources()}><RefreshCwIcon /> {busy ? "Loading" : "Load"}</Button></div>{error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}{resources.length ? <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">{resources.map((resource) => <button type="button" key={`${resource.type}:${resource.id}`} onClick={() => onSelect(resource)} className="rounded-lg border bg-white p-3 text-left hover:border-red-300 hover:bg-red-50"><span className="block font-medium">{resource.name}</span><span className="mt-1 block text-xs text-muted-foreground">{resource.type.replaceAll("_", " ")} · {resource.id}{resource.status ? ` · ${resource.status}` : ""}</span></button>)}</div> : null}</div>;
}

function RequestDetail({ detail, providerPreview, providerPreviewError, busy, approvalRequired, onEdit, onAction }: { detail: M03ChangeRequestDetail; providerPreview: M03ProviderWorkflowPreview | null; providerPreviewError: string | null; busy: boolean; approvalRequired: boolean; onEdit: () => void; onAction: (name: "validate" | "approve" | "cancel") => Promise<void> }) {
  const request = detail.request; const revision = detail.revisions[0]; const approval = detail.approvals[0];
  return <div className="space-y-4 rounded-xl border bg-white p-4 md:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{request.title}</h3><p className="text-sm text-muted-foreground">Version {request.lock_version} · immutable revisions {detail.revisions.length}</p></div><div className="flex flex-wrap gap-2">{request.status === "draft" || request.status === "validation_failed" ? <><Button size="sm" variant="outline" onClick={onEdit}><PencilIcon /> Edit draft</Button><Button size="sm" disabled={busy} onClick={() => void onAction("validate")}><ShieldCheckIcon /> {approvalRequired ? "Validate" : "Validate and approve"}</Button></> : null}{approvalRequired && request.status === "awaiting_approval" ? <Button size="sm" disabled={busy} onClick={() => void onAction("approve")}><CheckCircle2Icon /> Approve</Button> : null}{!(["approved", "cancelled"] as string[]).includes(request.status) ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void onAction("cancel")}><XIcon /> Cancel</Button> : null}</div></div>
    <div className="grid gap-3 md:grid-cols-2">{detail.items.map((item) => <div key={item.id} className="rounded-xl border p-4"><div className="mb-3 flex items-center justify-between"><span className="font-medium">{item.field_path}</span><Badge variant="outline">{item.entity_type}</Badge></div><div className="grid gap-3 sm:grid-cols-2"><ValueBlock label="Baseline" value={item.baseline_value} /><ValueBlock label="Proposed" value={item.proposed_value} emphasis /></div></div>)}</div>
    <div className="grid gap-3 lg:grid-cols-3"><Info title="Validation" icon={detail.validations[0]?.result === "passed" ? <CheckCircle2Icon className="size-4 text-emerald-600" /> : <AlertTriangleIcon className="size-4 text-amber-600" />}><p>{detail.validations[0]?.result ?? "Not run"}</p>{detail.validations[0]?.issues.map((issue) => <p key={`${issue.path}:${issue.message}`} className="text-red-700">{issue.path}: {issue.message}</p>)}</Info><Info title="Immutable revision"><p className="break-all font-mono text-xs">{revision?.payload_hash ?? "Created after validation"}</p></Info><Info title="Approval"><p>{approval ? `Approved ${formatTime(approval.created_at)}` : "Not approved"}</p><p className="mt-1 text-amber-700">Provider execution locked</p></Info></div>
    <div className="grid gap-3 lg:grid-cols-2">
      <Info title="Post-launch source"><p>{detail.source_verification?.source_kind.replaceAll("_", " ") ?? "Not verified"}</p>{detail.source_verification?.source_revision_hash ? <p className="mt-1 break-all font-mono text-xs">{detail.source_verification.source_revision_hash}</p> : null}<p className="mt-1 text-muted-foreground">M04 records are read-only; legacy adoption requires an official provider baseline.</p></Info>
      <Info title="Baseline freshness & conflict">{providerPreviewError ? <p className="text-red-700">Official baseline unavailable: {providerPreviewError}</p> : <><p>Source: {providerPreview?.baseline.source.replaceAll("_", " ") ?? "Loading"}</p><p>Fresh: {providerPreview?.baseline_fresh ? "Yes" : "No"}</p><p>Matches reviewed baseline: {providerPreview?.baseline_matches_reviewed_values ? "Yes" : "No"}</p>{providerPreview?.conflict_issues.map((issue) => <p key={issue.path} className="mt-1 text-red-700">{issue.message}</p>)}</>}</Info>
      <Info title="Provider capability plan"><p>Registry version {providerPreview?.mutation_plan.capability_registry_version ?? "—"}</p><p>{providerPreview?.mutation_plan.operations.filter((operation) => operation.mode === "direct_update").length ?? 0} direct operations</p><p>{providerPreview?.mutation_plan.replacement_items.length ?? 0} provider-native creative replacements</p>{providerPreview?.capability_issues.map((issue) => <p key={issue.path} className="mt-1 text-red-700">{issue.message}</p>)}</Info>
    </div>
    <Info title="Execution attempts & replacement progress"><div className="space-y-2">{detail.resource_mappings.map((mapping) => <p key={mapping.id}>{mapping.provider_resource_type}: {mapping.replacement_stage.replaceAll("_", " ")}</p>)}{detail.operation_resources.map((resource) => <div key={resource.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"><span>{resource.resource_role.replaceAll("_", " ")}{resource.provider_resource_identity ? ` · ${resource.provider_resource_identity}` : ""}</span><Badge variant="outline">{resource.lifecycle_state.replaceAll("_", " ")}</Badge></div>)}{detail.attempts.map((attempt) => <p key={attempt.id}>Attempt {attempt.attempt_number} · {attempt.action} · {attempt.result.replaceAll("_", " ")}{attempt.replacement_stage ? ` · ${attempt.replacement_stage.replaceAll("_", " ")}` : ""}</p>)}{!detail.resource_mappings.length && !detail.operation_resources.length && !detail.attempts.length ? <p className="text-muted-foreground">No provider attempt has run. Successful replacement stages will be resumable and will not be recreated.</p> : null}</div></Info>
    <Info title="Audit history"><div className="space-y-2">{detail.events.map((event) => <div key={event.id} className="flex flex-wrap justify-between gap-2 border-b pb-2 last:border-0"><span>{event.event_type.replaceAll("_", " ")} {event.from_status ? `· ${event.from_status} → ${event.to_status}` : ""}</span><span className="text-muted-foreground">{event.actor_name ?? "System"} · {formatTime(event.created_at)}{event.trusted_ip ? ` · ${event.trusted_ip}` : ""}</span></div>)}</div></Info>
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4"><p className="font-medium text-amber-950">Provider execution locked</p><p className="mt-1 text-sm text-amber-900">Approved is not published, and published is not verified. A separate test-account pilot must enable deployment, platform/account allowlists, and exact revision selection.</p><div className="mt-3 flex flex-wrap gap-2">{["Publish", "Retry", "Verify", "Resolve conflict", "Create rollback"].map((label) => <Button key={label} size="sm" variant="outline" disabled title="Locked until a separately approved test-account pilot">{label}</Button>)}</div></div>
  </div>;
}

function SettingsPanel({ settings, onChanged }: { settings: WorkflowSettingsPayload; onChanged: () => Promise<void> }) {
  const groups: Array<[string, WorkflowSettingModule, WorkflowSettingKind, WorkflowSetting[]]> = [["M03 approved operator email domains", "m03", "operator_domain", settings.m03_operator_domains], ["M03 trusted networks", "m03", "trusted_network", settings.m03_trusted_networks], ["M04 approved destination domains", "m04", "destination_domain", settings.m04_destination_domains], ["M04 trusted networks", "m04", "trusted_network", settings.m04_trusted_networks]];
  return <div className="grid gap-4 lg:grid-cols-2">{groups.map(([title, module, kind, rows]) => <SettingGroup key={title} title={title} module={module} kind={kind} rows={rows} onChanged={onChanged} />)}</div>;
}
function SettingGroup({ title, module, kind, rows, onChanged }: { title: string; module: WorkflowSettingModule; kind: WorkflowSettingKind; rows: WorkflowSetting[]; onChanged: () => Promise<void> }) {
  const [value, setValue] = useState(""); const [label, setLabel] = useState(""); const [clientId, setClientId] = useState(""); const [error, setError] = useState<string | null>(null);
  async function mutate(setting: { value: string; label?: string | null; client_id?: string | null; is_active: boolean }) { setError(null); try { await api("/api/change-control/settings", { method: "PUT", body: JSON.stringify({ module, kind, ...setting, idempotency_key: crypto.randomUUID() }) }); await onChanged(); } catch (caught) { setError(message(caught)); } }
  return <div className="rounded-xl border p-4"><h3 className="font-semibold">{title}</h3><div className="mt-3 space-y-2">{rows.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"><div className="min-w-0"><p className="truncate font-medium">{row.value}</p><p className="text-xs text-muted-foreground">{row.label || row.client_id || "No label"}</p></div><Switch checked={row.is_active} onCheckedChange={(active) => void mutate({ value: row.value, label: row.label, client_id: row.client_id, is_active: active })} /></div>)}</div><div className="mt-4 grid gap-2"><Input className="bg-white" placeholder={kind === "trusted_network" ? "127.0.0.1/32" : "example.com"} value={value} onChange={(event) => setValue(event.target.value)} />{kind === "destination_domain" ? <Input className="bg-white" placeholder="Client UUID" value={clientId} onChange={(event) => setClientId(event.target.value)} /> : <Input className="bg-white" placeholder="Label (optional)" value={label} onChange={(event) => setLabel(event.target.value)} />}<Button size="sm" variant="outline" disabled={!value} onClick={() => void mutate({ value, label: label || null, client_id: clientId || null, is_active: true }).then(() => { setValue(""); setLabel(""); setClientId(""); })}><PlusIcon /> Add active setting</Button>{error ? <p className="text-xs text-red-700">{error}</p> : null}</div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function ValueBlock({ label, value, emphasis = false }: { label: string; value: unknown; emphasis?: boolean }) { return <div className={`min-h-24 rounded-lg border p-3 ${emphasis ? "border-red-200 bg-red-50" : "bg-slate-50"}`}><p className="text-xs uppercase text-muted-foreground">{label}</p><pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm">{displayValue(value)}</pre></div>; }
function Info({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) { return <div className="rounded-xl border p-4"><h4 className="mb-2 flex items-center gap-2 font-medium">{icon}{title}</h4><div className="text-sm">{children}</div></div>; }
function StatusBadge({ status }: { status: M03Status }) { const variant = status === "approved" ? "default" : status === "validation_failed" || status === "failed" ? "destructive" : "outline"; return <Badge variant={variant}>{status.replaceAll("_", " ")}</Badge>; }
function displayValue(value: unknown) { return typeof value === "string" ? value : JSON.stringify(value, null, 2); }
function parseValue(value: unknown, type: M03ChangeItemInput["value_type"]) { if (type === "null") return null; if (type === "number") return Number(value); if (type === "boolean") return String(value).toLowerCase() === "true"; if (type === "json") { try { return JSON.parse(String(value)); } catch { return value; } } return String(value ?? ""); }
function serializeForm(form: RequestForm) { return { platform: form.platform, title: form.title, reason: form.reason, client_id: form.client_id || null, account_identity: form.account_identity, campaign_identity: form.campaign_identity, source_m04_plan_id: form.source_m04_plan_id ? Number(form.source_m04_plan_id) : null, source_m04_revision_id: form.source_m04_revision_id ? Number(form.source_m04_revision_id) : null, rollback_of_request_id: null, supersedes_request_id: null, items: form.items.map((item) => ({ ...item, baseline_value: parseValue(item.baseline_value, item.value_type), proposed_value: parseValue(item.proposed_value, item.value_type) })) }; }
function formatTime(value: string) { return value ? new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—"; }
async function api<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...init?.headers } }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Request failed."); return payload as T; }
function message(error: unknown) { return error instanceof Error ? error.message : "Something went wrong."; }

const META_FIELD_OPTIONS: Array<[string, string[]]> = [
  ["Campaign", ["campaign.name", "campaign.status", "campaign.budget.daily", "campaign.budget.lifetime", "campaign.bid.strategy"]],
  ["Ad set", ["ad_set.name", "ad_set.status", "ad_set.budget.daily", "ad_set.budget.lifetime", "ad_set.schedule.start_time", "ad_set.schedule.end_time", "ad_set.bid.strategy", "ad_set.bid.amount", "ad_set.billing_event", "ad_set.optimization_goal", "ad_set.attribution.spec", "ad_set.targeting.geo_locations", "ad_set.placements.publisher_platforms", "ad_set.promoted_object.pixel_id", "ad_set.promoted_object.custom_event_type"]],
  ["Ad", ["ad.name", "ad.status"]],
  ["Creative replacement", ["ad.copy.primary_text", "ad.copy.headline", "ad.copy.description", "ad.creative.call_to_action", "ad.creative.destination_url", "ad.creative.image_reference", "ad.creative.video_reference", "ad.creative.facebook_page_identity", "ad.creative.instagram_identity", "ad.creative.carousel_cards", "ad.creative.existing_post_reference"]],
];

function metaFieldValueType(path: string): M03ChangeItemInput["value_type"] {
  if (path.includes("budget") || path.endsWith("bid.amount")) return "number";
  if (path.includes("targeting") || path.includes("placements") || path.endsWith("attribution.spec") || path.endsWith("carousel_cards")) return "json";
  return "string";
}
