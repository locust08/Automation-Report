"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRightIcon, CalendarIcon, PlusIcon, RefreshCwIcon, RocketIcon } from "lucide-react";

import { ReportShell } from "@/components/reporting/report-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AuthRole } from "@/lib/auth/roles";
import type { CampaignPlanAction, CampaignPlanDetail, CampaignPlanningListPayload, CampaignPlatform } from "@/lib/campaign-planning/types";

type FormState = {
  clientName: string; platform: CampaignPlatform; accountId: string; packageId: string;
  campaignName: string; objective: string; destination: string; startDate: string; endDate: string; allocation: string;
  platformConfig: Record<string, string>;
};

const initialForm: FormState = {
  clientName: "", platform: "google", accountId: "", packageId: "", campaignName: "",
  objective: "Conversions", destination: "https://example.com", startDate: "2026-08-22", endDate: "2026-09-21", allocation: "5000",
  platformConfig: defaultPlatformConfig("google"),
};

export function CampaignsPageClient({ initialRole }: { initialRole: AuthRole }) {
  const [data, setData] = useState<CampaignPlanningListPayload | null>(null);
  const [selected, setSelected] = useState<CampaignPlanDetail | null>(null);
  const [filter, setFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = initialRole === "admin";

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch("/api/campaign-planning", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load campaigns.");
    setData(payload);
  }, []);

  useEffect(() => { void load().catch((reason) => setError(reason.message)); }, [load]);

  async function openPlan(id: number) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/campaign-planning/${id}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load campaign.");
      setSelected(payload);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load campaign."); }
    finally { setBusy(false); }
  }

  async function createPlan(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const response = await fetch("/api/campaign-planning", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, accountId: Number(form.accountId), packageId: Number(form.packageId), allocationMicros: Math.round(Number(form.allocation) * 1_000_000) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to create campaign.");
      setShowCreate(false); setForm(initialForm); await load(); setSelected(payload);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create campaign."); }
    finally { setBusy(false); }
  }

  async function runAction(action: CampaignPlanAction) {
    if (!selected || !window.confirm(`${actionLabel(action)}? This changes only local mock data.`)) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/campaign-planning/${selected.plan.id}/actions`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, lockVersion: selected.plan.lockVersion }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to update campaign.");
      setSelected(payload); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update campaign."); }
    finally { setBusy(false); }
  }

  const campaigns = useMemo(() => data?.campaigns.filter((item) => filter === "all" || item.status === filter) ?? [], [data, filter]);
  const accounts = data?.accounts.filter((item) => item.platform === form.platform) ?? [];
  const selectedAccount = accounts.find((item) => String(item.id) === form.accountId);
  const packages = data?.packages.filter((item) => !selectedAccount || (item.clientName === selectedAccount.clientName && item.currency === selectedAccount.currency)) ?? [];

  return (
    <ReportShell title="Campaign Planning" dateLabel="Local working model" initialRole={initialRole} reportReady={Boolean(data)}>
      <div className="space-y-5 py-6">
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          <strong>Local demo — no ads are created.</strong> Data is stored in a local SQLite database; Gate actions only simulate provider progress.
        </div>
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Summary label="Total" value={data?.summary.total ?? 0} />
          <Summary label="Draft" value={data?.summary.draft ?? 0} />
          <Summary label="Awaiting approval" value={data?.summary.awaitingApproval ?? 0} />
          <Summary label="Approved / launching" value={data?.summary.approvedOrLaunching ?? 0} />
          <Summary label="Launched" value={data?.summary.launched ?? 0} />
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div><CardTitle>Campaigns</CardTitle><CardDescription>Google, Meta, and TikTok planning records.</CardDescription></div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}><RefreshCwIcon /> Refresh</Button>
              {isAdmin ? <Button size="sm" onClick={() => setShowCreate((value) => !value)}><PlusIcon /> New campaign</Button> : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {["all", "draft", "awaiting_approval", "approved", "launch_in_progress", "launched"].map((value) => (
                <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)}>{humanize(value)}</Button>
              ))}
            </div>
            {showCreate && data ? <CreateForm form={form} setForm={setForm} accounts={accounts} packages={packages} busy={busy} submit={createPlan} /> : null}
            <div className="grid gap-3 lg:grid-cols-2">
              {campaigns.map((campaign) => (
                <button key={campaign.id} onClick={() => void openPlan(campaign.id)} className="rounded-xl border bg-white p-4 text-left transition hover:border-red-300 hover:shadow-sm">
                  <div className="flex items-start justify-between gap-4"><div><p className="font-semibold">{campaign.campaignName}</p><p className="mt-1 text-sm text-muted-foreground">{campaign.clientName} · {campaign.accountName}</p></div><Badge variant="outline">{humanize(campaign.status)}</Badge></div>
                  <div className="mt-4 flex items-center justify-between text-sm"><span className="uppercase tracking-wide text-muted-foreground">{campaign.platform}</span><span>{money(campaign.allocationMicros, campaign.currency)}</span></div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {selected ? <CampaignDetail detail={selected} isAdmin={isAdmin} busy={busy} onAction={runAction} /> : null}
      </div>
    </ReportShell>
  );
}

function Summary({ label, value }: { label: string; value: number }) { return <Card size="sm"><CardContent><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>; }

function CreateForm({ form, setForm, accounts, packages, busy, submit }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; accounts: CampaignPlanningListPayload["accounts"]; packages: CampaignPlanningListPayload["packages"]; busy: boolean; submit: (event: React.FormEvent) => void }) {
  const input = (key: "campaignName" | "destination" | "allocation") => ({ value: form[key], onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value })) });
  const setConfig = (key: string, value: string) => setForm((current) => ({ ...current, platformConfig: { ...current.platformConfig, [key]: value } }));
  const config = platformFields(form.platform);
  return <form onSubmit={submit} className="rounded-xl border bg-slate-50 p-4">
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Field label="Platform"><ShadcnSelect value={form.platform} placeholder="Select platform" options={[{ value: "google", label: "Google Ads" }, { value: "meta", label: "Meta Ads" }, { value: "tiktok", label: "TikTok Ads" }]} onChange={(value) => { const platform = value as CampaignPlatform; setForm((current) => ({ ...current, platform, accountId: "", packageId: "", clientName: "", objective: platformObjectives(platform)[0].value, platformConfig: defaultPlatformConfig(platform) })); }} /></Field>
      <Field label="Account"><ShadcnSelect value={form.accountId} placeholder="Select account" options={accounts.map((item) => ({ value: String(item.id), label: item.accountName }))} onChange={(value) => { const account = accounts.find((item) => String(item.id) === value); setForm((current) => ({ ...current, accountId: value, packageId: "", clientName: account?.clientName ?? "" })); }} /></Field>
      <Field label="Budget package"><ShadcnSelect value={form.packageId} placeholder="Select package" options={packages.map((item) => ({ value: String(item.id), label: `${item.name} · ${money(item.remainingMicros, item.currency)} available` }))} onChange={(value) => setForm((current) => ({ ...current, packageId: value }))} /></Field>
      <Field label="Client"><Input value={form.clientName} readOnly placeholder="Selected from account" className="bg-slate-100" /></Field>
      <Field label="Campaign name"><Input required {...input("campaignName")} /></Field>
      <Field label="Objective"><ShadcnSelect value={form.objective} placeholder="Select objective" options={platformObjectives(form.platform)} onChange={(value) => setForm((current) => ({ ...current, objective: value }))} /></Field>
      <Field label="Destination URL"><Input required type="url" {...input("destination")} /></Field>
      <Field label="Start date"><DatePickerField value={form.startDate} onChange={(value) => setForm((current) => ({ ...current, startDate: value }))} /></Field>
      <Field label="End date"><DatePickerField value={form.endDate} onChange={(value) => setForm((current) => ({ ...current, endDate: value }))} /></Field>
      <Field label="Allocation"><Input required type="number" min="1" step="0.01" {...input("allocation")} /></Field>
      {config.map((item) => <Field key={item.key} label={item.label}><ShadcnSelect value={form.platformConfig[item.key] ?? ""} placeholder={`Select ${item.label.toLowerCase()}`} options={item.options} onChange={(value) => setConfig(item.key, value)} /></Field>)}
    </div>
    <Button className="mt-5 h-11 w-full" disabled={busy || !form.accountId || !form.packageId}>Create local draft</Button>
  </form>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }

function ShadcnSelect({ value, placeholder, options, onChange }: { value: string; placeholder: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <Select value={value || undefined} onValueChange={onChange}><SelectTrigger className="w-full bg-white"><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent position="popper" align="start">{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>;
}

function DatePickerField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;
  return <Popover><PopoverTrigger asChild><Button type="button" variant="outline" className="w-full justify-start bg-white font-normal"><CalendarIcon />{selected ? selected.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" }) : "Pick a date"}</Button></PopoverTrigger><PopoverContent align="start" className="w-auto p-0"><Calendar mode="single" selected={selected} onSelect={(date) => { if (date) onChange(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`); }} /></PopoverContent></Popover>;
}

