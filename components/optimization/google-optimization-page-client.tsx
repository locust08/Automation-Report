"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { GoogleAccountSearchField } from "@/components/optimization/google-account-search-field";
import { DailyCapacityCounterGrid } from "@/components/optimization/daily-capacity-counter-grid";
import { useGoogleOptimizationCapacity } from "@/components/optimization/use-google-optimization-capacity";
import { PlacementOptimizationPageClient } from "@/components/placement-optimization/placement-optimization-page-client";
import { ReportShell } from "@/components/reporting/report-shell";
import { SearchTermOptimizationPageClient } from "@/components/search-term-optimization/search-term-optimization-page-client";
import { Button } from "@/components/ui/button";
import type { AuthRole } from "@/lib/auth/roles";
import { resolveGoogleAccountName } from "@/lib/search-term-optimization/job-summary";

type OptimizationTab = "search-terms" | "placements";
type Account = {
  accountName: string;
  adAccountId: string;
  accessPath?: string | null;
};
type SearchState = "idle" | "loading" | "success" | "error";

const RECENT_ACCOUNTS_KEY = "google-optimization-recent-accounts";
const ACCOUNT_SUMMARY_HOST_ID = "google-optimization-account-summary";

export function GoogleOptimizationPageClient({ role }: { role: AuthRole }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<OptimizationTab>(() => searchParams.get("tab") === "placements" ? "placements" : "search-terms");
  const initialAccountId = searchParams.get("googleAccountId") || searchParams.get("accountId") || "";
  const [query, setQuery] = useState(initialAccountId);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [results, setResults] = useState<Account[]>([]);
  const [recentAccounts, setRecentAccounts] = useState<Account[]>([]);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const requestId = useRef(0);
  const {capacity:dailyCapacity,refresh:refreshDailyCapacity}=useGoogleOptimizationCapacity(`${initialAccountId}:${tab}`);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(RECENT_ACCOUNTS_KEY) ?? "[]") as unknown;
      if (Array.isArray(stored)) setRecentAccounts(stored.filter(isAccount).slice(0, 5));
    } catch {
      window.localStorage.removeItem(RECENT_ACCOUNTS_KEY);
    }
  }, []);

  useEffect(() => {
    if (!initialAccountId) {
      setSelectedAccount(null);
      return;
    }
    if (selectedAccount && normalizeId(selectedAccount.adAccountId) === normalizeId(initialAccountId)) {
      const recent = recentAccounts.find((item) => normalizeId(item.adAccountId) === normalizeId(initialAccountId));
      const accountName = resolveGoogleAccountName({ directoryName: selectedAccount.accountName, recentName: recent?.accountName, accountId: initialAccountId });
      if (accountName !== selectedAccount.accountName) setSelectedAccount((current) => current ? { ...current, accountName, accessPath: current.accessPath ?? recent?.accessPath } : current);
      return;
    }
    const controller = new AbortController();
    setSelectedAccount(null);
    setQuery(initialAccountId);
    void fetch(`/api/search-term-optimization/account-search?q=${encodeURIComponent(initialAccountId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { accounts?: Account[] };
        const account = (payload.accounts ?? []).find((item) => normalizeId(item.adAccountId) === normalizeId(initialAccountId));
        if (account) {
          setSelectedAccount(account);
          setQuery(`${account.accountName} | ${account.adAccountId}`);
        } else {
          const recent = recentAccounts.find((item) => normalizeId(item.adAccountId) === normalizeId(initialAccountId));
          setSelectedAccount({ accountName: resolveGoogleAccountName({ recentName: recent?.accountName, accountId: initialAccountId }), adAccountId: initialAccountId, accessPath: recent?.accessPath });
        }
      })
      .catch(() => {
        const recent = recentAccounts.find((item) => normalizeId(item.adAccountId) === normalizeId(initialAccountId));
        setSelectedAccount({ accountName: resolveGoogleAccountName({ recentName: recent?.accountName, accountId: initialAccountId }), adAccountId: initialAccountId, accessPath: recent?.accessPath });
      });
    return () => controller.abort();
  }, [initialAccountId, recentAccounts, selectedAccount]);

  useEffect(() => {
    const trimmed = query.trim();
    if (selectedAccount && trimmed === `${selectedAccount.accountName} | ${selectedAccount.adAccountId}`) return;
    requestId.current += 1;
    const activeRequest = requestId.current;
    if (trimmed.length < 2) {
      setResults([]);
      setSearchState("idle");
      setSearchError(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchState("loading");
      setSearchError(null);
      try {
        const response = await fetch(`/api/search-term-optimization/account-search?q=${encodeURIComponent(trimmed)}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as { accounts?: Account[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to search Google Ads accounts.");
        if (activeRequest !== requestId.current) return;
        setResults((payload.accounts ?? []).filter(isAccount));
        setHighlightedIndex((payload.accounts ?? []).length > 0 ? 0 : -1);
        setSearchState("success");
      } catch (error) {
        if (controller.signal.aborted || activeRequest !== requestId.current) return;
        setResults([]);
        setSearchState("error");
        setSearchError(error instanceof Error ? error.message : "Unable to search Google Ads accounts.");
      }
    }, 300);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, selectedAccount]);

  const activeQuery = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tab");
    return params.toString();
  }, [searchParams]);

  function selectAccount(account: Account) {
    setSelectedAccount(account);
    setQuery(`${account.accountName} | ${account.adAccountId}`);
    setResults([]);
    setOpen(false);
    setHighlightedIndex(-1);
    setRecentAccounts((current) => {
      const next = [account, ...current.filter((item) => normalizeId(item.adAccountId) !== normalizeId(account.adAccountId))].slice(0, 5);
      window.localStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(next));
      return next;
    });
    const params = new URLSearchParams(searchParams.toString());
    params.delete("accountId");
    params.set("googleAccountId", account.adAccountId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const handleResolvedAccount = useCallback((account: Account) => {
    setSelectedAccount((current) => {
      if (!current || normalizeId(current.adAccountId) !== normalizeId(account.adAccountId)) return current;
      const accountName = resolveGoogleAccountName({ directoryName: current.accountName, dashboardName: account.accountName, accountId: account.adAccountId });
      if (accountName === current.accountName && (current.accessPath ?? null) === (account.accessPath ?? current.accessPath ?? null)) return current;
      return { ...current, ...account, accountName, accessPath: account.accessPath ?? current.accessPath };
    });
  }, []);

  const matchingRecentAccounts=useMemo(()=>{
    if(selectedAccount&&query.trim()===`${selectedAccount.accountName} | ${selectedAccount.adAccountId}`)return recentAccounts;
    return recentAccounts.filter(account=>matchesAccountWords(account,query));
  },[query,recentAccounts,selectedAccount]);

  const selectableAccounts = useMemo(() => {
    const resultIds = new Set(results.map((account) => normalizeId(account.adAccountId)));
    return [...results, ...matchingRecentAccounts.filter((account) => !resultIds.has(normalizeId(account.adAccountId)))];
  }, [matchingRecentAccounts, results]);

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setHighlightedIndex(-1);
      return;
    }
    if (!open || selectableAccounts.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => current < 0 ? 0 : (current + 1) % selectableAccounts.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => current <= 0 ? selectableAccounts.length - 1 : current - 1);
      return;
    }
    if (event.key === "Enter" && highlightedIndex >= 0 && highlightedIndex < selectableAccounts.length) {
      event.preventDefault();
      selectAccount(selectableAccounts[highlightedIndex]);
    }
  }

  return (
    <ReportShell
      title="Google Optimization"
      dateLabel=""
      activeQuery={activeQuery}
      initialRole={role}
      reportReady
      headerControlLayout="wide"
      headerDateControl={<DailyCapacityCounterGrid capacity={dailyCapacity} />}
    >
      <div className="space-y-5 text-neutral-950">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
          <label className="mb-2 block text-sm font-semibold text-neutral-800">Google Ads account</label>
          <div className="max-w-4xl">
            <GoogleAccountSearchField
              value={query}
              onChange={(value) => { setQuery(value); setOpen(true); setHighlightedIndex(-1); }}
              onSelect={selectAccount}
              results={results}
              recentAccounts={matchingRecentAccounts}
              open={open}
              state={searchState}
              error={searchError}
              onFocus={() => setOpen(true)}
              onBlur={() => window.setTimeout(() => setOpen(false), 100)}
              onKeyDown={handleSearchKeyDown}
              highlightedIndex={highlightedIndex}
              onHighlight={setHighlightedIndex}
            />
          </div>
          <p className="mt-2 text-xs text-neutral-500">Select one account to load its saved search-term and placement optimization data.</p>
          {selectedAccount ? <div id={ACCOUNT_SUMMARY_HOST_ID} className="mt-5">{tab === "placements" ? <><h2 className="text-3xl font-semibold">{selectedAccount.accountName}</h2><p className="mt-1 text-sm text-neutral-500">CID {selectedAccount.adAccountId}</p></> : null}</div> : null}
        </section>

        <div className="grid grid-cols-2 rounded-xl border border-neutral-200 bg-white p-1 shadow-sm" role="tablist" aria-label="Google optimization views">
          <Button type="button" role="tab" aria-selected={tab === "search-terms"} variant={tab === "search-terms" ? "default" : "ghost"} className={tab === "search-terms" ? "bg-red-700 hover:bg-red-800" : ""} onClick={() => setTab("search-terms")}>Search Terms</Button>
          <Button type="button" role="tab" aria-selected={tab === "placements"} variant={tab === "placements" ? "default" : "ghost"} className={tab === "placements" ? "bg-red-700 hover:bg-red-800" : ""} onClick={() => setTab("placements")}>Placements</Button>
        </div>

        {!selectedAccount ? <section className="rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm"><h2 className="font-semibold">Select a Google Ads account</h2><p className="mt-1 text-sm text-neutral-500">Both optimization dashboards will load for the selected account.</p></section> : null}
        <div role="tabpanel" hidden={tab !== "search-terms"} className={tab === "search-terms" && selectedAccount ? "block" : "hidden"}>
          <SearchTermOptimizationPageClient key={`search-terms-${normalizeId(selectedAccount?.adAccountId ?? "none")}`} role={role} embedded externalAccount={selectedAccount} embeddedHeaderTargetId={tab === "search-terms" ? ACCOUNT_SUMMARY_HOST_ID : undefined} dailyCapacity={dailyCapacity} onCapacityRefresh={refreshDailyCapacity} onAccountResolved={handleResolvedAccount} />
        </div>
        <div role="tabpanel" hidden={tab !== "placements"} className={tab === "placements" && selectedAccount ? "block" : "hidden"}>
          <PlacementOptimizationPageClient key={`placements-${normalizeId(selectedAccount?.adAccountId ?? "none")}`} role={role} embedded externalAccount={selectedAccount} />
        </div>
      </div>
    </ReportShell>
  );
}

function normalizeId(value: string) { return value.replace(/\D/g, ""); }
function matchesAccountWords(account:Account,query:string){const normalize=(value:string)=>value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();const tokens=normalize(query).split(" ").filter(Boolean);const haystack=normalize(`${account.accountName} ${account.adAccountId}`);return tokens.every(token=>haystack.includes(token));}
function isAccount(value: unknown): value is Account {
  if (!value || typeof value !== "object") return false;
  const account = value as Partial<Account>;
  return typeof account.accountName === "string" && typeof account.adAccountId === "string";
}
