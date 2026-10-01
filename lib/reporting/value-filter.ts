import type { CampaignRow, PreviewPerformanceSummary } from "./types";

export const valueMetrics = ["impressions", "videoViews", "clicks", "ctr", "cpm", "results", "costPerResult", "spend"] as const;
export type ValueMetric = typeof valueMetrics[number];
export type ValueFilter = { metric: ValueMetric; operator: "gt" | "gte" | "lt" | "lte" | "eq" | "between" | "unavailable"; value: number; upper: number };
export function performanceValue(row: CampaignRow | PreviewPerformanceSummary | null | undefined, metric: ValueMetric): number | null {
  if (!row) return null;
  if ("unavailableMetrics" in row && row.unavailableMetrics?.includes(metric)) return null;
  if ("resultsAvailable" in row && row.resultsAvailable === false && (metric === "results" || metric === "costPerResult")) return null;
  const unavailable = "unavailableMetrics" in row ? row.unavailableMetrics ?? [] : [];
  if ((metric === "ctr" || metric === "cpm") && (row.impressions <= 0 || unavailable.includes("impressions"))) return null;
  if (metric === "ctr" && unavailable.includes("clicks")) return null;
  if ((metric === "cpm" || metric === "costPerResult") && unavailable.includes("spend")) return null;
  if (metric === "costPerResult" && row.results <= 0) return null;
  const value = row[metric];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
export function matchesValueFilter(row: CampaignRow | PreviewPerformanceSummary | null | undefined, filter: ValueFilter | null): boolean {
  if (!filter) return true;
  const value = performanceValue(row, filter.metric);
  if (filter.operator === "unavailable") return value === null;
  if (value === null) return false;
  switch (filter.operator) {
    case "gt": return value > filter.value;
    case "gte": return value >= filter.value;
    case "lt": return value < filter.value;
    case "lte": return value <= filter.value;
    case "eq": return value === filter.value;
    case "between": return value >= filter.value && value <= filter.upper;
  }
}
export function levelTotals(rows: (CampaignRow | PreviewPerformanceSummary | null | undefined)[]): PreviewPerformanceSummary | null {
  if (!rows.length) return null;
  const sum = (metric: ValueMetric) => {
    const values = rows.map((row) => performanceValue(row, metric));
    return values.some((value) => value === null) ? null : values.reduce<number>((total, value) => total + value!, 0);
  };
  const impressions = sum("impressions"), clicks = sum("clicks"), spend = sum("spend"), results = sum("results");
  const costRows = rows.filter((row) => row && row.results > 0 && row.spend > 0 && row.costPerResult != null && row.costPerResult > 0);
  const costScale = costRows.length && costRows.every((row) => Math.abs(row!.costPerResult! * row!.results / row!.spend - 1000) < 5) ? 1000 : 1;
  return { resultLabel: "Results", resultsAvailable: results !== null, results: results ?? 0, impressions: impressions ?? 0, clicks: clicks ?? 0, spend: spend ?? 0, videoViews: sum("videoViews"),
    unavailableMetrics: [impressions === null ? "impressions" : "", clicks === null ? "clicks" : "", spend === null ? "spend" : "", impressions === null || clicks === null || impressions === 0 ? "ctr" : ""].filter(Boolean),
    ctr: impressions && clicks !== null ? clicks / impressions * 100 : 0, cpm: impressions && spend !== null ? spend / impressions * 1000 : null, cpc: clicks && spend !== null ? spend / clicks : null,
    costPerResult: results && spend !== null ? spend * costScale / results : null, landingPageViews: 0, linkClicks: 0 };
}

export function parseValueFilter(raw: string | null): ValueFilter | null {
  try {
    const value = JSON.parse(raw ?? "null") as ValueFilter | null;
    if (!value || !valueMetrics.includes(value.metric) || !["gt", "gte", "lt", "lte", "eq", "between", "unavailable"].includes(value.operator)) return null;
    if (value.operator !== "unavailable" && (!Number.isFinite(value.value) || (value.operator === "between" && (!Number.isFinite(value.upper) || value.upper < value.value)))) return null;
    return value;
  } catch { return null; }
}