function CampaignDetail({ detail, isAdmin, busy, onAction }: { detail: CampaignPlanDetail; isAdmin: boolean; busy: boolean; onAction: (action: CampaignPlanAction) => void }) {
  const next = nextAction(detail.plan.status, detail.build?.status ?? null);
  return <Card><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{detail.plan.campaignName}</CardTitle><CardDescription>{detail.plan.platform.toUpperCase()} · Revision {detail.currentRevision.revisionNo} · Lock {detail.plan.lockVersion}</CardDescription></div><Badge>{humanize(detail.plan.status)}</Badge></div></CardHeader>
    <CardContent className="space-y-5">
      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><Fact label="Objective" value={detail.plan.objective} /><Fact label="Flight" value={`${detail.plan.startDate} → ${detail.plan.endDate}`} /><Fact label="Budget" value={money(detail.plan.allocationMicros, detail.plan.currency)} /><Fact label="Destination" value={detail.plan.destination} /></div>
      {isAdmin && next ? <Button disabled={busy} onClick={() => onAction(next)}><RocketIcon /> {actionLabel(next)} <ArrowRightIcon /></Button> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Approval" rows={detail.approval ? [`Decision: ${detail.approval.decision}`, `By: ${detail.approval.approvedByEmail}`, `Expires: ${detail.approval.expiresAt}`] : ["Not approved"]} />
        <Panel title="Build & resources" rows={[`Build: ${detail.build ? humanize(detail.build.status) : "Not created"}`, ...detail.resources.map((item) => `${item.logicalResourceKey}: ${item.providerResourceId || "pending"}`)]} />
        <Panel title="Handoff" rows={detail.handoff ? [`Campaign: ${detail.handoff.providerCampaignId}`, ...detail.handoff.providerChildIds] : ["Not available"]} />
      </div>
      <Panel title="Audit trail" rows={detail.auditEvents.slice(0, 8).map((item) => `${new Date(item.createdAt).toLocaleString()} — ${humanize(item.eventType)} (${item.actorEmail})`)} />
    </CardContent>
  </Card>;
}

function Panel({ title, rows }: { title: string; rows: string[] }) { return <div className="rounded-xl border bg-slate-50 p-4"><p className="font-medium">{title}</p><div className="mt-2 space-y-1 text-sm text-muted-foreground">{rows.map((row, index) => <p key={`${row}-${index}`} className="break-all">{row}</p>)}</div></div>; }
function Fact({ label, value }: { label: string; value: string }) { return <div><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 break-all font-medium">{value}</p></div>; }
function humanize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function money(micros: number, currency: string) { return new Intl.NumberFormat("en-MY", { style: "currency", currency }).format(micros / 1_000_000); }
function actionLabel(action: CampaignPlanAction) { return ({ save_revision: "Save revision", submit: "Submit for approval", approve: "Approve & prepare build", simulate_gate_1: "Run demo Gate 1", simulate_gate_2: "Run demo Gate 2", create_handoff: "Create local handoff" })[action]; }
function nextAction(status: string, buildStatus: string | null): CampaignPlanAction | null {
  if (status === "draft") return "submit"; if (status === "awaiting_approval") return "approve";
  if (status === "approved" && buildStatus === "pending_gate_1") return "simulate_gate_1";
  if (status === "launch_in_progress" && buildStatus === "ready_to_deliver") return "simulate_gate_2";
  if (status === "launch_in_progress" && buildStatus === "verified") return "create_handoff";
  return null;
}

function platformObjectives(platform: CampaignPlatform) {
  if (platform === "meta") return [{ value: "Sales", label: "Sales" }, { value: "Leads", label: "Leads" }, { value: "Traffic", label: "Traffic" }, { value: "Engagement", label: "Engagement" }, { value: "Awareness", label: "Awareness" }];
  if (platform === "tiktok") return [{ value: "Traffic", label: "Traffic" }, { value: "Conversions", label: "Website conversions" }, { value: "Lead generation", label: "Lead generation" }, { value: "Reach", label: "Reach" }, { value: "Video views", label: "Video views" }];
  return [{ value: "Conversions", label: "Conversions" }, { value: "Sales", label: "Sales" }, { value: "Leads", label: "Leads" }, { value: "Traffic", label: "Website traffic" }, { value: "Awareness", label: "Awareness" }];
}

function defaultPlatformConfig(platform: CampaignPlatform): Record<string, string> {
  if (platform === "meta") return { buyingType: "auction", optimizationGoal: "lead_generation", conversionLocation: "website", specialAdCategory: "none" };
  if (platform === "tiktok") return { campaignType: "auction", objectiveType: "traffic", budgetMode: "daily", placementType: "automatic" };
  return { campaignType: "search", biddingStrategy: "maximize_conversions", networks: "search", language: "en" };
}

function platformFields(platform: CampaignPlatform) {
  if (platform === "meta") return [
    { key: "buyingType", label: "Buying type", options: [{ value: "auction", label: "Auction" }, { value: "reservation", label: "Reservation" }] },
    { key: "optimizationGoal", label: "Optimization goal", options: [{ value: "lead_generation", label: "Leads" }, { value: "offsite_conversions", label: "Conversions" }, { value: "link_clicks", label: "Link clicks" }, { value: "reach", label: "Reach" }] },
    { key: "conversionLocation", label: "Conversion location", options: [{ value: "website", label: "Website" }, { value: "instant_form", label: "Instant form" }, { value: "messaging", label: "Messaging apps" }, { value: "app", label: "App" }] },
    { key: "specialAdCategory", label: "Special ad category", options: [{ value: "none", label: "None" }, { value: "credit", label: "Credit" }, { value: "employment", label: "Employment" }, { value: "housing", label: "Housing" }, { value: "social_issues", label: "Social issues / politics" }] },
  ];
  if (platform === "tiktok") return [
    { key: "campaignType", label: "Campaign type", options: [{ value: "auction", label: "Auction" }, { value: "reach_frequency", label: "Reach & frequency" }] },
    { key: "objectiveType", label: "TikTok objective", options: [{ value: "traffic", label: "Traffic" }, { value: "web_conversions", label: "Website conversions" }, { value: "lead_generation", label: "Lead generation" }, { value: "reach", label: "Reach" }, { value: "video_views", label: "Video views" }] },
    { key: "budgetMode", label: "Budget mode", options: [{ value: "daily", label: "Daily budget" }, { value: "lifetime", label: "Lifetime budget" }] },
    { key: "placementType", label: "Placement type", options: [{ value: "automatic", label: "Automatic placement" }, { value: "tiktok_only", label: "TikTok only" }] },
  ];
  return [
    { key: "campaignType", label: "Campaign type", options: [{ value: "search", label: "Search" }, { value: "performance_max", label: "Performance Max" }, { value: "display", label: "Display" }, { value: "video", label: "Video" }, { value: "demand_gen", label: "Demand Gen" }] },
    { key: "biddingStrategy", label: "Bidding strategy", options: [{ value: "maximize_conversions", label: "Maximize conversions" }, { value: "maximize_conversion_value", label: "Maximize conversion value" }, { value: "maximize_clicks", label: "Maximize clicks" }, { value: "target_cpa", label: "Target CPA" }, { value: "target_roas", label: "Target ROAS" }] },
    { key: "networks", label: "Networks", options: [{ value: "search", label: "Google Search" }, { value: "search_partners", label: "Search + partners" }, { value: "all_google", label: "All eligible Google inventory" }] },
    { key: "language", label: "Language", options: [{ value: "en", label: "English" }, { value: "ms", label: "Malay" }, { value: "zh", label: "Chinese" }, { value: "all", label: "All languages" }] },
  ];
}
