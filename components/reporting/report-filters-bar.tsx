"use client";

import {
  FormEvent,
  KeyboardEvent,
  MutableRefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  IdCardIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCcwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReportFilters } from "@/components/reporting/use-report-filters";
import {
  extractAdAccountIdFromAccountSearchInput,
  formatAccountSuggestionLabel,
} from "@/components/reporting/home-account-search";
import { cn } from "@/lib/utils";

interface ReportFiltersBarProps {
  filters: ReportFilters;
  onApply: (next: Partial<ReportFilters>) => void;
  onReset: () => void;
  includePlatform?: boolean;
  dateMode?: "range" | "month";
  showDateFilters?: boolean;
  showResetButton?: boolean;
  submitLabel?: string;
  compact?: boolean;
  footerContent?: ReactNode;
}

type SearchPlatform = "meta" | "google";

interface SearchEntry {
  key: string;
  platform: SearchPlatform;
  accountId: string;
  searchText: string;
}

interface AccountSearchSuggestion {
  accountName: string;
  adAccountId: string;
  country: string | null;
  notionPageId: string;
}

const ACCOUNT_SEARCH_DEBOUNCE_MS = 300;
const RECENT_ACCOUNTS_STORAGE_KEY = "ads-reporting-recent-accounts";
const RECENT_ACCOUNTS_LIMIT = 5;

