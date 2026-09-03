"use client";

import { KeyboardEvent, type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ConstructionIcon,
  ExternalLinkIcon,
  FileDownIcon,
  SearchIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { ReportDateSelection } from "@/components/search-term-optimization/report-date-picker";
import { AnalysisProgressPanel } from "@/components/search-term-optimization/analysis-progress-panel";
import { DecisionConfirmationDialog } from "@/components/search-term-optimization/decision-confirmation-dialog";
import { SummaryReportDialog } from "@/components/search-term-optimization/summary-report-dialog";
import { SearchTermAccountSummary } from "@/components/search-term-optimization/search-term-account-summary";
import { ActionGroupTable, groupRowsByAction, type ApproverDecision, type ReviewDecision } from "@/components/search-term-optimization/search-term-results-table";
import { ReportShell } from "@/components/reporting/report-shell";
import { AccountEscalationNotice } from "@/components/team-lead-monitoring/account-escalation-notice";
import { GoogleAccountSearchField } from "@/components/optimization/google-account-search-field";
import type { DailyAnalysisCapacity } from "@/components/optimization/daily-capacity-counter-grid";
import { useSearchTermAnalysisJobs } from "@/components/optimization/search-term-analysis-tracker";
import { useWorkflowPolicies } from "@/components/workflow-settings/use-workflow-policies";
import { isAdminRole, type AuthRole } from "@/lib/auth/roles";
import { fetchDashboardWithRetry } from "@/lib/search-term-optimization/dashboard-load";
import { analysisRecoveryForMissingDashboard, isDailyCapacityReached, type SearchTermAnalysisJobSummary } from "@/lib/search-term-optimization/job-summary";
import { DEFAULT_SEARCH_TERM_CATEGORY_FILTER } from "@/lib/search-term-optimization/search-term-view";
import type {
  OptimizationDashboardPayload,
  OptimizationResult,
  GoogleKeywordRecommendation,
} from "@/lib/search-term-optimization/types";
import { approvalRequired } from "@/lib/workflow-settings/policy";

type CategoryFilter =
  | "all"
  | "add keyword"
  | "add negative keyword"
  | "special review needed"
  | "negative exact"
  | "add exact"
  | "negative phrase"
  | "no action"
  | "negative"
  | "approved"
  | "rejected"
  | "awaiting_approval"
  | "approved_for_publishing"
  | "approver_rejected"
  | "returned_for_clarification"
  | "unadded/unexcluded";

type AccountSuggestion = {
  accountName: string;
  adAccountId: string;
  accessPath?: string | null;
  optimizationScore: number | null;
  campaigns: Array<{ id: string; name: string; optimizationScore: number | null; clicks: number; conversions: number; conversionRate: number }>;
  warning?: string;
};

const ACCOUNT_SEARCH_DEBOUNCE_MS = 300;
const ACCOUNT_SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;
const RECENT_OPTIMIZATION_ACCOUNTS_KEY = "search-term-optimization-recent-accounts";
const ACCOUNT_SEARCH_CACHE_KEY = "search-term-optimization-account-search-cache";
const RECENT_ACCOUNT_LIMIT = 5;
const malaysiaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
type AccountSearchState = "idle" | "loading" | "success" | "error";
type DashboardLoadErrorCode = "SEARCH_TERM_STORAGE_UNAVAILABLE" | "SEARCH_TERM_ANALYSIS_NOT_FOUND" | "SEARCH_TERM_DASHBOARD_LOAD_FAILED" | null;

const REVIEW_ROLES: AuthRole[] = ["pms", "specialist", "admin"];

type SearchTermOptimizationPageClientProps = {
  role: AuthRole;
  embedded?: boolean;
  externalAccount?: { accountName: string; adAccountId: string; accessPath?: string | null } | null;
  embeddedHeaderTargetId?: string;
  dailyCapacity?: DailyAnalysisCapacity | null;
  onCapacityRefresh?: () => void | Promise<void>;
  onAccountResolved?: (account: { accountName: string; adAccountId: string; accessPath?: string | null }) => void;
};

export function SearchTermOptimizationPageClient({ role, embedded = false, externalAccount, embeddedHeaderTargetId, dailyCapacity: parentDailyCapacity, onCapacityRefresh, onAccountResolved }: SearchTermOptimizationPageClientProps) {
  const isAdmin = isAdminRole(role);
  const { jobs: activeAnalysisJobs, refreshJobs } = useSearchTermAnalysisJobs();
  const [embeddedHeaderTarget,setEmbeddedHeaderTarget]=useState<HTMLElement|null>(null);
  useEffect(()=>{setEmbeddedHeaderTarget(embeddedHeaderTargetId?document.getElementById(embeddedHeaderTargetId):null);},[embeddedHeaderTargetId]);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(DEFAULT_SEARCH_TERM_CATEGORY_FILTER);
  const canReview = REVIEW_ROLES.includes(role);
  const workflowPolicies = useWorkflowPolicies();
  const searchApprovalRequired = approvalRequired(workflowPolicies, "search_term_approval");
  const canApprove = searchApprovalRequired && (role === "approver" || isAdmin);
  const [data, setData] = useState<OptimizationDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadErrorCode, setLoadErrorCode] = useState<DashboardLoadErrorCode>(null);
  const [loading, setLoading] = useState(() => !isAdminRole(role));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>({});
  const [approverDecisions, setApproverDecisions] = useState<Record<string, ApproverDecision>>({});
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [categoryPages, setCategoryPages] = useState<Record<string, number>>({});
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [accountQuery, setAccountQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AccountSuggestion[]>([]);
  const [accountPerformance, setAccountPerformance] = useState<AccountSuggestion | null>(null);
  const [recentAccounts, setRecentAccounts] = useState<AccountSuggestion[]>([]);
  const [accountSearchState, setAccountSearchState] = useState<AccountSearchState>("idle");
  const [accountSearchError, setAccountSearchError] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisStage, setAnalysisStage] = useState<string | null>(null);
  const [analysisStartedAt, setAnalysisStartedAt] = useState<string | null>(null);
  const [analysisActivityAt, setAnalysisActivityAt] = useState<string | null>(null);
  const [activeAnalysisJobId,setActiveAnalysisJobId]=useState<string|null>(null);
  const [analysisStopping,setAnalysisStopping]=useState(false);
  const [retryAnalysisJobId,setRetryAnalysisJobId]=useState<string|null>(null);
  const [analysisProgress, setAnalysisProgress] = useState({ currentBatch: 0, completedBatches: 0, maxBatches: 10, currentBatchSize: 0, termsProcessed: 0, progressComplete: false });
  const [localDailyCapacity,setLocalDailyCapacity]=useState<(DailyAnalysisCapacity & {allocatedAccountIds?:string[]})|null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [highlightedAccountIndex, setHighlightedAccountIndex] = useState(-1);
  const accountSearchRequestId = useRef(0);
  const dashboardLoadRequestId = useRef(0);
  const skipNextAccountSearch = useRef(false);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsLoaded, setRecommendationsLoaded] = useState(false);
  const [googleRecommendations, setGoogleRecommendations] = useState<GoogleKeywordRecommendation[]>([]);
  const [googleRecommendationsWarning, setGoogleRecommendationsWarning] = useState<string | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportDateSelection, setReportDateSelection] = useState<ReportDateSelection>(() => ({ mode: "single", date: malaysiaToday() }));
  const [pendingDecision, setPendingDecision] = useState<{ rows: OptimizationResult[]; decision: ReviewDecision } | null>(null);
  const attachedAnalysisJobId = useRef<string | null>(null);

  const loadDailyCapacity=useCallback(async()=>{
    if(embedded&&onCapacityRefresh){await onCapacityRefresh();return;}
    try{const response=await fetch("/api/search-term-optimization/capacity",{cache:"no-store"});if(response.ok)setLocalDailyCapacity(await response.json());}catch{/* Analysis remains usable when the capacity badge cannot refresh. */}
  },[embedded,onCapacityRefresh]);
  useEffect(()=>{if(!embedded)void loadDailyCapacity();},[embedded,loadDailyCapacity]);
  const dailyCapacity=parentDailyCapacity??localDailyCapacity;
  const dailyCapacityReached=isDailyCapacityReached(dailyCapacity,accountPerformance?.adAccountId??null);

  const load = useCallback(async (accountId?: string) => {
    const requestId = dashboardLoadRequestId.current + 1;
    dashboardLoadRequestId.current = requestId;
    setLoading(true);
    setError(null);
    setLoadErrorCode(null);
    const params = new URLSearchParams();
    if (accountId) params.set("accountId", accountId);

    try {
      const response = await fetchDashboardWithRetry(`/api/search-term-optimization?${params}`);
      const payload = (await response.json()) as OptimizationDashboardPayload & { code?: Exclude<DashboardLoadErrorCode, null>; error?: string };
      if (requestId !== dashboardLoadRequestId.current) return;
      if (!response.ok) {
        if (payload.code === "SEARCH_TERM_ANALYSIS_NOT_FOUND" && accountId) {
          const jobResponse = await fetch(`/api/search-term-optimization/jobs?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" });
          if (jobResponse.ok) {
            const { job } = await jobResponse.json() as { job: SearchTermAnalysisJobSummary | null };
            if (job?.accountName && onAccountResolved) onAccountResolved({ accountName: job.accountName, adAccountId: job.accountId, accessPath: externalAccount?.accessPath });
            const recovery = analysisRecoveryForMissingDashboard(job);
            if (recovery && requestId === dashboardLoadRequestId.current) {
              setRetryAnalysisJobId(recovery.jobId);
              setLoadErrorCode("SEARCH_TERM_DASHBOARD_LOAD_FAILED");
              setError(recovery.error);
              setRefreshMessage("The previous analysis can be retried from its saved search-term batch.");
              setData(null);
              return;
            }
          }
        }
        setLoadErrorCode(payload.code ?? "SEARCH_TERM_DASHBOARD_LOAD_FAILED");
        throw new Error(payload.error ?? "Unable to load optimization data.");
      }
      setData(payload);
      setDecisions(Object.fromEntries(
        payload.results
          .filter((row) => row.reviewDecision)
          .map((row) => [row.id, row.reviewDecision as ReviewDecision]),
      ));
      setApproverDecisions(Object.fromEntries(
        payload.results
          .filter((row) => row.approverDecision)
          .map((row) => [row.id, row.approverDecision as ApproverDecision]),
      ));
      setRecommendationsLoaded(false);
      setGoogleRecommendations([]);
      setGoogleRecommendationsWarning(null);
    } catch (caught) {
      if (requestId !== dashboardLoadRequestId.current) return;
      const timedOut = caught instanceof DOMException && caught.name === "AbortError";
      if (timedOut) setLoadErrorCode("SEARCH_TERM_STORAGE_UNAVAILABLE");
      setError(timedOut ? "Saved analysis took too long to respond. Please try again." : caught instanceof Error ? caught.message : "Unable to load optimization data.");
      setData(null);
    } finally {
      if (requestId === dashboardLoadRequestId.current) setLoading(false);
    }
  }, [externalAccount?.accessPath, onAccountResolved]);

  useEffect(() => {
    const accountId = accountPerformance?.adAccountId.replace(/\D/g, "");
    if (!accountId) return;
    const job = activeAnalysisJobs.find(item => item.accountId.replace(/\D/g, "") === accountId);
    if (job) {
      attachedAnalysisJobId.current = job.jobId;
      setActiveAnalysisJobId(job.jobId);
      setAnalysisStage(job.stale ? "Worker update is delayed; progress is safely stored" : job.stage);
      setAnalysisStartedAt(job.startedAt);
      setAnalysisActivityAt(job.activityAt);
      setAnalysisProgress({ currentBatch: job.currentRun, completedBatches: job.completedRuns, maxBatches: job.plannedRuns, currentBatchSize: job.currentRunTerms, termsProcessed: job.termsProcessed, progressComplete: job.progressComplete });
      if (job.status === "needs_retry") {
        setAnalysisLoading(false);
        setLoading(false);
        setRetryAnalysisJobId(job.jobId);
        setError(job.error ?? "This analysis needs retry. Completed runs were kept.");
      } else {
        setAnalysisLoading(true);
        setLoading(true);
        setRetryAnalysisJobId(null);
      }
      return;
    }
    const finishedJobId = attachedAnalysisJobId.current;
    if (!finishedJobId) return;
    attachedAnalysisJobId.current = null;
    void (async () => {
      try {
        const response = await fetch(`/api/search-term-optimization/analyze?jobId=${encodeURIComponent(finishedJobId)}`, { cache: "no-store" });
        const status = await response.json() as { status?: string; dashboard?: OptimizationDashboardPayload; totalTerms?: number; error?: string; stage?: string };
        if (!response.ok) throw new Error(status.error ?? "Unable to read the completed analysis.");
        if (status.dashboard) {
          setData(status.dashboard);
          setDecisions(Object.fromEntries(status.dashboard.results.filter(row => row.reviewDecision).map(row => [row.id, row.reviewDecision as ReviewDecision])));
          setApproverDecisions(Object.fromEntries(status.dashboard.results.filter(row => row.approverDecision).map(row => [row.id, row.approverDecision as ApproverDecision])));
        } else if (status.status === "completed" && status.totalTerms === 0) {
          setData(null);
        }
        setRefreshMessage(status.status === "stopped" ? "Analysis stopped. Completed runs were kept." : status.status === "failed" ? "Analysis failed. Previous saved results were kept." : status.totalTerms === 0 ? "No search terms were detected. Daily analysis capacity was not used." : "Search-term analysis completed and the saved dashboard was refreshed.");
        if (status.status === "failed") setError(status.error ?? "Search-term analysis failed.");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load the completed analysis.");
      } finally {
        setAnalysisLoading(false);
        setLoading(false);
        setActiveAnalysisJobId(null);
        setAnalysisStopping(false);
        void loadDailyCapacity();
      }
    })();
  }, [accountPerformance?.adAccountId, activeAnalysisJobs, loadDailyCapacity]);

  useEffect(()=>{if(!analysisLoading&&accountPerformance&&error?.startsWith("Analysis was stopped"))void load(accountPerformance.adAccountId);},[accountPerformance,analysisLoading,error,load]);

  useEffect(() => {
    if (!embedded || !externalAccount) return;
    skipNextAccountSearch.current = true;
    setAccountPerformance({
      accountName: externalAccount.accountName,
      adAccountId: externalAccount.adAccountId,
      accessPath: externalAccount.accessPath,
      optimizationScore: null,
      campaigns: [],
    });
    setAccountQuery(`${externalAccount.accountName} | ${externalAccount.adAccountId}`);
    setData(null);
    setError(null);
    setRefreshMessage(null);
    setRetryAnalysisJobId(null);
    setActiveAnalysisJobId(null);
    setAnalysisStage(null);
    setAnalysisStartedAt(null);
    setAnalysisActivityAt(null);
    setAnalysisProgress({ currentBatch: 0, completedBatches: 0, maxBatches: 10, currentBatchSize: 0, termsProcessed: 0, progressComplete: false });
    void load(externalAccount.adAccountId);
  }, [embedded, externalAccount, load]);

  useEffect(() => {
    if (!onAccountResolved || !data?.account.customerId || !data.account.customerName) return;
    onAccountResolved({ accountName: data.account.customerName, adAccountId: data.account.customerId, accessPath: externalAccount?.accessPath });
  }, [data?.account.customerId, data?.account.customerName, externalAccount?.accessPath, onAccountResolved]);

  useEffect(() => {
    if (!onAccountResolved || !externalAccount) return;
    const job = activeAnalysisJobs.find((item) => item.accountId.replace(/\D/g, "") === externalAccount.adAccountId.replace(/\D/g, ""));
    if (job?.accountName) onAccountResolved({ accountName: job.accountName, adAccountId: job.accountId, accessPath: externalAccount.accessPath });
  }, [activeAnalysisJobs, externalAccount, onAccountResolved]);

  useEffect(() => {
    if (isAdmin) {
      setLoading(false);
      return;
    }
    void load();
  }, [isAdmin, load]);

  useEffect(() => {
    const customerId = data?.account.customerId;
    if (!customerId) return;
    const normalizedId = customerId.replace(/\D/g, "");
    if (accountPerformance?.adAccountId.replace(/\D/g, "") === normalizedId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const cached = readAccountSearchCache(normalizedId);
        const accounts = cached ?? await fetchAccountSuggestions(normalizedId, controller.signal);
        const match = accounts.find((account) => account.adAccountId.replace(/\D/g, "") === normalizedId) ?? null;
        if (!controller.signal.aborted) setAccountPerformance(match);
      } catch {
        if (!controller.signal.aborted) setAccountPerformance(null);
      }
    })();
    return () => controller.abort();
  }, [accountPerformance?.adAccountId, data?.account.customerId]);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(RECENT_OPTIMIZATION_ACCOUNTS_KEY) ?? "[]") as unknown;
      if (Array.isArray(stored)) setRecentAccounts(stored.filter(isAccountSuggestion).slice(0, RECENT_ACCOUNT_LIMIT));
    } catch {
      window.localStorage.removeItem(RECENT_OPTIMIZATION_ACCOUNTS_KEY);
    }
  }, []);

  useEffect(() => {
    const trimmed = accountQuery.trim();
    accountSearchRequestId.current += 1;
    const requestId = accountSearchRequestId.current;
    if (skipNextAccountSearch.current) {
      skipNextAccountSearch.current = false;
      return;
    }
    if (trimmed.length < 2) {
      setSuggestions([]);
      setAccountSearchState("idle");
      setAccountSearchError(null);
      setHighlightedAccountIndex(-1);
      return;
    }
    const cached = readAccountSearchCache(trimmed);
    if (cached) {
      setSuggestions(cached);
      setAccountSearchState("success");
      setAccountSearchError(null);
      setHighlightedAccountIndex(cached.length > 0 || recentAccounts.length > 0 ? 0 : -1);
      setAccountDropdownOpen(true);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAccountSearchState("loading");
      setAccountSearchError(null);
      setAccountDropdownOpen(true);
      try {
        const response = await fetch(`/api/search-term-optimization/account-search?q=${encodeURIComponent(trimmed)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as { accounts?: AccountSuggestion[]; error?: string };
        if (controller.signal.aborted || requestId !== accountSearchRequestId.current) return;
        if (!response.ok) throw new Error(payload.error ?? "Unable to search accounts.");
        const accounts = (payload.accounts ?? []).filter(isAccountSuggestion);
        setSuggestions(accounts);
        writeAccountSearchCache(trimmed, accounts);
        setAccountSearchState("success");
        setHighlightedAccountIndex(accounts.length > 0 || recentAccounts.length > 0 ? 0 : -1);
      } catch (caught) {
        if (controller.signal.aborted || requestId !== accountSearchRequestId.current) return;
        setSuggestions([]);
        setAccountSearchState("error");
        setAccountSearchError(caught instanceof Error ? caught.message : "Unable to search accounts.");
      }
    }, ACCOUNT_SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [accountQuery, recentAccounts.length]);

  const resultSuggestions = suggestions.filter((suggestion) => !recentAccounts.some((recent) => recent.adAccountId === suggestion.adAccountId));
  const visibleSuggestions = [...resultSuggestions, ...recentAccounts];

  function selectAccount(account: AccountSuggestion) {
    skipNextAccountSearch.current = true;
    setAccountPerformance(account);
    setAccountQuery(`${account.accountName} | ${account.adAccountId}`);
    setSuggestions([]);
    setAccountDropdownOpen(false);
    setHighlightedAccountIndex(-1);
    setData(null);
    setDecisions({});
    setApproverDecisions({});
    setSelectedIds(new Set());
    setRefreshMessage(null);
    setError(null);
    setRecentAccounts((current) => {
      const next = [account, ...current.filter((recent) => recent.adAccountId !== account.adAccountId)].slice(0, RECENT_ACCOUNT_LIMIT);
      try { window.localStorage.setItem(RECENT_OPTIMIZATION_ACCOUNTS_KEY, JSON.stringify(next)); } catch { /* keep in memory */ }
      return next;
    });
  }

  function changeAccountQuery(value: string) {
    setAccountQuery(value);
    setAccountPerformance(null);
    setData(null);
    setDecisions({});
    setApproverDecisions({});
    setSelectedIds(new Set());
    setRefreshMessage(null);
    setError(null);
    setAccountDropdownOpen(true);
    setHighlightedAccountIndex(-1);
  }

  async function runSelectedAccountAnalysis() {
    if (!accountPerformance || analysisLoading) return;
    setData(null);
    setDecisions({});
    setApproverDecisions({});
    setSelectedIds(new Set());
    setCategoryPages({});
    setCampaignFilter("all");
    setCategoryFilter(DEFAULT_SEARCH_TERM_CATEGORY_FILTER);
    setRecommendationsLoaded(false);
    setGoogleRecommendations([]);
    setGoogleRecommendationsWarning(null);
    setRefreshMessage(null);
    setAnalysisLoading(true);
    setAnalysisStage("Preparing smart search-term refresh");
    setAnalysisStartedAt(new Date().toISOString());
    setAnalysisActivityAt(new Date().toISOString());
    setAnalysisProgress({ currentBatch: 0, completedBatches: 0, maxBatches: 10, currentBatchSize: 0, termsProcessed: 0, progressComplete: false });
    setLoading(true);
    setError(null);
    setAccountDropdownOpen(false);
    let handedOff = false;
    try {
      const response = await fetch("/api/search-term-optimization/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: accountPerformance.adAccountId,
          accountName: accountPerformance.accountName,
          accessPath: accountPerformance.accessPath ?? null,
        }),
      });
      const started = (await response.json()) as { jobId?: string; stage?: string; error?: string; status?:string; dashboard?:OptimizationDashboardPayload };
      if (!response.ok) throw new Error(started.error ?? "Unable to start search-term analysis.");
      if (started.status === "completed" && started.dashboard) {
        const cached=started.dashboard;
        setData(cached);
        setDecisions(Object.fromEntries(cached.results.filter(row=>row.reviewDecision).map(row=>[row.id,row.reviewDecision as ReviewDecision])));
        setApproverDecisions(Object.fromEntries(cached.results.filter(row=>row.approverDecision).map(row=>[row.id,row.approverDecision as ApproverDecision])));
        setRefreshMessage("No new Google Ads check was needed today. Loaded the latest saved Supabase analysis.");
        return;
      }
      if (!started.jobId) throw new Error(started.error ?? "Unable to start search-term analysis.");
      if (started.status === "needs_retry") {
        setRetryAnalysisJobId(started.jobId);
        setLoadErrorCode("SEARCH_TERM_DASHBOARD_LOAD_FAILED");
        setError(started.error ?? "The previous analysis needs retry. Completed runs were kept.");
        setRefreshMessage("The previous analysis is recoverable and was not added to the active queue again.");
        return;
      }
      attachedAnalysisJobId.current = started.jobId;
      setActiveAnalysisJobId(started.jobId);
      setAnalysisStage(started.stage ?? "Analysis queued");
      handedOff = true;
      await refreshJobs();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to refresh search-term analysis. The previous saved analysis was kept.");
    } finally {
      void loadDailyCapacity();
      if (!handedOff) {
        setAnalysisLoading(false);
        setAnalysisStage(null);
        setLoading(false);
        setActiveAnalysisJobId(null);
        setAnalysisStopping(false);
      }
    }
  }

  async function stopSearchTermAnalysis(){if(!activeAnalysisJobId||analysisStopping)return;setAnalysisStopping(true);setAnalysisStage("Force stopping analysis");try{const response=await fetch(`/api/search-term-optimization/analyze?jobId=${encodeURIComponent(activeAnalysisJobId)}`,{method:"DELETE"});const payload=await response.json() as {status?:string;stage?:string;error?:string};if(!response.ok)throw new Error(payload.error??"Unable to force stop the analysis.");setAnalysisStage(payload.stage??"Analysis force stopped");await Promise.all([refreshJobs(),loadDailyCapacity()]);}catch(caught){setError(caught instanceof Error?caught.message:"Unable to force stop the analysis.");setAnalysisStopping(false);}}
  async function retrySearchTermAnalysis(){if(!retryAnalysisJobId)return;setError(null);const response=await fetch("/api/search-term-optimization/analyze",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({jobId:retryAnalysisJobId,action:"retry"})});if(!response.ok){const payload=await response.json().catch(()=>({})) as {error?:string};setError(payload.error??"Unable to retry this analysis.");return;}setRetryAnalysisJobId(null);setRefreshMessage("The failed run was queued again from its cached search terms.");await Promise.all([refreshJobs(),loadDailyCapacity()]);}

  function handleAccountKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") { setAccountDropdownOpen(false); setHighlightedAccountIndex(-1); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!accountDropdownOpen) setAccountDropdownOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setHighlightedAccountIndex((current) => visibleSuggestions.length === 0 ? -1 : (current + direction + visibleSuggestions.length) % visibleSuggestions.length);
      return;
    }
    if (event.key === "Enter" && highlightedAccountIndex >= 0 && visibleSuggestions[highlightedAccountIndex]) {
      event.preventDefault();
      selectAccount(visibleSuggestions[highlightedAccountIndex]);
    }
  }

  const visibleResults = useMemo(() => {
    const unaddedKeys = new Set(googleRecommendations.map((row) => `${row.searchTerm.toLowerCase()}|${row.campaign}|${row.adGroup}`));
    return (data?.results ?? []).filter((row) => {
      const matchesFilter = categoryFilter === "all"
        || (categoryFilter === "unadded/unexcluded"
          ? unaddedKeys.has(`${row.searchTerm.toLowerCase()}|${row.campaign}|${row.adGroup}`)
          : categoryFilter === "negative"
            ? row.reviewStatus === "approver_rejected"
          : categoryFilter === "special review needed"
            ? !row.reviewDecision && row.reviewStatus !== "approver_rejected" && proposedActionCategory(row.proposedAction) === "special review needed"
          : categoryFilter === "add keyword" || categoryFilter === "add negative keyword"
            ? !row.reviewDecision && proposedActionCategory(row.proposedAction) === categoryFilter
          : categoryFilter === "approved" || categoryFilter === "rejected"
            ? categoryFilter === "approved"
              ? row.reviewStatus === "approved_for_publishing"
              : row.reviewStatus === "approver_rejected"
            : categoryFilter === "awaiting_approval"
              ? row.reviewStatus === "ready_for_approval"
              : categoryFilter === "approved_for_publishing"
                ? row.reviewStatus === "approved_for_publishing"
                : categoryFilter === "approver_rejected"
                  ? row.reviewStatus === "approver_rejected"
                  : categoryFilter === "returned_for_clarification"
                    ? row.reviewStatus === "returned_for_clarification"
                    : !row.reviewDecision && normalizeAction(row.proposedAction) === categoryFilter);
      const matchesCampaign = campaignFilter === "all" || row.campaign === campaignFilter;
      return matchesFilter && matchesCampaign;
    }).sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || right.spend - left.spend);
  }, [campaignFilter, categoryFilter, data, googleRecommendations]);

  const campaignOptions = useMemo(
    () => [...new Set((data?.results ?? []).map((row) => row.campaign))].sort(),
    [data],
  );

  const selectedCampaignPerformance = useMemo(
    () => campaignFilter === "all"
      ? null
      : accountPerformance?.campaigns.find((campaign) => campaign.name === campaignFilter) ?? null,
    [accountPerformance, campaignFilter],
  );

  const grouped = useMemo(() => {
    const groups = new Map<string, OptimizationResult[]>();
    for (const row of visibleResults) {
      groups.set(row.adGroup, [...(groups.get(row.adGroup) ?? []), row]);
    }
    return [...groups.entries()];
  }, [visibleResults]);

  const cards = data
    ? [
        ["all", "Total reviewed", data.summary.totalReviewed],
        ["automatic", "Automatically excluded", data.summary.automaticallyExcluded],
        ["add-exact", "Add exact recommendations", data.summary.addExactRecommendations],
        ["review", "Needs review", data.summary.needsReview],
        ["no-action", "No action", data.summary.noAction],
        ["failed", "Failed or unverified", data.summary.failedOrUnverified],
        ["queued", "Remaining queue", data.refresh?.queuedNewTerms ?? 0],
        ["current", "Current terms", data.refresh?.currentTerms ?? data.results.length],
      ] as Array<[string, string, number]>
    : [];

  const cacheKey = data
    ? `search-term-review:${role}:${data.account.customerId}:${data.account.lastAnalysisAt}`
    : null;

  useEffect(() => {
    if (!cacheKey) return;
    const cached = window.localStorage.getItem(cacheKey);
    if (!cached) return;
    try {
      const parsed = JSON.parse(cached) as {
        selectedIds?: string[];
        categoryPages?: Record<string, number>;
      };
      window.queueMicrotask(() => {
        setSelectedIds(new Set(parsed.selectedIds ?? []));
        setCategoryPages(parsed.categoryPages ?? {});
      });
    } catch {
      window.localStorage.removeItem(cacheKey);
    }
  }, [cacheKey]);

  useEffect(() => {
    if (!cacheKey) return;
    window.localStorage.setItem(cacheKey, JSON.stringify({
      selectedIds: [...selectedIds],
      categoryPages,
    }));
  }, [cacheKey, categoryPages, selectedIds]);

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  function toggleCategory(rows: OptimizationResult[], checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      rows.forEach((row) => checked ? next.add(row.id) : next.delete(row.id));
      return next;
    });
  }

  function decideCategory(rows: OptimizationResult[], decision: ReviewDecision) {
    if (!canReview || decisionSaving) return;
    const selected = rows.filter((row) => selectedIds.has(row.id));
    const targets = selected.length > 0 ? selected : rows;
    if (targets.length > 100) {
      setDecisionError("Select no more than 100 search terms at a time.");
      return;
    }
    setPendingDecision({ rows: targets, decision });
  }

  async function confirmDecision() {
    if (!pendingDecision || decisionSaving) return;
    const { rows: targets, decision } = pendingDecision;
    setPendingDecision(null);
    setDecisionError(null);
    setDecisionSaving(true);
    try {
      const response = await fetch("/api/search-term-optimization/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationIds: targets.map((row) => row.id), decision }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to save the review decision.");
      setDecisions((current) => ({
        ...current,
        ...Object.fromEntries(targets.map((row) => [row.id, decision])),
      }));
      setData((current) => current ? {
        ...current,
        results: current.results.map((row) => targets.some((target) => target.id === row.id)
          ? {
              ...row,
              reviewDecision: decision,
              reviewStatus: decision === "approved" ? "approved_for_publishing" : "approver_rejected",
            }
          : row),
      } : current);
      setSelectedIds(new Set());
    } catch (caught) {
      setDecisionError(caught instanceof Error ? caught.message : "Unable to save the review decision.");
    } finally {
      setDecisionSaving(false);
    }
  }

  async function decideApproval(rows: OptimizationResult[], decision: ApproverDecision) {
    if (!canApprove) return;
    const selected = rows.filter((row) => selectedIds.has(row.id));
    const targets = selected.length > 0 ? selected : rows;
    setDecisionError(null);
    try {
      const response = await fetch("/api/search-term-optimization/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationIds: targets.map((row) => row.id), decision }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to save the approver decision.");
      setApproverDecisions((current) => ({
        ...current,
        ...Object.fromEntries(targets.map((row) => [row.id, decision])),
      }));
      if (decision === "rejected") setDecisions((current) => {
        const next = { ...current };
        targets.forEach((row) => delete next[row.id]);
        return next;
      });
      setData((current) => current ? {
        ...current,
        results: current.results.map((row) => targets.some((target) => target.id === row.id)
          ? {
              ...row,
              reviewStatus: decision === "accepted"
                ? row.reviewDecision === "rejected" ? "approver_rejected" : "approved_for_publishing"
                : "returned_for_clarification",
              reviewDecision: decision === "rejected" ? undefined : row.reviewDecision,
              approverDecision: decision,
            }
          : row),
      } : current);
      setSelectedIds(new Set());
    } catch (caught) {
      setDecisionError(caught instanceof Error ? caught.message : "Unable to save the approver decision.");
    }
  }


  const loadUnaddedSearchTerms = useCallback(async () => {
    if (recommendationsLoaded || recommendationsLoading || !data) return;
    setRecommendationsLoading(true);
    try {
      const params = new URLSearchParams({ accountId: data.account.customerId });
      const response = await fetch(`/api/search-term-optimization/recommendations?${params}`, { cache: "no-store" });
      const payload = (await response.json()) as { recommendations?: GoogleKeywordRecommendation[]; warning?: string | null; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load Google Ads recommendations.");
      setGoogleRecommendations(payload.recommendations ?? []);
      setGoogleRecommendationsWarning(payload.warning ?? null);
      setRecommendationsLoaded(true);
    } catch (caught) {
      setGoogleRecommendationsWarning(caught instanceof Error ? caught.message : "Unable to load Google Ads recommendations.");
    } finally {
      setRecommendationsLoading(false);
    }
  }, [data, recommendationsLoaded, recommendationsLoading]);

  useEffect(() => {
    if (categoryFilter === "unadded/unexcluded") void loadUnaddedSearchTerms();
  }, [categoryFilter, loadUnaddedSearchTerms]);

  return (
    <OptimizationPageFrame
      embedded={embedded}
      title="Search Term Optimization"
      dateLabel="Automation to be implemented"
      headerDateControl={<AutomationUnavailableStatus />}
      activeQuery=""
      reportReady={!loading && !analysisLoading && !error}
    >
      <div className="space-y-5 text-neutral-950">
        {embedded&&embeddedHeaderTarget?createPortal(<SearchTermAccountSummary account={externalAccount??accountPerformance} dashboard={data} analysisLoading={analysisLoading} loading={loading} capacityReached={dailyCapacityReached} showActions={isAdmin&&Boolean(externalAccount)} onStartAnalysis={()=>void runSelectedAccountAnalysis()} onOpenReport={()=>{setReportDateSelection({mode:"single",date:malaysiaToday()});setReportDialogOpen(true);}}/>,embeddedHeaderTarget):null}
        {!embedded && dailyCapacity ? <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"><div className="mb-4"><p className="font-semibold text-neutral-950">Daily analysis limit</p><p className="mt-1 text-sm text-neutral-500">Overall account-analysis attempts for today · maximum {dailyCapacity.total} accounts</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><CapacityStat label="Total attempts" value={dailyCapacity.total}/><CapacityStat label="Used" value={dailyCapacity.used+dailyCapacity.claiming}/><CapacityStat label="Reserved" value={dailyCapacity.reserved}/><CapacityStat label="Available" value={dailyCapacity.available}/></div></section> : null}
        <section className={embedded?"hidden":"relative rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7"}>
          {isAdmin && !embedded ? <div className="mb-5">
            <label className="mb-2 block text-sm font-semibold text-neutral-800">Notion account search</label>
            <div className="flex max-w-4xl items-start gap-2">
              <GoogleAccountSearchField value={accountQuery} onChange={changeAccountQuery} onSelect={selectAccount} results={suggestions} recentAccounts={recentAccounts} open={accountDropdownOpen} state={accountSearchState} error={accountSearchError} onFocus={()=>setAccountDropdownOpen(true)} onBlur={()=>setAccountDropdownOpen(false)} onKeyDown={handleAccountKeyDown} highlightedIndex={highlightedAccountIndex} onHighlight={setHighlightedAccountIndex}/>
              <Button
                type="button"
                className="h-12 cursor-pointer bg-red-600 text-white hover:bg-red-700"
                disabled={!accountPerformance || analysisLoading || dailyCapacityReached}
                onClick={() => void runSelectedAccountAnalysis()}
              >
                {analysisLoading ? <Spinner className="size-4" /> : <SearchIcon className="size-4" />}
                {analysisLoading ? "Analyzing..." : dailyCapacityReached ? "Max analysis reached today" : "Start analysis"}
              </Button>
              <Button type="button" variant="outline" className="cursor-pointer whitespace-nowrap hover:border-red-200 hover:bg-red-50 hover:text-red-700" disabled={!data || loading || analysisLoading} onClick={() => { setReportDateSelection({ mode: "single", date: malaysiaToday() }); setReportDialogOpen(true); }}>
                <FileDownIcon className="size-4" />
                Summary report
              </Button>
            </div>
            <p className="mt-2 text-xs text-neutral-500">Select an account, then start analysis to retrieve, analyze, and save its latest search terms.</p>
          </div> : null}
          <SearchTermAccountSummary account={accountPerformance} dashboard={data} analysisLoading={analysisLoading} loading={loading} capacityReached={dailyCapacityReached} showActions={false} onStartAnalysis={()=>void runSelectedAccountAnalysis()} onOpenReport={()=>{setReportDateSelection({mode:"single",date:malaysiaToday()});setReportDialogOpen(true);}}/>
        </section>

        {!analysisLoading && refreshMessage ? <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{refreshMessage}</div> : null}
        {!analysisLoading ? <AccountEscalationNotice module="search_term" accountId={data?.account.customerId} /> : null}

        {!analysisLoading && error && !accountPerformance && error.includes("No completed search-term analysis output was found") ? (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-700 shadow-sm">
            <p className="font-semibold">No account selected for analysis</p>
            <p className="mt-1 text-sm text-neutral-500">Select an account above, then press Search to begin.</p>
          </section>
        ) : !analysisLoading && error && loadErrorCode === "SEARCH_TERM_STORAGE_UNAVAILABLE" ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
            <p className="font-semibold">Saved analysis is temporarily unavailable</p>
            <p className="mt-1 text-sm">{error}</p>
            <Button type="button" variant="outline" className="mt-3 cursor-pointer bg-white" disabled={loading} onClick={()=>void load(accountPerformance?.adAccountId)}>Retry</Button>
          </section>
        ) : !analysisLoading && error && loadErrorCode !== "SEARCH_TERM_ANALYSIS_NOT_FOUND" ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
            <p className="font-semibold">Optimization dashboard unavailable</p>
            <p className="mt-1 text-sm">{error}</p>
            {retryAnalysisJobId?<Button type="button" variant="outline" className="mt-3 cursor-pointer bg-white" onClick={()=>void retrySearchTermAnalysis()}>Retry failed run</Button>:null}
          </section>
        ) : null}
        {loading || analysisLoading ? <AnalysisProgressPanel title={analysisLoading ? "Analyzing search terms" : "Loading saved search-term analysis"} label={analysisLoading ? (analysisStage ?? "Preparing analysis...") : "Retrieving saved recommendations..."} startedAt={analysisLoading ? analysisStartedAt : null} activityAt={analysisLoading ? analysisActivityAt : null} progress={analysisLoading ? analysisProgress : undefined} showWorkerStatus={analysisLoading} onStop={analysisLoading && activeAnalysisJobId?()=>void stopSearchTermAnalysis():undefined} stopping={analysisStopping} /> : null}

        {!loading && !analysisLoading && !data && !error && !accountPerformance ? (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-700 shadow-sm">
            <p className="font-semibold">Please select an account to optimize search terms</p>
            <p className="mt-1 text-sm text-neutral-500">Search for a company or Google Ads CID above, select it, then press Search.</p>
          </section>
        ) : null}

        {!loading && !analysisLoading && !data && (!error || loadErrorCode === "SEARCH_TERM_ANALYSIS_NOT_FOUND") && accountPerformance ? (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-700 shadow-sm">
            <p className="font-semibold">Search-term analysis is not available yet</p>
            <p className="mt-1 text-sm text-neutral-500">Press Start analysis to retrieve and analyze this account&apos;s search terms.</p>
          </section>
        ) : null}

        {data ? (
          <>
            {!embedded ? <section className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
              {cards.map(([key, label, value]) => (
                <div
                  key={key}
                  className="flex min-h-[122px] flex-col rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm"
                >
                  <span className="min-h-10 text-xs font-semibold uppercase leading-5 tracking-wide text-neutral-500">{label}</span>
                  <span className="mt-auto block pt-2 text-3xl font-semibold leading-none tabular-nums">{value.toLocaleString("en-MY")}</span>
                </div>
              ))}
            </section> : null}

            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">{data.results[0]?.adGroup || "General"}</h2>
              {data.results[0]?.destinationUrl ? (
                <a href={data.results[0].destinationUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-sm text-red-700 hover:underline">
                  {data.results[0].destinationUrl}<ExternalLinkIcon className="size-3.5 shrink-0" />
                </a>
              ) : null}
              <GeneralAccountPerformance account={accountPerformance} />
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Campaign</p><Select value={campaignFilter} onValueChange={setCampaignFilter}><SelectTrigger className="w-full cursor-pointer bg-white transition hover:bg-neutral-50"><SelectValue placeholder="All campaigns" /></SelectTrigger><SelectContent><SelectItem value="all">All campaigns</SelectItem>{campaignOptions.map((campaign) => <SelectItem key={campaign} value={campaign}>{campaign}</SelectItem>)}</SelectContent></Select></div>
                <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Category</p><Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as CategoryFilter)}><SelectTrigger className="w-full cursor-pointer bg-white transition hover:bg-neutral-50"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="add keyword">Add Keyword</SelectItem><SelectItem value="add negative keyword">Add Negative Keyword</SelectItem><SelectItem value="special review needed">Special Review Needed</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="rejected">Rejected</SelectItem><SelectItem value="all">All tables</SelectItem></SelectContent></Select></div>
              </div>
              {campaignFilter !== "all" ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-3 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Selected campaign</span>
                  <Badge variant="outline" className={optimizationTone(selectedCampaignPerformance?.optimizationScore ?? null)}>
                    Optimization {formatOptionalPercent(selectedCampaignPerformance?.optimizationScore ?? null)}
                  </Badge>
                  {selectedCampaignPerformance ? (
                    <span className="text-xs text-neutral-500">
                      {selectedCampaignPerformance.conversions.toFixed(2)} conversions · {selectedCampaignPerformance.conversionRate.toFixed(2)}% conversion rate
                    </span>
                  ) : null}
                </div>
              ) : null}
              {categoryFilter === "unadded/unexcluded" && recommendationsLoading ? <AnalysisProgressPanel label="Loading current Google Ads status..." compact /> : null}
              {categoryFilter === "unadded/unexcluded" && googleRecommendationsWarning ? <p className="mt-3 text-sm text-amber-700">{googleRecommendationsWarning}</p> : null}
            </section>

            {decisionError ? (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {decisionError}
              </p>
            ) : null}

            <section className="space-y-4">
              {grouped.map(([adGroup, rows]) => (
                <div key={adGroup} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
                  {grouped.length > 1 ? <div className="border-b bg-neutral-50 px-5 py-4">
                    <h2 className="text-lg font-semibold">{adGroup}</h2>
                    {rows[0]?.destinationUrl ? (
                      <a href={rows[0].destinationUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-sm text-red-700 hover:underline">
                        {rows[0].destinationUrl}<ExternalLinkIcon className="size-3.5 shrink-0" />
                      </a>
                    ) : null}
                  </div> : null}
                  <div className="space-y-5 p-4">
                    {((["approved", "rejected", "awaiting_approval", "approved_for_publishing", "approver_rejected", "returned_for_clarification"] as CategoryFilter[]).includes(categoryFilter)
                      ? [[categoryFilter, rows] as [string, OptimizationResult[]]]
                      : groupRowsByAction(rows)).map(([action, actionRows]) => {
                      const categoryId = `${adGroup}:${action}`;
                      return <ActionGroupTable
                        key={`${action}-${campaignFilter}-${categoryFilter}`}
                        action={action}
                        rows={actionRows}
                        selectedIds={selectedIds}
                        decisions={decisions}
                        approverDecisions={approverDecisions}
                        page={categoryPages[categoryId] ?? 1}
                        onPageChange={(page) => setCategoryPages((current) => ({ ...current, [categoryId]: page }))}
                        onToggleRow={toggleRow}
                        onToggleCategory={toggleCategory}
                        onDecision={decideCategory}
                        onApproverDecision={decideApproval}
                        canReview={canReview && !decisionSaving && !["approved", "rejected"].includes(action)}
                        canApprove={canApprove && action === "awaiting_approval"}
                        approverView={searchApprovalRequired && action === "awaiting_approval"}
                      />;
                    })}
                  </div>
                </div>
              ))}
              {grouped.length === 0 ? <p className="rounded-2xl bg-white p-6 text-center text-neutral-500">No results match the selected filter.</p> : null}
            </section>

          </>
        ) : null}
      </div>
      <SummaryReportDialog open={reportDialogOpen} onOpenChange={setReportDialogOpen} selection={reportDateSelection} onSelectionChange={setReportDateSelection} />
      <DecisionConfirmationDialog pending={pendingDecision} accountName={data?.account.customerName} saving={decisionSaving} onClose={()=>setPendingDecision(null)} onConfirm={()=>void confirmDecision()} />
    </OptimizationPageFrame>
  );
}

