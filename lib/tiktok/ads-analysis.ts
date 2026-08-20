import type { TikTokAdsRequestInput } from "@/lib/tiktok/ads-client";

export const TIKTOK_ANALYSIS_PROFILES = {
  advertiser: {
    report_type: "BASIC",
    data_level: "AUCTION_ADVERTISER",
    dimensions: ["advertiser_id"],
  },
  campaign: {
    report_type: "BASIC",
    data_level: "AUCTION_CAMPAIGN",
    dimensions: ["campaign_id"],
  },
  adgroup: {
    report_type: "BASIC",
    data_level: "AUCTION_ADGROUP",
    dimensions: ["adgroup_id"],
  },
  ad: {
    report_type: "BASIC",
    data_level: "AUCTION_AD",
    dimensions: ["ad_id"],
  },
  creative: {
    report_type: "BASIC",
    data_level: "AUCTION_AD",
    dimensions: ["ad_id"],
    metrics: [
      "spend", "impressions", "clicks", "video_play_actions", "video_watched_2s",
      "video_watched_6s", "video_views_p25", "video_views_p50", "video_views_p75",
      "video_views_p100", "conversion",
    ],
  },
  audience: {
    report_type: "AUDIENCE",
    data_level: "AUCTION_AD",
    dimensions: ["gender", "age"],
  },
  daily: {
    report_type: "BASIC",
    data_level: "AUCTION_CAMPAIGN",
    dimensions: ["campaign_id", "stat_time_day"],
  },
} as const;

export type TikTokAnalysisProfile = keyof typeof TIKTOK_ANALYSIS_PROFILES;

const DEFAULT_METRICS = [
  "spend", "impressions", "clicks", "conversion", "real_time_conversion",
  "total_complete_payment_rate", "total_complete_payment_value",
];

export function buildTikTokAnalysisRequest(params: {
  advertiserId: string;
  profile: TikTokAnalysisProfile;
  startDate: string;
  endDate: string;
  metrics?: string[];
  dimensions?: string[];
  filters?: unknown;
  page?: number;
  pageSize?: number;
}): TikTokAdsRequestInput {
  const profile = TIKTOK_ANALYSIS_PROFILES[params.profile];
  return {
    advertiser_id: params.advertiserId,
    report_type: profile.report_type,
    data_level: profile.data_level,
    dimensions: params.dimensions ?? [...profile.dimensions],
    metrics: params.metrics ?? ("metrics" in profile ? [...profile.metrics] : DEFAULT_METRICS),
    start_date: params.startDate,
    end_date: params.endDate,
    filtering: params.filters,
    page: params.page ?? 1,
    page_size: params.pageSize ?? 1000,
  };
}
function finiteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function summarizeTikTokReport(data: unknown) {
  const rows = data && typeof data === "object" && "list" in data && Array.isArray(data.list)
    ? data.list
    : [];
  const totals: Record<string, number> = {};
  for (const row of rows) {
    if (!row || typeof row !== "object" || !("metrics" in row) || !row.metrics || typeof row.metrics !== "object") {
      continue;
    }
    for (const [metric, raw] of Object.entries(row.metrics)) {
      const value = finiteNumber(raw);
      if (value === undefined) continue;
      totals[metric] = (totals[metric] ?? 0) + value;
    }
  }
  const spend = totals.spend ?? 0;
  const impressions = totals.impressions ?? 0;
  const clicks = totals.clicks ?? 0;
  const conversions = totals.conversion ?? totals.real_time_conversion ?? 0;
  const conversionValue = totals.total_complete_payment_value ?? 0;
  return {
    rowCount: rows.length,
    totals,
    derived: {
      ctr: impressions > 0 ? clicks / impressions : null,
      cpc: clicks > 0 ? spend / clicks : null,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
      cpa: conversions > 0 ? spend / conversions : null,
      roas: spend > 0 ? conversionValue / spend : null,
    },
  };
}

