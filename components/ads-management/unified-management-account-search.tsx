"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoaderCircleIcon, SearchIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  buildCanonicalManagementQuery,
  managementSelectionKey,
  mergeManagementRecentAccounts,
  resolveManagementAccount,
  type ManagementAccountDirectoryEntry,
  type ManagementAccountSelection,
} from "@/lib/ads-management/unified-management";

const RECENT_CACHE_KEY = "ads-management-recent-accounts-v2";
const LEGACY_RECENT_KEYS = [
  "meta-management-recent-accounts-v1",
  "google-management-recent-accounts-v1",
  "tiktok-management-recent-accounts-v1",
] as const;

type DirectoryEntry = ManagementAccountDirectoryEntry & {
  accessPath?: string | null;
  notionPageId?: string;
  country?: string | null;
};

export function UnifiedManagementAccountSearch({
  selection,
  synchronizedAt,
}: {
  selection?: ManagementAccountSelection | null;
  synchronizedAt?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLElement>(null);
  const requestId = useRef(0);
  const [query, setQuery] = useState(selection?.accountName ?? "");
  const [results, setResults] = useState<ManagementAccountSelection[]>([]);
  const [recents, setRecents] = useState<ManagementAccountSelection[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQuery(selection?.accountName ?? "");
  }, [selection?.accountName]);

  useEffect(() => {
    const migrated = readRecentAccounts();
    setRecents(migrated);
    writeRecentAccounts(migrated);
  }, []);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 2 || trimmed === selection?.accountName) {
      setResults([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const activeRequest = ++requestId.current;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const response = await fetch(`/api/search-term-optimization/account-search?q=${encodeURIComponent(trimmed)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json() as { accounts?: DirectoryEntry[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to search the account directory.");
        if (controller.signal.aborted || activeRequest !== requestId.current) return;
        setResults(mergeManagementRecentAccounts(payload.accounts ?? []));
      } catch (cause) {
        if (controller.signal.aborted || activeRequest !== requestId.current) return;
        setResults([]);
        setError(cause instanceof Error ? cause.message : "Unable to search the account directory.");
      } finally {
        if (!controller.signal.aborted && activeRequest === requestId.current) setSearching(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, selection?.accountName]);

  function selectAccount(account: ManagementAccountSelection) {
    const nextRecents = [
      account,
      ...recents.filter((item) => managementSelectionKey(item) !== managementSelectionKey(account)),
    ].slice(0, 10);
    setRecents(nextRecents);
    writeRecentAccounts(nextRecents);
    setQuery(account.accountName);
    setOpen(false);
    setError(null);

    router.push(`/manage?${buildCanonicalManagementQuery({
      ...account,
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
      view: "campaigns",
    })}`);
  }

  function selectDirectEntry() {
    const account = resolveManagementAccount({ directInput: query });
    if (!account) {
      setError("Use meta:, google:, or tiktok: before a numeric ID. Meta act_ IDs and hyphenated Google CIDs are also accepted.");
      return;
    }
    selectAccount(account);
  }

  const resultKeys = new Set(results.map(managementSelectionKey));
  const visibleRecents = recents.filter((account) => !resultKeys.has(managementSelectionKey(account)));

  return (
    <section ref={containerRef} className="relative z-30 rounded-2xl border bg-white p-5 shadow-sm">
      <label className="block text-sm font-semibold text-slate-800" htmlFor="ads-management-account-search">
        Ads account search
      </label>
      <div className="relative mt-2">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input
          id="ads-management-account-search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setError(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter") selectDirectEntry();
          }}
          placeholder="Search company or enter meta:, google:, or tiktok: followed by an account ID"
          className="bg-white pl-9 pr-10"
          autoComplete="off"
        />
        {searching ? <LoaderCircleIcon className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-red-700" /> : null}
        {open ? (
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[80] max-h-80 overflow-y-auto rounded-xl border bg-white p-2 shadow-2xl">
            <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Results</p>
            {query.trim().length < 2 ? (
              <p className="px-3 py-2 text-sm text-slate-500">Type at least 2 characters to search accounts.</p>
            ) : searching ? (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500"><LoaderCircleIcon className="size-4 animate-spin" />Searching accounts…</div>
            ) : results.length ? results.map((account) => (
              <AccountOption key={`result:${managementSelectionKey(account)}`} account={account} onSelect={selectAccount} />
            )) : (
              <p className="px-3 py-2 text-sm text-slate-500">No matching ad accounts found.</p>
            )}
            <div className="mt-1 border-t pt-1">
              <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Recent</p>
              {visibleRecents.length ? visibleRecents.map((account) => (
                <AccountOption key={`recent:${managementSelectionKey(account)}`} account={account} onSelect={selectAccount} />
              )) : <p className="px-3 py-2 text-sm text-slate-500">No recent accounts yet.</p>}
            </div>
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-slate-500">The directory platform is used first; account-name and explicit provider prefixes are safe fallbacks.</p>
      {selection ? (
        <div className="mt-4 border-t border-slate-200 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{selection.accountName}</h1>
            <Badge variant="outline" className="capitalize">{providerLabel(selection.platform)}</Badge>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {providerAccountLabel(selection)}
            {synchronizedAt ? ` · Synchronized ${new Date(synchronizedAt).toLocaleString()}` : ""}
          </p>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
    </section>
  );
}

function AccountOption({ account, onSelect }: { account: ManagementAccountSelection; onSelect: (account: ManagementAccountSelection) => void }) {
  return (
    <button type="button" onClick={() => onSelect(account)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left hover:bg-red-50">
      <span className="min-w-0">
        <strong className="block truncate text-sm text-slate-900">{account.accountName}</strong>
        <span className="block text-xs text-slate-500">{providerAccountLabel(account)}</span>
      </span>
      <Badge variant="outline" className="shrink-0 capitalize">{providerLabel(account.platform)}</Badge>
    </button>
  );
}

function providerLabel(platform: ManagementAccountSelection["platform"]) {
  return platform === "meta" ? "Meta" : platform === "google" ? "Google" : "TikTok";
}

function providerAccountLabel(account: ManagementAccountSelection) {
  if (account.platform === "meta") return `Meta ad account ${account.accountId}`;
  if (account.platform === "google") return `Google Ads CID ${account.accountId}`;
  return `TikTok advertiser ${account.accountId}`;
}

function readRecentAccounts(): ManagementAccountSelection[] {
  const entries: ManagementAccountDirectoryEntry[] = [];
  try {
    entries.push(...asDirectoryEntries(JSON.parse(window.localStorage.getItem(RECENT_CACHE_KEY) ?? "[]")));
    for (const key of LEGACY_RECENT_KEYS) {
      entries.push(...asDirectoryEntries(JSON.parse(window.localStorage.getItem(key) ?? "[]")));
    }
  } catch {
    return [];
  }
  return mergeManagementRecentAccounts(entries);
}

function writeRecentAccounts(accounts: ManagementAccountSelection[]) {
  try {
    window.localStorage.setItem(RECENT_CACHE_KEY, JSON.stringify(accounts));
  } catch {
    // Recent-account persistence is optional.
  }
}

function asDirectoryEntries(value: unknown): ManagementAccountDirectoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): ManagementAccountDirectoryEntry[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const accountName = typeof item.accountName === "string" ? item.accountName : "";
    const adAccountId = typeof item.adAccountId === "string"
      ? item.adAccountId
      : typeof item.accountId === "string"
        ? item.accountId
        : "";
    if (!accountName || !adAccountId) return [];
    return [{ accountName, adAccountId, platform: typeof item.platform === "string" ? item.platform : null }];
  });
}
