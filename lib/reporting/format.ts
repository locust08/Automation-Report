import { MetricFormat } from "@/lib/reporting/types";

export function formatMetricValue(
  value: number | null,
  format: MetricFormat,
  displayValue?: string
): string {
  if (displayValue) {
    return displayValue;
  }

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

export function formatCpcRinggit(value: number | null | undefined): string {
 return value == null || !Number.isFinite(value) ? "—" : `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatAccountCurrency(value: number | null | undefined, currency?: string): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const amount = value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency === "MYR" ? "RM" : currency || ""} ${amount}`.trim();
}
