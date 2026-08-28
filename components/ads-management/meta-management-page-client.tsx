"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangleIcon,
  BarChart3Icon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  FilePenLineIcon,
  ImageIcon,
  LayoutGridIcon,
  LightbulbIcon,
  LoaderCircleIcon,
  MegaphoneIcon,
  PencilIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react";

import { ReportHeaderMonthPicker } from "@/components/reporting/report-header-month-picker";
import { ReportShell } from "@/components/reporting/report-shell";
import { UnifiedManagementAccountSearch } from "@/components/ads-management/unified-management-account-search";
import { ManagementSectionNavigation } from "@/components/ads-management/management-section-navigation";
import {
  ManagementDetailGrid,
  ManagementEntityName,
  ManagementEntityReportSkeleton,
  ManagementPaginationFooter,
  ManagementStatusDot,
} from "@/components/ads-management/management-entity-report";
import {
  ManagementPerformancePanel,
  ManagementPerformanceSkeleton,
} from "@/components/ads-management/management-performance-panel";
import { M03RequestWorkspace } from "@/components/change-control/m03-request-workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { AuthRole } from "@/lib/auth/roles";
import {
  META_MANAGEMENT_PRIMARY_TABS,
  selectMetaChangeRequestNavigation,
  selectMetaPrimaryNavigation,
  type MetaManagementTab,
} from "@/lib/ads-management/meta-management-navigation";
import { META_PAGE_SIZE_OPTIONS, paginateRows, type MetaPageSize } from "@/lib/ads-management/pagination";
import {
  mergeMetaDailyPerformanceSeries,
  resolveMetaManagementCostPerResult,
} from "@/lib/ads-management/meta-management-performance";
import { getMetaPreviewFailureMessage } from "@/lib/ads-management/meta-preview-failure";
import {
  buildMetaManagementRecommendations,
  getMetaManagementActivityState,
  type MetaManagementRecommendation,
} from "@/lib/ads-management/meta-recommendations";
import {
  buildMetaManagementRequestPrefill,
  toMetaAdManagementResource,
  toMetaAdSetManagementResource,
  toMetaCampaignManagementResource,
  type M03MetaManagementResource,
} from "@/lib/change-control/meta-management-builder";
import {
  metaChangeFieldsForNavigationFilter,
  type MetaChangeRequestNavigationFilter,
} from "@/lib/change-control/meta-change-request-navigation";
import type { M03RequestPrefill } from "@/lib/change-control/workspace";
import type {
  AudienceClickBreakdownItem,
  CampaignGroup,
  OverallReportPayload,
  PreviewAdGroupNode,
  PreviewAdNode,
  PreviewCampaignNode,
  PreviewPlatformSection,
  PreviewReportPayload,
  SummarySection,
} from "@/lib/reporting/types";
import type { MetaManagementStage } from "@/lib/reporting/meta-management-stage";
import { isMetaCircuitBlocked, metaStageForTab } from "@/lib/ads-management/meta-management-client-state";
import {
  buildCanonicalManagementQuery,
  isAdsManagementView,
  resolveManagementDisplayName,
} from "@/lib/ads-management/unified-management";

type AccountSuggestion = {
  accountName: string;
  adAccountId: string;
  notionPageId?: string;
  platform: "meta" | "google" | "tiktok" | null;
  country: string | null;
};

const META_ACCOUNT_CACHE_KEY = "meta-management-account-search-cache-v1";
const META_RECENT_ACCOUNTS_KEY = "meta-management-recent-accounts-v1";
const META_ACCOUNT_CACHE_TTL_MS = 15 * 60 * 1000;

const PRIMARY_TAB_DETAILS: Record<(typeof META_MANAGEMENT_PRIMARY_TABS)[number], { label: string; icon: typeof BarChart3Icon }> = {
  campaigns: { label: "Campaigns", icon: MegaphoneIcon },
  ad_sets: { label: "Ad sets", icon: LayoutGridIcon },
  ads: { label: "Ads", icon: FilePenLineIcon },
  opportunities: { label: "Recommendations", icon: LightbulbIcon },
};
const PRIMARY_TABS = META_MANAGEMENT_PRIMARY_TABS.map((value) => ({ value, ...PRIMARY_TAB_DETAILS[value] }));