function OptimizationPageFrame({ embedded, children, ...shellProps }: ComponentProps<typeof ReportShell> & { embedded: boolean }) {
  return embedded ? <>{children}</> : <ReportShell {...shellProps}>{children}</ReportShell>;
}

function AutomationUnavailableStatus() {
  return (
    <div className="relative min-w-[230px] overflow-hidden rounded-2xl border border-white/25 bg-black/35 px-5 py-3 text-white shadow-xl backdrop-blur-md" aria-label="Automation to be implemented">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 via-white/5 to-black/15" />
      <div className="relative flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/30 bg-amber-400/15 text-amber-200">
          <ConstructionIcon className="size-5" />
        </span>
        <span>
          <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-white/65">Automation unavailable</span>
          <span className="mt-0.5 block text-base font-semibold">To be implemented</span>
        </span>
      </div>
    </div>
  );
}

function priorityRank(priority?: OptimizationResult["priority"]) {
  return priority === "critical" ? 0 : priority === "high" ? 1 : priority === "medium" ? 2 : 3;
}

function normalizeAction(value: string): CategoryFilter {
  const normalized = value.trim().toLowerCase();
  if (normalized === "special review") return "special review needed";
  if (["all", "special review needed", "negative exact", "add exact", "negative phrase", "no action"].includes(normalized)) return normalized as CategoryFilter;
  return "all";
}

