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
  ChevronDownIcon,
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
import { ButtonGroup } from "@/components/ui/button-group";
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
import { switchReportAccountEntryPlatform } from "@/lib/reporting/preview-platform-context";
import {
  clearRememberedReportAccount,
  readRememberedReportAccount,
  type RememberedReportAccount,
  writeRememberedReportAccount,
} from "@/lib/reporting/remembered-report-account";

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
  compactToolbar?: boolean;
  footerContent?: ReactNode;
  immediateAccountApply?: boolean;
  allowMultipleAccounts?: boolean;
  rememberAccountSelection?: boolean;
  onAccountSelected?: (account: RememberedReportAccount) => void;
}

type SearchPlatform = "meta" | "google" | "tiktok";

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
  platform?: "meta" | "google" | "tiktok" | null;
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
  compactToolbar = false,
  footerContent,
  immediateAccountApply = false,
  allowMultipleAccounts = true,
  rememberAccountSelection = true,
  onAccountSelected,
}: ReportFiltersBarProps) {
  const denseToolbar = compact && compactToolbar;
  const nextSearchEntryId = useRef(0);
  const [searchEntries, setSearchEntries] = useState<SearchEntry[]>(() =>
    parseSearchEntries(filters).map((entry, index) => ({
      ...entry,
      searchText: entry.accountId,
      key: `search-entry-initial-${index}`,
    }))
  );
  const [startDate, setStartDate] = useState(filters.startDate);
  const [endDate, setEndDate] = useState(filters.endDate);
  const [selectedMonth, setSelectedMonth] = useState(toMonthValue(filters.startDate));
  const [platform, setPlatform] = useState(filters.platform);
  const restoredRememberedAccount = useRef(false);

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

  useEffect(() => {
    if (
      restoredRememberedAccount.current ||
      !rememberAccountSelection ||
      hasAccountFilters(filters)
    ) {
      return;
    }
    restoredRememberedAccount.current = true;
    const remembered = readRememberedReportAccount(window.localStorage);
    if (!remembered) return;
    onAccountSelected?.(remembered);
    onApply(toReportAccountFilters(remembered));
  }, [filters, onAccountSelected, onApply, rememberAccountSelection]);

  function applyEntries(entries: SearchEntry[], nextPlatform: SearchPlatform) {
    const monthDateRange = toMonthDateRange(selectedMonth);
    const serialized = serializeSearchEntries(entries);
    onApply({
      ...serialized,
      startDate: dateMode === "month" ? monthDateRange.startDate : startDate,
      endDate: dateMode === "month" ? monthDateRange.endDate : endDate,
      platform: nextPlatform,
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyEntries(searchEntries, platform === "googleYoutube" ? "google" : platform);
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

  function switchSearchRowPlatform(key: string, nextPlatform: SearchPlatform) {
    setPlatform(nextPlatform);
    setSearchEntries((prev) =>
      prev.map((entry) =>
        entry.key === key
          ? switchReportAccountEntryPlatform(entry, nextPlatform)
          : entry
      )
    );
  }

  function updateSearchRowAccountId(key: string, value: string) {
    const accountId = extractAdAccountIdFromAccountSearchInput(value);
    const detected = detectAccountIdInputPlatform(accountId);
    const nextPlatform = detected?.platform ?? searchEntries.find((entry) => entry.key === key)?.platform ?? "meta";
    const nextEntry = {
      searchText: value,
      accountId: detected?.accountId ?? accountId,
      ...(detected?.platform ? { platform: detected.platform } : {}),
    };
    const nextEntries = searchEntries.map((entry) => entry.key === key ? { ...entry, ...nextEntry } : entry);
    setSearchEntries(nextEntries);
    if (detected?.platform) {
      setPlatform(detected.platform);
    }
    if (accountId) {
      rememberAccount({ accountId: detected?.accountId ?? accountId, platform: nextPlatform, displayName: value || accountId, country: null });
      if (immediateAccountApply) applyEntries(nextEntries, nextPlatform);
    }
  }

  function selectSearchRowAccount(key: string, suggestion: AccountSearchSuggestion) {
    const detected = suggestion.platform
      ? { platform: suggestion.platform, accountId: suggestion.adAccountId }
      : detectAccountIdInputPlatform(suggestion.adAccountId);
    const nextPlatform = detected?.platform ?? searchEntries.find((entry) => entry.key === key)?.platform ?? "meta";
    const nextEntry = {
      searchText: formatAccountSuggestionLabel(suggestion),
      accountId: suggestion.adAccountId,
      ...(detected?.platform ? { platform: detected.platform } : {}),
    };
    const nextEntries = searchEntries.map((entry) => entry.key === key ? { ...entry, ...nextEntry } : entry);
    setSearchEntries(nextEntries);
    if (detected?.platform) {
      setPlatform(detected.platform);
    }
    rememberAccount({
      accountId: suggestion.adAccountId,
      platform: nextPlatform,
      displayName: formatAccountSuggestionLabel(suggestion),
      country: suggestion.country,
    });
    if (immediateAccountApply) applyEntries(nextEntries, nextPlatform);
  }

  function rememberAccount(account: RememberedReportAccount) {
    if (rememberAccountSelection) {
      writeRememberedReportAccount(window.localStorage, account);
    }
    onAccountSelected?.(account);
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

  const reloadButton = (
    <Button
      type="submit"
      disabled={!searchEntries.some((entry) => Boolean(entry.accountId.trim()))}
      className={cn(
        "items-center justify-center gap-2 bg-red-600 text-center font-medium leading-none text-white hover:bg-red-700",
        denseToolbar
          ? "h-8 w-auto flex-none px-2 text-[11px]"
          : compact
            ? "h-9 w-full px-3 text-xs sm:min-w-[112px] sm:w-auto"
            : "h-10 w-full px-4 text-sm sm:min-w-[148px] sm:w-auto"
      )}
    >
      <SearchIcon data-icon="inline-start" className="shrink-0" />
      {submitLabel}
    </Button>
  );

  const resetButton = showResetButton ? (
    <Button
      type="button"
      variant="outline"
      title="Clear all selected accounts"
      className={cn(
        "items-center justify-center gap-2 font-medium leading-none",
        denseToolbar
          ? "h-8 w-auto flex-none px-2 text-[11px]"
          : compact
            ? "h-9 w-full px-3 text-xs sm:min-w-[112px] sm:w-auto"
            : "h-10 w-full px-4 text-sm sm:min-w-[148px] sm:w-auto"
      )}
      onClick={() => {
        if (rememberAccountSelection) clearRememberedReportAccount(window.localStorage);
        onReset();
      }}
    >
      <RefreshCcwIcon data-icon="inline-start" className="shrink-0" />
      Reset
    </Button>
  ) : null;

  const addAccountButton = allowMultipleAccounts ? (
    <Button
      type="button"
      variant="outline"
      className={cn(
        denseToolbar
          ? "h-8 w-auto flex-none px-2 text-[11px]"
          : "w-full sm:w-auto sm:self-start",
        !denseToolbar && (compact ? "h-8 px-2.5 text-xs" : "h-9")
      )}
      onClick={addSearchRow}
    >
      <PlusIcon data-icon="inline-start" />
      Add Account
    </Button>
  ) : null;

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex flex-col rounded-2xl border border-border/40 bg-card/90 shadow-sm",
        compact
          ? denseToolbar
            ? "gap-1.5 rounded-xl border-white/20 bg-white/90 p-2 shadow-none lg:flex-row lg:flex-wrap lg:items-start"
            : "gap-2 border-white/20 bg-white/90 p-2.5 shadow-none lg:flex-row lg:flex-wrap lg:items-start"
          : "gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-start"
      )}
    >
      <div className={cn("w-full min-w-0 space-y-1.5 sm:flex-1", compact ? "lg:min-w-[360px]" : "md:min-w-[360px]")}>
        {searchEntries.map((entry) => (
          <div
            key={entry.key}
            className={cn(
              "min-w-0 items-center gap-2",
              denseToolbar
                ? "grid grid-cols-[84px_minmax(0,1fr)_32px] gap-1.5 sm:grid-cols-[96px_minmax(0,1fr)_32px]"
                : "flex flex-wrap sm:flex-nowrap"
            )}
          >
            <Select
              value={entry.platform}
              onValueChange={(value) => switchSearchRowPlatform(entry.key, value as SearchPlatform)}
            >
              <SelectTrigger
                className={cn(
                  denseToolbar
                    ? "h-8 w-full px-2 text-[11px]"
                    : compact
                      ? "h-9 w-full text-xs sm:w-[130px]"
                      : "h-10 w-full sm:w-[130px]"
                )}
              >
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="meta">Meta Ads</SelectItem>
                <SelectItem value="google">Google Ads</SelectItem>
                <SelectItem value="tiktok">TikTok Ads</SelectItem>
              </SelectContent>
            </Select>

            <ReportAccountSearchInput
              entry={entry}
              compact={compact}
              compactToolbar={denseToolbar}
              onChange={(value) => updateSearchRowAccountId(entry.key, value)}
              onSelect={(suggestion) => selectSearchRowAccount(entry.key, suggestion)}
            />

            {allowMultipleAccounts ? <Button
              type="button"
              variant="outline"
              className={cn(
                "shrink-0",
                denseToolbar ? "size-8 p-0" : compact ? "h-9 px-3" : "h-10 px-3"
              )}
              onClick={() => removeSearchRow(entry.key)}
              aria-label="Remove account row"
              title="Remove"
            >
              <XIcon className="size-4" />
            </Button> : null}
          </div>
        ))}

        {!denseToolbar ? addAccountButton : null}

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
            <SelectItem value="tiktok">TikTok Ads</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <div className="hidden" />
      )}

      <div
        className={cn(
          "flex w-full",
          denseToolbar
            ? "flex-wrap items-center gap-1.5"
            : compact
              ? "flex-row flex-wrap items-start gap-2 lg:ml-auto lg:w-auto"
              : "flex-col gap-2 sm:ml-auto sm:w-auto sm:items-start"
        )}
      >
        {denseToolbar ? (
          <ButtonGroup className="flex-none">
            {addAccountButton}
            {reloadButton}
            {resetButton}
          </ButtonGroup>
        ) : (
          <div
            className={
              compact
                ? "flex w-full flex-row gap-2 sm:w-auto sm:items-start"
                : "flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-start"
            }
          >
            {reloadButton}
            {resetButton}
          </div>
        )}
        {footerContent ? (
          <div
            className={cn(
              denseToolbar ? "ml-auto w-auto flex-none" : "w-full sm:w-auto",
              compact && !denseToolbar && "[&_button]:h-9 [&_button]:px-3 [&_button]:text-xs"
            )}
          >
            {footerContent}
          </div>
        ) : null}
      </div>
    </form>
  );
}

