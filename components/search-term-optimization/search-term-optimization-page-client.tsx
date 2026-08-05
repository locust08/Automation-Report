"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  CheckCircle2Icon,
  ConstructionIcon,
  ExternalLinkIcon,
  SearchIcon,
  ShieldAlertIcon,
  CircleHelpIcon,
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

type CategoryFilter =
  | "all"
  | "special review needed"
  | "negative exact"
  | "add exact"
  | "negative phrase"
  | "no action"
  | "approved"
  | "rejected"
  | "to_be_determined"
  | "unadded/unexcluded";

type ReviewDecision = "approved" | "rejected" | "to_be_determined";

type AccountSuggestion = {
  accountName: string;
  adAccountId: string;
};

const REVIEW_ROLES: AuthRole[] = ["pms", "specialist", "approver", "admin"];

export function SearchTermOptimizationPageClient({ role }: { role: AuthRole }) {
  const isAdmin = role === "admin";
  const canReview = REVIEW_ROLES.includes(role);
  const [data, setData] = useState<OptimizationDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("special review needed");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>({});
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [categoryPages, setCategoryPages] = useState<Record<string, number>>({});
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [accountQuery, setAccountQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AccountSuggestion[]>([]);
  const [searchingAccounts, setSearchingAccounts] = useState(false);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsLoaded, setRecommendationsLoaded] = useState(false);
  const [googleRecommendations, setGoogleRecommendations] = useState<GoogleKeywordRecommendation[]>([]);
  const [googleRecommendationsWarning, setGoogleRecommendationsWarning] = useState<string | null>(null);

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
    const trimmed = accountQuery.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchingAccounts(true);
      try {
        const response = await fetch(`/api/notion/accounts/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const payload = (await response.json()) as { accounts?: AccountSuggestion[] };
        setSuggestions(response.ok ? payload.accounts ?? [] : []);
      } finally {
        setSearchingAccounts(false);
      }
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [accountQuery]);

  const visibleResults = useMemo(() => {
    const unaddedKeys = new Set(googleRecommendations.map((row) => `${row.searchTerm.toLowerCase()}|${row.campaign}|${row.adGroup}`));
    return (data?.results ?? []).filter((row) => {
      const matchesFilter = categoryFilter === "all"
        || (categoryFilter === "unadded/unexcluded"
          ? unaddedKeys.has(`${row.searchTerm.toLowerCase()}|${row.campaign}|${row.adGroup}`)
          : categoryFilter === "approved" || categoryFilter === "rejected" || categoryFilter === "to_be_determined"
            ? row.reviewDecision === categoryFilter
            : normalizeAction(row.proposedAction) === categoryFilter);
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
    ? `search-term-review:${role}:${data.account.customerId}:${data.account.lastAnalysisAt}`
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
      setSelectedIds((current) => {
        const next = new Set(current);
        targets.forEach((row) => next.delete(row.id));
        return next;
      });
    } catch (caught) {
      setDecisionError(caught instanceof Error ? caught.message : "Unable to save the review decision.");
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
    <ReportShell
      title="Search Term Optimization"
      dateLabel="Automation to be implemented"
      headerDateControl={<AutomationUnavailableStatus />}
      activeQuery=""
      reportReady={!loading && !error}
    >
      <div className="space-y-5 text-neutral-950">
        <section className="relative rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
          {isAdmin ? <div className="mb-5">
            <label className="mb-2 block text-sm font-semibold text-neutral-800">Notion account search</label>
            <div className="relative max-w-2xl">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                value={accountQuery}
                onChange={(event) => setAccountQuery(event.target.value)}
                placeholder="Search company or Google Ads CID"
                className="pl-9"
              />
              {(suggestions.length > 0 || searchingAccounts) && (
                <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border bg-white text-neutral-900 shadow-xl">
                  {searchingAccounts ? <p className="p-3 text-sm text-neutral-500">Searching…</p> : null}
                  {suggestions.map((account) => (
                    <button
                      key={`${account.adAccountId}-${account.accountName}`}
                      type="button"
                      className="block w-full cursor-pointer px-4 py-3 text-left text-sm transition hover:bg-red-50"
                      onClick={() => {
                        setAccountQuery(`${account.accountName} | ${account.adAccountId}`);
                        setSuggestions([]);
                        void load(account.adAccountId);
                      }}
                    >
                      <span className="font-semibold">{account.accountName}</span>
                      <span className="ml-2 text-neutral-500">{account.adAccountId}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div> : null}

          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Badge className="bg-neutral-700 text-white">Manual review mode</Badge>
                <Badge variant="outline" className={canReview ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-neutral-200 bg-neutral-100 text-neutral-700"}>
                  {AUTH_ROLE_LABELS[role]} · {canReview ? "Review access" : "Read-only"}
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

        {error ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
            <p className="font-semibold">Optimization dashboard unavailable</p>
            <p className="mt-1 text-sm">{error}</p>
          </section>
        ) : null}
        {loading ? <LoadingDataIndicator label="Loading analysis data..." /> : null}

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
              <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
                <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Campaign</p><Select value={campaignFilter} onValueChange={setCampaignFilter}><SelectTrigger className="w-full cursor-pointer bg-white transition hover:bg-neutral-50"><SelectValue placeholder="All campaigns" /></SelectTrigger><SelectContent><SelectItem value="all">All campaigns</SelectItem>{campaignOptions.map((campaign) => <SelectItem key={campaign} value={campaign}>{campaign}</SelectItem>)}</SelectContent></Select></div>
                <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Category</p><Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as CategoryFilter)}><SelectTrigger className="w-full cursor-pointer bg-white transition hover:bg-neutral-50"><SelectValue placeholder="Special review needed" /></SelectTrigger><SelectContent><SelectItem value="special review needed">Special review needed</SelectItem><SelectItem value="negative exact">Negative exact</SelectItem><SelectItem value="add exact">Add exact</SelectItem><SelectItem value="negative phrase">Negative phrase</SelectItem><SelectItem value="no action">No action</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="rejected">Rejected</SelectItem><SelectItem value="to_be_determined">To be determined</SelectItem>{isAdmin ? <SelectItem value="unadded/unexcluded">Unadded/Unexcluded</SelectItem> : null}<SelectItem value="all">All categories</SelectItem></SelectContent></Select></div>
              </div>
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
                    <SafetyScoreLegend />
                  </div>
                  <div className="space-y-5 p-4">
                    {(categoryFilter === "approved" || categoryFilter === "rejected" || categoryFilter === "to_be_determined"
                      ? [[categoryFilter, rows] as [string, OptimizationResult[]]]
                      : groupRowsByAction(rows)).map(([action, actionRows]) => {
                      const categoryId = `${adGroup}:${action}`;
                      return <ActionGroupTable
                        key={`${action}-${campaignFilter}-${categoryFilter}`}
                        action={action}
                        rows={actionRows}
                        selectedIds={selectedIds}
                        decisions={decisions}
                        page={categoryPages[categoryId] ?? 1}
                        onPageChange={(page) => setCategoryPages((current) => ({ ...current, [categoryId]: page }))}
                        onToggleRow={toggleRow}
                        onToggleCategory={toggleCategory}
                        onDecision={decideCategory}
                        canReview={canReview && action !== "no action"}
                      />;
                    })}
                  </div>
                </div>
              ))}
              {grouped.length === 0 ? <p className="rounded-2xl bg-white p-6 text-center text-neutral-500">No results match the selected filter.</p> : null}
            </section>

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

function LoadingDataIndicator({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div className={`${compact ? "mt-3" : "rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"} flex items-center gap-3 text-sm font-medium text-neutral-600`} role="status" aria-live="polite">
      <span className="flex size-9 items-center justify-center rounded-lg bg-neutral-100 text-red-700">
        <Spinner className="size-5" />
      </span>
      <span>{label}</span>
    </div>
  );
}

const RESULTS_PER_PAGE = 10;

function ActionGroupTable({
  action,
  rows,
  selectedIds,
  decisions,
  page,
  onPageChange,
  onToggleRow,
  onToggleCategory,
  onDecision,
  canReview,
}: {
  action: string;
  rows: OptimizationResult[];
  selectedIds: Set<string>;
  decisions: Record<string, ReviewDecision>;
  page: number;
  onPageChange: (page: number) => void;
  onToggleRow: (id: string, checked: boolean) => void;
  onToggleCategory: (rows: OptimizationResult[], checked: boolean) => void;
  onDecision: (rows: OptimizationResult[], decision: ReviewDecision) => void;
  canReview: boolean;
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
          {canReview ? <Checkbox
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
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[620px] w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              {(canReview ? ["", "Search term", "Clicks", "Spend", "Conv.", "Classification", "Score", "Decision"] : ["Search term", "Clicks", "Spend", "Conv.", "Classification", "Score"]).map((heading, index) => (
                <th key={`${heading}-${index}`} className="px-4 py-3 font-semibold">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {pageRows.map((row) => <ResultRow key={row.id} row={row} selected={selectedIds.has(row.id)} decision={decisions[row.id]} showRowActions={!allSelected} onToggle={onToggleRow} onDecision={onDecision} canReview={canReview} />)}
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

function groupRowsByAction(rows: OptimizationResult[]) {
  const order = ["special review needed", "negative exact", "add exact", "negative phrase", "no action"];
  const groups = new Map<string, OptimizationResult[]>();
  for (const row of rows) groups.set(row.proposedAction, [...(groups.get(row.proposedAction) ?? []), row]);
  return [...groups.entries()].sort(([left], [right]) => {
    const leftIndex = order.indexOf(left);
    const rightIndex = order.indexOf(right);
    return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex);
  });
}

function ResultRow({ row, selected, decision, showRowActions, onToggle, onDecision, canReview }: { row: OptimizationResult; selected: boolean; decision?: ReviewDecision; showRowActions: boolean; onToggle: (id: string, checked: boolean) => void; onDecision: (rows: OptimizationResult[], decision: ReviewDecision) => void; canReview: boolean }) {
  return (
    <tr className={`align-top ${decision === "approved" ? "bg-emerald-100/80" : decision === "rejected" ? "bg-red-100/80" : decision === "to_be_determined" ? "bg-amber-100/80" : "hover:bg-neutral-50/70"}`}>
      {canReview ? <td className="px-4 py-4"><Checkbox checked={selected} onCheckedChange={(checked) => onToggle(row.id, checked === true)} aria-label={`Select ${row.searchTerm}`} className="cursor-pointer" /></td> : null}
      <td className="px-4 py-4 font-semibold">{row.searchTerm}</td>
      <td className="px-4 py-4 tabular-nums">{row.clicks}</td>
      <td className="px-4 py-4 tabular-nums">RM {row.spend.toFixed(2)}</td>
      <td className="px-4 py-4 tabular-nums">{row.conversions.toFixed(2)}</td>
      <td className="px-4 py-4"><Badge variant="outline">{humanize(row.classification)}</Badge></td>
      <td className="px-4 py-4">
        <span className="flex items-center gap-1 font-semibold"><ScoreIcon row={row} /> {row.safetyScore}</span>
      </td>
      {canReview ? <td className="px-4 py-4">
        {showRowActions ? <div className="flex flex-wrap items-center gap-1"><DecisionButton label="Approve" decision="approved" onClick={() => onDecision([row], "approved")} /><DecisionButton label="To be determined" decision="to_be_determined" onClick={() => onDecision([row], "to_be_determined")} /><DecisionButton label="Reject" decision="rejected" onClick={() => onDecision([row], "rejected")} /></div> : <DecisionStatus decision={decision} />}
      </td> : null}
    </tr>
  );
}

function DecisionStatus({ decision }: { decision?: ReviewDecision }) {
  if (decision === "approved") return <span className="font-semibold text-emerald-700">Approved</span>;
  if (decision === "rejected") return <span className="font-semibold text-red-700">Rejected</span>;
  if (decision === "to_be_determined") return <span className="font-semibold text-amber-700">To be determined</span>;
  return <span className="text-neutral-400">Pending</span>;
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