export function MetaManagementPageClient({ initialRole }: { initialRole: AuthRole }) {
  const router = useRouter();
  const params = useSearchParams();
  const queryAccountId = normalizeMetaAccountId(params.get("accountId") ?? "");
  const queryAccountName = params.get("accountName")?.trim() || queryAccountId;
  const queryDates = dateRangeFromParams(params.get("startDate"), params.get("endDate"));
  const queryTab = metaTabFromCanonicalView(params.get("view"));
  const canonicalLoadKey = useRef("");
  const [accountQuery, setAccountQuery] = useState("");
  const [accountResults, setAccountResults] = useState<AccountSuggestion[]>([]);
  const [recentAccounts, setRecentAccounts] = useState<AccountSuggestion[]>([]);
  const [cachedAccounts, setCachedAccounts] = useState<AccountSuggestion[]>([]);
  const [accountResultsOpen, setAccountResultsOpen] = useState(false);
  const [accountSearching, setAccountSearching] = useState(false);
  const accountSearchRef = useRef<HTMLDivElement>(null);
  const [accountId, setAccountId] = useState(queryAccountId);
  const [accountName, setAccountName] = useState(queryAccountName);
  const [dates, setDates] = useState(queryDates);
  const [tab, setTab] = useState<MetaManagementTab>(queryTab);
  const [changeRequestFilter, setChangeRequestFilter] = useState<MetaChangeRequestNavigationFilter>("requests");
  const [, setChangeRequestsOpen] = useState(false);
  const [overall, setOverall] = useState<OverallReportPayload | null>(null);
  const [preview, setPreview] = useState<PreviewReportPayload | null>(null);
  const [stagePayloads, setStagePayloads] = useState<Partial<Record<MetaManagementStage, PreviewReportPayload>>>({});
  const [metaProtection, setMetaProtection] = useState<PreviewReportPayload["metaProtection"]>(undefined);
  const [clock, setClock] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [overallLoading, setOverallLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestPrefill, setRequestPrefill] = useState<M03RequestPrefill | null>(null);

  useEffect(() => {
    setRecentAccounts(readRecentMetaAccounts());
    setCachedAccounts(readAllCachedMetaAccounts());
  }, []);

  const load = useCallback(async (id: string, nextDates = dates, stage: MetaManagementStage = "campaigns") => {
    const normalized = id.replace(/^act_/, "").replace(/\D/g, "");
    if (!normalized) return;
    if (accountId && accountId !== normalized) {
      setRequestPrefill(null);
      setOverall(null);
      setPreview(null);
      setStagePayloads({});
    }
    setAccountId(normalized);
    setOverall(null);
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ metaAccountId: normalized, startDate: nextDates.startDate, endDate: nextDates.endDate });
      query.set("stage", stage);
      const previewPayload = await api<PreviewReportPayload>(`/api/reporting/preview?${query}&includeInactiveMeta=1`);
      const previewFailure = getMetaPreviewFailureMessage(previewPayload);
      if (previewFailure) throw new Error(previewFailure);
      setPreview(previewPayload);
      setStagePayloads((current) => ({ ...current, [stage]: previewPayload }));
      setMetaProtection(previewPayload.metaProtection);
      if (previewPayload.metaProtection?.circuitOpen) {
        setError(previewPayload.metaProtection.reason || "Meta requests are temporarily paused for this ad account.");
      }
      setAccountName(resolveManagementDisplayName({
        platform: "meta",
        accountId: normalized,
        canonicalName: accountName,
        providerName: previewPayload.sections.find((section) => section.platform === "meta")?.accountName || previewPayload.companyName,
      }));
      return previewPayload;
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.payload.code === "meta_circuit_open") {
        setMetaProtection({
          source: "stale-cache",
          circuitOpen: true,
          blockedUntil: typeof caught.payload.blockedUntil === "string" ? caught.payload.blockedUntil : null,
          reason: typeof caught.payload.reason === "string" ? caught.payload.reason : caught.message,
        });
      }
      setError(message(caught, "Unable to load this Meta Ads account. Please verify access and try again."));
      return null;
    } finally {
      setLoading(false);
    }
  }, [accountId, accountName, dates]);

  useEffect(() => {
    if (!queryAccountId) return;
    const key = `${queryAccountId}:${queryDates.startDate}:${queryDates.endDate}`;
    if (canonicalLoadKey.current === key) return;
    canonicalLoadKey.current = key;
    setAccountId(queryAccountId);
    setAccountName(queryAccountName);
    setAccountQuery(queryAccountName);
    setDates(queryDates);
    setTab(queryTab);
    setRequestPrefill(null);
    setStagePayloads({});
    setMetaProtection(undefined);
    void load(queryAccountId, queryDates, metaStageForTab(queryTab) ?? "campaigns");
  }, [load, queryAccountId, queryAccountName, queryDates, queryTab]);

  useEffect(() => {
    if (!accountId) return;
    const view = canonicalViewFromMetaTab(tab);
    const query = buildCanonicalManagementQuery({ platform: "meta", accountId, accountName: params.get("accountName")?.trim() || accountName, ...dates, view });
    if (params.toString() !== query) router.replace(`/manage?${query}`, { scroll: false });
  }, [accountId, accountName, dates, params, router, tab]);

  useEffect(() => {
    if (!metaProtection?.circuitOpen || !metaProtection.blockedUntil) return;
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [metaProtection]);

  const loadOverall = useCallback(async (id: string, nextDates = dates) => {
    const normalized = id.replace(/^act_/, "").replace(/\D/g, "");
    if (!normalized) return null;
    setOverallLoading(true);
    try {
      const query = new URLSearchParams({ metaAccountId: normalized, startDate: nextDates.startDate, endDate: nextDates.endDate });
      const payload = await api<OverallReportPayload>(`/api/reporting?${query}`);
      setOverall(payload);
      return payload;
    } catch (caught) {
      setError(message(caught, "Unable to load Meta recommendations."));
      return null;
    } finally {
      setOverallLoading(false);
    }
  }, [dates]);

  useEffect(() => {
    if (!accountResultsOpen || accountQuery.trim().length < 2 || accountQuery === accountName) {
      setAccountResults([]);
      setAccountSearching(false);
      return;
    }
    const cached = readMetaAccountCache(accountQuery.trim());
    if (cached) {
      setAccountResults(cached);
      setAccountSearching(false);
      return;
    }
    setAccountSearching(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/notion/accounts/search?q=${encodeURIComponent(accountQuery.trim())}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => response.ok ? response.json() as Promise<{ accounts?: AccountSuggestion[] }> : { accounts: [] })
        .then((payload) => {
          const accounts = (payload.accounts ?? []).filter(isMetaManagementAccountSuggestion);
          setAccountResults(accounts);
          writeMetaAccountCache(accountQuery.trim(), accounts);
          setCachedAccounts(readAllCachedMetaAccounts());
        })
        .catch(() => setAccountResults([]))
        .finally(() => {
          if (!controller.signal.aborted) setAccountSearching(false);
        });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [accountName, accountQuery, accountResultsOpen]);

  useEffect(() => {
    function closeAccountResults(event: PointerEvent) {
      if (!accountSearchRef.current?.contains(event.target as Node)) {
        setAccountResultsOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeAccountResults);
    return () => document.removeEventListener("pointerdown", closeAccountResults);
  }, []);

  useEffect(() => {
    if (tab === "opportunities" && accountId && preview && !overall && !loading && !overallLoading) {
      void loadOverall(accountId);
    }
  }, [accountId, loadOverall, loading, overall, overallLoading, preview, tab]);

  const metaSection = preview?.sections.find((section) => section.platform === "meta") ?? null;
  const campaigns = metaSection?.campaigns ?? [];
  const adSets = campaigns.flatMap((campaign) => campaign.children.map((adSet) => ({ campaign, adSet })));
  const ads = adSets.flatMap(({ campaign, adSet }) => adSet.ads.map((ad) => ({ campaign, adSet, ad })));
  const summary = overall?.summaries.find((section) => section.platform === "meta") ?? null;
  const campaignGroups = overall?.campaignGroups.filter((group) => group.platform === "meta") ?? [];

  function chooseAccount(account: AccountSuggestion) {
    const nextRecent = [account, ...recentAccounts.filter((item) => item.adAccountId !== account.adAccountId)].slice(0, 5);
    setRecentAccounts(nextRecent);
    writeRecentMetaAccounts(nextRecent);
    setAccountResultsOpen(false);
    setAccountSearching(false);
    setAccountResults([]);
    setAccountQuery(account.accountName);
    setAccountName(account.accountName);
    setAccountResults([]);
    setRequestPrefill(null);
    setStagePayloads({});
    setMetaProtection(undefined);
    void load(account.adAccountId, dates, "campaigns");
  }

  const knownAccounts = uniqueMetaAccounts([...recentAccounts, ...cachedAccounts]).slice(0, 10);
  const resultIds = new Set(accountResults.map((account) => account.adAccountId));
  const visibleKnownAccounts = knownAccounts.filter((account) => !resultIds.has(account.adAccountId));

  function changeDates(next: { startDate: string; endDate: string }) {
    setDates(next);
    setStagePayloads({});
    setMetaProtection(undefined);
    const stage = metaStageForTab(tab) ?? "campaigns";
    if (accountId) void load(accountId, next, stage);
  }

  function refreshOfficialData() {
    if (!accountId) return;
    const stage = metaStageForTab(tab);
    if (stage) void load(accountId, dates, stage);
  }

  function openRequest(resource: M03MetaManagementResource, fieldPath?: string) {
    setRequestPrefill(buildMetaManagementRequestPrefill({ accountIdentity: accountId, accountName, resource, fieldPath }));
    const selection = selectMetaChangeRequestNavigation(fieldPath?.startsWith("ad.copy.") || fieldPath?.startsWith("ad.creative.") ? "creative" : resource.entityType);
    setChangeRequestFilter(selection.changeRequestFilter);
    setChangeRequestsOpen(selection.changeRequestsOpen);
    setTab(selection.tab);
  }

  function selectPrimaryTab(nextTab: Exclude<MetaManagementTab, "change_requests">) {
    const selection = selectMetaPrimaryNavigation(nextTab);
    setTab(selection.tab);
    setChangeRequestsOpen(selection.changeRequestsOpen);
    const stage = metaStageForTab(selection.tab);
    if (stage && accountId) {
      const cached = stagePayloads[stage];
      if (cached) {
        setPreview(cached);
        setMetaProtection(cached.metaProtection);
        setError(cached.metaProtection?.circuitOpen ? cached.metaProtection.reason : null);
      } else if (!loading) {
        void load(accountId, dates, stage);
      }
    }
  }

  function selectChangeRequestFilter(filter: MetaChangeRequestNavigationFilter) {
    const selection = selectMetaChangeRequestNavigation(filter);
    setRequestPrefill(null);
    setChangeRequestFilter(selection.changeRequestFilter);
    setChangeRequestsOpen(selection.changeRequestsOpen);
    setTab(selection.tab);
  }

  async function refreshManagementResources() {
    if (!accountId) return null;
    const stage = metaStageForTab(tab) ?? "campaigns";
    const payload = await load(accountId, dates, stage);
    const section = payload?.sections.find((candidate) => candidate.platform === "meta");
    return section ? collectMetaManagementResources(section.campaigns) : null;
  }

  return (
    <ReportShell
      title="Ads Management"
      dateLabel={`${dates.startDate} – ${dates.endDate}`}
      hideHeaderDateControl
      compactResponsive
      initialRole={initialRole}
      activeQuery={accountId ? new URLSearchParams({ metaAccountId: accountId, startDate: dates.startDate, endDate: dates.endDate }).toString() : ""}
    >
      <div className={`mx-auto space-y-5 ${accountId ? "max-w-7xl" : "max-w-3xl"}`}>
        <UnifiedManagementAccountSearch selection={accountId ? { platform: "meta", accountId, accountName } : null} />
        {false ? <section className="relative z-30 rounded-2xl border bg-white p-5 shadow-sm">
          <label className="block text-sm font-semibold text-slate-800" htmlFor="meta-management-account-search">
            Meta Ads account search
          </label>
          <div ref={accountSearchRef} className="relative mt-2">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="meta-management-account-search"
                  value={accountQuery}
                  onChange={(event) => {
                    setAccountQuery(event.target.value);
                    setAccountResultsOpen(true);
                  }}
                  onFocus={() => setAccountResultsOpen(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setAccountResultsOpen(false);
                      setAccountSearching(false);
                      return;
                    }
                    if (event.key === "Enter" && accountQuery.trim()) {
                      setAccountResultsOpen(false);
                      void load(accountQuery.trim());
                    }
                  }}
                  className="bg-white pl-9 pr-10"
                  placeholder="Search company or enter a Meta ad-account ID"
                  aria-label="Meta Ads account search"
                  autoComplete="off"
                />
                {accountSearching ? <LoaderCircleIcon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-red-700" aria-label="Searching accounts" /> : null}
              </div>
              {accountResultsOpen ? (
                <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[80] max-h-80 overflow-y-auto rounded-xl border bg-white p-2 shadow-2xl">
                  <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Results</p>
                  {accountQuery.trim().length < 2 ? <p className="px-3 py-2 text-sm text-muted-foreground">Type at least 2 characters to search accounts.</p> : accountSearching ? <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"><LoaderCircleIcon className="size-4 animate-spin" /> Searching accounts…</div> : accountResults.length ? accountResults.map((account) => <MetaAccountOption key={`result:${account.notionPageId ?? "meta"}:${account.adAccountId}`} account={account} onSelect={chooseAccount} />) : <p className="px-3 py-2 text-sm text-muted-foreground">No matching Facebook accounts found.</p>}
                  <div className="mt-1 border-t pt-1">
                    <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent</p>
                    {visibleKnownAccounts.length ? visibleKnownAccounts.map((account) => <MetaAccountOption key={`known:${account.notionPageId ?? "meta"}:${account.adAccountId}`} account={account} onSelect={chooseAccount} />) : <p className="px-3 py-2 text-sm text-muted-foreground">No cached accounts yet. Search and open an account to keep it here.</p>}
                  </div>
                </div>
              ) : null}
          </div>
          <p className="mt-2 text-xs text-slate-500">Select an account to retrieve its latest Meta Ads data and governed change-control workspace.</p>
          {accountId ? <div className="mt-4 border-t border-slate-200 pt-5"><p className="text-xl font-semibold sm:text-2xl">{accountName || accountId}</p><p className="text-xs text-muted-foreground sm:text-sm">Meta ad account {accountId}</p></div> : null}
        </section> : null}

        {accountId ? <section className="relative z-20 flex flex-col gap-2 rounded-xl border bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"><ReportHeaderMonthPicker startDate={dates.startDate} endDate={dates.endDate} onChange={changeDates} variant="compact" /><Button size="sm" variant="outline" disabled={loading || isMetaCircuitBlocked(metaProtection, clock)} onClick={refreshOfficialData}><RefreshCwIcon className={loading ? "animate-spin" : ""} /> Refresh official data</Button></section> : null}

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"><p className="font-semibold">Meta Ads Management is unavailable</p><p className="mt-1 text-sm">{error}</p>{isMetaCircuitBlocked(metaProtection, clock) && metaProtection?.blockedUntil ? <p className="mt-2 text-xs font-medium">Manual refresh becomes available {new Date(metaProtection.blockedUntil).toLocaleString()}.</p> : null}</div> : null}
        {accountId ? (
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
            <ManagementSectionNavigation value={canonicalViewFromMetaTab(tab)} onChange={(next) => {
              if (next === "change_requests") selectChangeRequestFilter("requests");
              else selectPrimaryTab(metaPrimaryTabFromCanonicalView(next));
            }} />
            <div className="min-w-0 space-y-5">
            {loading ? (tab === "overview" ? <MetaOverviewSkeleton /> : <MetaResourceSkeleton />) : null}
            {!loading && preview && tab === "overview" ? <Overview summary={summary} campaignGroups={campaignGroups} campaigns={campaigns} warnings={overall?.warnings ?? []} /> : null}
            {!loading && preview && tab === "campaigns" ? <MetaCampaignsPage campaigns={campaigns} onEdit={(campaign) => openRequest(toMetaCampaignManagementResource(campaign))} /> : null}
            {!loading && preview && tab === "ad_sets" ? <MetaAdSetsPage rows={adSets} onEdit={(campaign, adSet) => openRequest(toMetaAdSetManagementResource(campaign, adSet))} /> : null}
            {!loading && preview && tab === "ads" ? <MetaAdsPage rows={ads} onEdit={(campaign, adSet, ad) => openRequest(toMetaAdManagementResource(campaign, adSet, ad))} /> : null}
            {!loading && preview && tab === "creatives" ? <CreativeList rows={ads} onSelect={(campaign, adSet, ad) => openRequest(toMetaAdManagementResource(campaign, adSet, ad), "ad.copy.primary_text")} /> : null}
            {!loading && preview && tab === "audience" ? overall ? <AudiencePanel overall={overall} section={metaSection} /> : <EmptyPanel title="Audience data unavailable" text="Reload the selected account to retrieve its audience and placement data." /> : null}
            {!loading && preview && tab === "opportunities" ? (
              overallLoading ? <MetaResourceSkeleton /> : <MetaRecommendations
                campaigns={campaigns}
                campaignGroups={campaignGroups}
                warnings={overall?.warnings ?? []}
                onRequestChange={(recommendation) => {
                  const campaign = campaigns.find((candidate) => candidate.id === recommendation.campaignId);
                  if (campaign) openRequest(toMetaCampaignManagementResource(campaign), recommendation.fieldPath);
                }}
              />
            ) : null}
            {!loading && preview && tab === "change_requests" ? <MetaChangeRequestsPanel
              accountId={accountId}
              accountName={accountName}
              filter={changeRequestFilter}
              requestPrefill={requestPrefill}
              campaigns={campaigns}
              adSets={adSets}
              ads={ads}
              onRequest={openRequest}
              onRefreshOfficialData={refreshManagementResources}
            /> : null}
            </div>
          </div>
        ) : <section className="rounded-2xl border border-dashed bg-white p-10 text-center shadow-sm"><SearchIcon className="mx-auto size-8 text-slate-400" /><h2 className="mt-3 text-lg font-semibold">Find a Meta Ads account</h2><p className="mt-1 text-sm text-slate-500">Search by company name or Meta ad-account ID. Recent and repeated searches load from this browser first.</p></section>}
      </div>
    </ReportShell>
  );
}

function MetaManagementNavigation({ tab, changeRequestFilter, changeRequestsOpen, onPrimarySelect, onChangeRequestSelect, onChangeRequestsOpenChange }: {
  tab: MetaManagementTab;
  changeRequestFilter: MetaChangeRequestNavigationFilter;
  changeRequestsOpen: boolean;
  onPrimarySelect: (tab: Exclude<MetaManagementTab, "change_requests">) => void;
  onChangeRequestSelect: (filter: MetaChangeRequestNavigationFilter) => void;
  onChangeRequestsOpenChange: (open: boolean) => void;
}) {
  const mobileValue = tab === "change_requests" ? `change:${changeRequestFilter}` : tab;

  function selectMobile(value: string) {
    if (value.startsWith("change:")) {
      onChangeRequestSelect(value.slice("change:".length) as MetaChangeRequestNavigationFilter);
      return;
    }
    onPrimarySelect(value as Exclude<MetaManagementTab, "change_requests">);
  }

  return <div className="lg:sticky lg:top-3">
    <div className="rounded-xl border bg-white p-3 shadow-sm lg:hidden">
      <Select value={mobileValue} onValueChange={selectMobile}>
        <SelectTrigger aria-label="Meta management section" className="w-full bg-white"><SelectValue placeholder="Choose a section" /></SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectGroup>
            <SelectLabel>Meta management</SelectLabel>
            {PRIMARY_TABS.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Change requests</SelectLabel>
            {META_CHANGE_REQUEST_NAVIGATION.map(({ value, label }) => <SelectItem key={value} value={`change:${value}`}>{label}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>

    <aside className="hidden rounded-xl border bg-white p-2 shadow-sm lg:block" aria-label="Meta management navigation">
      <nav className="space-y-1">
        {PRIMARY_TABS.map(({ value, label, icon: Icon }) => <button key={value} type="button" onClick={() => onPrimarySelect(value)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${tab === value ? "bg-red-50 text-red-800 ring-1 ring-red-200" : "text-slate-700 hover:bg-slate-50"}`}><Icon className="size-4 shrink-0" /><span>{label}</span></button>)}
      </nav>

      <div className="mx-2 my-3 border-t" />

      <Collapsible open={changeRequestsOpen} onOpenChange={onChangeRequestsOpenChange} className="group/change-requests">
        <CollapsibleTrigger className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${tab === "change_requests" ? "bg-red-50 text-red-800 ring-1 ring-red-200" : "text-slate-700 hover:bg-slate-50"}`}>
          <ClipboardListIcon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">Change requests</span>
          <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-[state=open]/change-requests:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <nav className="mt-1 space-y-1 border-l border-slate-200 pl-2 ml-5" aria-label="Change request options">
            {META_CHANGE_REQUEST_NAVIGATION.map(({ value, label, icon: Icon }) => {
              const fieldCount = metaChangeFieldsForNavigationFilter(value).length;
              return <button key={value} type="button" onClick={() => onChangeRequestSelect(value)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${tab === "change_requests" && changeRequestFilter === value ? "bg-red-50 font-medium text-red-800" : "text-slate-600 hover:bg-slate-50"}`}><Icon className="size-3.5 shrink-0" /><span className="min-w-0 flex-1">{label}</span>{fieldCount ? <span className="text-xs tabular-nums text-muted-foreground">{fieldCount}</span> : null}</button>;
            })}
          </nav>
        </CollapsibleContent>
      </Collapsible>

      <p className="mx-2 mt-3 border-t px-1 pt-3 text-xs leading-5 text-muted-foreground">Provider execution remains locked.</p>
    </aside>
  </div>;
}

const META_CHANGE_REQUEST_NAVIGATION: Array<{ value: MetaChangeRequestNavigationFilter; label: string; icon: typeof BarChart3Icon }> = [
  { value: "requests", label: "All requests", icon: ClipboardListIcon },
  { value: "campaign", label: "Campaign", icon: MegaphoneIcon },
  { value: "ad_set", label: "Ad sets", icon: LayoutGridIcon },
  { value: "ad", label: "Ads", icon: FilePenLineIcon },
  { value: "creative", label: "Creative", icon: ImageIcon },
];

function MetaChangeRequestsPanel({ accountId, accountName, filter, requestPrefill, campaigns, adSets, ads, onRequest, onRefreshOfficialData }: {
  accountId: string;
  accountName: string;
  filter: MetaChangeRequestNavigationFilter;
  requestPrefill: M03RequestPrefill | null;
  campaigns: PreviewCampaignNode[];
  adSets: Array<{ campaign: PreviewCampaignNode; adSet: PreviewAdGroupNode }>;
  ads: Array<{ campaign: PreviewCampaignNode; adSet: PreviewAdGroupNode; ad: PreviewAdNode }>;
  onRequest: (resource: M03MetaManagementResource, fieldPath?: string) => void;
  onRefreshOfficialData: () => Promise<readonly M03MetaManagementResource[] | null>;
}) {
  const fields = metaChangeFieldsForNavigationFilter(filter);
  const showWorkspace = filter === "requests" || Boolean(requestPrefill);

  return (
      <div className="min-w-0">
        {showWorkspace ? <M03RequestWorkspace
          key={accountId}
          scope={{ platform: "meta", accountIdentity: accountId }}
          prefill={requestPrefill}
          showNewRequestAction={false}
          focusEditorWhenOpen
          metaManagement={{
            accountIdentity: accountId,
            accountName,
            resources: collectMetaManagementResources(campaigns),
            onRefreshOfficialData,
          }}
        /> : <div className="space-y-4">
          <Card className="gap-3 bg-white">
            <CardHeader>
              <CardTitle>{META_CHANGE_REQUEST_NAVIGATION.find((item) => item.value === filter)?.label} changes</CardTitle>
              <CardDescription>Select a synchronized resource. The request editor will show only official supported fields for this area.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {fields.map((field) => <Badge key={field.field_path} variant="outline" className="bg-slate-50">{field.label}</Badge>)}
            </CardContent>
          </Card>
          {filter === "campaign" ? <CampaignList campaigns={campaigns} onSelect={(campaign) => onRequest(toMetaCampaignManagementResource(campaign))} /> : null}
          {filter === "ad_set" ? <AdSetList rows={adSets} onSelect={(campaign, adSet) => onRequest(toMetaAdSetManagementResource(campaign, adSet))} /> : null}
          {filter === "ad" ? <AdList rows={ads} onSelect={(campaign, adSet, ad) => onRequest(toMetaAdManagementResource(campaign, adSet, ad))} /> : null}
          {filter === "creative" ? <CreativeList rows={ads} onSelect={(campaign, adSet, ad) => onRequest(toMetaAdManagementResource(campaign, adSet, ad), "ad.copy.primary_text")} /> : null}
        </div>}
      </div>
  );
}

const META_METRIC_SKELETON_LABELS = ["Results", "Cost/Results", "Clicks", "CTR (%)", "CPM", "Impression", "Ads Spent"];

function MetaOverviewSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading Meta results">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {META_METRIC_SKELETON_LABELS.map((label) => (
          <Card key={label} className="gap-0 py-0">
            <CardContent className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
              <Skeleton className="mt-2 h-6 w-24" />
              <Skeleton className="mt-2 h-3 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Campaign performance</CardTitle>
          <Skeleton className="h-4 w-64 max-w-full" />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="p-3">Campaign</th><th className="p-3">Impressions</th><th className="p-3">Clicks</th><th className="p-3">CTR</th><th className="p-3">Results</th><th className="p-3">Spend</th></tr></thead>
              <tbody>
                {[0, 1, 2].map((row) => (
                  <tr key={row} className="border-b last:border-0">
                    {["w-56", "w-20", "w-14", "w-14", "w-20", "w-20"].map((width, cell) => <td key={cell} className="p-3"><Skeleton className={`h-4 ${width}`} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetaResourceSkeleton() {
  return <div className="space-y-8"><ManagementPerformanceSkeleton /><div><ManagementEntityReportSkeleton /><div className="border-x border-b bg-white px-4 py-3"><Skeleton className="h-8 w-full" /></div></div></div>;
}

function Overview({ summary, campaignGroups, campaigns, warnings }: { summary: SummarySection | null; campaignGroups: CampaignGroup[]; campaigns: PreviewCampaignNode[]; warnings: string[] }) {
  const rows = campaignGroups.flatMap((group) => group.rows);
  const activity = getMetaManagementActivityState({ surface: "overview", campaignCount: campaigns.length, performanceRowCount: rows.length, warnings });
  if (activity.kind === "no_qualifying_activity") {
    return <NoMetaActivityPanel title={activity.title} description={activity.description} campaignCount={campaigns.length} />;
  }
  return <div className="space-y-5"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{summary?.metrics.slice(0, 8).map((metric) => <Card key={metric.key} className="gap-0 py-0"><CardContent className="p-4"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{metric.label}</p><p className="mt-1 text-xl font-semibold">{metric.displayValue ?? number(metric.value)}</p>{metric.delta != null ? <p className={`mt-0.5 text-[11px] ${metric.delta >= 0 ? "text-emerald-700" : "text-red-700"}`}>{metric.delta >= 0 ? "+" : ""}{metric.delta.toFixed(1)}%</p> : null}</CardContent></Card>)}</div><CampaignPerformanceTable rows={rows} campaignCount={campaigns.length} /></div>;
}

function CampaignPerformanceTable({ rows, campaignCount }: { rows: CampaignGroup["rows"]; campaignCount: number }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<MetaPageSize>(10);
  const pagination = paginateRows(rows, page, pageSize);
  return <Card><CardHeader><CardTitle>Campaign performance</CardTitle><CardDescription>{campaignCount} synchronized campaigns · {rows.length} performance rows</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="p-3">Campaign</th><th className="p-3">Impressions</th><th className="p-3">Clicks</th><th className="p-3">CTR</th><th className="p-3">Results</th><th className="p-3">Spend</th></tr></thead><tbody>{pagination.items.map((row) => <tr key={row.id} className="border-b last:border-0"><td className="p-3 font-medium">{row.campaignName}</td><td className="p-3">{number(row.impressions)}</td><td className="p-3">{number(row.clicks)}</td><td className="p-3">{row.ctr.toFixed(2)}%</td><td className="p-3">{number(row.results)}</td><td className="p-3">{currency(row.spend)}</td></tr>)}</tbody></table></div>{rows.length ? <PaginationControls pagination={pagination} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} /> : null}</CardContent></Card>;
}

function MetaRecommendations({ campaigns, campaignGroups, warnings, onRequestChange }: { campaigns: PreviewCampaignNode[]; campaignGroups: CampaignGroup[]; warnings: string[]; onRequestChange: (recommendation: MetaManagementRecommendation) => void }) {
  const rows = campaignGroups.flatMap((group) => group.rows);
  const recommendations = buildMetaManagementRecommendations(rows);
  const activity = getMetaManagementActivityState({ surface: "recommendations", campaignCount: campaigns.length, performanceRowCount: rows.length, warnings });

  if (activity.kind === "no_qualifying_activity") {
    return <NoMetaActivityPanel title="Recommendations need performance activity" description={`${activity.description} Recommendations will appear after Meta returns qualifying campaign performance.`} campaignCount={campaigns.length} />;
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-700">Meta Ads</p>
          <CardTitle className="text-2xl">Recommendations</CardTitle>
          <CardDescription>Evidence-based suggestions calculated from synchronized Meta performance. These are dashboard recommendations, not provider-issued instructions.</CardDescription>
        </CardHeader>
      </Card>
      <div className="flex flex-wrap gap-2 rounded-xl border bg-white p-3 shadow-sm">
        <Badge variant="outline" className="border-red-200 bg-red-50 text-red-800">All ({recommendations.length})</Badge>
        <Badge variant="outline">Efficiency ({recommendations.filter((item) => item.category === "Efficiency").length})</Badge>
        <Badge variant="outline">Growth ({recommendations.filter((item) => item.category === "Growth").length})</Badge>
      </div>
      {recommendations.length ? recommendations.map((recommendation) => (
        <Card key={recommendation.id}>
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2"><LightbulbIcon className="size-4 text-red-700" /><Badge variant="outline">{recommendation.category}</Badge></div>
              <CardTitle className="mt-3">{recommendation.title}</CardTitle>
              <CardDescription className="mt-2 max-w-3xl">{recommendation.description}</CardDescription>
            </div>
            <Button className="shrink-0 bg-red-600 text-white hover:bg-red-700" onClick={() => onRequestChange(recommendation)}>Request change</Button>
          </CardHeader>
          <CardContent><div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm"><span className="font-semibold text-slate-900">Performance evidence</span><span className="ml-2 text-slate-600">{recommendation.evidence}</span></div></CardContent>
        </Card>
      )) : <EmptyPanel title="No actionable recommendation" text="Meta performance was returned, but it did not meet the evidence rules for a budget recommendation." />}
    </div>
  );
}

function NoMetaActivityPanel({ title, description, campaignCount }: { title: string; description: string; campaignCount: number }) {
  return <Card className="border-amber-200 bg-amber-50/70"><CardContent className="flex gap-4 p-5 sm:p-6"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700 ring-1 ring-amber-200"><AlertTriangleIcon className="size-5" /></span><div><h2 className="font-semibold text-slate-900">{title}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>{campaignCount > 0 ? <p className="mt-3 text-sm font-medium text-slate-800">The synchronized account structure is still available in Campaigns, Ad sets, and Ads.</p> : null}</div></CardContent></Card>;
}

type MetaReportRow = {
  id: string;
  name: string;
  status: string;
  dailyPerformance?: PreviewCampaignNode["dailyPerformance"];
  performance?: PreviewCampaignNode["performance"];
  details: Array<{ label: string; value: string }>;
  managementFields?: Record<string, unknown>;
};

function MetaCampaignsPage({ campaigns, onEdit }: { campaigns: PreviewCampaignNode[]; onEdit: (campaign: PreviewCampaignNode) => void }) {
  return <MetaEntityReport
    title="Campaign performance"
    reportTitle="Campaign report"
    reportDescription="Each campaign starts collapsed. Select View metrics to see its performance and delivery details."
    entityLabel="campaign"
    filterLabel="Campaign filter"
    allLabel="All campaigns"
    rows={campaigns}
    getRow={(campaign) => campaign}
    getSummary={(campaign) => [
      { label: "Budget", value: formatMetaBudget(campaign.managementFields, "campaign") },
      { label: "Delivery status", value: formatMetaStatus(campaign.status) },
    ]}
    onEdit={onEdit}
  />;
}

function MetaAdSetsPage({ rows, onEdit }: { rows: Array<{ campaign: PreviewCampaignNode; adSet: PreviewAdGroupNode }>; onEdit: (campaign: PreviewCampaignNode, adSet: PreviewAdGroupNode) => void }) {
  return <MetaEntityReport
    title="Ad set performance"
    reportTitle="Ad set report"
    reportDescription="Each ad set starts collapsed. Select View metrics to see its settings and performance details."
    entityLabel="ad set"
    filterLabel="Ad set filter"
    allLabel="All ad sets"
    rows={rows}
    getRow={({ adSet }) => adSet}
    getSummary={({ campaign, adSet }) => [
      { label: "Campaign", value: campaign.name },
      { label: "Delivery status", value: formatMetaStatus(adSet.status) },
    ]}
    onEdit={({ campaign, adSet }) => onEdit(campaign, adSet)}
  />;
}

function MetaAdsPage({ rows, onEdit }: { rows: Array<{ campaign: PreviewCampaignNode; adSet: PreviewAdGroupNode; ad: PreviewAdNode }>; onEdit: (campaign: PreviewCampaignNode, adSet: PreviewAdGroupNode, ad: PreviewAdNode) => void }) {
  return <MetaEntityReport
    title="Ad performance"
    reportTitle="Ad report"
    reportDescription="Each ad starts collapsed. Select View metrics to see its creative and performance details."
    entityLabel="ad"
    filterLabel="Ad filter"
    allLabel="All ads"
    rows={rows}
    getRow={({ ad }) => ad}
    getSummary={({ campaign, adSet }) => [
      { label: "Campaign", value: campaign.name },
      { label: "Ad set", value: adSet.name },
    ]}
    getAdditionalDetails={({ ad }) => [
      { label: "Headline", value: ad.creative?.title || "—" },
      { label: "Primary text", value: ad.creative?.body || "—", wide: true },
      { label: "Destination URL", value: ad.finalUrl || "—", wide: true },
      { label: "Facebook Page ID", value: ad.creative?.pageId || "—" },
      { label: "Instagram actor ID", value: ad.creative?.instagramActorId || "—" },
    ]}
    onEdit={({ campaign, adSet, ad }) => onEdit(campaign, adSet, ad)}
  />;
}

function MetaEntityReport<T>({
  title,
  reportTitle,
  reportDescription,
  entityLabel,
  filterLabel,
  allLabel,
  rows,
  getRow,
  getSummary,
  getAdditionalDetails = () => [],
  onEdit,
}: {
  title: string;
  reportTitle: string;
  reportDescription: string;
  entityLabel: string;
  filterLabel: string;
  allLabel: string;
  rows: readonly T[];
  getRow: (row: T) => MetaReportRow;
  getSummary: (row: T) => Array<{ label: string; value: string }>;
  getAdditionalDetails?: (row: T) => Array<{ label: string; value: string; wide?: boolean }>;
  onEdit: (row: T) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<MetaPageSize>(10);
  const filteredRows = useMemo(() => filter === "all" ? rows : rows.filter((row) => getRow(row).id === filter), [filter, getRow, rows]);
  const pagination = useMemo(() => paginateRows(filteredRows, page, pageSize), [filteredRows, page, pageSize]);
  const daily = useMemo(() => mergeMetaDailyPerformanceSeries(filteredRows.map((row) => getRow(row).dailyPerformance)), [filteredRows, getRow]);
  const resultLabel = daily.find((point) => point.resultLabel !== "Results")?.resultLabel || daily[0]?.resultLabel || "Results";
  const performancePoints = daily.map((point) => ({ date: point.date, cost: point.spend, results: point.results, clicks: point.clicks }));
  const authoritativeCostPerResult = resolveMetaManagementCostPerResult(
    filteredRows.map((row) => getRow(row).performance),
  );
  const performanceDetails = (row: MetaReportRow) => [
    ...row.details,
    { label: "Spend", value: currency(row.performance?.spend) },
    { label: row.performance?.resultLabel || "Results", value: number(row.performance?.results) },
    { label: "Impressions", value: number(row.performance?.impressions) },
    { label: "Clicks", value: number(row.performance?.clicks) },
    { label: "CTR", value: row.performance ? `${number(row.performance.ctr)}%` : "—" },
    { label: "CPC", value: currency(row.performance?.cpc) },
    { label: "CPM", value: currency(row.performance?.cpm) },
    { label: "Cost / result", value: currency(row.performance?.costPerResult) },
    { label: "Landing-page views", value: number(row.performance?.landingPageViews) },
    { label: "Link clicks", value: number(row.performance?.linkClicks) },
  ];

  return <div className="space-y-8">
    <div className="py-1"><ManagementPerformancePanel points={performancePoints} authoritativeCostPerResult={authoritativeCostPerResult} title={title} subtitle={`${filter === "all" ? allLabel : filteredRows[0] ? getRow(filteredRows[0]).name : `Selected ${entityLabel}`} · daily official Meta Ads metrics`} headerControl={<Select value={filter} onValueChange={(value) => { setFilter(value); setPage(1); }}><SelectTrigger aria-label={filterLabel} className="w-full bg-white sm:w-72"><SelectValue placeholder={`Select ${entityLabel}`} /></SelectTrigger><SelectContent position="popper" align="end" className="max-h-[22rem]"><SelectItem value="all">{allLabel}</SelectItem>{rows.map((row) => { const entity = getRow(row); return <SelectItem key={entity.id} value={entity.id}>{entity.name}</SelectItem>; })}</SelectContent></Select>} labels={{ cost: "Spend", results: resultLabel, clicks: "Clicks", costPerResult: "Cost / result" }} emptyTitle="No performance activity in this date range" emptyDescription={`Meta returned no daily spend, result, or click rows for the selected ${entityLabel}.`} chartAriaLabel={`Meta ${entityLabel} performance line chart`} /></div>
    <div>
      <section className="overflow-hidden rounded-t-2xl border border-b-0 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-5"><div><h3 className="font-semibold">{reportTitle}</h3><p className="mt-1 text-xs text-slate-500">{reportDescription}</p></div><span className="text-xs text-slate-500">{filteredRows.length} {entityLabel}{filteredRows.length === 1 ? "" : "s"}</span></div>
        {pagination.items.length ? <div className="divide-y">{pagination.items.map((item) => {
          const row = getRow(item);
          return <Collapsible key={row.id} defaultOpen={false} className="group"><div className="grid items-center gap-4 py-4 pl-5 pr-7 md:grid-cols-[minmax(0,1fr)_40px_minmax(150px,220px)_minmax(150px,200px)_128px]"><div className="min-w-0"><span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">{entityLabel}</span><div className="flex min-w-0 items-center gap-3"><ManagementStatusDot status={row.status} /><ManagementEntityName text={row.name} multiline={entityLabel === "ad"} /></div></div><Button type="button" size="icon-sm" variant="ghost" className="ads-edit-action justify-self-center text-red-700" aria-label={`Edit ${entityLabel} ${row.name}`} onClick={() => onEdit(item)}><PencilIcon /></Button>{getSummary(item).map((summary) => <div key={summary.label} className="min-w-0 text-sm"><span className="block text-[11px] uppercase tracking-wide text-slate-400">{summary.label}</span><span className="block truncate font-medium" title={summary.value}>{summary.value}</span></div>)}<CollapsibleTrigger asChild><Button type="button" variant="outline" size="sm" className="w-32 justify-center"><span className="group-data-[state=open]:hidden">View metrics</span><span className="hidden group-data-[state=open]:inline">Hide metrics</span><ChevronDownIcon className="transition-transform group-data-[state=open]:rotate-180" /></Button></CollapsibleTrigger></div><CollapsibleContent className="border-t bg-slate-50/70 px-5 py-5"><ManagementDetailGrid details={[...performanceDetails(row), ...getAdditionalDetails(item)]} /></CollapsibleContent></Collapsible>;
        })}</div> : <div className="p-8 text-center text-sm text-slate-500">No {entityLabel}s match this filter.</div>}
      </section>
      <ManagementPaginationFooter model={{ ...pagination, setPage, setPageSize: (value) => { setPageSize(value); setPage(1); } }} />
    </div>
  </div>;
}

function formatMetaBudget(fields: Record<string, unknown> | undefined, entity: "campaign" | "ad_set") {
  const daily = Number(fields?.[`${entity}.budget.daily`]);
  const lifetime = Number(fields?.[`${entity}.budget.lifetime`]);
  if (Number.isFinite(daily) && daily > 0) return `${currency(daily / 100)}/day`;
  if (Number.isFinite(lifetime) && lifetime > 0) return `${currency(lifetime / 100)} lifetime`;
  return "—";
}

function formatMetaStatus(status: string) {
  return status ? status.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unknown";
}

function CampaignList({ campaigns, onSelect }: { campaigns: PreviewCampaignNode[]; onSelect: (campaign: PreviewCampaignNode) => void }) {
  return <PaginatedResourceCard title="Campaigns" description={`${campaigns.length} synchronized Meta campaigns`} rows={campaigns} renderRow={(campaign) => <ResourceRow key={campaign.id} name={campaign.name} status={campaign.status} subtitle={`${campaign.objective || campaign.type || "Meta campaign"} · ${campaign.id}`} performance={campaign.performance} onSelect={() => onSelect(campaign)} />} />;
}
function AdSetList({ rows, onSelect }: { rows: Array<{ campaign: PreviewCampaignNode; adSet: PreviewAdGroupNode }>; onSelect: (campaign: PreviewCampaignNode, adSet: PreviewAdGroupNode) => void }) {
  return <PaginatedResourceCard title="Ad sets" description={`${rows.length} synchronized Meta ad sets`} rows={rows} renderRow={({ campaign, adSet }) => <ResourceRow key={adSet.id} name={adSet.name} status={adSet.status} subtitle={`${campaign.name} · ${adSet.id}`} performance={adSet.performance} onSelect={() => onSelect(campaign, adSet)} />} />;
}
function AdList({ rows, onSelect }: { rows: Array<{ campaign: PreviewCampaignNode; adSet: PreviewAdGroupNode; ad: PreviewAdNode }>; onSelect: (campaign: PreviewCampaignNode, adSet: PreviewAdGroupNode, ad: PreviewAdNode) => void }) {
  return <PaginatedResourceCard title="Ads" description={`${rows.length} synchronized Meta ads`} rows={rows} renderRow={({ campaign, adSet, ad }) => <ResourceRow key={ad.id} name={ad.name} status={ad.status} subtitle={`${campaign.name} · ${adSet.name} · ${ad.id}`} performance={ad.performance} onSelect={() => onSelect(campaign, adSet, ad)} />} />;
}
function CreativeList({ rows, onSelect }: { rows: Array<{ campaign: PreviewCampaignNode; adSet: PreviewAdGroupNode; ad: PreviewAdNode }>; onSelect: (campaign: PreviewCampaignNode, adSet: PreviewAdGroupNode, ad: PreviewAdNode) => void }) {
  const creativeRows = rows.filter(({ ad }) => ad.creative);
  return <PaginatedResourceCard title="Creatives" description={`${creativeRows.length} synchronized creative records`} rows={creativeRows} renderRow={({ campaign, adSet, ad }) => { const previewImage = ad.creative?.imageUrl || ad.creative?.thumbnailUrl; return <div key={ad.id} className="grid gap-4 border-b p-4 last:border-0 md:grid-cols-[112px_minmax(0,1fr)_auto] md:items-center">{previewImage ? <div role="img" aria-label="Meta creative preview" className="h-24 w-28 rounded-lg border bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(previewImage).slice(1, -1)})` }} /> : <div className="flex h-24 w-28 items-center justify-center rounded-lg border bg-slate-50"><ImageIcon className="size-7 text-slate-400" /></div>}<div className="min-w-0"><p className="font-semibold">{ad.creative?.title || ad.creative?.name || ad.name}</p><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{ad.creative?.body || ad.creative?.description || "No creative copy returned."}</p><p className="mt-2 text-xs text-muted-foreground">{campaign.name} · {adSet.name}</p></div><Button variant="outline" onClick={() => onSelect(campaign, adSet, ad)}><FilePenLineIcon /> Request change</Button></div>; }} />;
}

function AudiencePanel({ overall, section }: { overall: OverallReportPayload; section: PreviewPlatformSection | null }) {
  const audience = overall.audienceClickBreakdown;
  const placements = section?.campaigns.flatMap((campaign) => campaign.platformDistribution ?? []).reduce<Record<string, number>>((acc, row) => { const key = `${row.platform} · ${row.device}`; acc[key] = (acc[key] ?? 0) + row.results; return acc; }, {}) ?? {};
  return <div className="grid gap-5 lg:grid-cols-2"><Breakdown title="Age" rows={audience.age.filter(isMetaAudience)} /><Breakdown title="Gender" rows={audience.gender.filter(isMetaAudience)} /><Breakdown title="Regions" rows={audience.location.region.filter(isMetaAudience)} /><Card><CardHeader><CardTitle>Placements</CardTitle><CardDescription>Provider platform and device distribution</CardDescription></CardHeader><CardContent className="space-y-2">{Object.entries(placements).length ? Object.entries(placements).sort((a, b) => b[1] - a[1]).map(([label, value]) => <div key={label} className="flex items-center justify-between rounded-lg border px-3 py-2"><span>{label}</span><strong>{number(value)}</strong></div>) : <p className="text-sm text-muted-foreground">No placement distribution was returned for this date range.</p>}</CardContent></Card></div>;
}

function ResourceCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="p-0">{children || <p className="p-6 text-sm text-muted-foreground">No records returned.</p>}</CardContent></Card>; }
function PaginatedResourceCard<T>({ title, description, rows, renderRow }: { title: string; description: string; rows: readonly T[]; renderRow: (row: T) => React.ReactNode }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<MetaPageSize>(10);
  const pagination = paginateRows(rows, page, pageSize);
  return <ResourceCard title={title} description={description}>{rows.length ? <>{pagination.items.map(renderRow)}<div className="px-4 pb-4"><PaginationControls pagination={pagination} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} /></div></> : null}</ResourceCard>;
}
function PaginationControls({ pagination, onPageChange, onPageSizeChange }: { pagination: ReturnType<typeof paginateRows<unknown>>; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: MetaPageSize) => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm"><span className="text-muted-foreground">{pagination.start}–{pagination.end} of {pagination.total}</span><div className="flex flex-wrap items-center gap-2"><Select value={String(pagination.pageSize)} onValueChange={(value) => onPageSizeChange(Number(value) as MetaPageSize)}><SelectTrigger aria-label="Rows per page" className="h-8 w-[118px] bg-white"><SelectValue /></SelectTrigger><SelectContent position="popper" align="end">{META_PAGE_SIZE_OPTIONS.map((value) => <SelectItem key={value} value={String(value)}>{value} per page</SelectItem>)}</SelectContent></Select><Button size="sm" variant="outline" disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)}><ChevronLeftIcon /> Previous</Button><span className="min-w-20 text-center">Page {pagination.page} of {pagination.totalPages}</span><Button size="sm" variant="outline" disabled={pagination.page >= pagination.totalPages} onClick={() => onPageChange(pagination.page + 1)}>Next <ChevronRightIcon /></Button></div></div>;
}
function MetaAccountOption({ account, onSelect }: { account: AccountSuggestion; onSelect: (account: AccountSuggestion) => void }) { return <button type="button" onClick={() => onSelect(account)} className="flex w-full items-center rounded-lg px-3 py-3 text-left transition hover:bg-red-50"><span className="min-w-0"><strong className="block truncate text-sm">{account.accountName}</strong><span className="block text-xs text-muted-foreground">Meta Ads · {account.adAccountId}</span></span></button>; }
function ResourceRow({ name, status, subtitle, performance, onSelect }: { name: string; status: string; subtitle: string; performance?: PreviewCampaignNode["performance"]; onSelect: () => void }) { return <div className="grid gap-3 border-b p-4 last:border-0 md:grid-cols-[minmax(0,1fr)_repeat(3,110px)_auto] md:items-center"><div className="min-w-0"><p className="truncate font-semibold" title={name}>{name}</p><p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p><Badge variant="outline" className="mt-2">{status || "Unknown"}</Badge></div><Metric label="Spend" value={currency(performance?.spend)} /><Metric label="Clicks" value={number(performance?.clicks)} /><Metric label="Results" value={number(performance?.results)} /><Button variant="outline" onClick={onSelect}><FilePenLineIcon /> Request change</Button></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-[11px] uppercase text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div>; }
function Breakdown({ title, rows }: { title: string; rows: AudienceClickBreakdownItem[] }) { return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>Click distribution returned by Meta</CardDescription></CardHeader><CardContent className="space-y-2">{rows.length ? rows.slice(0, 12).map((row) => <div key={`${row.dimension}:${row.label}`} className="flex items-center justify-between rounded-lg border px-3 py-2"><span>{row.label}</span><strong>{number(row.clicks)}</strong></div>) : <p className="text-sm text-muted-foreground">No data returned for this dimension.</p>}</CardContent></Card>; }
function collectMetaManagementResources(campaigns: PreviewCampaignNode[]): M03MetaManagementResource[] {
  const resources: M03MetaManagementResource[] = [];
  for (const campaign of campaigns) {
    resources.push(toMetaCampaignManagementResource(campaign));
    for (const adSet of campaign.children) {
      resources.push(toMetaAdSetManagementResource(campaign, adSet));
      for (const ad of adSet.ads) resources.push(toMetaAdManagementResource(campaign, adSet, ad));
    }
  }
  return resources;
}
function EmptyPanel({ title, text }: { title: string; text: string }) { return <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed bg-white p-8 text-center"><AlertTriangleIcon className="size-7 text-muted-foreground" /><h2 className="mt-3 font-semibold">{title}</h2><p className="mt-1 max-w-xl text-sm text-muted-foreground">{text}</p></div>; }
function isMetaManagementAccountSuggestion(account: AccountSuggestion) { return (account.platform === "meta" || account.platform == null) && /^facebook\s*-\s*/i.test(account.accountName.trim()); }
function readMetaAccountCache(query: string): AccountSuggestion[] | null {
  try {
    const cache = JSON.parse(window.localStorage.getItem(META_ACCOUNT_CACHE_KEY) ?? "{}") as Record<string, { expiresAt?: number; accounts?: unknown }>;
    const entry = cache[query.toLowerCase()];
    if (!entry || typeof entry.expiresAt !== "number" || entry.expiresAt <= Date.now() || !Array.isArray(entry.accounts)) return null;
    return (entry.accounts as AccountSuggestion[]).filter(isMetaManagementAccountSuggestion);
  } catch {
    window.localStorage.removeItem(META_ACCOUNT_CACHE_KEY);
    return null;
  }
}
function writeMetaAccountCache(query: string, accounts: AccountSuggestion[]) {
  try {
    const cache = JSON.parse(window.localStorage.getItem(META_ACCOUNT_CACHE_KEY) ?? "{}") as Record<string, { expiresAt: number; accounts: AccountSuggestion[] }>;
    cache[query.toLowerCase()] = { expiresAt: Date.now() + META_ACCOUNT_CACHE_TTL_MS, accounts };
    const fresh = Object.entries(cache).filter(([, entry]) => entry.expiresAt > Date.now()).slice(-20);
    window.localStorage.setItem(META_ACCOUNT_CACHE_KEY, JSON.stringify(Object.fromEntries(fresh)));
  } catch {
    /* Account search remains available when localStorage is unavailable. */
  }
}
function readAllCachedMetaAccounts(): AccountSuggestion[] {
  try {
    const cache = JSON.parse(window.localStorage.getItem(META_ACCOUNT_CACHE_KEY) ?? "{}") as Record<string, { expiresAt?: number; accounts?: unknown }>;
    const accounts = Object.values(cache).flatMap((entry) => entry.expiresAt && entry.expiresAt > Date.now() && Array.isArray(entry.accounts) ? entry.accounts as AccountSuggestion[] : []);
    return uniqueMetaAccounts(accounts.filter(isMetaManagementAccountSuggestion)).slice(0, 10);
  } catch {
    window.localStorage.removeItem(META_ACCOUNT_CACHE_KEY);
    return [];
  }
}
function uniqueMetaAccounts(accounts: AccountSuggestion[]) {
  return [...new Map(accounts.map((account) => [account.adAccountId, account])).values()];
}
function readRecentMetaAccounts(): AccountSuggestion[] {
  try {
    const accounts = JSON.parse(window.localStorage.getItem(META_RECENT_ACCOUNTS_KEY) ?? "[]") as AccountSuggestion[];
    return accounts.filter(isMetaManagementAccountSuggestion).slice(0, 5);
  } catch {
    window.localStorage.removeItem(META_RECENT_ACCOUNTS_KEY);
    return [];
  }
}
function writeRecentMetaAccounts(accounts: AccountSuggestion[]) {
  try {
    window.localStorage.setItem(META_RECENT_ACCOUNTS_KEY, JSON.stringify(accounts.slice(0, 5)));
  } catch {
    /* Recent accounts are optional. */
  }
}
function isMetaAudience(row: AudienceClickBreakdownItem) { return row.platform === "meta"; }
function number(value: number | null | undefined) { return value == null ? "—" : new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 }).format(value); }
function currency(value: number | null | undefined) { return value == null ? "—" : new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(value); }
function defaultDateRange() { const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 29); return { startDate: localIso(start), endDate: localIso(end) }; }
function localIso(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function dateRangeFromParams(startDate: string | null, endDate: string | null) { return /^\d{4}-\d{2}-\d{2}$/.test(startDate ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(endDate ?? "") ? { startDate: startDate!, endDate: endDate! } : defaultDateRange(); }
function normalizeMetaAccountId(value: string) { return value.trim().replace(/^act_/i, "").replace(/\D/g, ""); }
function metaTabFromCanonicalView(value: string | null): MetaManagementTab { if (!isAdsManagementView(value)) return "campaigns"; if (value === "ad_groups") return "ad_sets"; if (value === "recommendations") return "opportunities"; return value; }
function metaPrimaryTabFromCanonicalView(value: Exclude<import("@/lib/ads-management/unified-management").AdsManagementView, "change_requests">): Exclude<MetaManagementTab, "change_requests"> { return value === "ad_groups" ? "ad_sets" : value === "recommendations" ? "opportunities" : value; }
function canonicalViewFromMetaTab(tab: MetaManagementTab) { if (tab === "ad_sets") return "ad_groups" as const; if (tab === "opportunities") return "recommendations" as const; if (tab === "change_requests") return "change_requests" as const; if (tab === "ads") return "ads" as const; return "campaigns" as const; }
function message(error: unknown, fallback: string) { return error instanceof Error && error.message ? error.message : fallback; }
class ApiRequestError extends Error {
  payload: Record<string, unknown>;

  constructor(message: string, payload: Record<string, unknown>) {
    super(message);
    this.name = "ApiRequestError";
    this.payload = payload;
  }
}

async function api<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...init?.headers } });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new ApiRequestError(typeof payload.error === "string" ? payload.error : "Request failed.", payload);
  return payload as T;
}