function ReportAccountSearchInput({
  entry,
  compact,
  compactToolbar,
  onChange,
  onSelect,
}: {
  entry: SearchEntry;
  compact?: boolean;
  compactToolbar?: boolean;
  onChange: (value: string) => void;
  onSelect: (suggestion: AccountSearchSuggestion) => void;
}) {
  const [suggestions, setSuggestions] = useState<AccountSearchSuggestion[]>([]);
  const [recentAccounts, setRecentAccounts] = useState<AccountSearchSuggestion[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchState, setSearchState] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const requestId = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const query = searchQuery.trim();
  const resultSuggestions = suggestions.filter(
    (suggestion) =>
      !recentAccounts.some((recent) => recent.notionPageId === suggestion.notionPageId)
  );
  const navigableSuggestions = [...recentAccounts, ...resultSuggestions];

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

    if (query.length < 2) {
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
        setHighlightedId(nextSuggestions[0]?.notionPageId ?? null);
      } catch (error) {
        if (controller.signal.aborted || currentRequestId !== requestId.current) {
          return;
        }
        setSuggestions([]);
        setSearchState("error");
        setHighlightedId(null);
        setSearchError(error instanceof Error ? error.message : "Unable to search accounts.");
      }
    }, ACCOUNT_SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frameId);
  }, [isOpen]);

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
    setSearchQuery("");
    setIsOpen(false);
    setHighlightedId(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      setHighlightedId(null);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (navigableSuggestions.length === 0) {
        return;
      }
      event.preventDefault();
      const currentIndex = navigableSuggestions.findIndex(
        (suggestion) => suggestion.notionPageId === highlightedId
      );
      const nextIndex =
        event.key === "ArrowDown"
          ? currentIndex < navigableSuggestions.length - 1
            ? currentIndex + 1
            : 0
          : currentIndex > 0
            ? currentIndex - 1
            : navigableSuggestions.length - 1;
      setHighlightedId(navigableSuggestions[nextIndex]?.notionPageId ?? null);
      return;
    }

    if (event.key === "Enter" && highlightedId) {
      const suggestion = navigableSuggestions.find(
        (item) => item.notionPageId === highlightedId
      );
      if (suggestion) {
        event.preventDefault();
        selectSuggestion(suggestion);
        return;
      }
    }

    if (event.key === "Enter") {
      const directAccountId = extractAdAccountIdFromAccountSearchInput(query);
      if (directAccountId) {
        event.preventDefault();
        onChange(directAccountId);
        setSearchQuery("");
        setIsOpen(false);
        setHighlightedId(null);
      }
    }
  }

  return (
    <div
      className="relative w-full min-w-0 flex-1 sm:w-auto"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
          setHighlightedId(null);
        }
      }}
    >
      <button
        type="button"
        onClick={() => {
          setIsOpen((current) => !current);
          setHighlightedId(recentAccounts[0]?.notionPageId ?? null);
        }}
        className={cn(
          "flex w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background text-left shadow-xs outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          compactToolbar ? "h-8 px-2 text-[11px]" : compact ? "h-9 px-3 text-xs" : "h-10 px-3 text-sm"
        )}
        aria-label={`${entry.platform === "meta" ? "Meta Ads" : entry.platform === "tiktok" ? "TikTok Ads" : "Google Ads"} account`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <IdCardIcon className="size-4 shrink-0 text-muted-foreground" />
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            entry.accountId ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {entry.searchText || "Select an account"}
        </span>
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen ? (
        <div
          className={cn(
            "absolute top-full z-50 mt-2 overflow-hidden rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl",
            compactToolbar
              ? "right-0 mt-1.5 w-[min(20rem,calc(100vw-1.5rem))] min-w-0 rounded-lg p-1.5"
              : "left-0 right-0 min-w-[320px]"
          )}
        >
          <div className="relative">
            <SearchIcon
              className={cn(
                "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground",
                compactToolbar ? "left-2.5 size-3.5" : "left-3 size-4"
              )}
            />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setHighlightedId(null);
              }}
              onKeyDown={handleKeyDown}
              className={compactToolbar ? "h-8 px-2 pl-8 text-[11px]" : "h-10 pl-9"}
              placeholder="Search account name or ID"
              aria-label="Search accounts"
              aria-autocomplete="list"
              autoComplete="off"
            />
          </div>

          <div className={compactToolbar ? "mt-1.5 max-h-64 overflow-auto" : "mt-2 max-h-80 overflow-auto"}>
            <div className={cn(
              "font-semibold uppercase tracking-wide text-muted-foreground",
              compactToolbar ? "px-2 py-1 text-[9px]" : "px-2 py-1.5 text-xs"
            )}>
              Recent
            </div>
            {recentAccounts.length > 0 ? (
              <AccountSuggestionList
                suggestions={recentAccounts}
                highlightedId={highlightedId}
                onSelect={selectSuggestion}
                onHighlight={setHighlightedId}
                compact={compactToolbar}
              />
            ) : (
              <p className="px-2 py-2 text-sm text-muted-foreground">
                No recent accounts yet.
              </p>
            )}

            <div className={cn(
              "mt-1 border-t border-border px-2 pb-1 font-semibold uppercase tracking-wide text-muted-foreground",
              compactToolbar ? "pt-2 text-[9px]" : "pt-3 text-xs"
            )}>
              Results
            </div>
            {query.length < 2 ? (
              <p className="px-2 py-2 text-sm text-muted-foreground">
                Type at least 2 characters to search accounts.
              </p>
            ) : searchState === "loading" ? (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                Searching accounts...
              </div>
            ) : searchState === "error" ? (
              <div className="px-3 py-3 text-sm text-destructive">
              {searchError ?? "Unable to search accounts."}
              </div>
            ) : searchState === "success" && suggestions.length === 0 ? (
              <div className="px-3 py-3 text-sm text-muted-foreground">
              No matching account found.
              </div>
            ) : resultSuggestions.length > 0 ? (
              <AccountSuggestionList
                suggestions={resultSuggestions}
                highlightedId={highlightedId}
                onSelect={selectSuggestion}
                onHighlight={setHighlightedId}
                compact={compactToolbar}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AccountSuggestionList({
  suggestions,
  highlightedId,
  onSelect,
  onHighlight,
  compact = false,
}: {
  suggestions: AccountSearchSuggestion[];
  highlightedId: string | null;
  onSelect: (suggestion: AccountSearchSuggestion) => void;
  onHighlight: (notionPageId: string) => void;
  compact?: boolean;
}) {
  return (
    <ul className="space-y-1" role="listbox">
      {suggestions.map((suggestion) => {
        const highlighted = suggestion.notionPageId === highlightedId;
        return (
          <li key={suggestion.notionPageId}>
            <button
              type="button"
              role="option"
              aria-selected={highlighted}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onHighlight(suggestion.notionPageId)}
              onClick={() => onSelect(suggestion)}
              className={cn(
                "grid w-full rounded-md text-left transition",
                compact ? "gap-0.5 px-2 py-1.5 text-[11px] leading-snug" : "gap-1 px-3 py-2 text-sm",
                highlighted
                  ? "bg-red-600 text-white"
                  : "hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <span className="font-semibold leading-snug">
                {formatAccountSuggestionLabel(suggestion)}
              </span>
              {suggestion.country ? (
                <span
                  className={cn(
                    compact ? "text-[9px]" : "text-xs",
                    highlighted ? "text-white/75" : "text-muted-foreground"
                  )}
                >
                  {suggestion.country}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
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

function parseSearchEntries(filters: Pick<ReportFilters, "accountId" | "metaAccountId" | "googleAccountId" | "tiktokAccountId">): Array<{
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

  splitAccountIdList(filters.tiktokAccountId).forEach((value) => {
    entries.push({ platform: "tiktok", accountId: value });
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
  tiktokAccountId: string;
} {
  const metaIds: string[] = [];
  const googleIds: string[] = [];
  const tiktokIds: string[] = [];

  entries.forEach((entry) => {
    const trimmed = entry.accountId.trim();
    if (!trimmed) {
      return;
    }

    if (entry.platform === "meta") {
      metaIds.push(trimmed);
      return;
    }

    if (entry.platform === "tiktok") {
      tiktokIds.push(trimmed);
      return;
    }

    googleIds.push(trimmed);
  });

  return {
    accountId: "",
    metaAccountId: metaIds.join(","),
    googleAccountId: googleIds.join(","),
    tiktokAccountId: tiktokIds.join(","),
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

  if (lowered.startsWith("tiktok:") || lowered.startsWith("tt:")) {
    return { platform: "tiktok", accountId: trimmed.split(":").slice(1).join(":").trim() };
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
  const prefixed = /^(meta|m|google|g|tiktok|tt)\s*:\s*(.+)$/i.exec(trimmed);

  if (prefixed) {
    const prefix = prefixed[1].toLowerCase();
    return {
      platform: prefix === "google" || prefix === "g" ? "google" : prefix === "tiktok" || prefix === "tt" ? "tiktok" : "meta",
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

function hasAccountFilters(filters: Pick<ReportFilters, "accountId" | "metaAccountId" | "googleAccountId" | "tiktokAccountId">) {
  return Boolean(filters.accountId || filters.metaAccountId || filters.googleAccountId || filters.tiktokAccountId);
}

function toReportAccountFilters(account: RememberedReportAccount): Partial<ReportFilters> {
  return {
    accountId: "",
    metaAccountId: account.platform === "meta" ? account.accountId : "",
    googleAccountId: account.platform === "google" ? account.accountId : "",
    tiktokAccountId: account.platform === "tiktok" ? account.accountId : "",
    platform: account.platform,
  };
}
