"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDaysIcon, ChevronDownIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Calendar02 } from "@/components/shadcn-studio/calendar/calendar-02";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { selectDateRangeDay } from "@/lib/reporting/date-range-selection";
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
  variant = "header",
  densePopover = false,
  className,
}: {
  startDate: string;
  endDate: string;
  onChange: (next: { startDate: string; endDate: string }) => void;
  variant?: "header" | "compact";
  densePopover?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [smallScreen, setSmallScreen] = useState(true);
  const [draftStartDate, setDraftStartDate] = useState(normalizeIsoDate(startDate));
  const [draftEndDate, setDraftEndDate] = useState<string | null>(normalizeIsoDate(endDate));
  const [draftRange, setDraftRange] = useState<DateRange>(() => ({
    from: parseIsoDate(startDate),
    to: parseIsoDate(endDate),
  }));
  const [rangeSelectionStart, setRangeSelectionStart] = useState<Date | null>(null);
  const [preset, setPreset] = useState<DatePreset>("custom");
  const compact = variant === "compact";

  const normalizedCurrent = useMemo(
    () => normalizeDateRange(startDate, endDate),
    [startDate, endDate]
  );
  const dateLabel = useMemo(
    () => `${formatLabelDate(normalizedCurrent.startDate)} - ${formatLabelDate(normalizedCurrent.endDate)}`,
    [normalizedCurrent.endDate, normalizedCurrent.startDate]
  );
  const compactDateLabel = useMemo(
    () => formatCompactDateRange(normalizedCurrent.startDate, normalizedCurrent.endDate),
    [normalizedCurrent.endDate, normalizedCurrent.startDate]
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const updateScreen = () => setSmallScreen(media.matches);
    updateScreen();
    media.addEventListener("change", updateScreen);
    return () => media.removeEventListener("change", updateScreen);
  }, []);

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
    if (!draftEndDate) {
      return;
    }
    applyRange(draftStartDate, draftEndDate);
    setOpen(false);
  }

  function handleCalendarDayClick(day: Date) {
    setPreset("custom");
    const next = selectDateRangeDay(
      {
        startDate: draftStartDate,
        endDate: draftEndDate,
        selectionStart: rangeSelectionStart ? toIsoDate(rangeSelectionStart) : null,
      },
      toIsoDate(day),
    );
    setDraftStartDate(next.startDate);
    setDraftEndDate(next.endDate);
    setRangeSelectionStart(next.selectionStart ? parseIsoDate(next.selectionStart) : null);
    setDraftRange({
      from: parseIsoDate(next.startDate),
      to: next.endDate ? parseIsoDate(next.endDate) : undefined,
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
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

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <div
        className={cn(
          "relative flex max-w-full items-center text-[#5f5f5f]",
          compact
            ? "h-9 w-auto min-w-0 gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 shadow-none"
            : "h-auto w-full gap-1 rounded-2xl bg-[#d9d9d9] p-1.5 shadow-sm sm:h-12 sm:min-w-[340px] sm:w-auto",
          className,
        )}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex min-w-0 flex-1 items-center text-left",
              compact ? "gap-1.5 rounded-md px-1.5 py-0.5" : "gap-2 rounded-xl px-2 py-1",
              open && (compact ? "bg-slate-50" : "bg-white/70")
            )}
            aria-label="Open date range picker"
            aria-expanded={open}
          >
            <CalendarDaysIcon className={cn("text-[#7a7a7a]", compact ? "size-3.5" : "size-4")} />
            <span className={cn("truncate font-semibold leading-none text-[#5f5f5f]", compact ? "text-xs" : "text-sm sm:text-base")}>
              {compact ? compactDateLabel : dateLabel}
            </span>
            <ChevronDownIcon
              className={cn("ml-auto text-[#7a7a7a]", compact ? "size-3.5" : "size-4")}
              data-report-export-exclude="true"
            />
          </button>
        </PopoverTrigger>

        {open ? (
          <PopoverContent
            align="end"
            sideOffset={8}
            collisionPadding={12}
            data-report-date-picker="true"
            aria-label="Select date range"
            className={cn(
              "z-50 max-h-[var(--radix-popover-content-available-height)] w-[min(22rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] overflow-auto rounded-2xl border bg-white p-0 shadow-[0_12px_32px_rgba(0,0,0,0.18)]",
              densePopover ? "rounded-xl md:w-[480px]" : "md:w-[560px]"
            )}
          >
            <div className={cn("flex items-center justify-between border-b max-[399px]:flex-col max-[399px]:items-stretch", densePopover ? "gap-2 p-2.5" : "gap-3 p-3")}>
              <div>
                <p className={cn("font-semibold text-foreground", densePopover ? "text-xs" : "text-sm")}>Select date range</p>
                <p className={cn("text-muted-foreground", densePopover ? "max-w-48 text-[10px] leading-3.5" : "text-xs")}>
                  Choose a preset or select dates from the calendar.
                </p>
              </div>
              <label className="flex shrink-0 items-center justify-end">
                <span className="sr-only">Quick date range</span>
                <Select
                  value={preset}
                  onValueChange={(value) => handlePresetChange(value as DatePreset)}
                >
                  <SelectTrigger
                    aria-label="Quick date range"
                    className={cn("bg-white max-[399px]:w-full", densePopover ? "h-8 w-28 text-xs" : "w-36")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="end">
                    <SelectItem value="custom">Custom</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="last7Days">Last 7 days</SelectItem>
                    <SelectItem value="last30Days">Last 30 days</SelectItem>
                    <SelectItem value="thisMonth">This month</SelectItem>
                    <SelectItem value="lastMonth">Last month</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>

            <div className={cn(densePopover ? "space-y-2 p-2" : "space-y-3 p-3")}>
              <Calendar02
                mode="range"
                timeZone="UTC"
                defaultMonth={parseIsoDate(draftStartDate)}
                numberOfMonths={smallScreen ? 1 : 2}
                pagedNavigation
                selected={draftRange}
                // onSelect keeps DayPicker controlled so its highlights match the draft.
              onSelect={(_range, day) => handleCalendarDayClick(day)}
                classNames={densePopover ? { caption_label: "whitespace-nowrap text-[10px] font-medium select-none" } : undefined}
                className={cn(
                  "mx-auto w-fit",
                  compact && "border-0 shadow-none [&_.rdp-months]:gap-1",
                  densePopover && "p-1 text-xs [--cell-size:1.75rem] [&_.rdp-months]:gap-2 [&_.rdp-month]:gap-2 [&_.rdp-week]:mt-1"
                )}
              />

              <div className={cn(densePopover ? "flex flex-wrap items-center justify-between gap-2" : "gap-3", !densePopover && (compact ? "flex items-center justify-between" : "space-y-3"))}>
                <div className={cn("flex items-center text-muted-foreground", densePopover ? "gap-1 text-[10px]" : "gap-2 text-sm", !compact && "justify-center")}>
                  <span>{formatLabelDate(draftStartDate)}</span>
                  <span aria-hidden="true">→</span>
                  <span>{draftEndDate ? formatLabelDate(draftEndDate) : "Select end date"}</span>
                </div>

                <div className={cn("gap-2", compact ? "flex shrink-0 items-center" : "flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end")}>
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(densePopover ? "h-8 px-2.5 text-xs" : "h-9 px-4", "text-[#6f6f6f]", !compact && "w-full sm:w-auto")}
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
                    className={cn(densePopover ? "h-8 px-2.5 text-xs" : "h-9 px-4", !compact && "w-full sm:w-auto")}
                    onClick={applyDraftRange}
                    disabled={!draftRange.from || !draftRange.to || !draftEndDate}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          </PopoverContent>
        ) : null}
      </div>
    </Popover>
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

function formatCompactDateRange(startDate: string, endDate: string): string {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth();

  if (sameMonth) {
    const month = new Intl.DateTimeFormat("en-US", {
      month: "short",
      timeZone: "UTC",
    }).format(start);
    return `${month} ${start.getUTCDate()}–${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }

  return `${formatLabelDate(startDate)} – ${formatLabelDate(endDate)}`;
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
