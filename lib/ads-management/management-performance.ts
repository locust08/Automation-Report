export type ManagementPerformancePoint = {
  date: string;
  cost: number;
  results: number;
  clicks: number;
};

export type ManagementPerformanceTotals = {
  cost: number;
  results: number;
  clicks: number;
  costPerResult: number;
};

type ManagementPerformanceSummaryOptions = {
  costPerResult?: number | null;
};

export function toGoogleManagementPerformancePoints(
  rows: ReadonlyArray<{
    date: string;
    costMicros: number | string;
    conversions: number | string;
    clicks: number | string;
  }>,
): ManagementPerformancePoint[] {
  return rows
    .map((row) => ({
      date: row.date,
      cost: Number(row.costMicros) / 1_000_000,
      results: Number(row.conversions) || 0,
      clicks: Number(row.clicks) || 0,
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function summarizeManagementPerformance(
  points: readonly ManagementPerformancePoint[],
  options: ManagementPerformanceSummaryOptions = {},
): ManagementPerformanceTotals {
  const totals = points.reduce(
    (current, point) => ({
      cost: current.cost + point.cost,
      results: current.results + point.results,
      clicks: current.clicks + point.clicks,
    }),
    { cost: 0, results: 0, clicks: 0 },
  );
  return {
    ...totals,
    costPerResult:
      typeof options.costPerResult === "number" && Number.isFinite(options.costPerResult)
        && options.costPerResult > 0
        ? options.costPerResult
        : totals.results > 0
          ? totals.cost / totals.results
          : 0,
  };
}

export function addManagementCostPerResult(
  points: readonly ManagementPerformancePoint[],
  authoritativeCostPerResult?: number | null,
): Array<ManagementPerformancePoint & { costPerResult: number }> {
  const rawTotals = summarizeManagementPerformance(points);
  const scale =
    typeof authoritativeCostPerResult === "number" &&
    Number.isFinite(authoritativeCostPerResult) &&
    authoritativeCostPerResult > 0 &&
    rawTotals.costPerResult > 0
      ? authoritativeCostPerResult / rawTotals.costPerResult
      : 1;

  return points.map((point) => ({
    ...point,
    costPerResult: point.results > 0 ? (point.cost / point.results) * scale : 0,
  }));
}

export function formatManagementCostPerResult(value: number, currencyCode = "MYR"): string {
  const decimals = value > 0 && value < 0.01 ? 4 : 2;
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value).replaceAll("\u00a0", " ");
}
