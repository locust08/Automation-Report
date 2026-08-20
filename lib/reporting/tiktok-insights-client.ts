export interface TikTokTopAdView {
  adId: string;
  adName: string;
  thumbnailUrl: string | null;
  impressions: number;
  spend: number;
  reach: number;
}

export type TikTokTopAdMetric = "impressions" | "spend" | "reach";

export function rankTikTokTopAdsForDisplay<T extends TikTokTopAdView>(ads: T[], metric: TikTokTopAdMetric): T[] {
  return [...ads]
    .sort((a, b) => b[metric] - a[metric] || a.adName.localeCompare(b.adName) || a.adId.localeCompare(b.adId))
    .slice(0, 3);
}
