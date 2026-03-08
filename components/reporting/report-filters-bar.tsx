"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  IdCardIcon,
  RefreshCcwIcon,
  SearchIcon,
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
  showMetaGoogleFields?: boolean;
  showResetButton?: boolean;
  submitLabel?: string;
  compact?: boolean;
}

export function ReportFiltersBar({
  filters,
  onApply,
  onReset,
  includePlatform = false,
  dateMode = "range",
  showDateFilters = true,
  showMetaGoogleFields = true,
  showResetButton = true,
  submitLabel = "Load Report",
  compact = false,
}: ReportFiltersBarProps) {
  const [accountId, setAccountId] = useState(filters.accountId);
  const [metaAccountId, setMetaAccountId] = useState(filters.metaAccountId);
  const [googleAccountId, setGoogleAccountId] = useState(filters.googleAccountId);
  const [startDate, setStartDate] = useState(filters.startDate);
  const [endDate, setEndDate] = useState(filters.endDate);
  const [selectedMonth, setSelectedMonth] = useState(toMonthValue(filters.startDate));
  const [platform, setPlatform] = useState(filters.platform);

  useEffect(() => {
    setAccountId(filters.accountId);
    setMetaAccountId(filters.metaAccountId);
    setGoogleAccountId(filters.googleAccountId);
    setStartDate(filters.startDate);
    setEndDate(filters.endDate);
    setSelectedMonth(toMonthValue(filters.startDate));
    setPlatform(filters.platform);
  }, [filters]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const monthDateRange = toMonthDateRange(selectedMonth);

    onApply({
      accountId: accountId.trim(),
      metaAccountId: metaAccountId.trim(),
      googleAccountId: googleAccountId.trim(),
      startDate: dateMode === "month" ? monthDateRange.startDate : startDate,
      endDate: dateMode === "month" ? monthDateRange.endDate : endDate,
      platform,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-2xl border border-border/40 bg-card/90 p-4 shadow-sm",
        compact && "gap-2 border-white/20 bg-white/90 p-3 shadow-none"
      )}
    >
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 md:min-w-[280px]">
        <IdCardIcon className="size-4 text-muted-foreground" />
        <Input
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          className="h-10 border-0 shadow-none focus-visible:ring-0"
          placeholder={compact ? "Ad Account ID" : "Ad Account ID (auto-fill URL: ?accountId=...)"}
        />
      </label>

      {showMetaGoogleFields ? (
        <Input
          value={metaAccountId}
          onChange={(event) => setMetaAccountId(event.target.value)}
          className="h-10 md:w-[250px]"
          placeholder="Meta Account ID (optional override)"
        />
      ) : null}

      {showMetaGoogleFields ? (
        <Input
          value={googleAccountId}
          onChange={(event) => setGoogleAccountId(event.target.value)}
          className="h-10 md:w-[250px]"
          placeholder="Google Ads ID (optional override)"
        />
      ) : null}

      {showDateFilters && dateMode === "month" ? (
        <div className="flex min-w-0 items-center gap-2 rounded-md border border-input bg-background px-2 md:w-[260px]">
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
          <label className="flex min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 md:w-[220px]">
            <CalendarDaysIcon className="size-4 text-muted-foreground" />
            <Input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="h-10 border-0 shadow-none focus-visible:ring-0"
              aria-label="Start date"
            />
          </label>

          <label className="flex min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 md:w-[220px]">
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
          <SelectTrigger className="h-10 w-full md:w-[180px]">
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

      <div className="ml-auto flex items-center gap-2">
        <Button type="submit" className="h-10 bg-red-600 hover:bg-red-700">
          <SearchIcon data-icon="inline-start" />
          {submitLabel}
        </Button>
        {showResetButton ? (
          <Button type="button" variant="outline" className="h-10" onClick={onReset}>
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