export function ReportFiltersBar({
  filters,
  onApply,
  onReset,
  includePlatform = false,
  dateMode = "range",
  showDateFilters = true,
  showResetButton = true,
  submitLabel = "Load Report",
  compact = false,
  footerContent,
}: ReportFiltersBarProps) {
  const [searchEntries, setSearchEntries] = useState<SearchEntry[]>([]);
  const nextSearchEntryId = useRef(0);
  const [startDate, setStartDate] = useState(filters.startDate);
  const [endDate, setEndDate] = useState(filters.endDate);
  const [selectedMonth, setSelectedMonth] = useState(toMonthValue(filters.startDate));
  const [platform, setPlatform] = useState(filters.platform);

  useEffect(() => {
    const parsedEntries = parseSearchEntries(filters);
    nextSearchEntryId.current = 0;
    setSearchEntries(
      parsedEntries.map((entry) => ({
        ...entry,
        searchText: entry.accountId,
        key: nextSearchEntryKey(nextSearchEntryId),
      }))
    );
    setStartDate(filters.startDate);
    setEndDate(filters.endDate);
    setSelectedMonth(toMonthValue(filters.startDate));
    setPlatform(filters.platform);
  }, [filters]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const monthDateRange = toMonthDateRange(selectedMonth);
    const serialized = serializeSearchEntries(searchEntries);

    onApply({
      accountId: serialized.accountId,
      metaAccountId: serialized.metaAccountId,
      googleAccountId: serialized.googleAccountId,
      startDate: dateMode === "month" ? monthDateRange.startDate : startDate,
      endDate: dateMode === "month" ? monthDateRange.endDate : endDate,
      platform,
    });
  }

  function addSearchRow() {
    setSearchEntries((prev) => [
      ...prev,
      {
        key: nextSearchEntryKey(nextSearchEntryId),
        platform: "meta",
        accountId: "",
        searchText: "",
      },
    ]);
  }

  function updateSearchRow(key: string, next: Partial<Omit<SearchEntry, "key">>) {
    setSearchEntries((prev) =>
      prev.map((entry) => (entry.key === key ? { ...entry, ...next } : entry))
    );
  }

  function updateSearchRowAccountId(key: string, value: string) {
    const accountId = extractAdAccountIdFromAccountSearchInput(value);
    const detected = detectAccountIdInputPlatform(accountId);
    updateSearchRow(key, {
      searchText: value,
      accountId: detected?.accountId ?? accountId,
      ...(detected?.platform ? { platform: detected.platform } : {}),
    });
  }

  function selectSearchRowAccount(key: string, suggestion: AccountSearchSuggestion) {
    const detected = detectAccountIdInputPlatform(suggestion.adAccountId);
    updateSearchRow(key, {
      searchText: formatAccountSuggestionLabel(suggestion),
      accountId: suggestion.adAccountId,
      ...(detected?.platform ? { platform: detected.platform } : {}),
    });
  }

  function removeSearchRow(key: string) {
    setSearchEntries((prev) => {
      const filtered = prev.filter((entry) => entry.key !== key);
      if (filtered.length > 0) {
        return filtered;
      }

      return [
        {
          key: nextSearchEntryKey(nextSearchEntryId),
          platform: "meta",
          accountId: "",
          searchText: "",
        },
      ];
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-border/40 bg-card/90 p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-start",
        compact && "gap-2 border-white/20 bg-white/90 p-3 shadow-none"
      )}
    >
      <div className="w-full min-w-0 space-y-1.5 sm:flex-1 md:min-w-[360px]">
        {searchEntries.map((entry) => (
          <div key={entry.key} className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap">
            <Select
              value={entry.platform}
              onValueChange={(value) =>
                updateSearchRow(entry.key, { platform: value as SearchPlatform })
              }
            >
              <SelectTrigger className="h-10 w-full sm:w-[130px]">
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="meta">Meta Ads</SelectItem>
                <SelectItem value="google">Google Ads</SelectItem>
              </SelectContent>
            </Select>

            <ReportAccountSearchInput
              entry={entry}
              onChange={(value) => updateSearchRowAccountId(entry.key, value)}
              onSelect={(suggestion) => selectSearchRowAccount(entry.key, suggestion)}
            />

            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0 px-3"
              onClick={() => removeSearchRow(entry.key)}
              aria-label="Remove account row"
              title="Remove"
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          className="h-9 w-full sm:w-auto sm:self-start"
          onClick={addSearchRow}
        >
          <PlusIcon data-icon="inline-start" />
          Add Account
        </Button>

        {!searchEntries.some((entry) => Boolean(entry.accountId.trim())) ? (
          <p className="text-xs font-medium text-amber-700" role="status">
            Select an account to load this report.
          </p>
        ) : null}
      </div>

      {showDateFilters && dateMode === "month" ? (
        <div className="flex w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background px-2 sm:w-auto md:w-[260px]">
          <CalendarDaysIcon className="ml-1 size-4 text-muted-foreground" />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="h-8 w-8 text-muted-foreground"
            onClick={() => setSelectedMonth((prev) => shiftMonth(prev, -1))}
            aria-label="Previous month"
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Input
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="h-10 border-0 px-1 shadow-none focus-visible:ring-0"
            aria-label="Selected month"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="h-8 w-8 text-muted-foreground"
            onClick={() => setSelectedMonth((prev) => shiftMonth(prev, 1))}
            aria-label="Next month"
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      ) : showDateFilters ? (
        <>
          <label className="flex w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 sm:w-auto md:w-[220px]">
            <CalendarDaysIcon className="size-4 text-muted-foreground" />
            <Input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="h-10 border-0 shadow-none focus-visible:ring-0"
              aria-label="Start date"
            />
          </label>

          <label className="flex w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 sm:w-auto md:w-[220px]">
            <CalendarDaysIcon className="size-4 text-muted-foreground" />
            <Input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="h-10 border-0 shadow-none focus-visible:ring-0"
              aria-label="End date"
            />
          </label>
        </>
      ) : null}

      {includePlatform ? (
        <Select value={platform} onValueChange={(value) => setPlatform(value as ReportFilters["platform"])}>
          <SelectTrigger className="h-10 w-full sm:w-auto md:w-[180px]">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="meta">Meta</SelectItem>
            <SelectItem value="google">Google Ads</SelectItem>
            <SelectItem value="googleYoutube">Google Ads YouTube</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <div className="hidden" />
      )}

      <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:items-start">
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-start">
          <Button
            type="submit"
            disabled={!searchEntries.some((entry) => Boolean(entry.accountId.trim()))}
            className="h-10 w-full items-center justify-center gap-2 bg-red-600 px-4 text-center text-sm font-medium leading-none text-white hover:bg-red-700 sm:min-w-[148px] sm:w-auto"
          >
            <SearchIcon data-icon="inline-start" className="shrink-0" />
            {submitLabel}
          </Button>
          {showResetButton ? (
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full items-center justify-center gap-2 px-4 text-sm font-medium leading-none sm:min-w-[148px] sm:w-auto"
              onClick={onReset}
            >
              <RefreshCcwIcon data-icon="inline-start" className="shrink-0" />
              Reset
            </Button>
          ) : null}
        </div>
        {footerContent ? <div className="w-full sm:w-auto">{footerContent}</div> : null}
      </div>
    </form>
  );
}

function ReportAccountSearchInput({
  entry,
  onChange,
  onSelect,
}: {
  entry: SearchEntry;
  onChange: (value: string) => void;
  onSelect: (suggestion: AccountSearchSuggestion) => void;
}) {
  const [suggestions, setSuggestions] = useState<AccountSearchSuggestion[]>([]);
  const [recentAccounts, setRecentAccounts] = useState<AccountSearchSuggestion[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const requestId = useRef(0);
  const query = entry.searchText.trim();
  const showRecent = query.length < 2;
  const visibleSuggestions = showRecent ? recentAccounts : suggestions;

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(RECENT_ACCOUNTS_STORAGE_KEY);
      const storedAccounts = storedValue ? (JSON.parse(storedValue) as unknown) : [];
      if (Array.isArray(storedAccounts)) {
        setRecentAccounts(
          storedAccounts
            .filter(isAccountSearchSuggestion)
            .slice(0, RECENT_ACCOUNTS_LIMIT)
        );
      }
    } catch {
      window.localStorage.removeItem(RECENT_ACCOUNTS_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    requestId.current += 1;
    const currentRequestId = requestId.current;

    if (query.length < 2 || entry.accountId) {
      setSuggestions([]);
      setSearchState("idle");
      setSearchError(null);
      return;
    }

    setSearchState("loading");
    setSearchError(null);
    setIsOpen(true);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/notion/accounts/search?q=${encodeURIComponent(query)}`,
          { cache: "no-store", signal: controller.signal }
        );
        const payload = (await response.json().catch(() => null)) as
          | { accounts?: AccountSearchSuggestion[]; error?: string; message?: string }
          | null;

        if (controller.signal.aborted || currentRequestId !== requestId.current) {
          return;
        }

        if (!response.ok || !payload) {
          throw new Error(payload?.error ?? payload?.message ?? "Unable to search accounts.");
        }

        const nextSuggestions = Array.isArray(payload.accounts) ? payload.accounts : [];
        setSuggestions(nextSuggestions);
        setSearchState("success");
        setHighlightedIndex(nextSuggestions.length > 0 ? 0 : -1);
      } catch (error) {
        if (controller.signal.aborted || currentRequestId !== requestId.current) {
          return;
        }
        setSuggestions([]);
        setSearchState("error");
        setHighlightedIndex(-1);
        setSearchError(error instanceof Error ? error.message : "Unable to search accounts.");
      }
    }, ACCOUNT_SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [entry.accountId, query]);

  function selectSuggestion(suggestion: AccountSearchSuggestion) {
    const nextRecent = [
      suggestion,
      ...recentAccounts.filter((account) => account.notionPageId !== suggestion.notionPageId),
    ].slice(0, RECENT_ACCOUNTS_LIMIT);
    setRecentAccounts(nextRecent);
    try {
      window.localStorage.setItem(RECENT_ACCOUNTS_STORAGE_KEY, JSON.stringify(nextRecent));
    } catch {
      // Keep the selection available in memory when browser storage is unavailable.
    }
    onSelect(suggestion);
    setIsOpen(false);
    setHighlightedIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      setHighlightedIndex(-1);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (visibleSuggestions.length === 0) {
        return;
      }
      event.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((current) => {
        if (event.key === "ArrowDown") {
          return current < visibleSuggestions.length - 1 ? current + 1 : 0;
        }
        return current > 0 ? current - 1 : visibleSuggestions.length - 1;
      });
      return;
    }

    if (event.key === "Enter" && isOpen && highlightedIndex >= 0) {
      const suggestion = visibleSuggestions[highlightedIndex];
      if (suggestion) {
        event.preventDefault();
        selectSuggestion(suggestion);
      }
    }
  }

  return (
    <label
      className="relative flex w-full min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 sm:w-auto"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
          setHighlightedIndex(-1);
        }
      }}
    >
      <IdCardIcon className="size-4 shrink-0 text-muted-foreground" />
      <Input
        value={entry.searchText}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => {
          if (query.length >= 2 || recentAccounts.length > 0) {
            setIsOpen(true);
            setHighlightedIndex(visibleSuggestions.length > 0 ? 0 : -1);
          }
        }}
        onKeyDown={handleKeyDown}
        className="h-10 border-0 shadow-none focus-visible:ring-0"
        placeholder="Search account name or ID"
        aria-label={`${entry.platform === "meta" ? "Meta Ads" : "Google Ads"} account`}
        aria-autocomplete="list"
        aria-expanded={isOpen}
        autoComplete="off"
      />

      {isOpen && (query.length >= 2 || recentAccounts.length > 0) ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl">
          {showRecent && recentAccounts.length > 0 ? (
            <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent accounts
            </div>
          ) : null}
          {!showRecent && searchState === "loading" ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Searching Notion accounts...
            </div>
          ) : null}
          {!showRecent && searchState === "error" ? (
            <div className="px-3 py-3 text-sm text-destructive">
              {searchError ?? "Unable to search accounts."}
            </div>
          ) : null}
          {!showRecent && searchState === "success" && suggestions.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">
              No matching account found.
            </div>
          ) : null}
          {visibleSuggestions.length > 0 ? (
            <ul className="max-h-72 overflow-auto py-1">
              {visibleSuggestions.map((suggestion, index) => (
                <li key={suggestion.notionPageId}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectSuggestion(suggestion)}
                    className={cn(
                      "grid w-full gap-1 px-3 py-2 text-left text-sm transition",
                      index === highlightedIndex
                        ? "bg-red-600 text-white"
                        : "hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <span className="font-semibold">
                      {formatAccountSuggestionLabel(suggestion)}
                    </span>
                    <span
                      className={cn(
                        "text-xs",
                        index === highlightedIndex
                          ? "text-white/75"
                          : "text-muted-foreground"
                      )}
                    >
                      {suggestion.country ?? "No country set"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </label>
  );
}

function isAccountSearchSuggestion(value: unknown): value is AccountSearchSuggestion {
  return Boolean(
    value &&
      typeof value === "object" &&
      "accountName" in value &&
      typeof value.accountName === "string" &&
      "adAccountId" in value &&
      typeof value.adAccountId === "string" &&
      "notionPageId" in value &&
      typeof value.notionPageId === "string"
  );
}

function toMonthValue(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value.slice(0, 7);
  }

  return getDefaultMonthValue();
}

function toMonthDateRange(monthValue: string): { startDate: string; endDate: string } {
  if (!/^\d{4}-\d{2}$/.test(monthValue)) {
    return toMonthDateRange(getDefaultMonthValue());
  }

  const [yearText, monthText] = monthValue.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function shiftMonth(monthValue: string, offset: number): string {
  const normalized = toMonthValue(`${monthValue}-01`);
  const [yearText, monthText] = normalized.split("-");
  const monthDate = new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + offset, 1));
  return `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getDefaultMonthValue(): string {
  const now = new Date();
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${lastMonth.getUTCFullYear()}-${String(lastMonth.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseSearchEntries(filters: Pick<ReportFilters, "accountId" | "metaAccountId" | "googleAccountId">): Array<{
  platform: SearchPlatform;
  accountId: string;
}> {
  const entries: Array<{ platform: SearchPlatform; accountId: string }> = [];

  splitAccountIdList(filters.metaAccountId).forEach((value) => {
    entries.push({ platform: "meta", accountId: value });
  });

  splitAccountIdList(filters.googleAccountId).forEach((value) => {
    entries.push({ platform: "google", accountId: value });
  });

  splitAccountIdList(filters.accountId).forEach((token) => {
    const classified = classifyAccountIdToken(token);
    entries.push({ platform: classified.platform, accountId: classified.accountId });
  });

  const deduped = dedupeSearchEntries(entries);
  return deduped.length > 0 ? deduped : [{ platform: "meta", accountId: "" }];
}

function serializeSearchEntries(entries: SearchEntry[]): {
  accountId: string;
  metaAccountId: string;
  googleAccountId: string;
} {
  const metaIds: string[] = [];
  const googleIds: string[] = [];

  entries.forEach((entry) => {
    const trimmed = entry.accountId.trim();
    if (!trimmed) {
      return;
    }

    if (entry.platform === "meta") {
      metaIds.push(trimmed);
      return;
    }

    googleIds.push(trimmed);
  });

  return {
    accountId: "",
    metaAccountId: metaIds.join(","),
    googleAccountId: googleIds.join(","),
  };
}

function splitAccountIdList(value: string): string[] {
  return value
    .split(/[\s,;|]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function classifyAccountIdToken(token: string): {
  platform: SearchPlatform;
  accountId: string;
} {
  const trimmed = token.trim();
  const lowered = trimmed.toLowerCase();
  const digitsOnly = trimmed.replace(/\D/g, "");

  if (lowered.startsWith("meta:") || lowered.startsWith("m:")) {
    return { platform: "meta", accountId: trimmed.split(":").slice(1).join(":").trim() };
  }

  if (lowered.startsWith("google:") || lowered.startsWith("g:")) {
    return { platform: "google", accountId: trimmed.split(":").slice(1).join(":").trim() };
  }

  if (lowered.startsWith("act_")) {
    return { platform: "meta", accountId: trimmed };
  }

  if (/^\d{3}-\d{3}-\d{4}$/.test(trimmed)) {
    return { platform: "google", accountId: trimmed };
  }

  if (/^\d+$/.test(trimmed) && digitsOnly.length === 10) {
    return { platform: "google", accountId: trimmed };
  }

  if (/^\d+$/.test(trimmed) && digitsOnly.length >= 12) {
    return { platform: "meta", accountId: trimmed };
  }

  return { platform: "meta", accountId: trimmed };
}

function detectAccountIdInputPlatform(value: string): {
  platform: SearchPlatform;
  accountId: string;
} | null {
  const trimmed = value.trim();
  const lowered = trimmed.toLowerCase();
  const digitsOnly = trimmed.replace(/\D/g, "");
  const prefixed = /^(meta|m|google|g)\s*:\s*(.+)$/i.exec(trimmed);

  if (prefixed) {
    const prefix = prefixed[1].toLowerCase();
    return {
      platform: prefix === "google" || prefix === "g" ? "google" : "meta",
      accountId: prefixed[2].trim(),
    };
  }

  if (lowered.startsWith("act_")) {
    return { platform: "meta", accountId: trimmed };
  }

  if (/^\d{3}-\d{3}-\d{4}$/.test(trimmed)) {
    return { platform: "google", accountId: trimmed };
  }

  if (/^[\d\s-]+$/.test(trimmed) && digitsOnly.length === 10) {
    return { platform: "google", accountId: trimmed };
  }

  if (/^[\d\s-]+$/.test(trimmed) && digitsOnly.length >= 12) {
    return { platform: "meta", accountId: trimmed };
  }

  return null;
}

function dedupeSearchEntries(
  entries: Array<{ platform: SearchPlatform; accountId: string }>
): Array<{ platform: SearchPlatform; accountId: string }> {
  const seen = new Set<string>();
  const deduped: Array<{ platform: SearchPlatform; accountId: string }> = [];

  entries.forEach((entry) => {
    const trimmed = entry.accountId.trim();
    if (!trimmed) {
      return;
    }

    const normalized = trimmed.replace(/\D/g, "");
    const uniqueKey = `${entry.platform}:${normalized || trimmed.toLowerCase()}`;
    if (seen.has(uniqueKey)) {
      return;
    }

    seen.add(uniqueKey);
    deduped.push({ platform: entry.platform, accountId: trimmed });
  });

  return deduped;
}

function nextSearchEntryKey(counter: MutableRefObject<number>): string {
  const key = `search-entry-${counter.current}`;
  counter.current += 1;
  return key;
}
