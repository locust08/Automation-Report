"use client";

import { useMemo, useState } from "react";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ReportDateSelection =
  | { mode: "single"; date: string }
  | { mode: "range"; startDate: string; endDate: string };

type ReportDatePickerProps = {
  value: ReportDateSelection;
  onChange: (value: ReportDateSelection) => void;
  maxDate?: string;
};

const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export function ReportDatePicker({ value, onChange, maxDate = malaysiaToday() }: ReportDatePickerProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(getAnchorDate(value, maxDate)));
  const [rangeStart, setRangeStart] = useState<string | null>(null);

  const summary = useMemo(() => {
    if (value.mode === "single") return formatDisplayDate(value.date);
    if (value.startDate === value.endDate) return formatDisplayDate(value.startDate);
    return `${formatDisplayDate(value.startDate)} to ${formatDisplayDate(value.endDate)}`;
  }, [value]);

  const maxMonth = startOfMonth(parseDate(maxDate));
  const canGoNext = startOfMonth(addMonths(visibleMonth, 1)) <= maxMonth;

  function handleDaySelect(day: string) {
    if (!rangeStart) {
      onChange({ mode: "single", date: day });
      setRangeStart(day);
      return;
    }
    if (day === rangeStart) onChange({ mode: "single", date: day });
    else {
      const [startDate, endDate] = day < rangeStart ? [day, rangeStart] : [rangeStart, day];
      onChange({ mode: "range", startDate, endDate });
    }
    setRangeStart(null);
  }

  const months = [addMonths(visibleMonth, -1), visibleMonth];

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Select report date</p>
          <p className="text-xs text-muted-foreground">Choose one day, or click a second day to create a range.</p>
        </div>
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors",
            value.mode === "range" && "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
          )}
        >
          <CalendarIcon className="size-4" />
          <span className="font-medium text-foreground">{summary}</span>
        </div>
      </div>

      <div className="p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="shrink-0"
              onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
              aria-label="Previous month"
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <div className="text-sm font-semibold text-foreground">
              {formatMonthYear(addMonths(visibleMonth, -1))} and {formatMonthYear(visibleMonth)}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="shrink-0"
              onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
              disabled={!canGoNext}
              aria-label="Next month"
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {months.map((month) => (
              <CalendarMonth
                key={monthKey(month)}
                month={month}
                selection={value}
                pendingRangeStart={rangeStart}
                maxDate={maxDate}
                onSelectDay={handleDaySelect}
              />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              {rangeStart
                ? "Start date selected. Choose another date for a range, or generate now for this single date."
                : value.mode === "range"
                  ? "Date range selected. Click another date to start a new selection."
                  : "Single date selected. Click another date to begin a new selection."}
            </p>
          </div>
        </div>
    </div>
  );
}

function CalendarMonth({
  month,
  selection,
  pendingRangeStart,
  maxDate,
  onSelectDay,
}: {
  month: Date;
  selection: ReportDateSelection;
  pendingRangeStart: string | null;
  maxDate: string;
  onSelectDay: (date: string) => void;
}) {
  const days = buildCalendarDays(month);
  const rangeStart = selection.mode === "range" ? selection.startDate : null;
  const rangeEnd = selection.mode === "range" ? selection.endDate : null;
  const singleDate = selection.mode === "single" ? selection.date : null;
  const monthPrefix = monthKey(month);

  return (
    <div className="rounded-xl border border-border bg-background p-3 shadow-xs">
      <div className="mb-3 text-center text-sm font-semibold text-foreground">{formatMonthYear(month)}</div>
      <div className="grid grid-cols-7 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {WEEKDAY_LABELS.map((label, index) => <div key={`${label}-${index}`} className="pb-2">{label}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => {
          if (!day) return <div key={`blank-${index}`} className="aspect-square" />;

          const disabled = day > maxDate;
          const isSelectedSingle = singleDate === day;
          const isSelectedStart = rangeStart === day;
          const isSelectedEnd = rangeEnd === day;
          const inRange = Boolean(rangeStart && rangeEnd && day > rangeStart && day < rangeEnd);
          const isMonthDay = day.startsWith(monthPrefix);

          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              onClick={() => onSelectDay(day)}
              className={cn(
                "aspect-square rounded-md text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40",
                isMonthDay ? "hover:bg-accent hover:text-accent-foreground" : "text-muted-foreground/50",
                isSelectedSingle || isSelectedStart || isSelectedEnd || pendingRangeStart === day
                  ? "bg-red-600 font-semibold text-white shadow-sm hover:bg-red-700 hover:text-white"
                  : inRange
                    ? "bg-red-100 font-medium text-red-900 hover:bg-red-200 hover:text-red-900"
                    : "",
              )}
              aria-pressed={isSelectedSingle || isSelectedStart || isSelectedEnd || inRange}
            >
              <span className="flex size-full items-center justify-center rounded-md">
                {Number(day.slice(-2))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function buildCalendarDays(month: Date) {
  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells: Array<string | null> = [];

  for (let index = 0; index < firstWeekday; index += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(formatDateString(new Date(Date.UTC(year, monthIndex, day, 12))));

  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function getAnchorDate(value: ReportDateSelection, maxDate: string) {
  if (value.mode === "single") return parseDate(value.date);
  if (value.mode === "range") return parseDate(value.startDate);
  return parseDate(maxDate);
}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function formatDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(value: string) {
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: MALAYSIA_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parseDate(value));
}

function formatMonthYear(value: Date) {
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: MALAYSIA_TIME_ZONE,
    month: "long",
    year: "numeric",
  }).format(value);
}

function malaysiaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MALAYSIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function startOfMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1, 12));
}

function addMonths(value: Date, amount: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + amount, 1, 12));
}

function monthKey(value: Date) {
  return `${String(value.getUTCFullYear())}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}
