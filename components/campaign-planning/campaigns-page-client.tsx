"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarIcon, DatabaseIcon, PlusIcon, RefreshCwIcon } from "lucide-react";

import { ReportShell } from "@/components/reporting/report-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AuthRole } from "@/lib/auth/roles";
import type {
  CampaignDatabaseConnection,
  CampaignPlanDetail,
  CampaignPlanningListPayload,
  CampaignPlatform,
} from "@/lib/campaign-planning/types";

type FormState = {
  platform: CampaignPlatform;
  accountId: string;
  packageId: string;
  campaignName: string;
  objective: string;
  destination: string;
  startDate: string;
  endDate: string;
  allocatedBudget: string;
  trackingTemplate: string;
  campaignType: string;
  biddingStrategy: string;
  targetCpa: string;
  targetRoas: string;
  searchPartners: string;
  locations: string;
  languages: string;
  conversionActionId: string;
  conversionCategory: string;
  groupName: string;
  keywords: string;
  optimizationGoal: string;
  billingEvent: string;
  pixelId: string;
  conversionEvent: string;
  placementMode: string;
  manualPlacements: string;
  countries: string;
  ageMin: string;
  ageMax: string;
  genders: string;
  interests: string;
  operatingSystems: string;
  creativeFormat: string;
  assetIds: string;
  primaryText: string;
  headline: string;
  descriptions: string;
  businessName: string;
  callToAction: string;
  identityName: string;
};

const baseForm: FormState = {
  platform: "google",
  accountId: "",
  packageId: "",
  campaignName: "",
  objective: "leads",
  destination: "https://example.test/landing",
  startDate: "2026-08-22",
  endDate: "2026-09-21",
  allocatedBudget: "5000",
  trackingTemplate: "{lpurl}?utm_source=m04_stage2",
  campaignType: "search",
  biddingStrategy: "target_cpa",
  targetCpa: "50",
  targetRoas: "",
  searchPartners: "false",
  locations: "MY-KUL, MY-SEL",
  languages: "en, ms",
  conversionActionId: "mock-conversion-action",
  conversionCategory: "submit_lead_form",
  groupName: "Core intent",
  keywords: "stage two campaign, local campaign draft",
  optimizationGoal: "offsite_conversions",
  billingEvent: "impressions",
  pixelId: "mock-pixel-id",
  conversionEvent: "lead",
  placementMode: "automatic",
  manualPlacements: "facebook_feed, instagram_feed",
  countries: "MY",
  ageMin: "21",
  ageMax: "55",
  genders: "all",
  interests: "business software",
  operatingSystems: "android, ios",
  creativeFormat: "responsive_search_ad",
  assetIds: "mock-image-1, mock-image-2, mock-image-3",
  primaryText: "Planned locally. No provider calls are made.",
  headline: "Local Stage 2 campaign",
  descriptions: "A validated campaign draft, Stored only in local Supabase",
  businessName: "Stage 2 Business",
  callToAction: "learn_more",
  identityName: "Stage 2 Business",
};

