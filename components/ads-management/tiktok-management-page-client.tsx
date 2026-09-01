"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDownIcon, LoaderCircleIcon, PencilIcon, RefreshCwIcon, SearchIcon } from "lucide-react";

import { ManagementDetailGrid, ManagementEntityName, ManagementEntityReportSkeleton, ManagementPaginationFooter, ManagementStatusDot } from "./management-entity-report";
import { ManagementPerformancePanel, ManagementPerformanceSkeleton } from "./management-performance-panel";
import { UnifiedManagementAccountSearch } from "./unified-management-account-search";
import { ManagementSectionNavigation } from "./management-section-navigation";
import { M03RequestWorkspace } from "@/components/change-control/m03-request-workspace";
import { ReportHeaderMonthPicker } from "@/components/reporting/report-header-month-picker";
import { ReportShell } from "@/components/reporting/report-shell";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AuthRole } from "@/lib/auth/roles";
import { m03CapabilitiesForRole } from "@/lib/change-control/permissions";
import { paginateRows, type MetaPageSize } from "@/lib/ads-management/pagination";
import { tiktokStageForTab, type TikTokManagementTab } from "@/lib/ads-management/tiktok-management-navigation";
import { toTikTokManagementPerformancePoints } from "@/lib/ads-management/tiktok-management-performance";
import { buildTikTokManagementRequestPrefill, toTikTokAdGroupManagementResource, toTikTokAdManagementResource, toTikTokCampaignManagementResource, type M03TikTokManagementResource } from "@/lib/change-control/tiktok-management-builder";
import type { M03RequestPrefill } from "@/lib/change-control/workspace";
import type { PreviewAdGroupNode, PreviewAdNode, PreviewCampaignNode, PreviewManagementPerformancePoint, PreviewReportPayload } from "@/lib/reporting/types";
import type { TikTokManagementStage } from "@/lib/reporting/tiktok-management-stage";
import { buildCanonicalManagementQuery, isAdsManagementView, resolveRefreshedManagementAccountName } from "@/lib/ads-management/unified-management";

type AccountSuggestion = { accountName: string; adAccountId: string; notionPageId?: string; platform: "meta" | "google" | "tiktok" | null; country: string | null };
type ResourceKind = "campaign" | "ad_group" | "ad";
type TikTokResourceRow = { campaign: PreviewCampaignNode; adGroup?: PreviewAdGroupNode; ad?: PreviewAdNode };

