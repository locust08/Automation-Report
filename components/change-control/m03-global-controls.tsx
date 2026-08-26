"use client";

import { useEffect, useState } from "react";
import { ChevronDownIcon, PlusIcon, RefreshCwIcon, Settings2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { M03ValueBlock } from "@/components/change-control/m03-request-detail";
import { formatM03Time } from "@/components/change-control/m03-request-list";
import { requestM03Api } from "@/lib/change-control/workspace";
import type { WorkflowSetting, WorkflowSettingKind, WorkflowSettingModule, WorkflowSettingsPayload } from "@/lib/change-control/types";

type LegacyGoogleRequest = { id: string; title: string; status: string; account_id: string; updated_at: string; created_by_name?: string; version?: number };
type LegacyGoogleDetail = LegacyGoogleRequest & { reason?: string; ads_field_changes?: Array<{ id: string; field_label: string; baseline_value: unknown; proposed_value: unknown; publish_status?: string; verification_status?: string }>; ads_change_set_revisions?: Array<{ id: string; version: number; payload_hash: string; created_at: string }>; ads_change_approvals?: Array<{ id: string; payload_hash?: string; created_at: string; approved_by_name?: string }>; ads_change_events?: Array<{ id: string; event_type: string; created_at: string; actor_name?: string }> };

export function M03LegacyGoogleHistory({ initialAccountId, initialRequestId }: { initialAccountId: string; initialRequestId: string }) {
  const [open, setOpen] = useState(Boolean(initialAccountId || initialRequestId));
  const [accountId, setAccountId] = useState(initialAccountId);
  const [rows, setRows] = useState<LegacyGoogleRequest[]>([]);
  const [selected, setSelected] = useState<LegacyGoogleDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function loadLegacy() {
    setBusy(true); setError(null);
    try {
      const payload = await requestM03Api<{ requests?: LegacyGoogleRequest[]; changeSets?: LegacyGoogleRequest[] }>(`/api/ads-management/change-requests?accountId=${encodeURIComponent(accountId)}`);
      setRows(payload.requests ?? payload.changeSets ?? []);
    } catch { setError("Unable to load legacy history."); }
    finally { setBusy(false); }
  }
  async function selectLegacy(id: string) {
    if (selected?.id === id) { setSelected(null); return; }
    setBusy(true); setError(null);
    try { setSelected(await requestM03Api<LegacyGoogleDetail>(`/api/ads-management/change-requests/${id}`)); }
    catch { setError("Unable to load legacy history."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!initialRequestId) return;
    let active = true;
    setBusy(true); setError(null);
    void requestM03Api<LegacyGoogleDetail>(`/api/ads-management/change-requests/${initialRequestId}`).then((next) => { if (active) setSelected(next); }).catch(() => { if (active) setError("Unable to load legacy history."); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [initialRequestId]);

  return <Collapsible open={open} onOpenChange={setOpen}><Card className="gap-0 bg-white"><CollapsibleTrigger asChild><button className="flex w-full items-center justify-between px-6 py-5 text-left"><span><span className="font-semibold">Legacy Google history</span><span className="mt-1 block text-sm text-muted-foreground">Read-only requests created before Google changes moved to M03.</span></span><ChevronDownIcon className={`size-5 transition ${open ? "rotate-180" : ""}`} /></button></CollapsibleTrigger><CollapsibleContent><CardContent className="space-y-4 border-t pt-5"><div className="flex flex-wrap gap-2"><Input className="max-w-sm bg-white" placeholder="Google Ads customer ID" value={accountId} onChange={(event) => setAccountId(event.target.value)} /><Button variant="outline" disabled={busy || !accountId.trim()} onClick={() => void loadLegacy()}><RefreshCwIcon /> {busy ? "Loading" : "Load history"}</Button></div>{error ? <p className="text-sm text-red-700">{error}</p> : null}{rows.length ? <div className="divide-y rounded-xl border">{rows.map((row) => <button type="button" key={row.id} onClick={() => void selectLegacy(row.id)} className="grid w-full gap-2 p-4 text-left hover:bg-red-50 sm:grid-cols-[1fr_auto]"><div><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{row.title}</span><Badge variant="outline">Legacy · {row.status.replaceAll("_", " ")}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{row.created_by_name || "Unknown operator"} · immutable history preserved</p></div><span className="text-xs text-muted-foreground">{formatM03Time(row.updated_at)}</span></button>)}</div> : !busy && !error ? <p className="text-sm text-muted-foreground">Enter an account ID to view preserved legacy Google requests.</p> : null}{selected ? <div className="space-y-3 rounded-xl border bg-slate-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">{selected.title}</h4><Badge variant="outline">Read only</Badge></div><div className="grid gap-3 md:grid-cols-2">{selected.ads_field_changes?.map((field) => <div key={field.id} className="rounded-lg border bg-white p-3"><p className="font-medium">{field.field_label}</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><M03ValueBlock label="Baseline" value={field.baseline_value} /><M03ValueBlock label="Proposed" value={field.proposed_value} emphasis /></div><p className="mt-2 text-xs text-muted-foreground">Publish: {field.publish_status || "not run"} · Verification: {field.verification_status || "not run"}</p></div>)}</div>{selected.ads_change_set_revisions?.map((revision) => <p key={revision.id} className="break-all font-mono text-xs">Revision {revision.version}: {revision.payload_hash}</p>)}{selected.ads_change_approvals?.map((approval) => <p key={approval.id} className="text-sm">Approved by {approval.approved_by_name || "operator"} · {formatM03Time(approval.created_at)}</p>)}{selected.ads_change_events?.map((event) => <p key={event.id} className="text-sm">{event.event_type.replaceAll("_", " ")} · {event.actor_name || "System"} · {formatM03Time(event.created_at)}</p>)}</div> : null}</CardContent></CollapsibleContent></Card></Collapsible>;
}

export function M03WorkflowSettings() {
  const [settings, setSettings] = useState<WorkflowSettingsPayload | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    setOpen((value) => !value);
    if (!settings) try { setSettings(await requestM03Api("/api/change-control/settings")); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load workflow settings."); }
  }
  return <Collapsible open={open} onOpenChange={() => void toggle()}><Card className="gap-0 bg-white"><CollapsibleTrigger asChild><button className="flex w-full items-center justify-between px-6 py-5 text-left"><span><span className="flex items-center gap-2 font-semibold"><Settings2Icon className="size-4" /> Workflow access settings</span><span className="mt-1 block text-sm text-muted-foreground">Admin recovery controls for M03 operator domains and M04 launch access.</span></span><ChevronDownIcon className={`size-5 transition ${open ? "rotate-180" : ""}`} /></button></CollapsibleTrigger><CollapsibleContent><CardContent className="border-t pt-5">{error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}{settings ? <SettingsPanel settings={settings} onChanged={async () => setSettings(await requestM03Api("/api/change-control/settings"))} /> : <p className="text-sm text-muted-foreground">Loading settings…</p>}</CardContent></CollapsibleContent></Card></Collapsible>;
}

function SettingsPanel({ settings, onChanged }: { settings: WorkflowSettingsPayload; onChanged: () => Promise<void> }) {
  const groups: Array<[string, WorkflowSettingModule, WorkflowSettingKind, WorkflowSetting[]]> = [["M03 approved operator email domains", "m03", "operator_domain", settings.m03_operator_domains], ["M04 approved destination domains", "m04", "destination_domain", settings.m04_destination_domains], ["M04 trusted networks", "m04", "trusted_network", settings.m04_trusted_networks]];
  return <div className="grid gap-4 lg:grid-cols-2">{groups.map(([title, module, kind, rows]) => <SettingGroup key={title} title={title} module={module} kind={kind} rows={rows} onChanged={onChanged} />)}</div>;
}

function SettingGroup({ title, module, kind, rows, onChanged }: { title: string; module: WorkflowSettingModule; kind: WorkflowSettingKind; rows: WorkflowSetting[]; onChanged: () => Promise<void> }) {
  const [value, setValue] = useState(""); const [label, setLabel] = useState(""); const [clientId, setClientId] = useState(""); const [error, setError] = useState<string | null>(null);
  async function mutate(setting: { value: string; label?: string | null; client_id?: string | null; is_active: boolean }) { setError(null); try { await requestM03Api("/api/change-control/settings", { method: "PUT", body: JSON.stringify({ module, kind, ...setting, idempotency_key: crypto.randomUUID() }) }); await onChanged(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update setting."); } }
  return <div className="rounded-xl border p-4"><h3 className="font-semibold">{title}</h3><div className="mt-3 space-y-2">{rows.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"><div className="min-w-0"><p className="truncate font-medium">{row.value}</p><p className="text-xs text-muted-foreground">{row.label || row.client_id || "No label"}</p></div><Switch checked={row.is_active} onCheckedChange={(active) => void mutate({ value: row.value, label: row.label, client_id: row.client_id, is_active: active })} /></div>)}</div><div className="mt-4 grid gap-2"><Input className="bg-white" placeholder={kind === "trusted_network" ? "127.0.0.1/32" : "example.com"} value={value} onChange={(event) => setValue(event.target.value)} />{kind === "destination_domain" ? <Input className="bg-white" placeholder="Client UUID" value={clientId} onChange={(event) => setClientId(event.target.value)} /> : <Input className="bg-white" placeholder="Label (optional)" value={label} onChange={(event) => setLabel(event.target.value)} />}<Button size="sm" variant="outline" disabled={!value} onClick={() => void mutate({ value, label: label || null, client_id: clientId || null, is_active: true }).then(() => { setValue(""); setLabel(""); setClientId(""); })}><PlusIcon /> Add active setting</Button>{error ? <p className="text-xs text-red-700">{error}</p> : null}</div></div>;
}