function CapacityStat({label,value}:{label:string;value:number}){return <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-950">{value}</p></div>}

function proposedActionCategory(value: string): "add keyword" | "add negative keyword" | "special review needed" | "no action" {
  const action = normalizeAction(value);
  if (action === "add exact") return "add keyword";
  if (action === "negative exact" || action === "negative phrase") return "add negative keyword";
  if (action === "no action") return "no action";
  return "special review needed";
}

function formatOptionalPercent(value: number | null) { return value === null ? "N/A" : `${value.toFixed(1)}%`; }
function isAccountSuggestion(value: unknown): value is AccountSuggestion {
  if (!value || typeof value !== "object") return false;
  const account = value as Partial<AccountSuggestion>;
  return typeof account.accountName === "string"
    && typeof account.adAccountId === "string"
    && /^\d{10}$/.test(account.adAccountId.replace(/\D/g, ""))
    && (account.optimizationScore === null || typeof account.optimizationScore === "number")
    && Array.isArray(account.campaigns);
}
function readAccountSearchCache(query: string): AccountSuggestion[] | null {
  try {
    const cache = JSON.parse(window.localStorage.getItem(ACCOUNT_SEARCH_CACHE_KEY) ?? "{}") as Record<string, { expiresAt?: number; accounts?: unknown }>;
    const entry = cache[query.toLowerCase()];
    if (!entry || typeof entry.expiresAt !== "number" || entry.expiresAt <= Date.now() || !Array.isArray(entry.accounts)) return null;
    return entry.accounts.filter(isAccountSuggestion);
  } catch {
    window.localStorage.removeItem(ACCOUNT_SEARCH_CACHE_KEY);
    return null;
  }
}
function writeAccountSearchCache(query: string, accounts: AccountSuggestion[]) {
  try {
    const cache = JSON.parse(window.localStorage.getItem(ACCOUNT_SEARCH_CACHE_KEY) ?? "{}") as Record<string, { expiresAt: number; accounts: AccountSuggestion[] }>;
    cache[query.toLowerCase()] = { expiresAt: Date.now() + ACCOUNT_SEARCH_CACHE_TTL_MS, accounts };
    const freshEntries = Object.entries(cache).filter(([, entry]) => entry.expiresAt > Date.now()).slice(-20);
    window.localStorage.setItem(ACCOUNT_SEARCH_CACHE_KEY, JSON.stringify(Object.fromEntries(freshEntries)));
  } catch {
    // Search remains functional when browser storage is unavailable.
  }
}
async function fetchAccountSuggestions(query: string, signal?: AbortSignal) {
  const response = await fetch(`/api/search-term-optimization/account-search?q=${encodeURIComponent(query)}`, { cache: "no-store", signal });
  const payload = await response.json() as { accounts?: AccountSuggestion[]; error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Unable to load account performance.");
  const accounts = (payload.accounts ?? []).filter(isAccountSuggestion);
  writeAccountSearchCache(query, accounts);
  return accounts;
}
function campaignTotals(campaigns: AccountSuggestion["campaigns"]) {
  const totals = campaigns.reduce((current, campaign) => ({ clicks: current.clicks + campaign.clicks, conversions: current.conversions + campaign.conversions }), { clicks: 0, conversions: 0 });
  return { ...totals, conversionRate: totals.clicks > 0 ? totals.conversions / totals.clicks * 100 : 0 };
}
function GeneralAccountPerformance({ account }: { account: AccountSuggestion | null }) {
  if (!account) return <div className="mt-3 text-xs text-neutral-400">Loading account performance…</div>;
  const totals = campaignTotals(account.campaigns);
  return <div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><Badge variant="outline" className={optimizationTone(account.optimizationScore)}>Optimization {formatOptionalPercent(account.optimizationScore)}</Badge><Badge variant="outline" className="bg-blue-50 text-blue-800">Conversion rate {totals.conversionRate.toFixed(2)}%</Badge><span className="text-xs text-neutral-500">{totals.conversions.toFixed(2)} conversions across all campaigns</span></div>;
}
function optimizationTone(value: number | null) {
  if (value === null) return "bg-neutral-100 text-neutral-600";
  if (value < 60) return "border-red-200 bg-red-50 text-red-700";
  if (value < 80) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}
