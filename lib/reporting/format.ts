import { MetricFormat } from "@/lib/reporting/types";

export function formatMetricValue(value: number | null, format: MetricFormat): string {
  if (value === null || !Number.isFinite(value)) {
    return "No Data";
  }

  if (format === "currency") {
    return new Intl.NumberFormat("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  if (format === "percent") {
    return new Intl.NumberFormat("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  return new Intl.NumberFormat("en-MY", {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDelta(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "No baseline";
  }
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(abs);
  return `${value >= 0 ? "+" : "-"} ${formatted}%`;
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-MY", {
    maximumFractionDigits: 2,
  }).format(value);
}
