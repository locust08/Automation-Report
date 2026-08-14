"use client";

import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ExternalLinkIcon,
  Globe2Icon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { ReportShell } from "@/components/reporting/report-shell";
import { PlacementDecisionButton } from "@/components/placement-optimization/placement-decision-button";
import { AccountEscalationNotice } from "@/components/team-lead-monitoring/account-escalation-notice";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { GoogleAccountSearchField } from "@/components/optimization/google-account-search-field";
import { isAdminRole, type AuthRole } from "@/lib/auth/roles";
import type {
  PlacementApproverDecision,
  ContentSuitabilityPayload,
  ContentSuitabilitySection,
  PlacementDashboardPayload,
  PlacementDecision,
  PlacementOptimizationRow,
  PlacementWorkflowMode,
} from "@/lib/placement-optimization/types";

const modeForRole = (role: AuthRole): PlacementWorkflowMode =>
  role === "approver" ? "approver" : role === "pm" ? "pm" : "optimizer";

type AccountSuggestion = {
  accountName: string;
  adAccountId: string;
  accessPath?: string | null;
};
type AccountSearchState = "idle" | "loading" | "success" | "error";
type PlacementJob = { id:string; status:"queued"|"running"|"completed"|"failed"|"cancelled"; stage:string; processed_rows:number; total_rows:number|null; has_more:boolean; error:string|null; started_at:string; expires_at?:string|null };
const ACCOUNT_SEARCH_CACHE_KEY =
  "placement-optimization-pmax-account-search-cache-v1";
const RECENT_ACCOUNTS_KEY = "placement-optimization-recent-accounts";
const ACCOUNT_SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;
const PLACEMENT_OVERVIEW_CACHE_KEY = "placement-optimization-overview-cache-v1";
const PLACEMENT_OVERVIEW_CACHE_TTL_MS = 60 * 60 * 1000;
const ACCOUNT_SEARCH_DEBOUNCE_MS = 300;
const PLACEMENTS_PER_PAGE = 20;

