import type { ManagementPerformancePoint } from "@/lib/ads-management/management-performance";
import type { PreviewManagementPerformancePoint } from "@/lib/reporting/types";

export function toTikTokManagementPerformancePoints(
  points: readonly PreviewManagementPerformancePoint[],
): ManagementPerformancePoint[] {
  return points.map((point) => ({
    date: point.date,
    cost: point.spend,
    results: point.results,
    clicks: point.engagements ?? point.clicks,
  }));
}
