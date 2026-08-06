"use client";

import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  CheckIcon,
  CheckCircle2Icon,
  ConstructionIcon,
  ExternalLinkIcon,
  SearchIcon,
  ShieldAlertIcon,
  CircleHelpIcon,
  FileUpIcon,
  SaveIcon,
  XIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ReportShell } from "@/components/reporting/report-shell";
import { AUTH_ROLE_LABELS, type AuthRole } from "@/lib/auth/roles";
import type {
  OptimizationDashboardPayload,
  OptimizationResult,
  GoogleKeywordRecommendation,
} from "@/lib/search-term-optimization/types";
import type { LeadQualityValues } from "@/lib/search-term-optimization/lead-quality-repository";

type CategoryFilter =
  | "all"
  | "special review needed"
  | "negative exact"
  | "add exact"
  | "negative phrase"
  | "no action"
  | "negative"
  | "final review"
  | "approved"
  | "rejected"
  | "to_be_determined"
  | "awaiting_approval"
  | "approved_for_publishing"
  | "approver_rejected"
  | "returned_for_clarification"
  | "unadded/unexcluded";

type ReviewDecision = "approved" | "rejected" | "to_be_determined";
type ApproverDecision = "accepted" | "rejected";
type WorkflowMode = "specialist" | "approver";

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
type AccountSearchState = "idle" | "loading" | "success" | "error";

const REVIEW_ROLES: AuthRole[] = ["pms", "specialist", "admin"];

