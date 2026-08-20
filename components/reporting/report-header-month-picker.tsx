"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDaysIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Calendar02 } from "@/components/shadcn-studio/calendar/calendar-02";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DatePreset =
  | "custom"
  | "today"
  | "yesterday"
  | "last7Days"
  | "last30Days"
  | "thisMonth"
  | "lastMonth";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function ReportHeaderMonthPicker({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (next: { startDate: string; endDate: string }) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draftStartDate, setDraftStartDate] = useState(normalizeIsoDate(startDate));
  const [draftEndDate, setDraftEndDate] = useState(normalizeIsoDate(endDate));
  const [draftRange, setDraftRange] = useState<DateRange>(() => ({
    from: parseIsoDate(startDate),
    to: parseIsoDate(endDate),
  }));
  const [rangeSelectionStart, setRangeSelectionStart] = useState<Date | null>(null);
  const [preset, setPreset] = useState<DatePreset>("custom");

  const normalizedCurrent = useMemo(
    () => normalizeDateRange(startDate, endDate),
    [startDate, endDate]
  );
  const dateLabel = useMemo(
    () => `${formatLabelDate(normalizedCurrent.startDate)} - ${formatLabelDate(normalizedCurrent.endDate)}`,
    [normalizedCurrent.endDate, normalizedCurrent.startDate]
  );

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!open) {
        return;
      }
      const target = event.target as Node | null;
      if (containerRef.current && target && !containerRef.current.contains(target)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function applyRange(nextStartDate: string, nextEndDate: string) {
    onChange(normalizeDateRange(nextStartDate, nextEndDate));
  }

  function handlePresetChange(nextPreset: DatePreset) {
    setPreset(nextPreset);
    if (nextPreset === "custom") {
      return;
    }

    const next = getPresetRange(nextPreset);
    setDraftStartDate(next.startDate);
    setDraftEndDate(next.endDate);
    setDraftRange({
      from: parseIsoDate(next.startDate),
      to: parseIsoDate(next.endDate),
    });
    setRangeSelectionStart(null);
  }

  function applyDraftRange() {
    applyRange(draftStartDate, draftEndDate);
    setOpen(false);
  }

  function handleCalendarDayClick(day: Date) {
    setPreset("custom");
    if (!rangeSelectionStart) {
      setRangeSelectionStart(day);
      setDraftRange({ from: day, to: undefined });
      setDraftStartDate(toCalendarIsoDate(day));
      return;
    }

    const from = day < rangeSelectionStart ? day : rangeSelectionStart;
    const to = day < rangeSelectionStart ? rangeSelectionStart : day;
    setDraftRange({ from, to });
    setDraftStartDate(toCalendarIsoDate(from));
    setDraftEndDate(toCalendarIsoDate(to));
    setRangeSelectionStart(null);
  }

  function togglePicker() {
    if (open) {
      setOpen(false);
      return;
    }

    setDraftStartDate(normalizedCurrent.startDate);
    setDraftEndDate(normalizedCurrent.endDate);
    setDraftRange({
      from: parseIsoDate(normalizedCurrent.startDate),
      to: parseIsoDate(normalizedCurrent.endDate),
    });
    setRangeSelectionStart(null);
    setPreset("custom");
    setOpen(true);
  }

  function shiftRange(direction: -1 | 1) {
    if (isFullCalendarMonthRange(normalizedCurrent.startDate, normalizedCurrent.endDate)) {
      const currentStart = parseIsoDate(normalizedCurrent.startDate);
      const monthOffset = direction;
      const shiftedStart = new Date(
        Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() + monthOffset, 1)
      );
      const shiftedEnd = new Date(
        Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() + monthOffset + 1, 0)
      );
      applyRange(toIsoDate(shiftedStart), toIsoDate(shiftedEnd));
      return;
    }

    const dayCount = getInclusiveDayCount(normalizedCurrent.startDate, normalizedCurrent.endDate);
    const offset = dayCount * direction;
    const shiftedStart = toIsoDate(addDays(parseIsoDate(normalizedCurrent.startDate), offset));
    const shiftedEnd = toIsoDate(addDays(parseIsoDate(normalizedCurrent.endDate), offset));
    applyRange(shiftedStart, shiftedEnd);
  }

  return (
    <div
      ref={containerRef}
      className="relative flex h-auto w-full max-w-full items-center gap-1 rounded-2xl bg-[#d9d9d9] p-1.5 text-[#5f5f5f] shadow-sm sm:h-12 sm:min-w-[340px] sm:w-auto"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="h-8 w-8 shrink-0 text-[#6f6f6f]"
        onClick={() => shiftRange(-1)}
        aria-label="Previous date range"
        data-report-export-exclude="true"
      >
        <ChevronLeftIcon className="size-4" />
      </Button>

      <button
        type="button"
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1 text-left",
          open && "bg-white/70"
        )}
        onClick={togglePicker}
        aria-label="Open date range picker"
        aria-expanded={open}
      >
        <CalendarDaysIcon className="size-4 text-[#7a7a7a]" />
        <span className="truncate text-sm font-semibold leading-none text-[#5f5f5f] sm:text-base">{dateLabel}</span>
        <ChevronDownIcon
          className="ml-auto size-4 text-[#7a7a7a]"
          data-report-export-exclude="true"
        />
      </button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="h-8 w-8 shrink-0 text-[#6f6f6f]"
        onClick={() => shiftRange(1)}
        aria-label="Next date range"
        data-report-export-exclude="true"
      >
        <ChevronRightIcon className="size-4" />
      </Button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 max-h-[min(680px,calc(100vh-6rem))] w-[600px] max-w-[calc(100vw-2rem)] overflow-auto rounded-2xl border bg-white shadow-[0_12px_32px_rgba(0,0,0,0.18)] sm:left-auto sm:right-0">
          <div className="flex items-center justify-between gap-3 border-b p-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Select date range</p>
              <p className="text-xs text-muted-foreground">Choose a preset or select dates from the calendar.</p>
            </div>
            <label className="flex shrink-0 items-center justify-end">
              <span className="sr-only">Quick date range</span>
              <select
                value={preset}
                onChange={(event) => handlePresetChange(event.target.value as DatePreset)}
                className="h-9 rounded-md border bg-background px-3 text-sm font-medium text-foreground outline-none ring-offset-background focus:ring-2 focus:ring-ring"
                aria-label="Quick date range"
              >
                <option value="custom">
                  Custom
                </option>
                <option value="today">
                  Today
                </option>
                <option value="yesterday">
                  Yesterday
                </option>
                <option value="last7Days">
                  Last 7 days
                </option>
                <option value="last30Days">
                  Last 30 days
                </option>
                <option value="thisMonth">
                  This month
                </option>
                <option value="lastMonth">
                  Last month
                </option>
              </select>
            </label>
          </div>

          <div className="space-y-3 p-3">
            <Calendar02
              mode="range"
              defaultMonth={parseIsoDate(draftStartDate)}
              selected={draftRange}
              onDayClick={handleCalendarDayClick}
              className="mx-auto w-fit"
            />

            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <span>{formatLabelDate(draftStartDate)}</span>
              <span aria-hidden="true">→</span>
              <span>{formatLabelDate(draftEndDate)}</span>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                className="h-9 w-full px-4 text-[#6f6f6f] sm:w-auto"
                onClick={() => {
                  setDraftStartDate(normalizedCurrent.startDate);
                  setDraftEndDate(normalizedCurrent.endDate);
                  setDraftRange({
                    from: parseIsoDate(normalizedCurrent.startDate),
                    to: parseIsoDate(normalizedCurrent.endDate),
                  });
                  setRangeSelectionStart(null);
                  setPreset("custom");
                  setOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-9 w-full px-4 sm:w-auto"
                onClick={applyDraftRange}
                disabled={!draftRange.from || !draftRange.to}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function normalizeIsoDate(value: string): string {
  if (ISO_DATE_REGEX.test(value)) {
    return value;
  }

  return toIsoDate(new Date());
}

function normalizeDateRange(startDate: string, endDate: string): { startDate: string; endDate: string } {
  const start = normalizeIsoDate(startDate);
  const end = normalizeIsoDate(endDate);

  if (start <= end) {
    return { startDate: start, endDate: end };
  }

  return { startDate: end, endDate: start };
}

function formatLabelDate(value: string): string {
  const date = parseIsoDate(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function getInclusiveDayCount(startDate: string, endDate: string): number {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function isFullCalendarMonthRange(startDate: string, endDate: string): boolean {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  return (
    start.getUTCDate() === 1 &&
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth() &&
    end.getUTCDate() === new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate()
  );
}

function getPresetRange(preset: Exclude<DatePreset, "custom">): { startDate: string; endDate: string } {
  const today = parseIsoDate(toIsoDate(new Date()));

  if (preset === "today") {
    const value = toIsoDate(today);
    return { startDate: value, endDate: value };
  }

  if (preset === "yesterday") {
    const yesterday = addDays(today, -1);
    const value = toIsoDate(yesterday);
    return { startDate: value, endDate: value };
  }

  if (preset === "last7Days") {
    return {
      startDate: toIsoDate(addDays(today, -6)),
      endDate: toIsoDate(today),
    };
  }

  if (preset === "last30Days") {
    return {
      startDate: toIsoDate(addDays(today, -29)),
      endDate: toIsoDate(today),
    };
  }

  if (preset === "thisMonth") {
    const startOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const endOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
    return {
      startDate: toIsoDate(startOfMonth),
      endDate: toIsoDate(endOfMonth),
    };
  }

  const startOfLastMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const endOfLastMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
  return {
    startDate: toIsoDate(startOfLastMonth),
    endDate: toIsoDate(endOfLastMonth),
  };
}

function parseIsoDate(value: string): Date {
  const normalized = normalizeIsoDate(value);
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(Date.UTC(1970, 0, 1));
  }
  return parsed;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDate(date: Date): string {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return utcDate.toISOString().slice(0, 10);
}

function toCalendarIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
