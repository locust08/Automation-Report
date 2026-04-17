"use client";

import { FormEvent, MutableRefObject, useEffect, useRef, useState } from "react";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  IdCardIcon,
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
}

type SearchPlatform = "meta" | "google";

interface SearchEntry {
  key: string;
  platform: SearchPlatform;
  accountId: string;
}

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
      },
    ]);
  }

  function updateSearchRow(key: string, next: Partial<Omit<SearchEntry, "key">>) {
    setSearchEntries((prev) =>
      prev.map((entry) => (entry.key === key ? { ...entry, ...next } : entry))
    );
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

            <label className="flex w-full min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 sm:w-auto">
              <IdCardIcon className="size-4 text-muted-foreground" />
              <Input
                value={entry.accountId}
                onChange={(event) => updateSearchRow(entry.key, { accountId: event.target.value })}
                className="h-10 border-0 shadow-none focus-visible:ring-0"
                placeholder="Account ID"
              />
            </label>

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

      <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:items-start">
        <Button type="submit" className="h-10 w-full bg-red-600 hover:bg-red-700 sm:w-auto">
          <SearchIcon data-icon="inline-start" />
          {submitLabel}
        </Button>
        {showResetButton ? (
          <Button type="button" variant="outline" className="h-10 w-full sm:w-auto" onClick={onReset}>
            <RefreshCcwIcon data-icon="inline-start" />
            Reset
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function toMonthValue(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value.slice(0, 7);
  }

  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toMonthDateRange(monthValue: string): { startDate: string; endDate: string } {
  if (!/^\d{4}-\d{2}$/.test(monthValue)) {
    const fallback = toMonthValue(new Date().toISOString().slice(0, 10));
    return toMonthDateRange(fallback);
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