export function PlacementOptimizationPageClient({ role, embedded = false, externalAccount }: { role: AuthRole; embedded?: boolean; externalAccount?: { accountName: string; adAccountId: string } | null }) {
  const searchParams = useSearchParams();
  const mode = modeForRole(role);
  const [data, setData] = useState<PlacementDashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadStartedAt, setLoadStartedAt] = useState<number | null>(null);
  const [loadCompletedAt, setLoadCompletedAt] = useState<string | null>(null);
  const [analysisJob, setAnalysisJob] = useState<PlacementJob | null>(null);
  const [remoteRowTotal, setRemoteRowTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadErrorDetails, setLoadErrorDetails] = useState<{code?:string;accountId?:string;managerId?:string|null}|null>(null);
  const [account, setAccount] = useState("");
  const [selectedAccount, setSelectedAccount] =
    useState<AccountSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<AccountSuggestion[]>([]);
  const [recentAccounts, setRecentAccounts] = useState<AccountSuggestion[]>([]);
  const [searchState, setSearchState] = useState<AccountSearchState>("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchRequestId = useRef(0);
  const placementLoadController = useRef<AbortController | null>(null);
  const skipNextSearch = useRef(false);
  const [type] = useState(searchParams.get("type") || "all");
  const [decisionsOpen, setDecisionsOpen] = useState(false);
  const [decisionView, setDecisionView] = useState<"content" | "excluded">("content");
  const [decisionType, setDecisionType] = useState("all");
  const [decisionCampaignType, setDecisionCampaignType] = useState("all");
  const [decisionPage, setDecisionPage] = useState(1);
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [pendingExclusionIds, setPendingExclusionIds] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [suitabilityOpen, setSuitabilityOpen] = useState(false);
  const [suitability, setSuitability] =
    useState<ContentSuitabilityPayload | null>(null);
  const [suitabilityLoading, setSuitabilityLoading] = useState(false);
  const [suitabilityError, setSuitabilityError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const load = useCallback(async (accountId?: string, refresh = false) => {
    placementLoadController.current?.abort();
    const controller = new AbortController();
    placementLoadController.current = controller;
    const cachedOverview = accountId ? readPlacementOverviewCache(accountId) : null;
    if (cachedOverview) {
      setData(cachedOverview);
    }
    setLoading(true);
    setLoadStartedAt(Date.now());
    setLoadCompletedAt(null);
    setError(null);
    setLoadErrorDetails(null);
    try {
      const params = new URLSearchParams();
      if (accountId) params.set("accountId", accountId);
      if (refresh) params.set("refresh", "1");
      const response = await fetch(`/api/placement-optimization?${params}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = (await response.json()) as PlacementDashboardPayload & {
        error?: string;
        code?: string;
        accountId?: string;
        managerId?: string | null;
      };
      if (!response.ok) {
        setLoadErrorDetails({code:payload.code,accountId:payload.accountId,managerId:payload.managerId});
        throw new Error(payload.error || "Unable to load placements.");
      }
      setData(payload);
      if(payload.placementCache?.status === "completed")setLoadCompletedAt(new Date().toISOString());
      writePlacementOverviewCache(payload);
      if (accountId) {
        const jobResponse=await fetch("/api/placement-optimization/analyze",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({accountId,startDate:payload.account.startDate,endDate:payload.account.endDate,refresh}),cache:"no-store",signal:controller.signal});
        if(jobResponse.ok){const jobPayload=await jobResponse.json() as PlacementJob;setAnalysisJob(jobPayload);if(jobPayload.status==="completed")setLoadCompletedAt(new Date().toISOString());}
      }
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(
        caught instanceof Error ? caught.message : "Unable to load placements.",
      );
    } finally {
      if (placementLoadController.current === controller) {
        placementLoadController.current = null;
        setLoading(false);
      }
    }
  }, []);
  const cancelLoad = useCallback(() => {
    placementLoadController.current?.abort();
    placementLoadController.current = null;
    setLoading(false);
    setLoadStartedAt(null);
  }, []);
  useEffect(() => {
    if (!embedded || !externalAccount) return;
    skipNextSearch.current = true;
    setData(null);
    setAnalysisJob(null);
    setError(null);
    setPage(1);
    setSelectedAccount({
      accountName: externalAccount.accountName,
      adAccountId: externalAccount.adAccountId,
    });
    setAccount(`${externalAccount.accountName} | ${externalAccount.adAccountId}`);
    void load(externalAccount.adAccountId);
  }, [embedded, externalAccount, load]);
  const loadSuitability = useCallback(
    async (refresh = false) => {
      const customerId = data?.account.customerId;
      if (!customerId || suitabilityLoading) return;
      setSuitabilityLoading(true);
      setSuitabilityError(null);
      try {
        const params = new URLSearchParams({ accountId: customerId });
        if (refresh) params.set("refresh", "1");
        const response = await fetch(
          `/api/placement-optimization/content-suitability?${params}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as ContentSuitabilityPayload & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error || "Unable to load content suitability.");
        }
        setSuitability(payload);
      } catch (caught) {
        setSuitabilityError(
          caught instanceof Error
            ? caught.message
            : "Unable to load content suitability.",
        );
      } finally {
        setSuitabilityLoading(false);
      }
    },
    [data?.account.customerId, suitabilityLoading],
  );
  useEffect(() => {
    setSuitability(null);
    setSuitabilityError(null);
    setSuitabilityOpen(false);
  }, [data?.account.customerId]);
  useEffect(() => {
    const closeAccountSearch = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        searchContainerRef.current &&
        !searchContainerRef.current.contains(target)
      ) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeAccountSearch);
    return () => document.removeEventListener("pointerdown", closeAccountSearch);
  }, []);
  useEffect(() => {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(RECENT_ACCOUNTS_KEY) ?? "[]",
      ) as unknown;
      if (Array.isArray(stored))
        setRecentAccounts(stored.filter(isAccountSuggestion).slice(0, 5));
    } catch {
      window.localStorage.removeItem(RECENT_ACCOUNTS_KEY);
    }
  }, []);
  useEffect(() => {
    const query = account.trim();
    searchRequestId.current += 1;
    const requestId = searchRequestId.current;
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    setSelectedAccount(null);
    if (query.length < 2) {
      setSuggestions([]);
      setSearchState("idle");
      setSearchError(null);
      return;
    }
    const cached = readAccountSearchCache(query);
    if (cached) {
      setSuggestions(cached);
      setSearchState("success");
      setDropdownOpen(true);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchState("loading");
      setSearchError(null);
      setDropdownOpen(true);
      try {
        const response = await fetch(
          `/api/placement-optimization/account-search?q=${encodeURIComponent(query)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = (await response.json()) as {
          accounts?: AccountSuggestion[];
          error?: string;
        };
        if (controller.signal.aborted || requestId !== searchRequestId.current)
          return;
        if (!response.ok)
          throw new Error(payload.error || "Unable to search accounts.");
        const accounts = (payload.accounts ?? []).filter(isAccountSuggestion);
        setSuggestions(accounts);
        writeAccountSearchCache(query, accounts);
        setSearchState("success");
      } catch (caught) {
        if (controller.signal.aborted || requestId !== searchRequestId.current)
          return;
        setSuggestions([]);
        setSearchState("error");
        setSearchError(
          caught instanceof Error
            ? caught.message
            : "Unable to search accounts.",
        );
      }
    }, ACCOUNT_SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [account]);
  function chooseAccount(result: AccountSuggestion) {
    skipNextSearch.current = true;
    setSelectedAccount(result);
    setAccount(`${result.accountName} | ${result.adAccountId}`);
    setSuggestions([]);
    setDropdownOpen(false);
    setRecentAccounts((current) => {
      const next = [
        result,
        ...current.filter((item) => item.adAccountId !== result.adAccountId),
      ].slice(0, 5);
      try {
        window.localStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(next));
      } catch {
        /* keep in memory */
      }
      return next;
    });
  }
  function runAnalysis() {
    if (!selectedAccount || loading) return;
    setDropdownOpen(false);
    void startPlacementAnalysis(selectedAccount.adAccountId);
  }
  async function startPlacementAnalysis(accountId:string){setError(null);setLoadCompletedAt(null);try{const response=await fetch("/api/placement-optimization/analyze",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({accountId,startDate:data?.account.startDate,endDate:data?.account.endDate,refresh:true})});const job=await response.json() as PlacementJob&{error?:string};if(!response.ok)throw new Error(job.error??"Unable to refresh placements.");setAnalysisJob(job);}catch(caught){setError(caught instanceof Error?caught.message:"Unable to refresh placements.");}}
  async function loadNextPlacementBatch(){if(!data||!analysisJob?.has_more||["queued","running"].includes(analysisJob.status))return;setError(null);try{const response=await fetch("/api/placement-optimization/analyze",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({accountId:data.account.customerId,startDate:data.account.startDate,endDate:data.account.endDate,loadMore:true})});const job=await response.json() as PlacementJob&{error?:string};if(!response.ok)throw new Error(job.error??"Unable to load the next placement batch.");setAnalysisJob(job);}catch(caught){setError(caught instanceof Error?caught.message:"Unable to load the next placement batch.");}}
  useEffect(()=>{if(!analysisJob||!["queued","running"].includes(analysisJob.status)||!data)return;const timer=window.setInterval(async()=>{try{const params=new URLSearchParams({accountId:data.account.customerId,startDate:data.account.startDate,endDate:data.account.endDate});const response=await fetch(`/api/placement-optimization/analyze?${params}`,{cache:"no-store"});const payload=await response.json() as {job:PlacementJob|null;error?:string};if(!response.ok)throw new Error(payload.error??"Unable to read placement progress.");if(!payload.job)return;const hasNewChunk=payload.job.processed_rows>analysisJob.processed_rows;setAnalysisJob(payload.job);if(hasNewChunk||payload.job.status==="completed"){setLoadCompletedAt(new Date().toISOString());void load(data.account.customerId);}else if(payload.job.status==="failed")setError(payload.job.error??"Placement retrieval failed.");}catch(caught){setError(caught instanceof Error?caught.message:"Unable to read placement progress.");}},2000);return()=>window.clearInterval(timer);},[analysisJob,data,load]);
  async function cancelPlacementAnalysis(){if(!analysisJob||!data)return;const params=new URLSearchParams({accountId:data.account.customerId,startDate:data.account.startDate,endDate:data.account.endDate});await fetch(`/api/placement-optimization/analyze?${params}`,{method:"DELETE"});setAnalysisJob(current=>current?{...current,status:"cancelled",stage:"Placement retrieval stopped"}:null);}
  const customerId=data?.account.customerId;
  const accountStartDate=data?.account.startDate;
  const accountEndDate=data?.account.endDate;
  const loadRowsPage=useCallback(async(pageNumber:number)=>{if(!customerId||!accountStartDate||!accountEndDate)return;const params=new URLSearchParams({accountId:customerId,startDate:accountStartDate,endDate:accountEndDate,page:String(pageNumber),pageSize:String(PLACEMENTS_PER_PAGE),campaignType:decisionCampaignType,placementType:decisionType,view:decisionView});const response=await fetch(`/api/placement-optimization/rows?${params}`,{cache:"no-store"});const payload=await response.json() as {rows?:PlacementOptimizationRow[];total?:number;error?:string};if(!response.ok)throw new Error(payload.error??"Unable to load placements.");setData(current=>current?{...current,rows:payload.rows??[]}:current);setRemoteRowTotal(payload.total??0);},[accountEndDate,accountStartDate,customerId,decisionCampaignType,decisionType,decisionView]);
  useEffect(()=>{if(!decisionsOpen)return;void loadRowsPage(decisionPage).catch(caught=>setError(caught instanceof Error?caught.message:"Unable to load placements."));},[decisionPage,decisionsOpen,loadRowsPage]);
  const rows = useMemo(
    () =>
      data?.rows.filter(
        (row) => type === "all" || row.placementType === type,
      ) ?? [],
    [data, type],
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / PLACEMENTS_PER_PAGE));
  const pageRows = useMemo(
    () =>
      rows.slice(
        (page - 1) * PLACEMENTS_PER_PAGE,
        page * PLACEMENTS_PER_PAGE,
      ),
    [page, rows],
  );
  useEffect(() => {
    setPage(1);
  }, [type, data?.account.customerId]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  const types = [
    ...new Set((data?.rows ?? []).map((row) => row.placementType)),
  ].sort();
  const campaignTypes = [...new Set((data?.rows ?? []).map((row) => row.campaignType || "PERFORMANCE_MAX"))].sort();
  const canOptimizer = role === "co" || role === "approver" || isAdminRole(role);
  const canApprover = role === "approver" || isAdminRole(role);
  function decide(
    endpoint: string,
    decision: PlacementDecision | PlacementApproverDecision,
    ids: string[],
  ) {
    if (endpoint === "/api/placement-optimization/decisions" && decision === "exclude") {
      setPendingExclusionIds(ids);
      return;
    }
    void saveDecision(endpoint, decision, ids);
  }
  async function saveDecision(
    endpoint: string,
    decision: PlacementDecision | PlacementApproverDecision,
    ids: string[],
  ) {
    setError(null);
    setDecisionSaving(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, accountId: data?.account.customerId, startDate: data?.account.startDate, endDate: data?.account.endDate, placements: (data?.rows ?? []).filter((row) => ids.includes(row.id)).map(toExclusionPayload) }),
      });
      const result = (await response.json()) as {
        error?: string;
        status?: string;
        reviewerEmail?: string;
        reviewerRole?: string;
        createdAt?: string;
      };
      if (!response.ok) {
        setError(result.error || "Unable to save decision.");
        return;
      }
      const selectedIds = new Set(ids);
      setData((current) => current ? {
        ...current,
        rows: current.rows.map((row) => selectedIds.has(row.id) ? {
          ...row,
          currentDecision: decision,
          reviewStatus: result.status ?? (decision === "exclude" ? "ready_for_publishing" : decision),
          reviewHistory: [{
            id: `local-${result.createdAt ?? Date.now()}`,
            reviewerEmail: result.reviewerEmail ?? "Current user",
            reviewerRole: result.reviewerRole ?? role,
            action: `optimizer_${decision}`,
            resultingStatus: result.status ?? decision,
            createdAt: result.createdAt ?? new Date().toISOString(),
          }, ...row.reviewHistory],
        } : row),
      } : current);
      setSelected(new Set());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save decision.");
    } finally {
      setDecisionSaving(false);
    }
  }
  const decisionRows = useMemo(() => (data?.rows ?? []).filter((row) => {
    if (decisionType !== "all" && row.placementType !== decisionType) return false;
    if (decisionCampaignType !== "all" && row.campaignType !== decisionCampaignType) return false;
    const excluded = row.reviewStatus === "ready_for_approval" ||
      row.reviewStatus === "ready_for_publishing" ||
      row.currentDecision === "exclude" || row.currentDecision === "approved";
    return decisionView === "excluded" ? excluded : !excluded;
  }), [data?.rows, decisionCampaignType, decisionType, decisionView]);
  const decisionPageCount = Math.max(1, Math.ceil(remoteRowTotal / PLACEMENTS_PER_PAGE));
  const placementStorageAvailable = data?.placementStorage?.status !== "unavailable";
  const decisionPageRows = decisionRows;
  useEffect(() => {
    if (decisionPage > decisionPageCount) setDecisionPage(decisionPageCount);
  }, [decisionPage, decisionPageCount]);
  useEffect(() => {
    setDecisionPage(1);
    setSelected(new Set());
  }, [decisionCampaignType, decisionType, decisionView, data?.account.customerId]);
  const allSelected = pageRows.length > 0 && pageRows.every((row) => selected.has(row.id));
  const toggleAll = (checked: boolean) =>
    setSelected(checked ? new Set(pageRows.map((row) => row.id)) : new Set());
  return (
    <OptimizationPageFrame
      embedded={embedded}
      title="Placement Optimization"
      dateLabel="Campaign Optimizer"
      reportReady={!loading}
    >
      <div className="space-y-5 text-neutral-950">
        {loading && !(analysisJob && ["queued","running"].includes(analysisJob.status)) ? <PlacementAnalysisLoader startedAt={loadStartedAt} onCancel={cancelLoad} /> : null}
        {analysisJob && ["queued","running"].includes(analysisJob.status) ? <PlacementJobProgress job={analysisJob} onCancel={()=>void cancelPlacementAnalysis()} /> : null}
        {!loading && data && loadCompletedAt && analysisJob?.status === "completed" ? (
          <section role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-900 shadow-sm">
            <CheckCircle2Icon className="size-5 shrink-0 text-emerald-700" />
            <div>
              <p className="font-semibold">Placements loaded from Google Ads</p>
              <p className="text-sm text-emerald-800">{analysisJob.processed_rows.toLocaleString()} temporary placement{analysisJob.processed_rows === 1 ? " is" : "s are"} available · expires one hour after retrieval.</p>
            </div>
            {analysisJob.has_more ? <Button type="button" variant="outline" className="ml-auto cursor-pointer bg-white" onClick={()=>void loadNextPlacementBatch()}>Load next 250</Button> : <span className="ml-auto text-sm font-medium">All available placements loaded</span>}
          </section>
        ) : null}
        {!embedded ? <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <p className="mb-2 text-sm font-semibold">Notion account search</p>
          <div className="flex max-w-4xl items-start gap-2">
            <div ref={searchContainerRef} className="min-w-0 flex-1"><GoogleAccountSearchField value={account} onChange={value=>{setAccount(value);setDropdownOpen(true);}} onSelect={chooseAccount} results={suggestions} recentAccounts={recentAccounts} open={dropdownOpen} state={searchState} error={searchError} onFocus={()=>{if(!selectedAccount)setDropdownOpen(true);}} onKeyDown={event=>{if(event.key==="Escape")setDropdownOpen(false);}} /></div>
            <Button
              disabled={!selectedAccount || loading || !placementStorageAvailable}
              className="h-12 cursor-pointer bg-red-600 hover:bg-red-700"
              onClick={runAnalysis}
            >
              {loading ? <Spinner className="size-4" /> : <SearchIcon className="size-4" />}
              {loading ? "Analyzing…" : "Search"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-neutral-500">Select an account, then press Search to retrieve campaign types and placements.</p>
          {data ? (
            <>
              <h2 className="mt-5 text-4xl font-semibold">
                {data.account.customerName}
              </h2>
              <PlacementAccountDetails account={data.account} />
              <Button
                type="button"
                variant="outline"
                className="mt-4 cursor-pointer hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                onClick={() => {
                  setSuitabilityOpen(true);
                  if (!suitability && !suitabilityLoading) void loadSuitability();
                }}
              >
                <ShieldCheckIcon className="size-4" />
                Content suitability
              </Button>
            </>
          ) : null}
        </section> : data ? (
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-3xl font-semibold">{data.account.customerName}</h2>
            <PlacementAccountDetails account={data.account} />
            <div className="mt-4 flex flex-wrap items-center gap-2"><Button type="button" variant="outline" disabled={!externalAccount||Boolean(analysisJob&&["queued","running"].includes(analysisJob.status))} className="cursor-pointer" onClick={()=>externalAccount&&void startPlacementAnalysis(externalAccount.adAccountId)}><RefreshCwIcon className="size-4" />Refresh placements</Button><Button type="button" variant="outline" className="ml-auto cursor-pointer hover:border-red-200 hover:bg-red-50 hover:text-red-700" onClick={() => { setSuitabilityOpen(true); if (!suitability && !suitabilityLoading) void loadSuitability(); }}><ShieldCheckIcon className="size-4" />Content suitability</Button></div>
          </section>
        ) : null}
        <ContentSuitabilitySheet
          open={suitabilityOpen}
          onOpenChange={setSuitabilityOpen}
          payload={suitability}
          loading={suitabilityLoading}
          error={suitabilityError}
          onRefresh={() => void loadSuitability(true)}
        />
        <AccountEscalationNotice module="placement" accountId={data?.account.customerId} />
        {data?.placementStorage?.status === "unavailable" ? (
          <section role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm">
            <div><p className="font-semibold">Placement storage is temporarily unavailable</p><p className="mt-1 text-sm text-amber-800">{data.placementStorage.message ?? "Saved placement results cannot be loaded right now."} Campaign counts are still shown from Google Ads.</p></div>
            <Button type="button" variant="outline" disabled={loading} onClick={()=>void load(data.account.customerId)}>{loading?<Spinner className="size-4"/>:null}Retry</Button>
          </section>
        ) : null}
        {data ? <PlacementOverview data={data} /> : null}
        {data ? (
          <section className="flex items-center justify-between gap-4 rounded-2xl border bg-white p-5 shadow-sm">
            <div>
              <h3 className="font-semibold">All placements</h3>
              <p className="text-sm text-neutral-500">Browse placements and exclude selected websites or videos directly from Google Ads after confirmation.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button type="button" disabled={!placementStorageAvailable||!data.placementOverview.placementCount} className="cursor-pointer bg-red-700 hover:bg-red-800" onClick={() => {setDecisionPage(1);setDecisionsOpen(true);}}>
                {!placementStorageAvailable?"Temporarily unavailable":analysisJob?.processed_rows?`View ${analysisJob.processed_rows.toLocaleString()} loaded`:analysisJob&&["queued","running"].includes(analysisJob.status)?"Loading placements…":data.placementOverview.placementCount ? "View placements" : "No placement data"}
              </Button>
            </div>
          </section>
        ) : null}
        <PlacementDecisionsSheet
          open={decisionsOpen}
          onOpenChange={setDecisionsOpen}
          rows={decisionRows}
          pageRows={decisionPageRows}
          types={types}
          campaignTypes={campaignTypes}
          type={decisionType}
          campaignType={decisionCampaignType}
          onTypeChange={setDecisionType}
          onCampaignTypeChange={setDecisionCampaignType}
          view={decisionView}
          onViewChange={setDecisionView}
          page={decisionPage}
          pageCount={decisionPageCount}
          onPageChange={setDecisionPage}
          selected={selected}
          onSelectedChange={setSelected}
          canOptimizer={canOptimizer}
          saving={decisionSaving}
          onOptimizerDecision={(decision, ids) => void decide("/api/placement-optimization/decisions", decision, ids)}
        />
        {error && loadErrorDetails?.code === "GOOGLE_ADS_ACCESS_PATH_INVALID" ? (
          <section role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950 shadow-sm">
            <h3 className="text-lg font-semibold">Google Ads account connection needs attention</h3>
            <p className="mt-2 text-sm">{error}</p>
            <div className="mt-3 rounded-xl border border-amber-200 bg-white/70 p-3 text-sm">
              <p><span className="font-medium">Account:</span> {formatCustomerId(loadErrorDetails.accountId ?? selectedAccount?.adAccountId ?? "")}</p>
              <p className="mt-1"><span className="font-medium">Saved manager:</span> {loadErrorDetails.managerId ? formatCustomerId(loadErrorDetails.managerId) : "Not configured"}</p>
            </div>
            <p className="mt-3 text-sm">Update this account&apos;s Access Path in Notion, sync the account directory, then retry.</p>
            <Button type="button" variant="outline" className="mt-4 cursor-pointer bg-white" disabled={loading} onClick={()=>selectedAccount&&void load(selectedAccount.adAccountId,true)}><RefreshCwIcon className="size-4" />Retry connection</Button>
          </section>
        ) : error ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
          >
            {error}
          </p>
        ) : null}
        {data?.warnings.filter(isUserFacingPlacementWarning).map((warning) => (
          <p
            key={warning}
            className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
          >
            {warning}
          </p>
        ))}
        {!loading && mode === "pm" ? (
          null
        ) : !loading && data ? (
          <section className="hidden overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-neutral-50 px-5 py-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                  className="cursor-pointer"
                />
                <h3 className="font-semibold">{rows.length} placements</h3>
              </div>
              {allSelected && canOptimizer ? (
                <div className="flex gap-2">
                  <Action
                    label="Exclude"
                    tone="red"
                    onClick={() =>
                      void decide(
                        "/api/placement-optimization/decisions",
                        "exclude",
                        [...selected],
                      )
                    }
                  />
                  <Action
                    label="Keep"
                    tone="green"
                    onClick={() =>
                      void decide(
                        "/api/placement-optimization/decisions",
                        "keep",
                        [...selected],
                      )
                    }
                  />
                  <Action
                    label="Keep in View"
                    tone="amber"
                    onClick={() =>
                      void decide(
                        "/api/placement-optimization/decisions",
                        "kiv",
                        [...selected],
                      )
                    }
                  />
                </div>
              ) : null}
              {allSelected && canApprover ? (
                <div className="flex gap-2">
                  <Action
                    label="Approve"
                    tone="green"
                    onClick={() =>
                      void decide(
                        "/api/placement-optimization/approvals",
                        "approved",
                        [...selected],
                      )
                    }
                  />
                  <Action
                    label="Return"
                    tone="amber"
                    onClick={() =>
                      void decide(
                        "/api/placement-optimization/approvals",
                        "returned",
                        [...selected],
                      )
                    }
                  />
                  <Action
                    label="Reject"
                    tone="red"
                    onClick={() =>
                      void decide(
                        "/api/placement-optimization/approvals",
                        "rejected",
                        [...selected],
                      )
                    }
                  />
                </div>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[700px] w-full text-left text-sm">
                <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
                  <tr>
                    {[
                      "",
                      "Placement",
                      "Type",
                      "Campaign",
                      "Impressions",
                    ].map((heading, index) => (
                      <th key={`${heading}-${index}`} className="px-4 py-3">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pageRows.map((row) => (
                    <PlacementRow
                      key={row.id}
                      row={row}
                      checked={selected.has(row.id)}
                      onCheck={(checked) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (checked) next.add(row.id);
                          else next.delete(row.id);
                          return next;
                        })
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 ? (
              <p className="p-8 text-center text-neutral-500">
                No placements match this queue.
              </p>
            ) : (
              <div className="flex items-center justify-between gap-3 border-t bg-neutral-50 px-5 py-4 text-sm">
                <span className="text-neutral-500">
                  Page {page} of {pageCount} · {rows.length} placements · 10 per page
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={page === 1}
                    className="cursor-pointer disabled:cursor-not-allowed"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={page === pageCount}
                    className="cursor-pointer disabled:cursor-not-allowed"
                    onClick={() =>
                      setPage((current) => Math.min(pageCount, current + 1))
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </section>
        ) : null}
      </div>
      <AlertDialog open={Boolean(pendingExclusionIds)} onOpenChange={(open) => { if (!open && !decisionSaving) setPendingExclusionIds(null); }}>
        <AlertDialogContent className="w-[calc(100%-2rem)] sm:max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Exclude these placements?</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately modify Google Ads for {data?.account.customerName ?? "the selected account"} and stop ads from showing on the selected placements.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-neutral-900">{pendingExclusionIds?.length ?? 0} placement{pendingExclusionIds?.length === 1 ? "" : "s"}</p>
            <p className="mt-1 text-sm text-neutral-600">Creates campaign-level placement exclusions in Google Ads.</p>
            <div className="mt-3 space-y-1 text-xs text-neutral-600">
              {(pendingExclusionIds ?? []).slice(0, 3).map((id) => {
                const row = data?.rows.find((item) => item.id === id);
                return <p key={id} className="truncate">• {row?.displayName || row?.placement || id}</p>;
              })}
              {(pendingExclusionIds?.length ?? 0) > 3 ? <p className="font-medium">+{(pendingExclusionIds?.length ?? 0) - 3} more</p> : null}
            </div>
          </div>
          <AlertDialogFooter className="sm:grid sm:grid-cols-2">
            <AlertDialogCancel className="w-full" disabled={decisionSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="w-full bg-red-600 text-white hover:bg-red-700"
              disabled={decisionSaving}
              onClick={() => {
                const ids = pendingExclusionIds ?? [];
                setPendingExclusionIds(null);
                void saveDecision("/api/placement-optimization/decisions", "exclude", ids);
              }}
            >
              Exclude in Google Ads
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </OptimizationPageFrame>
  );
}

function OptimizationPageFrame({ embedded, children, ...shellProps }: ComponentProps<typeof ReportShell> & { embedded: boolean }) {
  return embedded ? <>{children}</> : <ReportShell {...shellProps}>{children}</ReportShell>;
}

function PlacementAnalysisLoader({ startedAt, onCancel }: { startedAt: number | null; onCancel: () => void }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  const takingLonger = elapsedSeconds >= 30;
  return (
    <section role="status" className="overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm">
      <div className="flex items-center gap-3 p-5">
        <span className="flex size-10 items-center justify-center rounded-xl bg-red-50 text-red-700"><Spinner className="size-5" /></span>
        <div className="min-w-0 flex-1"><p className="font-semibold">{takingLonger ? "Still loading campaign placements" : "Loading campaign placements"}</p><p className="text-sm text-neutral-500">{takingLonger ? "This account has more data than usual, but the request is still running." : "Retrieving campaign types, placement sites, and performance metrics."}</p></div>
        <Button type="button" variant="outline" className="shrink-0 cursor-pointer" onClick={onCancel}>Cancel</Button>
      </div>
      <div className="border-t bg-neutral-50 px-5 py-3">
        <div className="mb-2 flex justify-between text-xs text-neutral-500"><span>Request in progress</span><span>Elapsed: {formatElapsedTime(elapsedSeconds)}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-neutral-200"><div className="h-full w-1/3 animate-pulse rounded-full bg-gradient-to-r from-red-700 to-red-400" /></div>
      </div>
    </section>
  );
}

function PlacementJobProgress({job,onCancel}:{job:PlacementJob;onCancel:()=>void}){
  const [elapsedSeconds,setElapsedSeconds]=useState(0);
  useEffect(()=>{const start=new Date(job.started_at).getTime();const update=()=>setElapsedSeconds(Math.max(0,Math.floor((Date.now()-start)/1000)));update();const timer=window.setInterval(update,1000);return()=>window.clearInterval(timer);},[job.started_at]);
  const progress=job.total_rows?Math.min(100,Math.round(job.processed_rows/job.total_rows*100)):null;
  return <section role="status" className="overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm"><div className="flex items-center gap-3 p-5"><span className="flex size-10 items-center justify-center rounded-xl bg-red-50 text-red-700"><Spinner className="size-5" /></span><div className="min-w-0 flex-1"><p className="font-semibold">Loading placements from Google Ads</p><p className="text-sm text-neutral-500">{job.stage}{job.total_rows?` · ${job.processed_rows.toLocaleString()} of ${job.total_rows.toLocaleString()} retrieved`:""}</p></div><Button type="button" variant="outline" className="shrink-0 cursor-pointer" onClick={onCancel}>Stop retrieval</Button></div><div className="border-t bg-neutral-50 px-5 py-3"><div className="mb-2 flex justify-between text-xs text-neutral-500"><span>{progress===null?"Preparing temporary results":`${progress}% complete`}</span><span>Elapsed: {formatElapsedTime(elapsedSeconds)}</span></div><div className="h-2 overflow-hidden rounded-full bg-neutral-200"><div className="h-full rounded-full bg-gradient-to-r from-red-700 to-red-400 transition-all" style={{width:`${progress??15}%`}} /></div></div></section>;
}

function useResizableSheet(initialWidth = 720, maximumViewportFraction = 1) {
  const [sidebarWidth, setSidebarWidth] = useState(initialWidth);
  const [resizing, setResizing] = useState(false);
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  const finishResize = useCallback(
    (element?: HTMLButtonElement, pointerId?: number) => {
      if (
        element &&
        pointerId !== undefined &&
        element.hasPointerCapture(pointerId)
      ) {
        element.releasePointerCapture(pointerId);
      }
      dragState.current = null;
      setResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    },
    [],
  );

  const resizeHandleProps = {
    onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragState.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: sidebarWidth,
      };
      setResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
      const drag = dragState.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      const maximum = Math.max(
        360,
        Math.floor(window.innerWidth * maximumViewportFraction),
      );
      setSidebarWidth(
        Math.min(
          maximum,
          Math.max(360, drag.startWidth + drag.startX - event.clientX),
        ),
      );
    },
    onPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
      finishResize(event.currentTarget, event.pointerId);
    },
    onPointerCancel(event: React.PointerEvent<HTMLButtonElement>) {
      finishResize(event.currentTarget, event.pointerId);
    },
    onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const maximum = Math.max(
        360,
        Math.floor(window.innerWidth * maximumViewportFraction),
      );
      const change = event.key === "ArrowLeft" ? 32 : -32;
      setSidebarWidth((width) =>
        Math.min(maximum, Math.max(360, width + change)),
      );
    },
    onDoubleClick() {
      setSidebarWidth(initialWidth);
    },
  };

  useEffect(() => () => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  return { sidebarWidth, resizing, resizeHandleProps };
}

function SheetResizeHandle({
  resizing,
  resizeHandleProps,
}: {
  resizing: boolean;
  resizeHandleProps: ReturnType<typeof useResizableSheet>["resizeHandleProps"];
}) {
  return (
    <button
      type="button"
      role="separator"
      aria-orientation="vertical"
      aria-label="Drag to resize sidebar"
      title="Drag left or right to resize. Double-click to reset."
      {...resizeHandleProps}
      style={{ top: 0, bottom: 0, height: "100%", zIndex: 10000 }}
      className="group absolute inset-y-0 -left-2 z-[10000] hidden w-8 touch-none cursor-ew-resize border-0 bg-transparent p-0 outline-none sm:block"
    >
      <span className={`absolute left-3 top-1/2 w-1.5 -translate-y-1/2 rounded-full shadow transition-all duration-150 group-hover:h-32 group-hover:bg-red-600 group-focus-visible:h-32 group-focus-visible:bg-red-600 ${resizing ? "h-32 bg-red-600" : "h-24 bg-neutral-400"}`} />
      <span className="sr-only">Drag to resize sidebar</span>
    </button>
  );
}

// Retained temporarily for compatibility with older saved placement payloads.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PlacementsSheet({
  open,
  onOpenChange,
  rows,
  pageRows,
  types,
  campaignTypes,
  type,
  campaignType,
  onTypeChange,
  onCampaignTypeChange,
  page,
  pageCount,
  onPageChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: PlacementOptimizationRow[];
  pageRows: PlacementOptimizationRow[];
  types: string[];
  campaignTypes: string[];
  type: string;
  campaignType: string;
  onTypeChange: (value: string) => void;
  onCampaignTypeChange: (value: string) => void;
  page: number;
  pageCount: number;
  onPageChange: (value: number | ((current: number) => number)) => void;
}) {
  const { sidebarWidth, resizing, resizeHandleProps } = useResizableSheet(560, 0.5);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={`w-full sm:max-w-none ${resizing ? "select-none transition-none" : "transition-[width] duration-150"}`}
        style={{ width: sidebarWidth, maxWidth: "50vw" }}
      >
        <SheetResizeHandle resizing={resizing} resizeHandleProps={resizeHandleProps} />
        <SheetHeader className="border-b">
          <SheetTitle>Google Ads placements</SheetTitle>
          <SheetDescription>
            {rows.length.toLocaleString()} placements · showing 20 per page
          </SheetDescription>
        </SheetHeader>
        <div className="border-b p-5">
          <Filter label="Placement type">
            <Select value={type} onValueChange={onTypeChange}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All placement types</SelectItem>
                {types.map((value) => (
                  <SelectItem key={value} value={value}>
                    {humanize(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Filter>
          <Filter label="Campaign type">
            <Select value={campaignType} onValueChange={onCampaignTypeChange}>
              <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
              <SelectContent className="z-[10001]">
                <SelectItem value="all">All campaign types</SelectItem>
                {campaignTypes.map((value) => <SelectItem key={value} value={value}>{campaignTypeLabel(value)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Filter>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            className="grid content-start gap-3 p-4"
            style={{
              gridTemplateColumns:
                sidebarWidth >= 480
                  ? "repeat(2, minmax(0, 1fr))"
                  : "minmax(0, 1fr)",
            }}
          >
            {pageRows.map((row) => {
              const href = placementWebsiteUrl(row.targetUrl, row.placement);
              return (
                <article
                  key={row.id}
                  className="flex h-[200px] w-full min-w-0 flex-col overflow-hidden rounded-xl border bg-white p-3 shadow-sm transition hover:border-red-200 hover:shadow-md"
                >
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-semibold leading-5">{row.displayName}</p>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="mt-0.5 flex items-center gap-1 text-xs text-red-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300">
                        <span className="truncate">{row.placement}</span>
                        <ExternalLinkIcon className="size-3 shrink-0" />
                      </a>
                    ) : (
                      <p className="mt-0.5 truncate text-xs text-neutral-500">{row.placement}</p>
                    )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                    <div className="flex flex-wrap gap-1"><Badge variant="outline">{campaignTypeLabel(row.campaignType)}</Badge><Badge variant="outline">{humanize(row.placementType)}</Badge></div>
                  </div>
                </div>
                <div className="mt-2 min-h-0 flex-1 overflow-hidden">
                  {row.campaignName !== "Unknown Performance Max campaign" ? (
                    <p className="line-clamp-3 break-words text-xs leading-4 text-neutral-500">{row.campaignName}</p>
                  ) : null}
                </div>
                <div className="mt-auto border-t pt-2 text-right">
                  <p className="text-lg font-semibold tabular-nums">{row.impressions.toLocaleString()}</p>
                  <p className="text-xs text-neutral-500">impressions</p>
                </div>
                </article>
              );
            })}
          </div>
          {pageRows.length === 0 ? (
            <p className="p-8 text-center text-sm text-neutral-500">No placements match this type.</p>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3 border-t bg-neutral-50 p-4 text-sm">
          <span className="text-neutral-500">Page {page} of {pageCount}</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={page === 1} className="cursor-pointer disabled:cursor-not-allowed" onClick={() => onPageChange((current) => Math.max(1, current - 1))}>Previous</Button>
            <Button type="button" variant="outline" disabled={page === pageCount} className="cursor-pointer disabled:cursor-not-allowed" onClick={() => onPageChange((current) => Math.min(pageCount, current + 1))}>Next</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PlacementDecisionsSheet({
  open,
  onOpenChange,
  rows,
  pageRows,
  types,
  campaignTypes,
  type,
  campaignType,
  onTypeChange,
  onCampaignTypeChange,
  view,
  onViewChange,
  page,
  pageCount,
  onPageChange,
  selected,
  onSelectedChange,
  canOptimizer,
  saving,
  onOptimizerDecision,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: PlacementOptimizationRow[];
  pageRows: PlacementOptimizationRow[];
  types: string[];
  campaignTypes: string[];
  type: string;
  campaignType: string;
  onTypeChange: (value: string) => void;
  onCampaignTypeChange: (value: string) => void;
  view: "content" | "excluded";
  onViewChange: (value: "content" | "excluded") => void;
  page: number;
  pageCount: number;
  onPageChange: (value: number | ((current: number) => number)) => void;
  selected: Set<string>;
  onSelectedChange: React.Dispatch<React.SetStateAction<Set<string>>>;
  canOptimizer: boolean;
  saving: boolean;
  onOptimizerDecision: (decision: PlacementDecision, ids: string[]) => void;
}) {
  const { sidebarWidth, resizing, resizeHandleProps } = useResizableSheet(720, 0.65);
  const selectedIds = [...selected];
  const allSelected = pageRows.length > 0 && pageRows.every((row) => selected.has(row.id));

  return (
    <Sheet open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <SheetContent
        className={`w-full sm:max-w-none ${resizing ? "select-none transition-none" : "transition-[width] duration-150"}`}
        style={{ width: sidebarWidth, maxWidth: "65vw" }}
      >
        <SheetResizeHandle resizing={resizing} resizeHandleProps={resizeHandleProps} />
        <SheetHeader className="border-b">
          <SheetTitle>Google Ads placements</SheetTitle>
          <SheetDescription>
            Exclusions are published directly to Google Ads after confirmation. Keep and Keep in View remain internal decisions.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 border-b p-5">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-neutral-100 p-1">
            {(["content", "excluded"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                variant={view === value ? "default" : "ghost"}
                disabled={saving}
                className={view === value ? "cursor-pointer bg-red-700 hover:bg-red-800" : "cursor-pointer"}
                onClick={() => onViewChange(value)}
              >
                {value === "content" ? "Content" : "Excluded"}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Filter label="Placement type">
              <Select value={type} onValueChange={onTypeChange} disabled={saving}>
                <SelectTrigger className="w-full cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[10001]">
                  <SelectItem value="all">All placement types</SelectItem>
                  {types.map((value) => <SelectItem key={value} value={value}>{humanize(value)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Filter>
            <Filter label="Campaign type">
              <Select value={campaignType} onValueChange={onCampaignTypeChange} disabled={saving}>
                <SelectTrigger className="w-full cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[10001]">
                  <SelectItem value="all">All campaign types</SelectItem>
                  {campaignTypes.map((value) => <SelectItem key={value} value={value}>{campaignTypeLabel(value)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Filter>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={allSelected}
                disabled={saving || pageRows.length === 0}
                onCheckedChange={(checked) => onSelectedChange((current) => {
                  const next = new Set(current);
                  pageRows.forEach((row) => checked === true ? next.add(row.id) : next.delete(row.id));
                  return next;
                })}
              />
              Select this page
            </label>
            <span className="text-sm text-neutral-500">{selected.size} selected</span>
          </div>
          {selected.size > 0 ? (
            <div className="ml-auto flex w-fit flex-wrap justify-end gap-2">
              {canOptimizer && view === "content" ? (
                <>
                  <PlacementDecisionButton action="exclude" disabled={saving} onClick={() => onOptimizerDecision("exclude", selectedIds)}>Exclude</PlacementDecisionButton>
                </>
              ) : null}
              {view === "excluded" ? <span className="text-sm text-neutral-500">Published exclusion history cannot be removed here.</span> : null}
              {saving ? <span className="inline-flex items-center gap-2 text-sm text-neutral-500"><Spinner className="size-4" /> Saving history…</span> : null}
            </div>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="space-y-3">
            {pageRows.map((row) => {
              const latest = row.reviewHistory[0];
              const href = placementWebsiteUrl(row.targetUrl, row.placement);
              return (
                <article key={row.id} className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selected.has(row.id)}
                      disabled={saving}
                      className="mt-1 cursor-pointer"
                      onCheckedChange={(checked) => onSelectedChange((current) => {
                        const next = new Set(current);
                        if (checked === true) next.add(row.id); else next.delete(row.id);
                        return next;
                      })}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold">{row.displayName}</p>
                          {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 text-xs text-red-700 hover:underline"><span className="truncate">{row.placement}</span><ExternalLinkIcon className="size-3 shrink-0" /></a> : <p className="truncate text-xs text-neutral-500">{row.placement}</p>}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="outline">{campaignTypeLabel(row.campaignType)}</Badge>
                          <Badge variant="outline">{humanize(row.placementType)}</Badge>
                          <Badge variant="outline">{placementStatusLabel(row.reviewStatus)}</Badge>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-neutral-500 sm:grid-cols-3">
                        <span>{row.impressions.toLocaleString()} impressions</span>
                        <span>Decision: {row.currentDecision ? humanize(row.currentDecision) : "None"}</span>
                        <span>{row.reviewHistory.length} history event{row.reviewHistory.length === 1 ? "" : "s"}</span>
                      </div>
                      {latest ? (
                        <Collapsible className="mt-3 rounded-lg bg-neutral-50 px-3 py-2">
                          <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between gap-2 text-left text-xs font-medium">
                            Latest: {humanize(latest.action)} by {latest.reviewerEmail}
                            <ChevronDownIcon className="size-4" />
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-2 space-y-2 border-t pt-2 text-xs text-neutral-500">
                            {row.reviewHistory.map((event) => (
                              <div key={event.id} className="flex flex-wrap justify-between gap-2">
                                <span>{humanize(event.action)} → {humanize(event.resultingStatus)}</span>
                                <span>{event.reviewerEmail} · {formatDate(event.createdAt)}</span>
                              </div>
                            ))}
                          </CollapsibleContent>
                        </Collapsible>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
            {pageRows.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-neutral-500">{view === "excluded" ? "No placement exclusion decisions have been recorded." : "No placements match this filter."}</p> : null}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t bg-neutral-50 p-4 text-sm">
          <span className="text-neutral-500">Page {page} of {pageCount} · {rows.length} records</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={saving || page === 1} className="cursor-pointer disabled:cursor-not-allowed" onClick={() => onPageChange((current) => Math.max(1, current - 1))}>Previous</Button>
            <Button type="button" variant="outline" disabled={saving || page === pageCount} className="cursor-pointer disabled:cursor-not-allowed" onClick={() => onPageChange((current) => Math.min(pageCount, current + 1))}>Next</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ContentSuitabilitySheet({
  open,
  onOpenChange,
  payload,
  loading,
  error,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: ContentSuitabilityPayload | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const { sidebarWidth, resizing, resizeHandleProps } = useResizableSheet(560, 0.5);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={`w-full sm:max-w-none ${resizing ? "select-none transition-none" : "transition-[width] duration-150"}`}
        style={{ width: sidebarWidth, maxWidth: "50vw" }}
      >
        <SheetResizeHandle resizing={resizing} resizeHandleProps={resizeHandleProps} />
        <SheetHeader>
          <div className="flex items-center gap-2 text-red-700">
            <ShieldCheckIcon className="size-5" />
            <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
              Read-only
            </Badge>
          </div>
          <SheetTitle className="mt-3">
            {payload?.account.customerName ?? "Content suitability"}
          </SheetTitle>
          <SheetDescription>
            {payload
              ? `CID ${payload.account.customerId} · Refreshed ${formatDate(payload.refreshedAt)}`
              : "Account-level Google Ads content controls and exclusions."}
          </SheetDescription>
        </SheetHeader>
        <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
          {loading ? (
            <div className="sticky top-0 z-20 border-b border-red-100 bg-white/95 px-5 py-4 shadow-sm backdrop-blur" role="status" aria-live="polite">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
                  <Spinner className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Loading content suitability</p>
                  <p className="text-xs text-neutral-500">Checking inventory controls and account-level exclusions.</p>
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-200">
                <div className="search-analysis-progress h-full w-1/3 rounded-full bg-gradient-to-r from-red-800 via-red-500 to-red-300" />
              </div>
            </div>
          ) : null}
          {loading && !payload ? <ContentSuitabilitySkeleton /> : null}
          {error && !payload ? (
            <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-semibold">Unable to load content suitability</p>
              <p className="mt-1">{error}</p>
              <Button variant="outline" className="mt-3 cursor-pointer" onClick={onRefresh}>
                Try again
              </Button>
            </div>
          ) : null}
          {payload ? (
            <div className="space-y-4 p-5">
              <div className="rounded-2xl border bg-neutral-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase text-neutral-500">Inventory type</p>
                    <p className="mt-1 text-2xl font-semibold">{payload.inventoryType}</p>
                  </div>
                  <Badge variant="outline" className={payload.stale ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>
                    {payload.stale ? "Cached · stale" : payload.source === "cache" ? "Cached" : "Live"}
                  </Badge>
                </div>
                {payload.inventoryType === "Unknown" ? (
                  <p className="mt-2 text-xs text-neutral-500">This setting was not returned by the Google Ads API.</p>
                ) : null}
              </div>
              {payload.warnings.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  {payload.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                </div>
              ) : null}
              <div className="divide-y overflow-hidden rounded-2xl border">
                {payload.sections.map((section) => (
                  <SuitabilitySection key={section.key} section={section} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between border-t bg-neutral-50 px-5 py-4">
          <p className="text-xs text-neutral-500">No settings can be changed here.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="cursor-pointer hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            disabled={loading || !payload}
            onClick={onRefresh}
          >
            {loading ? <Spinner className="size-4" /> : <RefreshCwIcon className="size-4" />}
            Refresh
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ContentSuitabilitySkeleton() {
  return (
    <div className="space-y-4 p-5">
      <Skeleton className="h-28 rounded-2xl" />
      {[0, 1, 2, 3, 4].map((item) => (
        <Skeleton key={item} className="h-14 rounded-xl" />
      ))}
    </div>
  );
}

function SuitabilitySection({ section }: { section: ContentSuitabilitySection }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex w-full cursor-pointer items-center justify-between gap-3 bg-white px-4 py-3 text-left transition hover:bg-red-50">
        <div className="min-w-0">
          <p className="font-semibold">{section.title}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {!section.available
              ? section.unavailableReason
              : section.items.length === 0
                ? "No exclusions configured"
                : `${section.items.length.toLocaleString()} configured`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline">{section.items.length}</Badge>
          <ChevronDownIcon className="size-4 text-neutral-500 transition group-data-open:rotate-180" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t bg-neutral-50 px-4 py-3">
          {!section.available ? (
            <p className="text-sm text-neutral-500">{section.unavailableReason}</p>
          ) : section.items.length === 0 ? (
            <p className="text-sm text-neutral-500">No exclusions are configured in this section.</p>
          ) : (
            <ul className="space-y-2">
              {section.items.slice(0, 10).map((entry) => (
                <li key={entry.id} className="rounded-lg border bg-white px-3 py-2 text-sm">
                  <p className="break-words font-medium">{entry.value}</p>
                  {entry.label ? <p className="mt-0.5 text-xs text-neutral-500">{entry.label}</p> : null}
                </li>
              ))}
            </ul>
          )}
          {section.items.length > 10 ? (
            <p className="mt-3 text-xs text-neutral-500">Showing 10 of {section.items.length.toLocaleString()} exclusions.</p>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function isAccountSuggestion(value: unknown): value is AccountSuggestion {
  if (!value || typeof value !== "object") return false;
  const account = value as Partial<AccountSuggestion>;
  return typeof account.accountName === "string" && typeof account.adAccountId === "string" && /^\d{10}$/.test(account.adAccountId.replace(/\D/g, ""));
}

function PlacementAccountDetails({ account }: { account: PlacementDashboardPayload["account"] }) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <PlacementAccountDetail label="Google Ads account" value={`CID ${account.customerId}`} />
      <PlacementAccountDetail
        label="Analysis period"
        value={`${formatReportingDate(account.startDate)} – ${formatReportingDate(account.endDate)}`}
        emphasized
      />
      <PlacementAccountDetail label="Refreshed on" value={formatDate(account.refreshedAt)} />
    </div>
  );
}

function PlacementAccountDetail({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <div className={`rounded-xl border px-3.5 py-3 ${emphasized ? "border-red-200 bg-red-50" : "border-neutral-200 bg-neutral-50"}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${emphasized ? "text-red-700" : "text-neutral-500"}`}>{label}</p>
      <p className="mt-1 text-sm font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

function PlacementOverview({ data }: { data: PlacementDashboardPayload }) {
  const storageUnavailable = data.placementStorage?.status === "unavailable";
  const overview = data.placementOverview ?? {
    campaignCount: data.performanceMax?.campaignCount ?? new Set(data.rows.map((row) => row.campaignName)).size,
    placementCount: data.rows.length,
    totalImpressions: data.rows.reduce((sum, row) => sum + row.impressions, 0),
    totalSpend: data.rows.reduce((sum, row) => sum + row.spend, 0),
    uniqueSites: new Set(data.rows.filter((row) => row.placementType === "WEBSITE").map((row) => row.placement)).size,
    topSites: data.rows.filter((row) => row.placementType === "WEBSITE").sort((left, right) => right.impressions - left.impressions).slice(0, 5),
  };
  const campaignTypes = data.campaignTypes ?? [{channelType:"PERFORMANCE_MAX",label:"Performance Max",campaignCount:data.performanceMax?.campaignCount??0,placementCount:data.rows.length,impressions:overview.totalImpressions,spend:overview.totalSpend,available:data.rows.length>0}];
  const total = overview.totalImpressions;
  return (
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b bg-neutral-50 px-5 py-4">
        <div>
          <div className="flex items-center gap-2"><Globe2Icon className="size-5 text-red-700" /><h3 className="text-lg font-semibold">Campaign placement overview</h3></div>
          <p className="mt-1 text-sm text-neutral-500">Campaign types and placements returned by Google Ads for the selected account.</p>
        </div>
        <Badge className={overview.placementCount ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-neutral-200 bg-neutral-100 text-neutral-500"} variant="outline">
          {storageUnavailable ? "Placement data unavailable" : overview.placementCount ? `${overview.placementCount} placements` : "No placement data"}
        </Badge>
      </header>
      <div className="grid gap-3 border-b p-5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Campaigns", overview.campaignCount.toLocaleString()],
          ["Placements", storageUnavailable ? "Temporarily unavailable" : overview.placementCount.toLocaleString()],
          ["Total impressions", storageUnavailable ? "Temporarily unavailable" : total.toLocaleString()],
          ["Unique sites", storageUnavailable ? "Temporarily unavailable" : overview.uniqueSites.toLocaleString()],
        ].map(([label, value]) => <div key={label} className="rounded-xl border bg-white p-4"><p className="text-xs font-semibold uppercase text-neutral-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}
      </div>
      <div className="grid gap-3 border-b p-5 sm:grid-cols-2 xl:grid-cols-3">
        {campaignTypes.map((item)=><div key={item.channelType} className="rounded-xl border bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.label}</p><p className="mt-1 text-xs text-neutral-500">{item.campaignCount} campaign{item.campaignCount===1?"":"s"}</p></div><Badge variant="outline">{storageUnavailable?"Unavailable":`${item.placementCount} placements`}</Badge></div><p className="mt-3 text-sm text-neutral-600">{storageUnavailable?"Placement data is temporarily unavailable":item.available?`${item.impressions.toLocaleString()} impressions · ${item.spend.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} spend`:"No placement data for this period"}</p></div>)}
      </div>
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between"><h4 className="font-semibold">Top 5 sites</h4><span className="text-xs text-neutral-500">Share of all placement impressions</span></div>
        <div className="space-y-2">
          {overview.topSites.map((site, index) => {
            const share = total > 0 ? site.impressions * 100 / total : 0;
            const href = placementWebsiteUrl(site.targetUrl, site.placement);
            const content = <>
              <span className="flex size-7 items-center justify-center rounded-lg bg-red-50 text-xs font-semibold text-red-700">{index + 1}</span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate font-semibold">
                  <span className="truncate">{site.displayName}</span>
                  {href ? <ExternalLinkIcon className="size-3.5 shrink-0 text-neutral-400" /> : null}
                </p>
              </div>
              <div className="text-left sm:text-right">
                <p className="font-semibold">{site.impressions.toLocaleString()}</p>
                <p className="text-xs text-neutral-500">{share.toFixed(1)}% <span className="whitespace-nowrap">of total impressions</span></p>
              </div>
            </>;
            return href ? (
              <a key={site.id} href={href} target="_blank" rel="noopener noreferrer" className="grid items-center gap-3 rounded-xl border p-3 transition hover:border-red-200 hover:bg-red-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 sm:grid-cols-[2rem_minmax(0,1fr)_9rem]">
                {content}
              </a>
            ) : (
              <div key={site.id} className="grid items-center gap-3 rounded-xl border p-3 sm:grid-cols-[2rem_minmax(0,1fr)_9rem]">
                {content}
              </div>
            );
          })}
          {overview.topSites.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-neutral-500">No website placement impressions were returned.</p> : null}
        </div>
      </div>
    </section>
  );
}

function campaignTypeLabel(value?: string) {
  if (!value) return "Performance Max";
  if (value === "VIDEO") return "Video / YouTube";
  if (value === "PERFORMANCE_MAX") return "Performance Max";
  if (value === "DEMAND_GEN" || value === "DISCOVERY") return "Demand Gen";
  return humanize(value);
}

function isUserFacingPlacementWarning(warning: string) {
  return !warning.startsWith("Notion resolved ");
}

function placementWebsiteUrl(targetUrl: string | null, placement: string) {
  for (const candidate of [targetUrl, placement]) {
    const value = candidate?.trim();
    if (!value || value.toLowerCase() === "other") continue;
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
    } catch {
      // Some Google placement identifiers are not web addresses.
    }
  }
  return null;
}

type PlacementOverviewCache = {
  lastAccountId?: string;
  entries: Record<string, { expiresAt: number; payload: PlacementDashboardPayload }>;
};

function readPlacementOverviewCache(accountId?: string): PlacementDashboardPayload | null {
  try {
    const cache = JSON.parse(window.localStorage.getItem(PLACEMENT_OVERVIEW_CACHE_KEY) ?? "{}") as Partial<PlacementOverviewCache>;
    const key = accountId ?? cache.lastAccountId;
    const entry = key && cache.entries?.[key];
    if (!entry || entry.expiresAt <= Date.now()) return null;
    return { ...entry.payload, rows: [], changeSets: [], reports: [] };
  } catch {
    return null;
  }
}

function writePlacementOverviewCache(payload: PlacementDashboardPayload) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(PLACEMENT_OVERVIEW_CACHE_KEY) ?? "{}") as Partial<PlacementOverviewCache>;
    const entries = stored.entries ?? {};
    const compactPayload: PlacementDashboardPayload = {
      ...payload,
      rows: [],
      changeSets: [],
      reports: [],
      warnings: payload.warnings.filter(isUserFacingPlacementWarning),
    };
    entries[payload.account.customerId] = {
      expiresAt: Date.now() + PLACEMENT_OVERVIEW_CACHE_TTL_MS,
      payload: compactPayload,
    };
    const newestEntries = Object.fromEntries(
      Object.entries(entries)
        .filter(([, entry]) => entry.expiresAt > Date.now())
        .sort((left, right) => right[1].expiresAt - left[1].expiresAt)
        .slice(0, 10),
    );
    window.localStorage.setItem(PLACEMENT_OVERVIEW_CACHE_KEY, JSON.stringify({
      lastAccountId: payload.account.customerId,
      entries: newestEntries,
    } satisfies PlacementOverviewCache));
  } catch {
    // The live placement response remains available when browser storage is unavailable.
  }
}

function readAccountSearchCache(query: string): AccountSuggestion[] | null {
  try {
    const cache = JSON.parse(window.localStorage.getItem(ACCOUNT_SEARCH_CACHE_KEY) ?? "{}") as Record<string, { expiresAt: number; accounts: AccountSuggestion[] }>;
    const entry = cache[query.trim().toLowerCase()];
    if (!entry || entry.expiresAt <= Date.now()) return null;
    return entry.accounts.filter(isAccountSuggestion);
  } catch { return null; }
}

function writeAccountSearchCache(query: string, accounts: AccountSuggestion[]) {
  try {
    const cache = JSON.parse(window.localStorage.getItem(ACCOUNT_SEARCH_CACHE_KEY) ?? "{}") as Record<string, { expiresAt: number; accounts: AccountSuggestion[] }>;
    cache[query.trim().toLowerCase()] = { expiresAt: Date.now() + ACCOUNT_SEARCH_CACHE_TTL_MS, accounts };
    window.localStorage.setItem(ACCOUNT_SEARCH_CACHE_KEY, JSON.stringify(cache));
  } catch { /* Search remains available without browser storage. */ }
}

function PlacementRow({
  row,
  checked,
  onCheck,
}: {
  row: PlacementOptimizationRow;
  checked: boolean;
  onCheck: (value: boolean) => void;
}) {
  const tone =
    row.reviewStatus === "ready_for_publishing"
      ? "bg-emerald-50"
      : row.reviewStatus === "approver_rejected"
        ? "bg-red-50"
        : row.reviewStatus === "kiv" ||
            row.reviewStatus === "returned_for_clarification"
          ? "bg-amber-50"
          : "";
  return (
    <tr className={tone}>
      <td className="px-4 py-4">
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onCheck(value === true)}
          className="cursor-pointer"
        />
      </td>
      <td className="max-w-64 px-4 py-4">
        <p className="font-semibold">{row.displayName}</p>
        <p className="truncate text-xs text-neutral-500">{row.placement}</p>
        {row.targetUrl ? (
          <a
            href={row.targetUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-red-700"
          >
            Open <ExternalLinkIcon className="size-3" />
          </a>
        ) : null}
      </td>
      <td className="px-4 py-4">
        <Badge variant="outline">{campaignTypeLabel(row.campaignType)}</Badge>
        <Badge variant="outline">{humanize(row.placementType)}</Badge>
      </td>
      <td className="px-4 py-4">{row.campaignName}</td>
      <td className="px-4 py-4 font-semibold tabular-nums">{row.impressions.toLocaleString()}</td>
    </tr>
  );
}
function Filter({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase text-neutral-500">
        {label}
      </p>
      {children}
    </div>
  );
}
function Action({
  label,
  tone,
  disabled = false,
  onClick,
}: {
  label: string;
  tone: "red" | "green" | "amber";
  disabled?: boolean;
  onClick: () => void;
}) {
  const style =
    tone === "red"
      ? "bg-red-600 hover:bg-red-700"
      : tone === "green"
        ? "bg-emerald-600 hover:bg-emerald-700"
        : "bg-amber-500 hover:bg-amber-600";
  return (
    <Button
      size="sm"
      disabled={disabled}
      className={`cursor-pointer text-white ${style}`}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
function placementStatusLabel(value: string) {
  return value === "ready_for_publishing" ? "Excluded" : humanize(value);
}

function toExclusionPayload(row: PlacementOptimizationRow) {
  return {
    placement: row.placement,
    displayName: row.displayName,
    placementType: row.placementType,
    targetUrl: row.targetUrl,
    campaignId: row.campaignId,
    campaignName: row.campaignName,
    campaignType: row.campaignType,
    adGroupId: row.adGroupId,
    adGroupName: row.adGroupName,
    impressions: row.impressions,
    clicks: row.clicks,
    spend: row.spend,
    conversions: row.conversions,
    videoViews: row.videoViews,
  };
}
function formatReportingDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-MY", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date);
}
function formatElapsedTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
function formatCustomerId(value: string) {
  const normalized = value.replace(/\D/g, "");
  return normalized.length === 10
    ? `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`
    : value || "Unknown";
}
function formatDate(value: string) {
  const date = new Date(
    value.includes("T") ? value : `${value.replace(" ", "T")}Z`,
  );
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-MY", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
