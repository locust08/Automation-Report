export type AdSortMetric = "clicks" | "ctr" | "cpc" | "views";

/** Stable numeric ordering; unavailable values remain last in either direction. */
export function sortAdsByMetric<T extends { metrics: Partial<Record<AdSortMetric, number | null>> }>(rows: T[], metric: AdSortMetric, ascending: boolean): T[] {
  return [...rows].sort((a,b) => {
    const left=a.metrics[metric], right=b.metrics[metric];
    const leftValid=typeof left === "number" && Number.isFinite(left);
    const rightValid=typeof right === "number" && Number.isFinite(right);
    if (!leftValid) return rightValid ? 1 : 0;
    if (!rightValid) return -1;
    return ascending ? left-right : right-left;
  });
}