const RECENT_KEY = "tiktok-management-recent-accounts-v1";
export function TikTokManagementPageClient({ initialRole }: { initialRole: AuthRole }) {
  const canDraftChanges = m03CapabilitiesForRole(initialRole).create;
  const router = useRouter();
  const params = useSearchParams();
  const queryAccountId = params.get("accountId")?.trim() || "";
  const queryAccountName = params.get("accountName")?.trim() || queryAccountId;
  const queryDates = dateRangeFromParams(params.get("startDate"), params.get("endDate"));
  const queryTab = isAdsManagementView(params.get("view")) ? params.get("view") as TikTokManagementTab : "campaigns";
  const canonicalLoadKey = useRef("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AccountSuggestion[]>([]);
  const [recents, setRecents] = useState<AccountSuggestion[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [accountId, setAccountId] = useState(queryAccountId);
  const [accountName, setAccountName] = useState(queryAccountName);
  const [dates, setDates] = useState(queryDates);
  const [tab, setTab] = useState<TikTokManagementTab>(queryTab);
  const [stagePayloads, setStagePayloads] = useState<Partial<Record<TikTokManagementStage, PreviewReportPayload>>>({});
  const [preview, setPreview] = useState<PreviewReportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<M03RequestPrefill | null>(null);
  const [assetPayloads, setAssetPayloads] = useState<Record<string, PreviewReportPayload>>({});

  useEffect(() => { setRecents(readAccounts(RECENT_KEY)); }, []);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!searchRef.current?.contains(event.target as Node)) setSearchOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  useEffect(() => {
    if (!searchOpen || query.trim().length < 2 || query === accountName) { setResults([]); setSearching(false); return; }
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(() => {
      void fetch(`/api/notion/accounts/search?q=${encodeURIComponent(query.trim())}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => response.ok ? response.json() as Promise<{ accounts?: AccountSuggestion[] }> : { accounts: [] })
        .then((payload) => setResults((payload.accounts ?? []).filter(isTikTokAccount)))
        .catch(() => setResults([]))
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [accountName, query, searchOpen]);

  const loadStage = useCallback(async (advertiserId: string, stage: TikTokManagementStage, nextDates = dates, selection?: { campaignId?: string; adGroupId?: string; adId?: string }, forceRefresh = false) => {
    const normalized = advertiserId.trim();
    if (!/^\d{1,32}$/.test(normalized)) { setError("Enter a valid TikTok advertiser ID."); return null; }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ platform: "tiktok", tiktokAccountId: normalized, startDate: nextDates.startDate, endDate: nextDates.endDate, stage });
      if (selection?.campaignId) params.set("campaignId", selection.campaignId);
      if (selection?.adGroupId) params.set("adGroupId", selection.adGroupId);
      if (selection?.adId) params.set("adId", selection.adId);
      if (forceRefresh) params.set("refresh", String(Date.now()));
      const payload = await api<PreviewReportPayload>(`/api/reporting/preview?${params}`);
      const warning = payload.warnings.find((item) => item.includes(`TikTok Ads (${normalized})`));
      if (warning && !payload.sections.find((section) => section.platform === "tiktok")?.campaigns.length) throw new Error(warning);
      if (stage === "assets" && selection?.adId) setAssetPayloads((current) => ({ ...current, [selection.adId!]: payload }));
      else {
        setStagePayloads((current) => ({ ...current, [stage]: payload }));
        setPreview(payload);
      }
      const account = payload.tiktokAccounts?.[0];
      const providerName = account?.advertiserName || payload.sections.find((section) => section.platform === "tiktok")?.accountName;
      setAccountName((selectedName) => resolveRefreshedManagementAccountName({
        platform: "tiktok",
        accountId: normalized,
        selectedName,
        providerName,
      }));
      return payload;
    } catch (caught) {
      setError(message(caught, "Unable to load this TikTok Ads section. The last successful data remains visible."));
      return null;
    } finally { setLoading(false); }
  }, [dates]);

  useEffect(() => {
    if (!queryAccountId) return;
    const key = `${queryAccountId}:${queryDates.startDate}:${queryDates.endDate}`;
    if (canonicalLoadKey.current === key) return;
    canonicalLoadKey.current = key;
    setAccountId(queryAccountId);
    setAccountName(queryAccountName);
    setQuery(queryAccountName);
    setDates(queryDates);
    setTab(queryTab);
    setPreview(null);
    setStagePayloads({});
    setAssetPayloads({});
    setPrefill(null);
    void loadStage(queryAccountId, tiktokStageForTab(queryTab) ?? "campaigns", queryDates);
  }, [loadStage, queryAccountId, queryAccountName, queryDates, queryTab]);

  useEffect(() => {
    if (!accountId) return;
    const queryString = buildCanonicalManagementQuery({ platform: "tiktok", accountId, accountName: params.get("accountName")?.trim() || accountName, ...dates, view: tab });
    if (params.toString() !== queryString) router.replace(`/manage?${queryString}`, { scroll: false });
  }, [accountId, accountName, dates, params, router, tab]);

  function chooseAccount(account: AccountSuggestion) {
    const next = [account, ...recents.filter((item) => item.adAccountId !== account.adAccountId)].slice(0, 5);
    setRecents(next); writeAccounts(RECENT_KEY, next);
    setSearchOpen(false); setQuery(account.accountName); setAccountId(account.adAccountId); setAccountName(account.accountName);
    setPreview(null); setStagePayloads({}); setAssetPayloads({}); setPrefill(null); setTab("campaigns");
    void loadStage(account.adAccountId, "campaigns");
  }

  function selectTab(next: TikTokManagementTab) {
    setTab(next); setPrefill(null);
    const stage = tiktokStageForTab(next);
    if (!stage || !accountId) return;
    const cached = stagePayloads[stage];
    if (cached) { setPreview(cached); setError(null); }
    else if (!loading) void loadStage(accountId, stage);
  }

  function changeDates(next: { startDate: string; endDate: string }) {
    setDates(next); setStagePayloads({}); setAssetPayloads({});
    const stage = tiktokStageForTab(tab) ?? "campaigns";
    if (accountId) void loadStage(accountId, stage, next);
  }

  function refresh() {
    const stage = tiktokStageForTab(tab) ?? "campaigns";
    if (!accountId || loading) return;
    setStagePayloads((current) => { const next = { ...current }; delete next[stage]; return next; });
    void loadStage(accountId, stage, dates, undefined, true);
  }

  const section = preview?.sections.find((item) => item.platform === "tiktok") ?? null;
  const campaigns = section?.campaigns ?? [];
  const campaignRows = campaigns.map((campaign) => ({ campaign }));
  const adGroupRows = campaigns.flatMap((campaign) => campaign.children.map((adGroup) => ({ campaign, adGroup })));
  const adRows = adGroupRows.flatMap(({ campaign, adGroup }) => adGroup.ads.map((ad) => ({ campaign, adGroup, ad })));
  const account = preview?.tiktokAccounts?.[0] ?? Object.values(stagePayloads).find(Boolean)?.tiktokAccounts?.[0];
  const currencyCode = account?.currency || "MYR";
  const resources = useMemo(() => collectResources(Object.values(stagePayloads).filter(Boolean) as PreviewReportPayload[]), [stagePayloads]);

  function openEditor(resource: M03TikTokManagementResource) {
    setPrefill(buildTikTokManagementRequestPrefill({ accountIdentity: accountId, accountName, resource }));
    setTab("change_requests");
  }

  async function refreshResources() {
    const stage = stageForEntity(prefill?.entityType) ?? "campaigns";
    const payload = await loadStage(accountId, stage);
    return payload ? collectResources([payload, ...Object.values(stagePayloads).filter(Boolean) as PreviewReportPayload[]]) : null;
  }

  return <ReportShell title="Ads Management" dateLabel={`${dates.startDate} – ${dates.endDate}`} hideHeaderDateControl compactResponsive initialRole={initialRole} activeQuery={accountId ? new URLSearchParams({ tiktokAccountId: accountId, platform: "tiktok", startDate: dates.startDate, endDate: dates.endDate }).toString() : ""}>
    <div data-can-edit={canDraftChanges} className={`mx-auto space-y-5 ${accountId ? "max-w-7xl" : "max-w-3xl"}`}>
      <UnifiedManagementAccountSearch selection={accountId ? { platform: "tiktok", accountId, accountName } : null} />
      {false ? <section className="relative z-30 rounded-2xl border bg-white p-5 shadow-sm">
        <label htmlFor="tiktok-account-search" className="text-sm font-semibold">TikTok Ads account search</label>
        <div ref={searchRef} className="relative mt-2"><SearchIcon className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-slate-400" /><Input id="tiktok-account-search" value={query} onFocus={() => setSearchOpen(true)} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") setSearchOpen(false); if (event.key === "Enter" && /^\d{1,32}$/.test(query.trim())) { setSearchOpen(false); setAccountId(query.trim()); setAccountName(query.trim()); setStagePayloads({}); void loadStage(query.trim(), "campaigns"); } }} className="bg-white pl-9" placeholder="Search company or enter a TikTok advertiser ID" />
          {searchOpen ? <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[80] max-h-80 overflow-y-auto rounded-xl border bg-white p-2 shadow-2xl"><p className="px-2 py-1 text-xs font-semibold uppercase text-slate-500">Results</p>{searching ? <p className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500"><LoaderCircleIcon className="size-4 animate-spin" />Searching accounts…</p> : results.length ? results.map((item) => <AccountOption key={`result:${item.adAccountId}`} account={item} onSelect={chooseAccount} />) : <p className="px-3 py-2 text-sm text-slate-500">{query.trim().length < 2 ? "Type at least 2 characters to search accounts." : "No matching TikTok advertisers found."}</p>}<div className="mt-1 border-t pt-1"><p className="px-2 py-1 text-xs font-semibold uppercase text-slate-500">Recent</p>{recents.length ? recents.map((item) => <AccountOption key={`recent:${item.adAccountId}`} account={item} onSelect={chooseAccount} />) : <p className="px-3 py-2 text-sm text-slate-500">No recent TikTok advertisers.</p>}</div></div> : null}
        </div><p className="mt-2 text-xs text-slate-500">Select an advertiser to retrieve official TikTok Ads data and its governed change-control workspace.</p>
        {accountId ? <div className="mt-4 border-t pt-5"><h2 className="text-2xl font-semibold">{accountName || accountId}</h2><p className="text-sm text-slate-500">TikTok advertiser {accountId}{account?.timezone ? ` · ${account?.timezone}` : ""}</p></div> : null}
      </section> : null}
      {accountId ? <section className="relative z-20 flex flex-col gap-2 rounded-xl border bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"><ReportHeaderMonthPicker startDate={dates.startDate} endDate={dates.endDate} onChange={changeDates} variant="compact" /><Button size="sm" variant="outline" disabled={loading} onClick={refresh}><RefreshCwIcon className={loading ? "animate-spin" : ""} />Refresh official data</Button></section> : null}
      {error ? <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">This TikTok section could not refresh</p><p className="mt-1">{error}</p></div> : null}
      {!accountId ? <div className="rounded-xl border border-dashed bg-white p-12 text-center"><h2 className="font-semibold">Choose a TikTok advertiser</h2><p className="mt-1 text-sm text-slate-500">Campaigns load first. Other resources load only when opened.</p></div> : <>
        <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]"><ManagementSectionNavigation role={initialRole} value={tab} onChange={(next) => selectTab(next)} />
          <main className="min-w-0">{loading && !preview ? <div className="space-y-8"><ManagementPerformanceSkeleton /><ManagementEntityReportSkeleton /></div> : tab === "campaigns" ? <ResourceView kind="campaign" rows={campaignRows} currencyCode={currencyCode} onEdit={(row) => openEditor(toTikTokCampaignManagementResource(row.campaign))} /> : tab === "ad_groups" ? <ResourceView kind="ad_group" rows={adGroupRows} currencyCode={currencyCode} onEdit={(row) => openEditor(toTikTokAdGroupManagementResource(row.campaign, row.adGroup!))} /> : tab === "ads" ? <ResourceView kind="ad" rows={adRows} currencyCode={currencyCode} assetPayloads={assetPayloads} onExpand={(row) => { if (row.ad && !assetPayloads[row.ad.id]) void loadStage(accountId, "assets", dates, { campaignId: row.campaign.id, adGroupId: row.adGroup?.id, adId: row.ad.id }); }} onEdit={(row) => openEditor(toTikTokAdManagementResource(row.campaign, row.adGroup!, row.ad!))} /> : tab === "recommendations" ? <Recommendations campaigns={(stagePayloads.campaigns ?? preview)?.sections.find((item) => item.platform === "tiktok")?.campaigns ?? []} currencyCode={currencyCode} onRequest={(campaign) => openEditor(toTikTokCampaignManagementResource(campaign))} /> : <M03RequestWorkspace role={initialRole} scope={{ platform: "tiktok", accountIdentity: accountId }} prefill={prefill} prefillReason="Opened from TikTok Ads Management." showNewRequestAction={false} focusEditorWhenOpen tiktokManagement={{ accountIdentity: accountId, accountName, resources, onRefreshOfficialData: refreshResources }} />}</main>
        </div></>}
    </div>
  </ReportShell>;
}

function ResourceView({ kind, rows, currencyCode, onEdit, onExpand, assetPayloads = {} }: { kind: ResourceKind; rows: TikTokResourceRow[]; currencyCode: string; onEdit: (row: TikTokResourceRow) => void; onExpand?: (row: TikTokResourceRow) => void; assetPayloads?: Record<string, PreviewReportPayload> }) {
  const [filter, setFilter] = useState("all"); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState<MetaPageSize>(10);
  const entity = (row: TikTokResourceRow) => kind === "campaign" ? row.campaign : kind === "ad_group" ? row.adGroup! : row.ad!;
  const filtered = filter === "all" ? rows : rows.filter((row) => entity(row).id === filter);
  const pagination = paginateRows(filtered, page, pageSize);
  const daily = mergeDaily(filtered.flatMap((row) => entity(row).dailyPerformance ?? []));
  const points = toTikTokManagementPerformancePoints(daily);
  const resultLabel = daily.find((point) => point.resultLabel !== "Results")?.resultLabel ?? daily[0]?.resultLabel ?? "Results";
  const labels = kind === "campaign" ? { title: "Campaign performance", report: "Campaign report", singular: "campaign" } : kind === "ad_group" ? { title: "Ad group performance", report: "Ad group report", singular: "ad group" } : { title: "Ad performance", report: "Ad report", singular: "ad" };
  const cpr = resolveCostPerResult(filtered.map((row) => entity(row).performance));
  return <div className="space-y-8"><ManagementPerformancePanel points={points} authoritativeCostPerResult={cpr} currencyCode={currencyCode} title={labels.title} subtitle={`${filter === "all" ? `All ${labels.singular}s` : entity(filtered[0]!).name} · daily official TikTok Ads metrics`} headerControl={<Select value={filter} onValueChange={(value) => { setFilter(value); setPage(1); }}><SelectTrigger className="w-full bg-white sm:w-72"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All {labels.singular}s</SelectItem>{rows.map((row) => <SelectItem key={entity(row).id} value={entity(row).id}>{entity(row).name}</SelectItem>)}</SelectContent></Select>} labels={{ cost: "Spend", results: resultLabel, clicks: "Engagements", costPerResult: "Cost / result" }} emptyTitle="No performance activity in this date range" emptyDescription={`TikTok returned no daily spend, result, or engagement rows for the selected ${labels.singular}.`} />
    <div><section className="overflow-hidden rounded-t-2xl border border-b-0 bg-white shadow-sm"><div className="border-b px-5 py-5"><h3 className="font-semibold">{labels.report}</h3><p className="mt-1 text-xs text-slate-500">Each row starts collapsed. Select View metrics for official delivery details.</p></div>{pagination.items.length ? <div className="divide-y">{pagination.items.map((row) => { const item = entity(row); const details = detailsFor(row, kind, currencyCode, assetPayloads); const summary = summaryFor(row, kind, currencyCode); return <Collapsible key={item.id} onOpenChange={(open) => { if (open) onExpand?.(row); }} className="group"><div className="grid items-center gap-4 py-4 pl-5 pr-7 md:grid-cols-[minmax(0,1fr)_40px_minmax(150px,220px)_minmax(150px,220px)_128px]"><div className="min-w-0"><span className="mb-1 block text-[11px] uppercase text-slate-400">{labels.singular}</span><div className="flex items-center gap-3"><ManagementStatusDot status={item.status} /><ManagementEntityName text={item.name} multiline={kind === "ad"} /></div></div><Button size="icon-sm" variant="ghost" className="text-red-700" aria-label={`Edit ${labels.singular} ${item.name}`} onClick={() => onEdit(row)}><PencilIcon /></Button>{summary.map((value) => <div key={value.label} className="min-w-0 text-sm"><span className="block text-[11px] uppercase text-slate-400">{value.label}</span><span className="block truncate font-medium" title={value.value}>{value.value}</span></div>)}<CollapsibleTrigger asChild><Button variant="outline" size="sm" className="w-32"><span className="group-data-[state=open]:hidden">View metrics</span><span className="hidden group-data-[state=open]:inline">Hide metrics</span><ChevronDownIcon className="group-data-[state=open]:rotate-180" /></Button></CollapsibleTrigger></div><CollapsibleContent className="border-t bg-slate-50/70 px-5 py-5"><ManagementDetailGrid details={details} /></CollapsibleContent></Collapsible>; })}</div> : <p className="p-8 text-center text-sm text-slate-500">No {labels.singular}s match this filter.</p>}</section><ManagementPaginationFooter model={{ ...pagination, setPage, setPageSize: (size) => { setPageSize(size); setPage(1); } }} /></div>
  </div>;
}

function Recommendations({ campaigns, currencyCode, onRequest }: { campaigns: PreviewCampaignNode[]; currencyCode: string; onRequest: (campaign: PreviewCampaignNode) => void }) {
  const active = campaigns.filter((campaign) => (campaign.performance?.spend ?? 0) > 0);
  const best = [...active].filter((campaign) => (campaign.performance?.results ?? 0) > 0).sort((a, b) => (a.performance!.costPerResult ?? Infinity) - (b.performance!.costPerResult ?? Infinity))[0];
  return <div className="space-y-5"><section className="rounded-2xl border bg-white p-6 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">TikTok Ads</p><h2 className="mt-2 text-2xl font-semibold">Recommendations</h2><p className="mt-2 text-sm text-slate-500">Dashboard recommendations derived only from the loaded campaign performance. They are not TikTok-issued instructions.</p></section>{best ? <section className="rounded-2xl border bg-white p-6 shadow-sm"><span className="rounded-full border px-3 py-1 text-xs">Efficiency</span><h3 className="mt-4 text-lg font-semibold">Review measured scaling for {best.name}</h3><p className="mt-2 text-sm text-slate-500">This campaign has the lowest loaded cost per result: {money(best.performance?.costPerResult, currencyCode)}.</p><Button className="mt-5" onClick={() => onRequest(best)}>Request change</Button></section> : <section className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">No recommendation can be calculated from the loaded date range.</section>}</div>;
}

function summaryFor(row: TikTokResourceRow, kind: ResourceKind, currencyCode: string) {
  if (kind === "campaign") return [{ label: "Budget", value: budget(row.campaign.managementFields, "campaign", currencyCode) }, { label: "Delivery status", value: status(row.campaign.status) }];
  if (kind === "ad_group") return [{ label: "Campaign", value: row.campaign.name }, { label: "Delivery status", value: status(row.adGroup!.status) }];
  return [{ label: "Campaign", value: row.campaign.name }, { label: "Ad group", value: row.adGroup!.name }];
}

function detailsFor(row: TikTokResourceRow, kind: ResourceKind, currencyCode: string, assets: Record<string, PreviewReportPayload>) {
  const item = kind === "campaign" ? row.campaign : kind === "ad_group" ? row.adGroup! : row.ad!;
  const performance = item.performance;
  const assetAd = kind === "ad" ? findAd(assets[row.ad!.id], row.ad!.id) : null;
  return [
    { label: "Provider ID", value: item.id }, ...item.details, { label: "Status", value: status(item.status) },
    { label: "Spend", value: money(performance?.spend, currencyCode) }, { label: performance?.resultLabel || "Results", value: number(performance?.results) },
    { label: "Impressions", value: number(performance?.impressions) }, { label: "Engagements", value: number(performance?.engagements ?? performance?.clicks) },
    { label: "Destination clicks", value: number(performance?.clicks) }, { label: "Destination CTR", value: performance ? `${number(performance.ctr)}%` : "—" }, { label: "Destination CPC", value: money(performance?.cpc, currencyCode) },
    { label: "CPM", value: money(performance?.cpm, currencyCode) }, { label: "Cost / result", value: money(performance?.costPerResult, currencyCode) },
    ...(assetAd?.creative?.body ? [{ label: "Primary text", value: assetAd.creative.body, wide: true }] : []),
    ...(assetAd?.previewLinks?.[0]?.url ? [{ label: "Public TikTok post", value: assetAd.previewLinks[0].url, wide: true }] : []),
  ];
}

function collectResources(payloads: PreviewReportPayload[]) { const map = new Map<string, M03TikTokManagementResource>(); for (const payload of payloads) { const section = payload.sections.find((item) => item.platform === "tiktok"); for (const campaign of section?.campaigns ?? []) { const campaignResource = toTikTokCampaignManagementResource(campaign); map.set(`${campaignResource.entityType}:${campaignResource.entityIdentity}`, campaignResource); for (const adGroup of campaign.children) { const groupResource = toTikTokAdGroupManagementResource(campaign, adGroup); map.set(`${groupResource.entityType}:${groupResource.entityIdentity}`, groupResource); for (const ad of adGroup.ads) { const adResource = toTikTokAdManagementResource(campaign, adGroup, ad); map.set(`${adResource.entityType}:${adResource.entityIdentity}`, adResource); } } } } return [...map.values()]; }
function mergeDaily(points: PreviewManagementPerformancePoint[]) { const map = new Map<string, PreviewManagementPerformancePoint>(); for (const point of points) { const current = map.get(point.date) ?? { ...point, spend: 0, results: 0, clicks: 0, engagements: 0 }; current.spend += point.spend; current.results += point.results; current.clicks += point.clicks; current.engagements = (current.engagements ?? 0) + (point.engagements ?? point.clicks); if (current.resultLabel !== point.resultLabel) current.resultLabel = "Results"; map.set(point.date, current); } return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)); }
function resolveCostPerResult(rows: Array<PreviewCampaignNode["performance"]>) { const spend = rows.reduce((sum, row) => sum + (row?.spend ?? 0), 0); const results = rows.reduce((sum, row) => sum + (row?.results ?? 0), 0); return results > 0 ? spend / results : 0; }
function findAd(payload: PreviewReportPayload | undefined, adId: string) { for (const campaign of payload?.sections.find((item) => item.platform === "tiktok")?.campaigns ?? []) for (const group of campaign.children) { const ad = group.ads.find((item) => item.id === adId); if (ad) return ad; } return null; }
function stageForEntity(entity?: string) { return entity === "ad" ? "ads" as const : entity === "ad_group" ? "ad-groups" as const : entity === "campaign" ? "campaigns" as const : null; }
function budget(fields: Record<string, unknown> | undefined, entity: "campaign" | "ad_group", currencyCode: string) { const value = Number(fields?.[`${entity}.budget.amount`]); return Number.isFinite(value) && value > 0 ? money(value, currencyCode) : "—"; }
function AccountOption({ account, onSelect }: { account: AccountSuggestion; onSelect: (account: AccountSuggestion) => void }) { return <button type="button" onClick={() => onSelect(account)} className="w-full rounded-lg px-3 py-3 text-left hover:bg-red-50"><strong className="block truncate text-sm">{account.accountName}</strong><span className="text-xs text-slate-500">TikTok Ads · {account.adAccountId}</span></button>; }
function isTikTokAccount(account: AccountSuggestion) { return account.platform === "tiktok" || (account.platform == null && /^tiktok\s*-/i.test(account.accountName)); }
function readAccounts(key: string) { try { return (JSON.parse(localStorage.getItem(key) ?? "[]") as AccountSuggestion[]).filter(isTikTokAccount).slice(0, 5); } catch { return []; } }
function writeAccounts(key: string, accounts: AccountSuggestion[]) { try { localStorage.setItem(key, JSON.stringify(accounts)); } catch { /* optional */ } }
function defaultDateRange() { const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 29); return { startDate: iso(start), endDate: iso(end) }; }
function dateRangeFromParams(startDate: string | null, endDate: string | null) { return /^\d{4}-\d{2}-\d{2}$/.test(startDate ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(endDate ?? "") ? { startDate: startDate!, endDate: endDate! } : defaultDateRange(); }
function iso(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function status(value: string) { return value ? value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unknown"; }
function number(value: number | null | undefined) { return value == null ? "—" : new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 }).format(value); }
function money(value: number | null | undefined, currencyCode: string) { return value == null ? "—" : new Intl.NumberFormat("en-MY", { style: "currency", currency: currencyCode }).format(value); }
function message(error: unknown, fallback: string) { return error instanceof Error && error.message ? error.message : fallback; }
async function api<T>(url: string): Promise<T> { const response = await fetch(url, { cache: "no-store" }); const payload = await response.json().catch(() => ({})) as Record<string, unknown>; if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Request failed."); return payload as T; }