export function CampaignsPageClient({ initialRole }: { initialRole: AuthRole }) {
  const [data, setData] = useState<CampaignPlanningListPayload | null>(null);
  const [connection, setConnection] = useState<CampaignDatabaseConnection>({ status: "disconnected", label: "CRM08 Supabase" });
  const [selected, setSelected] = useState<CampaignPlanDetail | null>(null);
  const [platformFilter, setPlatformFilter] = useState<"all" | CampaignPlatform>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<FormState>(baseForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = initialRole === "admin";

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch("/api/campaign-planning", { cache: "no-store" });
    const payload = await response.json();
    if (payload.connection) setConnection(payload.connection);
    if (!response.ok) throw new Error(payload.error || "Unable to connect to local Supabase.");
    setData(payload);
  }, []);

  useEffect(() => { void load().catch((reason) => setError(errorMessage(reason))); }, [load]);

  async function openPlan(id: number) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaign-planning/${id}`, { cache: "no-store" });
      const payload = await response.json();
      if (payload.connection) setConnection(payload.connection);
      if (!response.ok) throw new Error(payload.error || "Unable to load the campaign draft.");
      setSelected(payload);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function runMockWorkflow(id: number) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/campaign-planning/${id}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "run_full_mock" }) });
      const payload = await response.json() as CampaignPlanDetail & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Mock workflow failed.");
      setSelected(payload); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Mock workflow failed."); }
    finally { setBusy(false); }
  }

  async function createDraft(event: React.FormEvent) {
    event.preventDefault();
    const account = data?.accounts.find((item) => String(item.id) === form.accountId);
    if (!account) return setError("Select a local mock ad account.");
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/campaign-planning", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildDraftRequest(form, account)),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to create the draft.");
      setSelected(payload);
      setShowCreate(false);
      setForm((current) => platformForm(current.platform));
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const accounts = data?.accounts.filter((item) => item.platform === form.platform) ?? [];
  const selectedAccount = accounts.find((item) => String(item.id) === form.accountId);
  const packages = data?.packages.filter((item) => !selectedAccount || (
    item.clientId === selectedAccount.clientId && item.currency === selectedAccount.currency
  )) ?? [];
  const campaigns = useMemo(() => data?.campaigns.filter((item) => (
    platformFilter === "all" || item.platform === platformFilter
  )) ?? [], [data, platformFilter]);

  return (
    <ReportShell title="Campaign Planning" dateLabel="CRM08 Mock Workflow" initialRole={initialRole} reportReady={Boolean(data)}>
      <div className="space-y-5 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          <div><strong>CRM08 Supabase — Mock workflow, no provider calls.</strong> All simulated provider identifiers use the <code>mock-</code> prefix.</div>
          <Badge variant="outline" className={connection.status === "connected" ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-800"}>
            <DatabaseIcon /> {connection.status === "connected" ? `Connected · ${connection.label}` : "Database disconnected"}
          </Badge>
        </div>
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Summary label="Total drafts" value={data?.summary.total ?? 0} />
          <Summary label="Draft" value={data?.summary.draft ?? 0} />
          <Summary label="Google" value={data?.summary.google ?? 0} />
          <Summary label="Meta" value={data?.summary.meta ?? 0} />
          <Summary label="TikTok" value={data?.summary.tiktok ?? 0} />
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div><CardTitle>Campaign drafts</CardTitle><CardDescription>Validated shared revisions with one platform-specific detail row.</CardDescription></div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void load()}><RefreshCwIcon /> Refresh</Button>
              {isAdmin ? <Button type="button" size="sm" onClick={() => setShowCreate((value) => !value)}><PlusIcon /> New campaign</Button> : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(["all", "google", "meta", "tiktok"] as const).map((value) => (
                <Button key={value} type="button" size="sm" variant={platformFilter === value ? "default" : "outline"} onClick={() => setPlatformFilter(value)}>{humanize(value)}</Button>
              ))}
            </div>
            {showCreate && data ? <CreateForm form={form} setForm={setForm} accounts={accounts} packages={packages} busy={busy} submit={createDraft} /> : null}
            <div className="grid gap-3 lg:grid-cols-2">
              {campaigns.map((campaign) => (
                <button key={campaign.id} type="button" onClick={() => void openPlan(campaign.id)} className="rounded-xl border bg-white p-4 text-left transition hover:border-red-300 hover:shadow-sm">
                  <div className="flex items-start justify-between gap-4"><div><p className="font-semibold">{campaign.campaignName}</p><p className="mt-1 text-sm text-muted-foreground">{campaign.clientName} · {campaign.accountName}</p></div><Badge variant="outline">{humanize(campaign.status)}</Badge></div>
                  <div className="mt-4 flex items-center justify-between text-sm"><span className="uppercase tracking-wide text-muted-foreground">{campaign.platform}</span><span>{money(campaign.allocatedBudget, campaign.currency)}</span></div>
                </button>
              ))}
              {!campaigns.length ? <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No Stage 2 drafts yet.</p> : null}
            </div>
          </CardContent>
        </Card>

        {selected ? <CampaignDetail detail={selected} busy={busy} runMockWorkflow={runMockWorkflow} /> : null}
      </div>
    </ReportShell>
  );
}

function CreateForm({ form, setForm, accounts, packages, busy, submit }: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  accounts: CampaignPlanningListPayload["accounts"];
  packages: CampaignPlanningListPayload["packages"];
  busy: boolean;
  submit: (event: React.FormEvent) => void;
}) {
  const set = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const account = accounts.find((item) => String(item.id) === form.accountId);
  return (
    <form onSubmit={submit} className="rounded-xl border bg-slate-50 p-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Field label="Platform"><Choice value={form.platform} options={PLATFORM_OPTIONS} onChange={(value) => setForm(platformForm(value as CampaignPlatform))} /></Field>
        <Field label="Local mock account"><Choice value={form.accountId} placeholder="Select account" options={accounts.map((item) => ({ value: String(item.id), label: item.accountName }))} onChange={(value) => setForm((current) => ({ ...current, accountId: value, packageId: "" }))} /></Field>
        <Field label="Budget package"><Choice value={form.packageId} placeholder="Select package" options={packages.map((item) => ({ value: String(item.id), label: `${item.name} · ${money(item.remainingAmount, item.currency)} available` }))} onChange={(value) => set("packageId", value)} /></Field>
        <Field label="Client"><Input value={account?.clientName ?? ""} readOnly className="bg-slate-100" placeholder="Selected from account" /></Field>
        <Field label="Campaign name"><Input required value={form.campaignName} onChange={(event) => set("campaignName", event.target.value)} /></Field>
        <Field label="Objective"><Choice value={form.objective} options={objectiveOptions(form.platform)} onChange={(value) => setForm((current) => objectiveForm(current, value))} /></Field>
        <Field label="Destination URL"><Input required type="url" value={form.destination} onChange={(event) => set("destination", event.target.value)} /></Field>
        <Field label="Start date"><DatePickerField value={form.startDate} onChange={(value) => set("startDate", value)} /></Field>
        <Field label="End date"><DatePickerField value={form.endDate} onChange={(value) => set("endDate", value)} /></Field>
        <Field label={`Allocated budget${account ? ` (${account.currency})` : ""}`}><Input required type="number" min="1" step="0.01" value={form.allocatedBudget} onChange={(event) => set("allocatedBudget", event.target.value)} /></Field>
        <Field label="Tracking template"><Input value={form.trackingTemplate} onChange={(event) => set("trackingTemplate", event.target.value)} /></Field>
        {form.platform === "google" ? <GoogleFields form={form} set={set} setForm={setForm} /> : null}
        {form.platform === "meta" ? <MetaFields form={form} set={set} /> : null}
        {form.platform === "tiktok" ? <TikTokFields form={form} set={set} /> : null}
      </div>
      <Button className="mt-6 h-12 w-full" disabled={busy || !form.accountId || !form.packageId || !form.campaignName.trim()}>Create local draft</Button>
    </form>
  );
}

function GoogleFields({ form, set, setForm }: { form: FormState; set: (key: keyof FormState, value: string) => void; setForm: React.Dispatch<React.SetStateAction<FormState>> }) {
  const campaignTypes = [{ value: "search", label: "Search" }, { value: "performance_max", label: "Performance Max" }, { value: "demand_gen", label: "Demand Gen" }];
  const bidOptions = form.campaignType === "search"
    ? ["maximize_clicks", "maximize_conversions", "target_cpa", "maximize_conversion_value", "target_roas"]
    : ["maximize_conversions", "target_cpa", "maximize_conversion_value", "target_roas"];
  return <>
    <Field label="Google campaign type"><Choice value={form.campaignType} options={campaignTypes} onChange={(value) => setForm((current) => googleTypeForm(current, value))} /></Field>
    <Field label="Bidding strategy"><Choice value={form.biddingStrategy} options={bidOptions.map(option)} onChange={(value) => set("biddingStrategy", value)} /></Field>
    {form.biddingStrategy === "target_cpa" ? <Field label="Target CPA"><Input required type="number" min="0.01" step="0.01" value={form.targetCpa} onChange={(event) => set("targetCpa", event.target.value)} /></Field> : null}
    {form.biddingStrategy === "target_roas" ? <Field label="Target ROAS"><Input required type="number" min="0.01" step="0.01" value={form.targetRoas} onChange={(event) => set("targetRoas", event.target.value)} /></Field> : null}
    {form.campaignType === "search" ? <Field label="Search partners"><Choice value={form.searchPartners} options={[{ value: "false", label: "Off" }, { value: "true", label: "On" }]} onChange={(value) => set("searchPartners", value)} /></Field> : null}
    <Field label="Locations (comma separated)"><Input required value={form.locations} onChange={(event) => set("locations", event.target.value)} /></Field>
    <Field label="Languages (comma separated)"><Input required value={form.languages} onChange={(event) => set("languages", event.target.value)} /></Field>
    <Field label="Conversion action ID"><Input required value={form.conversionActionId} onChange={(event) => set("conversionActionId", event.target.value)} /></Field>
    <Field label="Conversion category"><Choice value={form.conversionCategory} options={["purchase", "submit_lead_form", "page_view"].map(option)} onChange={(value) => set("conversionCategory", value)} /></Field>
    <Field label={form.campaignType === "performance_max" ? "Asset group name" : "Ad group name"}><Input required value={form.groupName} onChange={(event) => set("groupName", event.target.value)} /></Field>
    {form.campaignType === "search" ? <Field label="Keywords (comma separated)"><Textarea required value={form.keywords} onChange={(event) => set("keywords", event.target.value)} /></Field> : null}
    <CreativeFields form={form} set={set} google />
  </>;
}

function MetaFields({ form, set }: { form: FormState; set: (key: keyof FormState, value: string) => void }) {
  return <>
    <Field label="Buying type"><Input value="Auction" readOnly className="bg-slate-100" /></Field>
    <Field label="Conversion location"><Input value="Website" readOnly className="bg-slate-100" /></Field>
    <Field label="Optimization goal"><Choice value={form.optimizationGoal} options={metaGoalOptions(form.objective)} onChange={(value) => set("optimizationGoal", value)} /></Field>
    <Field label="Billing event"><Choice value={form.billingEvent} options={[{ value: "impressions", label: "Impressions" }]} onChange={(value) => set("billingEvent", value)} /></Field>
    <Field label="Pixel ID"><Input required value={form.pixelId} onChange={(event) => set("pixelId", event.target.value)} /></Field>
    <Field label="Conversion event"><Choice value={form.conversionEvent} options={metaEventOptions(form.objective)} onChange={(value) => set("conversionEvent", value)} /></Field>
    <PlacementFields form={form} set={set} meta />
    <AudienceFields form={form} set={set} meta />
    <CreativeFields form={form} set={set} />
  </>;
}

function TikTokFields({ form, set }: { form: FormState; set: (key: keyof FormState, value: string) => void }) {
  return <>
    <Field label="Campaign type"><Input value="Auction" readOnly className="bg-slate-100" /></Field>
    <Field label="Budget mode"><Input value="Daily" readOnly className="bg-slate-100" /></Field>
    <Field label="Optimization goal"><Choice value={form.optimizationGoal} options={tikTokGoalOptions(form.objective)} onChange={(value) => set("optimizationGoal", value)} /></Field>
    <Field label="Pixel ID"><Input required value={form.pixelId} onChange={(event) => set("pixelId", event.target.value)} /></Field>
    <Field label="Conversion event"><Choice value={form.conversionEvent} options={tikTokEventOptions(form.objective)} onChange={(value) => set("conversionEvent", value)} /></Field>
    <PlacementFields form={form} set={set} />
    <AudienceFields form={form} set={set} />
    <Field label="Regular identity display name"><Input required value={form.identityName} onChange={(event) => set("identityName", event.target.value)} /></Field>
    <Field label="Video ID"><Input required value={split(form.assetIds)[0] ?? ""} onChange={(event) => set("assetIds", event.target.value)} /></Field>
    <Field label="Ad copy"><Textarea required value={form.primaryText} onChange={(event) => set("primaryText", event.target.value)} /></Field>
    <Field label="Call to action"><Choice value={form.callToAction} options={CTA_OPTIONS} onChange={(value) => set("callToAction", value)} /></Field>
  </>;
}

function PlacementFields({ form, set, meta = false }: { form: FormState; set: (key: keyof FormState, value: string) => void; meta?: boolean }) {
  return <>
    <Field label="Placement mode"><Choice value={form.placementMode} options={[{ value: "automatic", label: "Automatic" }, { value: "manual", label: "Manual" }]} onChange={(value) => set("placementMode", value)} /></Field>
    {form.placementMode === "manual" ? <Field label="Manual placements (comma separated)"><Input required value={form.manualPlacements} onChange={(event) => set("manualPlacements", event.target.value)} placeholder={meta ? "facebook_feed, instagram_feed" : "tiktok"} /></Field> : null}
  </>;
}

function AudienceFields({ form, set, meta = false }: { form: FormState; set: (key: keyof FormState, value: string) => void; meta?: boolean }) {
  return <>
    <Field label="Countries"><Input required value={form.countries} onChange={(event) => set("countries", event.target.value)} /></Field>
    {meta ? <><Field label="Minimum age"><Input required type="number" min="18" max="65" value={form.ageMin} onChange={(event) => set("ageMin", event.target.value)} /></Field><Field label="Maximum age"><Input required type="number" min="18" max="65" value={form.ageMax} onChange={(event) => set("ageMax", event.target.value)} /></Field></> : <Field label="Age groups"><Input required value="25-34, 35-44" readOnly className="bg-slate-100" /></Field>}
    <Field label="Genders"><Input required value={form.genders} onChange={(event) => set("genders", event.target.value)} /></Field>
    <Field label="Interests"><Input value={form.interests} onChange={(event) => set("interests", event.target.value)} /></Field>
    {!meta ? <><Field label="Languages"><Input required value={form.languages} onChange={(event) => set("languages", event.target.value)} /></Field><Field label="Operating systems"><Input required value={form.operatingSystems} onChange={(event) => set("operatingSystems", event.target.value)} /></Field></> : null}
  </>;
}

function CreativeFields({ form, set, google = false }: { form: FormState; set: (key: keyof FormState, value: string) => void; google?: boolean }) {
  const formats = google
    ? [{ value: form.campaignType === "search" ? "responsive_search_ad" : form.campaignType === "performance_max" ? "performance_max_asset_group" : "demand_gen_asset", label: humanize(form.campaignType) }]
    : ["image", "video", "carousel", "existing_post"].map(option);
  return <>
    <Field label="Creative format"><Choice value={form.creativeFormat} options={formats} onChange={(value) => set("creativeFormat", value)} /></Field>
    <Field label={form.creativeFormat === "existing_post" ? "Eligible existing post ID" : form.creativeFormat.includes("video") || form.creativeFormat === "video" ? "Video asset ID" : "Asset IDs (comma separated)"}><Input required value={form.assetIds} onChange={(event) => set("assetIds", event.target.value)} /></Field>
    {form.creativeFormat !== "existing_post" ? <><Field label={google ? "Headlines (comma separated)" : "Headline"}><Input required value={form.headline} onChange={(event) => set("headline", event.target.value)} /></Field><Field label={google ? "Descriptions (comma separated)" : "Primary text"}><Textarea required value={google ? form.descriptions : form.primaryText} onChange={(event) => set(google ? "descriptions" : "primaryText", event.target.value)} /></Field></> : null}
    {google && form.campaignType !== "search" ? <Field label="Business name"><Input required value={form.businessName} onChange={(event) => set("businessName", event.target.value)} /></Field> : null}
    {!google && form.creativeFormat !== "existing_post" ? <Field label="Call to action"><Choice value={form.callToAction} options={CTA_OPTIONS} onChange={(value) => set("callToAction", value)} /></Field> : null}
  </>;
}

function CampaignDetail({ detail, busy, runMockWorkflow }: { detail: CampaignPlanDetail; busy: boolean; runMockWorkflow: (id: number) => void }) {
  return <Card><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{detail.plan.campaignName}</CardTitle><CardDescription>{detail.plan.platform.toUpperCase()} · Revision {detail.currentRevision.revisionNo} · immutable revision</CardDescription></div><Badge>{humanize(detail.plan.status)}</Badge></div></CardHeader><CardContent className="space-y-5">
    <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><Fact label="Objective" value={humanize(detail.plan.objective)} /><Fact label="Flight" value={`${detail.plan.startDate} → ${detail.plan.endDate}`} /><Fact label="Budget" value={money(detail.plan.allocatedBudget, detail.plan.currency)} /><Fact label="Destination" value={detail.plan.destination} /></div>
    <div className="grid gap-4 lg:grid-cols-2"><Panel title="Stored revision" rows={[`Hash: ${detail.currentRevision.payloadHash}`, `Daily budget: ${money(detail.currentRevision.dailyBudget, detail.plan.currency)}`, `Projected total: ${money(detail.currentRevision.projectedTotal, detail.plan.currency)}`, `Author: ${detail.currentRevision.authorName}`]} /><div className="rounded-xl border bg-slate-50 p-4"><p className="font-medium">{humanize(detail.platformDetail.platform)} detail row</p><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{JSON.stringify(detail.platformDetail.values, null, 2)}</pre></div></div>
    {detail.plan.status === "draft" ? <Button type="button" className="w-full" disabled={busy} onClick={() => runMockWorkflow(detail.plan.id)}>Run complete offline mock workflow</Button> : <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">Mock workflow complete. No provider request was made and no M03/M05 record was published.</div>}
  </CardContent></Card>;
}

function buildDraftRequest(form: FormState, account: CampaignPlanningListPayload["accounts"][number]): Record<string, unknown> {
  const common = {
    client_id: account.clientId,
    client_name: account.clientName,
    ad_account_id: account.id,
    budget_package_id: Number(form.packageId),
    campaign_name: form.campaignName.trim(),
    provider_account_id: account.providerAccountId,
    currency: account.currency,
    timezone: account.timezone,
    start_date: form.startDate,
    end_date: form.endDate,
    allocated_budget: Number(form.allocatedBudget),
    destination: form.destination.trim(),
    tracking: { url_parameters: { utm_source: "m04_stage2" }, ...(form.trackingTemplate.trim() ? { tracking_template: form.trackingTemplate.trim() } : {}) },
  };
  if (form.platform === "google") {
    const format = form.campaignType === "search" ? "responsive_search_ad" : form.campaignType === "performance_max" ? "performance_max_asset_group" : "demand_gen_asset";
    const assets = split(form.assetIds);
    const creative = format === "responsive_search_ad"
      ? { format, headlines: pad(split(form.headline), 3), descriptions: pad(split(form.descriptions), 2) }
      : format === "performance_max_asset_group"
        ? { format, headlines: pad(split(form.headline), 3), long_headlines: [form.headline.trim()], descriptions: pad(split(form.descriptions), 2), business_name: form.businessName.trim(), image_asset_ids: assets, logo_asset_ids: [assets[0] ?? "mock-logo"], video_asset_ids: [] }
        : { format, headlines: [form.headline.trim()], descriptions: [split(form.descriptions)[0] ?? form.primaryText.trim()], business_name: form.businessName.trim(), image_asset_ids: assets, video_asset_ids: [] };
    return { ...common, platform: "google", objective: form.objective, campaign_type: form.campaignType, bidding_strategy: form.biddingStrategy, bid_targets: form.biddingStrategy === "target_cpa" ? { target_cpa: Number(form.targetCpa) } : form.biddingStrategy === "target_roas" ? { target_roas: Number(form.targetRoas) } : {}, network_settings: form.campaignType === "search" ? { google_search: true, search_partners: form.searchPartners === "true", display_network: false } : { google_search: false, search_partners: false, display_network: false }, locations: split(form.locations), languages: split(form.languages), placements: { inventory: form.campaignType === "search" ? "google_search" : form.campaignType === "performance_max" ? "all_google_inventory" : "discover_youtube_gmail" }, targeting: { audience_segments: [], excluded_locations: [] }, conversion: { action_id: form.conversionActionId.trim(), category: form.conversionCategory }, campaign_structure: { groups: [{ name: form.groupName.trim(), keywords: form.campaignType === "search" ? split(form.keywords).map((text) => ({ text, match_type: "phrase" })) : [] }] }, creative };
  }
  if (form.platform === "meta") {
    const assets = split(form.assetIds);
    const creative = form.creativeFormat === "existing_post" ? { format: "existing_post", post_id: assets[0], eligibility_confirmed: true } : form.creativeFormat === "video" ? { format: "video", video_asset_id: assets[0], primary_text: form.primaryText.trim(), headline: form.headline.trim(), call_to_action: form.callToAction } : form.creativeFormat === "carousel" ? { format: "carousel", primary_text: form.primaryText.trim(), cards: pad(assets, 2).map((image_asset_id, index) => ({ image_asset_id, headline: `${form.headline.trim()} ${index + 1}`, destination: form.destination.trim() })), call_to_action: form.callToAction } : { format: "image", image_asset_id: assets[0], primary_text: form.primaryText.trim(), headline: form.headline.trim(), call_to_action: form.callToAction };
    return { ...common, platform: "meta", objective: form.objective, buying_type: "auction", conversion_location: "website", optimization_goal: form.optimizationGoal, billing_event: "impressions", pixel_id: form.pixelId.trim(), conversion_event: form.conversionEvent, placements: form.placementMode === "automatic" ? { mode: "automatic" } : { mode: "manual", values: split(form.manualPlacements) }, targeting: { countries: split(form.countries), age_min: Number(form.ageMin), age_max: Number(form.ageMax), genders: split(form.genders), interests: split(form.interests) }, special_ad_categories: [], creative };
  }
  return { ...common, platform: "tiktok", objective: form.objective, campaign_type: "auction", budget_mode: "daily", optimization_goal: form.optimizationGoal, pixel_id: form.pixelId.trim(), conversion_event: form.conversionEvent, placements: form.placementMode === "automatic" ? { mode: "automatic" } : { mode: "manual", values: ["tiktok"] }, targeting: { countries: split(form.countries), languages: split(form.languages), age_groups: ["25-34", "35-44"], genders: split(form.genders), interests: split(form.interests), operating_systems: split(form.operatingSystems) }, identity: { type: "regular", display_name: form.identityName.trim() }, creative: { format: "single_video", spark_ad: false, video_id: split(form.assetIds)[0], ad_text: form.primaryText.trim(), call_to_action: form.callToAction } };
}

function platformForm(platform: CampaignPlatform): FormState {
  if (platform === "meta") return { ...baseForm, platform, objective: "leads", optimizationGoal: "offsite_conversions", conversionEvent: "lead", creativeFormat: "image" };
  if (platform === "tiktok") return { ...baseForm, platform, objective: "traffic", optimizationGoal: "click", conversionEvent: "page_view", creativeFormat: "single_video", manualPlacements: "tiktok", assetIds: "mock-video-id" };
  return { ...baseForm };
}

function objectiveForm(current: FormState, objective: string): FormState {
  if (current.platform === "meta") return { ...current, objective, optimizationGoal: objective === "traffic" ? "landing_page_views" : "offsite_conversions", conversionEvent: objective === "traffic" ? "view_content" : objective === "sales" ? "purchase" : "lead" };
  if (current.platform === "tiktok") return { ...current, objective, optimizationGoal: objective === "traffic" ? "click" : objective === "web_conversions" ? "complete_payment" : "lead", conversionEvent: objective === "traffic" ? "page_view" : objective === "web_conversions" ? "purchase" : "submit_form" };
  return { ...current, objective };
}

function googleTypeForm(current: FormState, campaignType: string): FormState {
  return { ...current, campaignType, creativeFormat: campaignType === "search" ? "responsive_search_ad" : campaignType === "performance_max" ? "performance_max_asset_group" : "demand_gen_asset", biddingStrategy: current.biddingStrategy === "maximize_clicks" && campaignType !== "search" ? "maximize_conversions" : current.biddingStrategy };
}

function objectiveOptions(platform: CampaignPlatform) { return (platform === "google" ? ["sales", "leads", "website_traffic"] : platform === "meta" ? ["traffic", "leads", "sales"] : ["traffic", "web_conversions", "lead_generation"]).map(option); }
function metaGoalOptions(objective: string) { return (objective === "traffic" ? ["landing_page_views", "link_clicks"] : ["offsite_conversions"]).map(option); }
function metaEventOptions(objective: string) { return [objective === "traffic" ? "view_content" : objective === "sales" ? "purchase" : "lead"].map(option); }
function tikTokGoalOptions(objective: string) { return (objective === "traffic" ? ["click", "landing_page_view"] : objective === "web_conversions" ? ["complete_payment"] : ["lead"]).map(option); }
function tikTokEventOptions(objective: string) { return [objective === "traffic" ? "page_view" : objective === "web_conversions" ? "purchase" : "submit_form"].map(option); }
const PLATFORM_OPTIONS = [{ value: "google", label: "Google Ads" }, { value: "meta", label: "Meta Ads" }, { value: "tiktok", label: "TikTok Ads" }];
const CTA_OPTIONS = ["learn_more", "shop_now", "sign_up", "apply_now"].map(option);

function Choice({ value, options, onChange, placeholder = "Select" }: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; placeholder?: string }) { return <Select value={value || undefined} onValueChange={onChange}><SelectTrigger className="w-full bg-white"><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent position="popper" align="start">{options.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>; }
function DatePickerField({ value, onChange }: { value: string; onChange: (value: string) => void }) { const date = value ? new Date(`${value}T00:00:00`) : undefined; return <Popover><PopoverTrigger asChild><Button type="button" variant="outline" className="w-full justify-start bg-white font-normal"><CalendarIcon />{date ? date.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" }) : "Pick a date"}</Button></PopoverTrigger><PopoverContent align="start" className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={(selected) => { if (selected) onChange(`${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(selected.getDate()).padStart(2, "0")}`); }} /></PopoverContent></Popover>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function Summary({ label, value }: { label: string; value: number }) { return <Card size="sm"><CardContent><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>; }
function Fact({ label, value }: { label: string; value: string }) { return <div><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 break-all font-medium">{value}</p></div>; }
function Panel({ title, rows }: { title: string; rows: string[] }) { return <div className="rounded-xl border bg-slate-50 p-4"><p className="font-medium">{title}</p><div className="mt-2 space-y-1 text-sm text-muted-foreground">{rows.map((row) => <p key={row} className="break-all">{row}</p>)}</div></div>; }
function split(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function pad(values: string[], minimum: number) { const result = [...values]; while (result.length < minimum) result.push(`${result[0] || "Stage 2 asset"} ${result.length + 1}`); return result; }
function option(value: string) { return { value, label: humanize(value) }; }
function humanize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function money(value: number, currency: string) { return new Intl.NumberFormat("en-MY", { style: "currency", currency }).format(value); }
function errorMessage(reason: unknown) { return reason instanceof Error ? reason.message : "Unable to complete the local Stage 2 request."; }