export function SearchTermOptimizationPageClient({ role }: { role: AuthRole }) {
  const isAdmin = role === "admin";
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>(role === "approver" ? "approver" : "specialist");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(role === "approver" ? "final review" : "special review needed");
  const finalReviewActive = workflowMode === "approver" || categoryFilter === "final review";
  const canReview = REVIEW_ROLES.includes(role) && workflowMode === "specialist" && !finalReviewActive;
  const canApprove = (role === "approver" || role === "admin") && finalReviewActive;
  const [data, setData] = useState<OptimizationDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>({});
  const [approverDecisions, setApproverDecisions] = useState<Record<string, ApproverDecision>>({});
  const [decisionError, setDecisionError] = useState<string | null>(null);
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
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [highlightedAccountIndex, setHighlightedAccountIndex] = useState(-1);
  const accountSearchRequestId = useRef(0);
  const skipNextAccountSearch = useRef(false);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsLoaded, setRecommendationsLoaded] = useState(false);
  const [googleRecommendations, setGoogleRecommendations] = useState<GoogleKeywordRecommendation[]>([]);
  const [googleRecommendationsWarning, setGoogleRecommendationsWarning] = useState<string | null>(null);
  const [leadQualityMessage, setLeadQualityMessage] = useState<string | null>(null);
  const [leadImportErrors, setLeadImportErrors] = useState<Array<{ row: number; message: string }>>([]);
  const [leadQualitySaving, setLeadQualitySaving] = useState(false);

  const load = useCallback(async (accountId?: string) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (accountId) params.set("accountId", accountId);

    try {
      const response = await fetch(`/api/search-term-optimization?${params}`, { cache: "no-store" });
      const payload = (await response.json()) as OptimizationDashboardPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load optimization data.");
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
      setError(caught instanceof Error ? caught.message : "Unable to load optimization data.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      setHighlightedAccountIndex(recentAccounts.length + (cached.length > 0 ? 0 : -1));
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
        setHighlightedAccountIndex(recentAccounts.length + (accounts.length > 0 ? 0 : -1));
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
  const visibleSuggestions = [...recentAccounts, ...resultSuggestions];

  function selectAccount(account: AccountSuggestion) {
    skipNextAccountSearch.current = true;
    setAccountPerformance(account);
    setAccountQuery(`${account.accountName} | ${account.adAccountId}`);
    setSuggestions([]);
    setAccountDropdownOpen(false);
    setHighlightedAccountIndex(-1);
    setRecentAccounts((current) => {
      const next = [account, ...current.filter((recent) => recent.adAccountId !== account.adAccountId)].slice(0, RECENT_ACCOUNT_LIMIT);
      try { window.localStorage.setItem(RECENT_OPTIMIZATION_ACCOUNTS_KEY, JSON.stringify(next)); } catch { /* keep in memory */ }
      return next;
    });
  }

  async function runSelectedAccountAnalysis() {
    if (!accountPerformance || analysisLoading) return;
    setAnalysisLoading(true);
    setAnalysisStage("Preparing full search-term analysis");
    setAnalysisStartedAt(new Date().toISOString());
    setAnalysisActivityAt(new Date().toISOString());
    setLoading(true);
    setError(null);
    setAccountDropdownOpen(false);
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
      const started = (await response.json()) as { jobId?: string; stage?: string; error?: string };
      if (!response.ok || !started.jobId) throw new Error(started.error ?? "Unable to start search-term analysis.");
      setAnalysisStage(started.stage ?? "Analysis queued");
      let payload: OptimizationDashboardPayload | null = null;
      for (let attempt = 0; attempt < 900; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        const statusResponse = await fetch(`/api/search-term-optimization/analyze?jobId=${encodeURIComponent(started.jobId)}`, { cache: "no-store" });
        const status = (await statusResponse.json()) as {
          status?: "queued" | "running" | "completed" | "failed";
          stage?: string;
          error?: string;
          dashboard?: OptimizationDashboardPayload;
          startedAt?: string;
          activityAt?: string;
        };
        if (!statusResponse.ok) throw new Error(status.error ?? "Unable to read analysis status.");
        setAnalysisStage(status.stage ?? "Analyzing search terms");
        if (status.startedAt) setAnalysisStartedAt(status.startedAt);
        if (status.activityAt) setAnalysisActivityAt(status.activityAt);
        if (status.status === "failed") throw new Error(status.error ?? "Full search-term analysis failed.");
        if (status.status === "completed" && status.dashboard) { payload = status.dashboard; break; }
      }
      if (!payload) throw new Error("Search-term analysis timed out before completion.");
      setData(payload);
      setDecisions(Object.fromEntries(payload.results.filter((row) => row.reviewDecision).map((row) => [row.id, row.reviewDecision as ReviewDecision])));
      setApproverDecisions(Object.fromEntries(payload.results.filter((row) => row.approverDecision).map((row) => [row.id, row.approverDecision as ApproverDecision])));
      setSelectedIds(new Set());
      setRecommendationsLoaded(false);
      setGoogleRecommendations([]);
      setGoogleRecommendationsWarning(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to generate search-term analysis.");
    } finally {
      setAnalysisLoading(false);
      setAnalysisStage(null);
      setLoading(false);
    }
  }

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

  useEffect(() => {
    setCategoryFilter(workflowMode === "approver" ? "final review" : "special review needed");
    setSelectedIds(new Set());
  }, [workflowMode]);

  const visibleResults = useMemo(() => {
    const unaddedKeys = new Set(googleRecommendations.map((row) => `${row.searchTerm.toLowerCase()}|${row.campaign}|${row.adGroup}`));
    return (data?.results ?? []).filter((row) => {
      const matchesFilter = categoryFilter === "all"
        || (categoryFilter === "unadded/unexcluded"
          ? unaddedKeys.has(`${row.searchTerm.toLowerCase()}|${row.campaign}|${row.adGroup}`)
          : categoryFilter === "negative"
            ? row.reviewStatus === "approver_rejected"
          : categoryFilter === "special review needed"
            ? (!row.reviewDecision && row.reviewStatus !== "approver_rejected") || row.reviewDecision === "to_be_determined"
          : categoryFilter === "final review"
            ? row.reviewStatus === "ready_for_approval"
          : categoryFilter === "approved" || categoryFilter === "rejected" || categoryFilter === "to_be_determined"
            ? categoryFilter === "approved"
              ? row.reviewStatus === "approved_for_publishing"
              : categoryFilter === "rejected"
                ? row.reviewStatus === "approver_rejected"
                : row.reviewDecision === "to_be_determined"
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
    });
  }, [campaignFilter, categoryFilter, data, googleRecommendations]);

  const campaignOptions = useMemo(
    () => [...new Set((data?.results ?? []).map((row) => row.campaign))].sort(),
    [data],
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
      ] as Array<[string, string, number]>
    : [];

  const cacheKey = data
    ? `search-term-review:${role}:${workflowMode}:${data.account.customerId}:${data.account.lastAnalysisAt}`
    : null;

  useEffect(() => {
    if (!cacheKey) return;
    const cached = window.localStorage.getItem(cacheKey);
    if (!cached) return;
    try {
      const parsed = JSON.parse(cached) as {
        categoryFilter?: CategoryFilter;
        selectedIds?: string[];
        categoryPages?: Record<string, number>;
      };
      window.queueMicrotask(() => {
        if (parsed.categoryFilter) setCategoryFilter(parsed.categoryFilter);
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
      categoryFilter,
      selectedIds: [...selectedIds],
      categoryPages,
    }));
  }, [cacheKey, categoryFilter, categoryPages, selectedIds]);

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

  async function decideCategory(rows: OptimizationResult[], decision: ReviewDecision) {
    if (!canReview) return;
    const selected = rows.filter((row) => selectedIds.has(row.id));
    const targets = selected.length > 0 ? selected : rows;
    setDecisionError(null);
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
              reviewStatus: decision === "to_be_determined" ? "kiv" : "ready_for_approval",
            }
          : row),
      } : current);
      setSelectedIds(new Set());
    } catch (caught) {
      setDecisionError(caught instanceof Error ? caught.message : "Unable to save the review decision.");
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
      if (decision === "rejected") setDecisions((current) => ({ ...current, ...Object.fromEntries(targets.map((row) => [row.id, "to_be_determined" as const])) }));
      setData((current) => current ? {
        ...current,
        results: current.results.map((row) => targets.some((target) => target.id === row.id)
          ? {
              ...row,
              reviewStatus: decision === "accepted"
                ? row.reviewDecision === "rejected" ? "approver_rejected" : "approved_for_publishing"
                : "returned_for_clarification",
              reviewDecision: decision === "rejected" ? "to_be_determined" : row.reviewDecision,
              approverDecision: decision,
            }
          : row),
      } : current);
      setSelectedIds(new Set());
    } catch (caught) {
      setDecisionError(caught instanceof Error ? caught.message : "Unable to save the approver decision.");
    }
  }

  async function updateLeadQuality(row: OptimizationResult, values: LeadQualityValues) {
    if (!row.searchTermId || !canReview) return;
    setLeadQualitySaving(true); setDecisionError(null);
    try {
      const response = await fetch("/api/search-term-optimization/lead-quality", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchTermId: row.searchTermId, ...values }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to update lead quality.");
      setLeadQualityMessage(`Lead quality updated for ${row.searchTerm}.`);
      await load(data?.account.customerId);
    } catch (caught) { setDecisionError(caught instanceof Error ? caught.message : "Unable to update lead quality."); }
    finally { setLeadQualitySaving(false); }
  }

  async function importLeadQuality(file: File) {
    setLeadQualitySaving(true); setDecisionError(null); setLeadQualityMessage(null); setLeadImportErrors([]);
    try {
      const formData = new FormData(); formData.set("file", file);
      const response = await fetch("/api/search-term-optimization/lead-quality", { method: "POST", body: formData });
      const payload = await response.json() as { updated?: number; errors?: Array<{ row: number; message: string }>; error?: string };
      if (!response.ok && !payload.errors) throw new Error(payload.error ?? "Unable to import lead quality.");
      setLeadImportErrors(payload.errors ?? []);
      setLeadQualityMessage(`${payload.updated ?? 0} search terms updated${payload.errors?.length ? `; ${payload.errors.length} rows need attention` : ""}.`);
      await load(data?.account.customerId);
    } catch (caught) { setDecisionError(caught instanceof Error ? caught.message : "Unable to import lead quality."); }
    finally { setLeadQualitySaving(false); }
  }

  function downloadImportErrors() {
    const csv = ["row,message", ...leadImportErrors.map((error) => `${error.row},"${error.message.replaceAll('"', '""')}"`)].join("\n");
    downloadText(csv, "lead-quality-import-errors.csv", "text/csv");
  }

  function downloadLeadTemplate() {
    downloadText("customer_id,campaign,ad_group,search_term,qualified_leads,spam_leads,invalid_leads,client_complaints\n", "lead-quality-template.csv", "text/csv");
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
    <ReportShell
      title="Search Term Optimization"
      dateLabel="Automation to be implemented"
      headerDateControl={<AutomationUnavailableStatus />}
      activeQuery=""
      reportReady={!loading && !analysisLoading && !error}
    >
      <div className="space-y-5 text-neutral-950">
        <section className="relative rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
          {isAdmin ? <div className="mb-5">
            <label className="mb-2 block text-sm font-semibold text-neutral-800">Notion account search</label>
            <div className="flex max-w-3xl items-start gap-2">
              <div className="relative min-w-0 flex-1">
                <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
                <Input
                  value={accountQuery}
                  onChange={(event) => { setAccountQuery(event.target.value); setAccountPerformance(null); setAccountDropdownOpen(true); setHighlightedAccountIndex(-1); }}
                  onFocus={() => setAccountDropdownOpen(true)}
                  onBlur={() => setAccountDropdownOpen(false)}
                  onKeyDown={handleAccountKeyDown}
                  placeholder="Search company or Google Ads CID"
                  autoComplete="off"
                  aria-autocomplete="list"
                  className="pl-9"
                />
                {accountDropdownOpen && (visibleSuggestions.length > 0 || accountSearchState !== "idle") && (
                <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border bg-white text-neutral-900 shadow-xl">
                  {recentAccounts.length > 0 ? <p className="border-b bg-neutral-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Recent accounts</p> : null}
                  {accountSearchState === "loading" ? <p className="p-3 text-sm text-neutral-500">Searching accounts…</p> : null}
                  {accountSearchState === "error" ? <p className="p-3 text-sm text-red-700">{accountSearchError}</p> : null}
                  {accountSearchState === "success" && accountQuery.trim().length >= 2 && resultSuggestions.length === 0 ? <p className="p-3 text-sm text-neutral-500">No additional matching accounts.</p> : null}
                  {visibleSuggestions.map((account, index) => (
                    <button
                      key={`${account.adAccountId}-${account.accountName}`}
                      type="button"
                      role="option"
                      aria-selected={index === highlightedAccountIndex}
                      className={`block w-full cursor-pointer px-4 py-3 text-left text-sm transition ${index === highlightedAccountIndex ? "bg-red-50" : "hover:bg-red-50"}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setHighlightedAccountIndex(index)}
                      onClick={() => selectAccount(account)}
                    >
                      <span className="flex items-center justify-between gap-3"><span className="font-semibold">{account.accountName}</span><Badge variant="outline" className={optimizationTone(account.optimizationScore)}>{formatOptionalPercent(account.optimizationScore)} optimized</Badge></span>
                      <span className="text-neutral-500">{account.adAccountId}</span>
                      <AccountCampaignSummary campaigns={account.campaigns} />
                      {account.warning ? <span className="mt-1 block text-xs text-amber-700">Performance unavailable</span> : null}
                    </button>
                  ))}
                </div>
                )}
              </div>
              <Button
                type="button"
                className="cursor-pointer bg-red-600 text-white hover:bg-red-700"
                disabled={!accountPerformance || analysisLoading}
                onClick={() => void runSelectedAccountAnalysis()}
              >
                {analysisLoading ? <Spinner className="size-4" /> : <SearchIcon className="size-4" />}
                {analysisLoading ? "Analyzing..." : "Search"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-neutral-500">Select an account, then press Search to retrieve, analyze, and save its latest search terms.</p>
          </div> : null}

          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Badge className="bg-neutral-700 text-white">Manual review mode</Badge>
                <Badge variant="outline" className={canReview || canApprove ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-neutral-200 bg-neutral-100 text-neutral-700"}>
                  {AUTH_ROLE_LABELS[role]} · {canApprove ? "Approval access" : canReview ? "Review access" : "Read-only"}
                </Badge>
              </div>
              <h1 className="text-3xl font-semibold sm:text-5xl">
                {data?.account.customerName ?? "Search-Term Optimization"}
              </h1>
              {data ? (
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-neutral-600">
                  <span>CID {data.account.customerId}</span>
                  <span>{data.account.reportingPeriod.startDate}–{data.account.reportingPeriod.endDate}</span>
                  <span>Last analysis {formatDateTime(data.account.lastAnalysisAt)}</span>
                  <span>Next run {data.account.nextRunAt ? formatDateTime(data.account.nextRunAt) : "Not scheduled"}</span>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {!analysisLoading && error && !accountPerformance && error.includes("No completed search-term analysis output was found") ? (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-700 shadow-sm">
            <p className="font-semibold">No account selected for analysis</p>
            <p className="mt-1 text-sm text-neutral-500">Select an account above, then press Search to begin.</p>
          </section>
        ) : !analysisLoading && error ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
            <p className="font-semibold">Optimization dashboard unavailable</p>
            <p className="mt-1 text-sm">{error}</p>
          </section>
        ) : null}
        {loading || analysisLoading ? <LoadingDataIndicator label={analysisStage ?? "Loading analysis data..."} startedAt={analysisStartedAt} activityAt={analysisActivityAt} /> : null}

        {data ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {cards.map(([key, label, value]) => (
                <div
                  key={key}
                  className="flex min-h-[122px] flex-col rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm"
                >
                  <span className="min-h-10 text-xs font-semibold uppercase leading-5 tracking-wide text-neutral-500">{label}</span>
                  <span className="mt-auto block pt-2 text-3xl font-semibold leading-none tabular-nums">{value}</span>
                </div>
              ))}
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className={`grid gap-3 ${isAdmin ? "md:grid-cols-3" : "sm:grid-cols-2"}`}>
                {isAdmin ? <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Workflow</p><Select value={workflowMode} onValueChange={(value) => setWorkflowMode(value as WorkflowMode)}><SelectTrigger className="w-full cursor-pointer bg-white transition hover:bg-neutral-50"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="specialist">Specialist review</SelectItem><SelectItem value="approver">Approver queue</SelectItem></SelectContent></Select></div> : null}
                <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Campaign</p><Select value={campaignFilter} onValueChange={setCampaignFilter}><SelectTrigger className="w-full cursor-pointer bg-white transition hover:bg-neutral-50"><SelectValue placeholder="All campaigns" /></SelectTrigger><SelectContent><SelectItem value="all">All campaigns</SelectItem>{campaignOptions.map((campaign) => <SelectItem key={campaign} value={campaign}>{campaign}</SelectItem>)}</SelectContent></Select></div>
                <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Category</p><Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as CategoryFilter)}><SelectTrigger className="w-full cursor-pointer bg-white transition hover:bg-neutral-50"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="approved">Approved</SelectItem><SelectItem value="negative">Negative</SelectItem><SelectItem value="special review needed">Special review needed</SelectItem><SelectItem value="final review">Final review</SelectItem><SelectItem value="all">All tables</SelectItem></SelectContent></Select></div>
              </div>
              {canReview ? <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-800">
                  <FileUpIcon className="size-4" /> {leadQualitySaving ? "Importing..." : "Import lead-quality CSV"}
                  <input type="file" accept=".csv,text/csv" className="sr-only" disabled={leadQualitySaving} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importLeadQuality(file); event.currentTarget.value = ""; }} />
                </label>
                <Button type="button" variant="outline" className="cursor-pointer" onClick={downloadLeadTemplate}>Download CSV template</Button>
                {leadImportErrors.length ? <Button type="button" variant="outline" className="cursor-pointer" onClick={downloadImportErrors}>Download import errors</Button> : null}
                {leadQualityMessage ? <span className="text-sm text-neutral-600">{leadQualityMessage}</span> : null}
              </div> : null}
              {categoryFilter === "unadded/unexcluded" && recommendationsLoading ? <LoadingDataIndicator label="Loading current Google Ads status..." compact /> : null}
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
                  <div className="border-b bg-neutral-50 px-5 py-4">
                    <h2 className="text-lg font-semibold">{adGroup}</h2>
                    {rows[0]?.destinationUrl ? (
                      <a href={rows[0].destinationUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-sm text-red-700 hover:underline">
                        {rows[0].destinationUrl}<ExternalLinkIcon className="size-3.5 shrink-0" />
                      </a>
                    ) : null}
                    <GeneralAccountPerformance account={accountPerformance} />
                    <SafetyScoreLegend />
                  </div>
                  <div className="space-y-5 p-4">
                    {((["approved", "rejected", "to_be_determined", "awaiting_approval", "approved_for_publishing", "approver_rejected", "returned_for_clarification"] as CategoryFilter[]).includes(categoryFilter)
                      ? [[categoryFilter, rows] as [string, OptimizationResult[]]]
                      : groupRowsByAction(rows, workflowMode)).map(([action, actionRows]) => {
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
                        canReview={canReview && !["final review", "approved", "negative"].includes(action)}
                        canApprove={canApprove && action === "final review"}
                        approverView={finalReviewActive}
                        onLeadQualityUpdate={updateLeadQuality}
                        leadQualitySaving={leadQualitySaving}
                      />;
                    })}
                  </div>
                </div>
              ))}
              {grouped.length === 0 ? <p className="rounded-2xl bg-white p-6 text-center text-neutral-500">No results match the selected filter.</p> : null}
            </section>

            {finalReviewActive ? <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b bg-neutral-50 px-5 py-4"><h2 className="text-lg font-semibold">Approved change sets</h2><Badge variant="outline" className="bg-white">{data.changeSets.length} batches</Badge></div>
              {data.changeSets.length > 0 ? <div className="divide-y">{data.changeSets.map((changeSet) => <div key={changeSet.id} className="grid gap-2 px-5 py-4 text-sm sm:grid-cols-4"><span className="font-semibold">Change set #{changeSet.id}</span><span>{changeSet.itemCount} items</span><span>{humanize(changeSet.status)}</span><span className="text-neutral-500">{changeSet.approvedByEmail} · {formatDateTime(changeSet.approvedAt)}</span></div>)}</div> : <p className="px-5 py-6 text-sm text-neutral-500">No approved change sets yet.</p>}
            </section> : null}

            <section className="relative overflow-hidden rounded-2xl border border-white/30 bg-neutral-900/75 p-5 text-white shadow-xl backdrop-blur-md" aria-label="Automatic action history to be implemented">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 via-white/5 to-black/20" />
              <div className="relative flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/30 bg-amber-400/15 text-amber-200"><ConstructionIcon className="size-5" /></span>
                <div>
                  <h2 className="text-lg font-semibold">Automatic action history</h2>
                  <p className="text-sm text-white/65">Unavailable · To be implemented</p>
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </ReportShell>
  );
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

function SafetyScoreLegend() {
  return (
    <div className="mt-4 border-t border-neutral-200 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Score decision guide</p>
      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
        <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900"><span className="mt-1 size-2 shrink-0 rounded-full bg-emerald-600" /><span><strong>90–100</strong> · Approve exclusion</span></div>
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900"><span className="mt-1 size-2 shrink-0 rounded-full bg-amber-500" /><span><strong>60–89</strong> · Review manually</span></div>
        <div className="flex items-start gap-2 rounded-lg bg-neutral-200/70 px-3 py-2 text-neutral-700"><span className="mt-1 size-2 shrink-0 rounded-full bg-neutral-500" /><span><strong>0–59</strong> · Reject automatic exclusion</span></div>
      </div>
      <p className="mt-2 text-xs text-neutral-500">Only exclusion recommendations use this guide. A score of 90+ still requires every safety gate to pass.</p>
    </div>
  );
}

function LoadingDataIndicator({ label, compact = false, startedAt, activityAt }: { label: string; compact?: boolean; startedAt?: string | null; activityAt?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (compact || !startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [compact, startedAt]);
  const elapsedSeconds = startedAt ? Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1_000)) : null;
  const activitySeconds = activityAt ? Math.max(0, Math.floor((now - Date.parse(activityAt)) / 1_000)) : null;
  const heartbeatHealthy = activitySeconds === null || activitySeconds < 20;
  if (compact) {
    return (
      <div className="mt-3 flex items-center gap-3 text-sm font-medium text-neutral-600" role="status" aria-live="polite">
        <Spinner className="size-5 text-red-600" />
        <span>{label}</span>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm" role="status" aria-live="polite">
      <div className="flex items-center gap-4 px-5 py-4 sm:px-6">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-1 ring-red-100">
          <Spinner className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-neutral-900">Analyzing search terms</p>
          <p className="mt-0.5 truncate text-sm text-neutral-500">{label}</p>
        </div>
        <span className="hidden rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-500 sm:inline-flex">Please wait</span>
      </div>
      <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-3 sm:px-6">
        <div className="mb-2 flex items-center justify-between text-xs font-medium text-neutral-500">
          <span>{elapsedSeconds === null ? "Analysis in progress" : `Elapsed ${formatElapsedTime(elapsedSeconds)}`}</span>
          <span className={heartbeatHealthy ? "text-emerald-700" : "text-amber-700"}>
            {activitySeconds === null ? "Starting worker..." : heartbeatHealthy ? `Worker active · ${activitySeconds}s ago` : `No update for ${activitySeconds}s · checking...`}
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-neutral-200 ring-1 ring-inset ring-neutral-300/60">
          <div className="search-analysis-progress h-full w-1/3 rounded-full bg-gradient-to-r from-red-700 via-red-500 to-red-400 shadow-sm" />
        </div>
      </div>
    </div>
  );
}

function formatElapsedTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, "0")}s` : `${seconds}s`;
}

const RESULTS_PER_PAGE = 10;

function ActionGroupTable({
  action,
  rows,
  selectedIds,
  decisions,
  approverDecisions,
  page,
  onPageChange,
  onToggleRow,
  onToggleCategory,
  onDecision,
  onApproverDecision,
  canReview,
  canApprove,
  approverView,
  onLeadQualityUpdate,
  leadQualitySaving,
}: {
  action: string;
  rows: OptimizationResult[];
  selectedIds: Set<string>;
  decisions: Record<string, ReviewDecision>;
  approverDecisions: Record<string, ApproverDecision>;
  page: number;
  onPageChange: (page: number) => void;
  onToggleRow: (id: string, checked: boolean) => void;
  onToggleCategory: (rows: OptimizationResult[], checked: boolean) => void;
  onDecision: (rows: OptimizationResult[], decision: ReviewDecision) => void;
  onApproverDecision: (rows: OptimizationResult[], decision: ApproverDecision) => void;
  canReview: boolean;
  canApprove: boolean;
  approverView: boolean;
  onLeadQualityUpdate: (row: OptimizationResult, values: LeadQualityValues) => Promise<void>;
  leadQualitySaving: boolean;
}) {
  const pageCount = Math.max(1, Math.ceil(rows.length / RESULTS_PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * RESULTS_PER_PAGE, safePage * RESULTS_PER_PAGE);
  const selectedCount = rows.filter((row) => selectedIds.has(row.id)).length;
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  return (
    <TooltipProvider delayDuration={200}>
    <section className="overflow-hidden rounded-xl border border-neutral-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-neutral-100 px-4 py-3">
        <div className="flex items-center gap-3">
          {canReview || canApprove ? <Checkbox
            checked={allSelected}
            onCheckedChange={(checked) => onToggleCategory(rows, checked === true)}
            aria-label={`Select all ${humanize(action)} terms`}
            className="cursor-pointer"
          /> : null}
          <h3 className="font-semibold">{humanize(action)}</h3>
          <Badge variant="outline" className="bg-white">{rows.length} terms</Badge>
          {selectedCount > 0 ? <span className="text-xs font-medium text-neutral-500">{selectedCount} selected</span> : null}
        </div>
        {canReview && allSelected ? <div className="flex items-center gap-2">
          <DecisionButton label="Approve selected rows" decision="approved" size="category" onClick={() => onDecision(rows, "approved")} />
          <DecisionButton label="Mark selected rows as to be determined" decision="to_be_determined" size="category" onClick={() => onDecision(rows, "to_be_determined")} />
          <DecisionButton label="Reject selected rows" decision="rejected" size="category" onClick={() => onDecision(rows, "rejected")} />
        </div> : null}
        {canApprove && allSelected ? <div className="flex items-center gap-2">
          <ApproverDecisionButton label="Accept selected decisions" decision="accepted" onClick={() => onApproverDecision(rows, "accepted")} />
          <ApproverDecisionButton label="Reject selected decisions" decision="rejected" onClick={() => onApproverDecision(rows, "rejected")} />
        </div> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[620px] w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              {(canReview || canApprove ? ["", "Search term", "Clicks", "Spend", "Conv.", "Classification", "Score", "Decision"] : approverView ? ["Search term", "Clicks", "Spend", "Conv.", "Classification", "Score", "Decision"] : ["Search term", "Clicks", "Spend", "Conv.", "Classification", "Score"]).map((heading, index) => (
                <th key={`${heading}-${index}`} className={`px-4 py-3 font-semibold ${heading === "Search term" ? "text-left" : "text-center"}`}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {pageRows.map((row) => <ResultRow key={row.id} row={row} selected={selectedIds.has(row.id)} decision={decisions[row.id]} approverDecision={approverDecisions[row.id]} showRowActions={!allSelected} onToggle={onToggleRow} onDecision={onDecision} onApproverDecision={onApproverDecision} canReview={canReview} canApprove={canApprove} approverView={approverView} onLeadQualityUpdate={onLeadQualityUpdate} leadQualitySaving={leadQualitySaving} />)}
          </tbody>
        </table>
      </div>
      {pageCount > 1 ? (
        <div className="flex items-center justify-between border-t bg-neutral-50 px-4 py-3">
          <span className="text-sm text-neutral-500">Page {safePage} of {pageCount}</span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" className="cursor-pointer transition hover:bg-neutral-100 disabled:cursor-not-allowed" disabled={safePage === 1} onClick={() => onPageChange(Math.max(1, safePage - 1))}>
              <ChevronLeftIcon className="size-4" /> Previous
            </Button>
            <Button type="button" size="sm" variant="outline" className="cursor-pointer transition hover:bg-neutral-100 disabled:cursor-not-allowed" disabled={safePage === pageCount} onClick={() => onPageChange(Math.min(pageCount, safePage + 1))}>
              Next <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </section>
    </TooltipProvider>
  );
}

function groupRowsByAction(rows: OptimizationResult[], workflowMode: WorkflowMode) {
  const order = ["approved", "negative", "special review needed", "no action", "to be determined", "final review"];
  const groups = new Map<string, OptimizationResult[]>();
  for (const row of rows) {
    const category = row.reviewStatus === "approved_for_publishing" ? "approved"
      : row.reviewStatus === "approver_rejected" ? "negative"
      : row.reviewStatus === "ready_for_approval" || workflowMode === "approver" ? "final review"
      : row.reviewDecision === "to_be_determined" ? "to be determined"
      : normalizeAction(row.proposedAction) === "no action" ? "no action"
      : "special review needed";
    groups.set(category, [...(groups.get(category) ?? []), row]);
  }
  return [...groups.entries()].sort(([left], [right]) => {
    const leftIndex = order.indexOf(left);
    const rightIndex = order.indexOf(right);
    return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex);
  });
}

function ResultRow({ row, selected, decision, approverDecision, showRowActions, onToggle, onDecision, onApproverDecision, canReview, canApprove, approverView, onLeadQualityUpdate, leadQualitySaving }: { row: OptimizationResult; selected: boolean; decision?: ReviewDecision; approverDecision?: ApproverDecision; showRowActions: boolean; onToggle: (id: string, checked: boolean) => void; onDecision: (rows: OptimizationResult[], decision: ReviewDecision) => void; onApproverDecision: (rows: OptimizationResult[], decision: ApproverDecision) => void; canReview: boolean; canApprove: boolean; approverView: boolean; onLeadQualityUpdate: (row: OptimizationResult, values: LeadQualityValues) => Promise<void>; leadQualitySaving: boolean }) {
  const approvedState = row.reviewStatus === "approved_for_publishing" || (!approverView && decision === "approved");
  const negativeState = row.reviewStatus === "approver_rejected" || (!approverView && decision === "rejected");
  const returnedState = row.reviewStatus === "returned_for_clarification" || decision === "to_be_determined";
  return (
    <tr className={`align-middle ${approvedState ? "bg-emerald-100/80" : negativeState ? "bg-red-100/80" : returnedState ? "bg-amber-100/80" : "hover:bg-neutral-50/70"}`}>
      {canReview || canApprove ? <td className="px-4 py-4 text-center"><Checkbox checked={selected} onCheckedChange={(checked) => onToggle(row.id, checked === true)} aria-label={`Select ${row.searchTerm}`} className="cursor-pointer" /></td> : null}
      <td className="px-4 py-4 font-semibold">
        <span>{row.searchTerm}</span>
        <SearchTermContextDetails key={`${row.id}:${row.qualifiedLeads}:${row.spamLeads}:${row.invalidLeads}:${row.clientComplaints}`} row={row} editable={canReview} saving={leadQualitySaving} onSave={onLeadQualityUpdate} />
      </td>
      <td className="px-4 py-4 text-center tabular-nums">{row.clicks}</td>
      <td className="px-4 py-4 text-center tabular-nums">RM {row.spend.toFixed(2)}</td>
      <td className="px-4 py-4 text-center tabular-nums">{row.conversions.toFixed(2)}</td>
      <td className="px-4 py-4 text-center"><Badge variant="outline">{humanize(row.classification)}</Badge></td>
      <td className="px-4 py-4 text-center">
        <span className="flex items-center justify-center gap-1 font-semibold"><ScoreIcon row={row} /> {row.safetyScore}</span>
      </td>
      {canReview ? <td className="px-4 py-4 text-center">
        {showRowActions ? <div className="flex items-center justify-center gap-1">
          {decision !== "approved" ? <DecisionButton label="Approve" decision="approved" onClick={() => onDecision([row], "approved")} /> : null}
          {decision !== "to_be_determined" ? <DecisionButton label="To be determined" decision="to_be_determined" onClick={() => onDecision([row], "to_be_determined")} /> : null}
          {decision !== "rejected" ? <DecisionButton label="Reject" decision="rejected" onClick={() => onDecision([row], "rejected")} /> : null}
        </div> : <DecisionStatus decision={decision} />}
      </td> : null}
      {approverView ? <td className="px-4 py-4 text-center">
        {canApprove && row.reviewStatus === "ready_for_approval" ? <div className="flex flex-wrap items-center justify-center gap-2"><ProposalBadge decision={decision} />{showRowActions ? <div className="flex items-center gap-1"><ApproverDecisionButton label="Accept decision" decision="accepted" onClick={() => onApproverDecision([row], "accepted")} /><ApproverDecisionButton label="Reject decision" decision="rejected" onClick={() => onApproverDecision([row], "rejected")} /></div> : null}</div> : <ApproverDecisionStatus decision={approverDecision} status={row.reviewStatus} />}
      </td> : null}
    </tr>
  );
}

function SearchTermContextDetails({ row, editable, saving, onSave }: { row: OptimizationResult; editable: boolean; saving: boolean; onSave: (row: OptimizationResult, values: LeadQualityValues) => Promise<void> }) {
  const [values, setValues] = useState<LeadQualityValues>({ qualifiedLeads: row.qualifiedLeads, spamLeads: row.spamLeads, invalidLeads: row.invalidLeads, clientComplaints: row.clientComplaints });
  const field = (key: keyof LeadQualityValues, label: string) => <label className="block"><span className="text-[11px] font-semibold uppercase text-neutral-500">{label}</span><Input type="number" min={0} step={1} value={values[key] ?? ""} disabled={!editable || saving} placeholder="Not available" className="mt-1 h-8" onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value === "" ? null : Number(event.target.value) }))} /></label>;
  return <details className="group mt-2 min-w-72 text-xs font-normal text-neutral-500">
    <summary className="flex cursor-pointer list-none items-center gap-1.5 select-none font-medium text-neutral-600 hover:text-neutral-900">View explanation and lead context <ChevronDownIcon className="size-3.5 transition-transform group-open:rotate-180" /></summary>
    <div className="mt-2 space-y-3 rounded-lg border bg-white p-3 shadow-sm">
      <div><p className="text-[11px] font-semibold uppercase text-neutral-400">Recommendation explanation</p><p className="mt-1 leading-relaxed text-neutral-700">{row.explanation || "No explanation is available."}</p></div>
      <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
        <ContextValue label="Triggering keyword" value={row.triggeringKeyword} />
        <ContextValue label="Match type" value={row.matchType} />
        <ContextValue label="Google status" value={row.addedExcludedStatus} />
        <ContextValue label="Asset group" value={row.assetGroup} />
        <ContextValue label="First detected" value={row.firstDetectedAt ? formatDateTime(row.firstDetectedAt) : null} />
        <ContextValue label="Last reviewed" value={row.lastReviewedAt ? formatDateTime(row.lastReviewedAt) : null} />
        <ContextValue label="Previous decision" value={row.previousDecision ? humanize(row.previousDecision) : null} />
        <ContextValue label="Retrieved" value={formatDateTime(row.dataRetrievedAt)} />
      </dl>
      <div className="grid gap-2 sm:grid-cols-2">{field("qualifiedLeads", "Qualified leads")}{field("spamLeads", "Spam leads")}{field("invalidLeads", "Invalid leads")}{field("clientComplaints", "Client complaints")}</div>
      {editable ? <Button type="button" size="sm" disabled={saving} className="cursor-pointer bg-red-700 hover:bg-red-800" onClick={() => void onSave(row, values)}><SaveIcon className="size-4" /> Save lead quality</Button> : null}
    </div>
  </details>;
}

function ContextValue({ label, value }: { label: string; value: string | null }) {
  return <div><dt className="text-[11px] font-semibold uppercase text-neutral-400">{label}</dt><dd className="mt-0.5 text-neutral-700">{value?.trim() || "Not available"}</dd></div>;
}

function DecisionStatus({ decision }: { decision?: ReviewDecision }) {
  if (decision === "approved") return <span className="font-semibold text-emerald-700">Approved</span>;
  if (decision === "rejected") return <span className="font-semibold text-red-700">Rejected</span>;
  if (decision === "to_be_determined") return <span className="font-semibold text-amber-700">To be determined</span>;
  return <span className="text-neutral-400">Pending</span>;
}

function ApproverDecisionStatus({ decision, status }: { decision?: ApproverDecision; status?: string }) {
  if (status === "approved_for_publishing") return <span className="font-semibold text-emerald-700">Approved</span>;
  if (status === "approver_rejected") return <span className="font-semibold text-red-700">Negative</span>;
  if (decision === "rejected" || status === "returned_for_clarification") return <span className="font-semibold text-amber-700">Returned to first review</span>;
  return <span className="text-neutral-500">Awaiting final review</span>;
}

function ProposalBadge({ decision }: { decision?: ReviewDecision }) {
  const rejected = decision === "rejected";
  return <Badge variant="outline" className={rejected ? "border-red-200 bg-red-50 font-semibold text-red-700" : "border-emerald-200 bg-emerald-50 font-semibold text-emerald-700"}>Proposed: {rejected ? "Negative" : "Approve"}</Badge>;
}

function ApproverDecisionButton({ label, decision, onClick }: { label: string; decision: ApproverDecision; onClick: () => void }) {
  const approved = decision === "accepted";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={label}
          className={`size-8 cursor-pointer transition ${approved ? "bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/20" : "bg-red-600/10 text-red-700 hover:bg-red-600/20"}`}
          onClick={onClick}
        >
          {approved ? <CheckIcon className="size-4" /> : <XIcon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8} className="border border-white/15 bg-[#211114] px-3 py-2 text-sm font-medium text-white shadow-xl">{label}</TooltipContent>
    </Tooltip>
  );
}

function DecisionButton({ label, decision, size = "row", onClick }: { label: string; decision: ReviewDecision; size?: "row" | "category"; onClick: () => void }) {
  const approved = decision === "approved";
  const toBeDetermined = decision === "to_be_determined";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant={size === "category" ? "outline" : "ghost"}
          aria-label={label}
          className={`${size === "category" ? "size-9 border-transparent" : "size-8"} cursor-pointer transition ${approved ? "bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/20 hover:text-emerald-800" : toBeDetermined ? "bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 hover:text-amber-800" : "bg-red-600/10 text-red-700 hover:bg-red-600/20 hover:text-red-800"}`}
          onClick={onClick}
        >
          {approved ? <CheckIcon className="size-4" /> : toBeDetermined ? <CircleHelpIcon className="size-4" /> : <XIcon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8} className="border border-white/15 bg-[#211114] px-3 py-2 text-sm font-medium text-white shadow-xl">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function ScoreIcon({ row }: { row: OptimizationResult }) {
  return row.safetyBand === "auto-safe" ? <CheckCircle2Icon className="size-4 text-emerald-600" /> : <ShieldAlertIcon className="size-4 text-amber-600" />;
}

function normalizeAction(value: string): CategoryFilter {
  const normalized = value.trim().toLowerCase();
  if (normalized === "special review") return "special review needed";
  if (["all", "special review needed", "negative exact", "add exact", "negative phrase", "no action"].includes(normalized)) return normalized as CategoryFilter;
  return "all";
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function downloadText(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
}

function formatOptionalPercent(value: number | null) { return value === null ? "N/A" : `${value.toFixed(1)}%`; }
function isAccountSuggestion(value: unknown): value is AccountSuggestion {
  if (!value || typeof value !== "object") return false;
  const account = value as Partial<AccountSuggestion>;
  return typeof account.accountName === "string"
    && typeof account.adAccountId === "string"
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
function AccountCampaignSummary({ campaigns }: { campaigns: AccountSuggestion["campaigns"] }) {
  if (campaigns.length === 0) return <span className="mt-2 block text-xs text-neutral-400">Campaign performance unavailable</span>;
  const totals = campaignTotals(campaigns);
  return <span className="mt-2 flex items-center justify-between gap-3 text-xs text-neutral-500"><span>All campaigns combined</span><span className="shrink-0 font-medium text-neutral-700">{totals.conversions.toFixed(2)} conversions · {totals.conversionRate.toFixed(2)}% CVR</span></span>;
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
