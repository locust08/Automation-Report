"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckIcon,
  CircleHelpIcon,
  ExternalLinkIcon,
  SearchIcon,
  ShieldXIcon,
  XIcon,
} from "lucide-react";
import { ReportShell } from "@/components/reporting/report-shell";
import { AccountEscalationNotice } from "@/components/team-lead-monitoring/account-escalation-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { AuthRole } from "@/lib/auth/roles";
import type {
  PlacementApproverDecision,
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
  optimizationScore: number | null;
  campaigns: Array<{
    id: string;
    name: string;
    optimizationScore: number | null;
    clicks: number;
    conversions: number;
    conversionRate: number;
  }>;
  warning?: string;
};
type AccountSearchState = "idle" | "loading" | "success" | "error";
const ACCOUNT_SEARCH_CACHE_KEY =
  "search-term-optimization-account-search-cache";
const RECENT_ACCOUNTS_KEY = "placement-optimization-recent-accounts";
const ACCOUNT_SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;
const ACCOUNT_SEARCH_DEBOUNCE_MS = 300;

export function PlacementOptimizationPageClient({ role }: { role: AuthRole }) {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<PlacementWorkflowMode>(modeForRole(role));
  const [data, setData] = useState<PlacementDashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState("");
  const [selectedAccount, setSelectedAccount] =
    useState<AccountSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<AccountSuggestion[]>([]);
  const [recentAccounts, setRecentAccounts] = useState<AccountSuggestion[]>([]);
  const [searchState, setSearchState] = useState<AccountSearchState>("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRequestId = useRef(0);
  const skipNextSearch = useRef(false);
  const [type, setType] = useState(searchParams.get("type") || "all");
  const [category, setCategory] = useState("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const load = useCallback(async (accountId?: string, refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (accountId) params.set("accountId", accountId);
      if (refresh) params.set("refresh", "1");
      const response = await fetch(`/api/placement-optimization?${params}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as PlacementDashboardPayload & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || "Unable to load placements.");
      setData(payload);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load placements.",
      );
    } finally {
      setLoading(false);
    }
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
          `/api/search-term-optimization/account-search?q=${encodeURIComponent(query)}`,
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
  useEffect(() => {
    setCategory(
      mode === "optimizer"
        ? "pending"
        : mode === "approver"
          ? "awaiting"
          : "all",
    );
    setSelected(new Set());
  }, [mode]);
  const visibleSuggestions = useMemo(
    () => [
      ...recentAccounts,
      ...suggestions.filter(
        (result) =>
          !recentAccounts.some(
            (recent) => recent.adAccountId === result.adAccountId,
          ),
      ),
    ],
    [recentAccounts, suggestions],
  );
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
    void load(selectedAccount.adAccountId, true);
  }
  const rows = useMemo(
    () =>
      data?.rows.filter((row) => {
        const typeMatch = type === "all" || row.placementType === type;
        const statusMatch =
          category === "all" ||
          (category === "pending" &&
            row.reviewStatus === "pending_optimizer") ||
          (category === "awaiting" &&
            row.reviewStatus === "ready_for_approval") ||
          (category === "kept" && row.reviewStatus === "kept") ||
          (category === "kiv" && row.reviewStatus === "kiv") ||
          (category === "approved" &&
            row.reviewStatus === "ready_for_publishing") ||
          (category === "rejected" &&
            row.reviewStatus === "approver_rejected") ||
          (category === "returned" &&
            row.reviewStatus === "returned_for_clarification");
        return typeMatch && statusMatch;
      }) ?? [],
    [data, type, category],
  );
  const canOptimizer =
    (role === "co" || role === "admin") && mode === "optimizer";
  const canApprover =
    (role === "approver" || role === "admin") && mode === "approver";
  const types = [
    ...new Set((data?.rows ?? []).map((row) => row.placementType)),
  ].sort();
  async function decide(
    endpoint: string,
    decision: PlacementDecision | PlacementApproverDecision,
    ids: string[],
  ) {
    setError(null);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recommendationIds: ids, decision }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(result.error || "Unable to save decision.");
      return;
    }
    setSelected(new Set());
    await load(data?.account.customerId);
  }
  const allSelected =
    rows.length > 0 && rows.every((row) => selected.has(row.id));
  const toggleAll = (checked: boolean) =>
    setSelected(checked ? new Set(rows.map((row) => row.id)) : new Set());
  return (
    <ReportShell
      title="Placement Optimization"
      dateLabel="Campaign Optimizer"
      reportReady={!loading}
    >
      <div className="space-y-5 text-neutral-950">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <p className="mb-2 text-sm font-semibold">Notion account search</p>
          <div className="flex max-w-3xl gap-2">
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                value={account}
                onChange={(event) => {
                  setAccount(event.target.value);
                  setDropdownOpen(true);
                }}
                onFocus={() => setDropdownOpen(true)}
                placeholder="Search company or Google Ads CID"
                className="pl-9"
              />
              {dropdownOpen && (visibleSuggestions.length > 0 || searchState !== "idle") ? (
                <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border bg-white p-1 shadow-xl">
                  {searchState === "loading" ? <p className="p-3 text-sm text-neutral-500">Searching accounts…</p> : null}
                  {searchState === "error" ? <p className="p-3 text-sm text-red-700">{searchError}</p> : null}
                  {searchState === "success" && visibleSuggestions.length === 0 ? <p className="p-3 text-sm text-neutral-500">No matching accounts.</p> : null}
                  {visibleSuggestions.map((result) => (
                    <button key={result.adAccountId} type="button" className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left hover:bg-red-50" onClick={() => chooseAccount(result)}>
                      <span className="flex items-center justify-between gap-3"><strong className="text-sm">{result.accountName}</strong>{result.optimizationScore !== null ? <Badge variant="outline">{result.optimizationScore.toFixed(1)}% optimized</Badge> : null}</span>
                      <span className="mt-1 block text-xs text-neutral-500">{result.adAccountId}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <Button
              disabled={!selectedAccount || loading}
              className="cursor-pointer bg-red-600 hover:bg-red-700"
              onClick={runAnalysis}
            >
              {loading ? <Spinner className="size-4" /> : <SearchIcon className="size-4" />}
              {loading ? "Analyzing…" : "Search"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-neutral-500">Select an account, then press Search to retrieve and cache its latest placements.</p>
          {data ? (
            <>
              <div className="mt-5 flex flex-wrap gap-2">
                <Badge>Read-only Google Ads</Badge>
                <Badge variant="outline">SQLite workflow</Badge>
              </div>
              <h2 className="mt-2 text-4xl font-semibold">
                {data.account.customerName}
              </h2>
              <p className="mt-2 text-neutral-500">
                CID {data.account.customerId} · {data.account.startDate}–
                {data.account.endDate} · Refreshed{" "}
                {formatDate(data.account.refreshedAt)}
              </p>
            </>
          ) : null}
        </section>
        <AccountEscalationNotice module="placement" accountId={data?.account.customerId} />
        {data ? (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Total placements", data.summary.total],
              ["Needs CO review", data.summary.needsReview],
              ["Awaiting approval", data.summary.awaitingApproval],
              ["Approved", data.summary.approved],
              ["Kept", data.summary.kept],
              ["KIV", data.summary.kiv],
              ["Rejected", data.summary.rejected],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="flex min-h-28 flex-col rounded-2xl border bg-white p-4 shadow-sm"
              >
                <span className="text-xs font-semibold uppercase text-neutral-500">
                  {label}
                </span>
                <strong className="mt-auto text-3xl">{value}</strong>
              </div>
            ))}
          </section>
        ) : null}
        {data ? (
          <section
            className={`grid gap-3 rounded-2xl border bg-white p-5 shadow-sm ${role === "admin" ? "md:grid-cols-3" : "md:grid-cols-2"}`}
          >
            {role === "admin" ? (
              <Filter label="Workflow">
                <Select
                  value={mode}
                  onValueChange={(value) =>
                    setMode(value as PlacementWorkflowMode)
                  }
                >
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="optimizer">
                      Campaign Optimizer
                    </SelectItem>
                    <SelectItem value="approver">Approver queue</SelectItem>
                    <SelectItem value="pm">PM reports</SelectItem>
                  </SelectContent>
                </Select>
              </Filter>
            ) : null}
            <Filter label="Placement type">
              <Select value={type} onValueChange={setType}>
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
            <Filter label="Category">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {mode === "optimizer" ? (
                    <>
                      <SelectItem value="pending">Needs review</SelectItem>
                      <SelectItem value="awaiting">
                        Sent for approval
                      </SelectItem>
                      <SelectItem value="kept">Kept</SelectItem>
                      <SelectItem value="kiv">KIV</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="awaiting">
                        Awaiting approval
                      </SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="returned">Returned</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </Filter>
          </section>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
          >
            {error}
          </p>
        ) : null}
        {data?.warnings.map((warning) => (
          <p
            key={warning}
            className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
          >
            {warning}
          </p>
        ))}
        {loading ? (
          <PlacementAnalysisLoader />
        ) : mode === "pm" ? (
          <PmReports data={data} />
        ) : data ? (
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
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
                    label="KIV"
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
              <table className="min-w-[1050px] w-full text-left text-sm">
                <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
                  <tr>
                    {[
                      "",
                      "Placement",
                      "Type",
                      "Campaign / ad group",
                      "Clicks",
                      "Spend",
                      "Conv.",
                      "Classification",
                      "Confidence",
                      "Decision",
                    ].map((heading, index) => (
                      <th key={`${heading}-${index}`} className="px-4 py-3">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
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
                      optimizer={canOptimizer}
                      approver={canApprover}
                      decide={decide}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 ? (
              <p className="p-8 text-center text-neutral-500">
                No placements match this queue.
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </ReportShell>
  );
}

function PlacementAnalysisLoader() {
  return (
    <section role="status" className="overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm">
      <div className="flex items-center gap-3 p-5">
        <span className="flex size-10 items-center justify-center rounded-xl bg-red-50 text-red-700"><Spinner className="size-5" /></span>
        <div><p className="font-semibold">Analyzing placements</p><p className="text-sm text-neutral-500">Retrieving Google Ads placements, applying rules, and saving the cached analysis.</p></div>
      </div>
      <div className="border-t bg-neutral-50 px-5 py-3">
        <div className="mb-2 flex justify-between text-xs text-neutral-500"><span>Analysis in progress</span><span>Processing</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-neutral-200"><div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-red-700 to-red-400" /></div>
      </div>
    </section>
  );
}

function isAccountSuggestion(value: unknown): value is AccountSuggestion {
  if (!value || typeof value !== "object") return false;
  const account = value as Partial<AccountSuggestion>;
  return typeof account.accountName === "string" && typeof account.adAccountId === "string" && Array.isArray(account.campaigns);
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
  optimizer,
  approver,
  decide,
}: {
  row: PlacementOptimizationRow;
  checked: boolean;
  onCheck: (value: boolean) => void;
  optimizer: boolean;
  approver: boolean;
  decide: (
    endpoint: string,
    decision: PlacementDecision | PlacementApproverDecision,
    ids: string[],
  ) => Promise<void>;
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
        <details className="mt-2 text-xs text-neutral-500">
          <summary className="cursor-pointer">Reason and history</summary>
          <p className="mt-1">{row.reason}</p>
          {row.reviewHistory.map((event) => (
            <p key={event.id}>
              {humanize(event.action)} · {event.reviewerEmail} ·{" "}
              {formatDate(event.createdAt)}
            </p>
          ))}
        </details>
      </td>
      <td className="px-4 py-4">
        <Badge variant="outline">{humanize(row.placementType)}</Badge>
      </td>
      <td className="px-4 py-4">
        <p>{row.campaignName}</p>
        <p className="text-xs text-neutral-500">{row.adGroupName}</p>
      </td>
      <td className="px-4 py-4">{row.clicks}</td>
      <td className="px-4 py-4">RM {row.spend.toFixed(2)}</td>
      <td className="px-4 py-4">{row.conversions.toFixed(2)}</td>
      <td className="px-4 py-4">
        <p>{row.classification}</p>
        <p className="text-xs text-neutral-500">{humanize(row.aiStatus)}</p>
      </td>
      <td className="px-4 py-4 font-semibold">{row.confidence}%</td>
      <td className="px-4 py-4">
        <div className="flex gap-1">
          {optimizer ? (
            <>
              <IconButton
                label="Exclude"
                onClick={() =>
                  void decide(
                    "/api/placement-optimization/decisions",
                    "exclude",
                    [row.id],
                  )
                }
              >
                <ShieldXIcon className="size-4" />
              </IconButton>
              <IconButton
                label="Keep"
                onClick={() =>
                  void decide("/api/placement-optimization/decisions", "keep", [
                    row.id,
                  ])
                }
              >
                <CheckIcon className="size-4" />
              </IconButton>
              <IconButton
                label="KIV"
                onClick={() =>
                  void decide("/api/placement-optimization/decisions", "kiv", [
                    row.id,
                  ])
                }
              >
                <CircleHelpIcon className="size-4" />
              </IconButton>
            </>
          ) : null}
          {approver && row.reviewStatus === "ready_for_approval" ? (
            <>
              <IconButton
                label="Approve"
                onClick={() =>
                  void decide(
                    "/api/placement-optimization/approvals",
                    "approved",
                    [row.id],
                  )
                }
              >
                <CheckIcon className="size-4" />
              </IconButton>
              <IconButton
                label="Return"
                onClick={() =>
                  void decide(
                    "/api/placement-optimization/approvals",
                    "returned",
                    [row.id],
                  )
                }
              >
                <CircleHelpIcon className="size-4" />
              </IconButton>
              <IconButton
                label="Reject"
                onClick={() =>
                  void decide(
                    "/api/placement-optimization/approvals",
                    "rejected",
                    [row.id],
                  )
                }
              >
                <XIcon className="size-4" />
              </IconButton>
            </>
          ) : null}
          {!optimizer && !approver ? (
            <span>{humanize(row.reviewStatus)}</span>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
function PmReports({ data }: { data: PlacementDashboardPayload | null }) {
  return (
    <section className="space-y-4">
      {(data?.reports ?? []).map((report) => (
        <article
          key={report.id}
          className="overflow-hidden rounded-2xl border bg-white shadow-sm"
        >
          <header className="border-b bg-neutral-50 p-5">
            <h3 className="font-semibold">
              PM optimization report #{report.id}
            </h3>
            <p className="text-sm text-neutral-500">
              {report.accountName} · {report.itemCount} exclusions ·{" "}
              {formatDate(report.generatedAt)}
            </p>
          </header>
          <div className="divide-y">
            {report.items.map((item, index) => (
              <div
                key={`${item.placement}-${index}`}
                className="grid gap-2 p-4 text-sm md:grid-cols-4"
              >
                <strong>{item.displayName}</strong>
                <span>{humanize(item.placementType)}</span>
                <span>
                  {item.campaignName} / {item.adGroupName}
                </span>
                <span>{item.reason}</span>
              </div>
            ))}
          </div>
        </article>
      ))}
      {!data?.reports.length ? (
        <p className="rounded-2xl border bg-white p-8 text-center text-neutral-500">
          No approved placement reports yet.
        </p>
      ) : null}
    </section>
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
  onClick,
}: {
  label: string;
  tone: "red" | "green" | "amber";
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
      className={`cursor-pointer text-white ${style}`}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      title={label}
      aria-label={label}
      className="size-8 cursor-pointer hover:bg-neutral-100"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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
