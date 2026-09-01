import type { PreviewManagementPerformancePoint } from "@/lib/reporting/types";
import { getManagementMetricVocabulary } from "@/lib/ads-management/unified-management";

export type MetaDailyPerformanceInput = PreviewManagementPerformancePoint & {
  entityId: string;
};

export function getMetaManagementPerformanceLabels() {
  const vocabulary = getManagementMetricVocabulary("meta");
  return {
    cost: vocabulary.spend,
    results: vocabulary.results,
    clicks: vocabulary.activity,
    costPerResult: vocabulary.costPerResult,
  };
}

export function groupMetaDailyPerformance(
  rows: readonly MetaDailyPerformanceInput[],
): Map<string, PreviewManagementPerformancePoint[]> {
  const byEntity = new Map<string, PreviewManagementPerformancePoint[]>();
  for (const row of rows) {
    const current = byEntity.get(row.entityId) ?? [];
    byEntity.set(row.entityId, mergeMetaDailyPerformanceSeries([current, [row]]));
  }
  return byEntity;
}

export function mergeMetaDailyPerformanceSeries(
  series: ReadonlyArray<ReadonlyArray<PreviewManagementPerformancePoint> | null | undefined>,
): PreviewManagementPerformancePoint[] {
  const byDate = new Map<string, PreviewManagementPerformancePoint>();
  for (const points of series) {
    for (const point of points ?? []) {
      if (!point.date) continue;
      const current = byDate.get(point.date);
      byDate.set(point.date, {
        date: point.date,
        spend: (current?.spend ?? 0) + point.spend,
        results: (current?.results ?? 0) + point.results,
        clicks: (current?.clicks ?? 0) + point.clicks,
        resultLabel:
          !current || current.resultLabel === point.resultLabel
            ? point.resultLabel
            : "Results",
      });
    }
  }
  return Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date));
}

export function resolveMetaManagementCostPerResult(
  summaries: ReadonlyArray<{
    resultLabel: string;
    results: number;
    costPerResult: number | null;
  } | null | undefined>,
): number | undefined {
  const valid = summaries.filter((summary): summary is {
    resultLabel: string;
    results: number;
    costPerResult: number;
  } => Boolean(
    summary &&
    summary.results > 0 &&
    typeof summary.costPerResult === "number" &&
    Number.isFinite(summary.costPerResult) &&
    summary.costPerResult > 0,
  ));
  if (valid.length === 0) return undefined;

  const labels = new Set(valid.map((summary) => summary.resultLabel.trim().toLowerCase()));
  if (labels.size !== 1) return undefined;

  const totalResults = valid.reduce((sum, summary) => sum + summary.results, 0);
  return valid.reduce(
    (sum, summary) => sum + summary.costPerResult * summary.results,
    0,
  ) / totalResults;
}
