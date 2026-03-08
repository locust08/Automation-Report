import { DateRangeConfig } from "@/lib/reporting/types";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value || !ISO_DATE_REGEX.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return isValidDate(parsed) ? parsed : null;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatHumanDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function buildDateRange(
  startDateParam: string | null,
  endDateParam: string | null
): DateRangeConfig {
  const now = new Date();
  const defaultStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const defaultEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

  const parsedStart = parseIsoDate(startDateParam) ?? defaultStart;
  const parsedEnd = parseIsoDate(endDateParam) ?? defaultEnd;

  const startDate = parsedStart <= parsedEnd ? parsedStart : parsedEnd;
  const endDate = parsedStart <= parsedEnd ? parsedEnd : parsedStart;

  const dayCount =
    Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const previousEndDate = addDays(startDate, -1);
  const previousStartDate = addDays(previousEndDate, -(dayCount - 1));

  return {
    startDate: toIsoDate(startDate),
    endDate: toIsoDate(endDate),
    previousStartDate: toIsoDate(previousStartDate),
    previousEndDate: toIsoDate(previousEndDate),
    currentLabel: `${formatHumanDate(startDate)} - ${formatHumanDate(endDate)}`,
    previousLabel: `${formatHumanDate(previousStartDate)} - ${formatHumanDate(previousEndDate)}`,
  };
}
