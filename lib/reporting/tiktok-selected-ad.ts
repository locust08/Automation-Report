import type { TikTokSelectedAdDailyPoint, TikTokSelectedAdDetail, TikTokSelectedAdMetrics } from "@/lib/reporting/types";

type JsonRecord = Record<string, unknown>;

export interface TikTokSelectedAdMetadata {
  adId: string;
  adName: string;
  currency: string;
  timezone: string;
  identityName?: string | null;
  identityType?: string | null;
  source?: string | null;
  durationSeconds?: number | null;
  aggregateMetrics?: JsonRecord | null;
  warnings?: string[];
  providerRequestIds?: string[];
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" ? value as JsonRecord : {};
}

function finite(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function metric(metrics: JsonRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const parsed = finite(metrics[key]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function sumNullable(values: Array<number | null>): number | null {
  const available = values.filter((value): value is number => value !== null);
  return available.length ? available.reduce((sum, value) => sum + value, 0) : null;
}

function ratio(numerator: number | null, denominator: number | null, multiplier = 1): number | null {
  return numerator !== null && denominator !== null && denominator > 0 ? (numerator / denominator) * multiplier : null;
}

function metricsFrom(source: JsonRecord): TikTokSelectedAdMetrics {
  const spend = metric(source, "spend");
  const impressions = metric(source, "impressions");
  const reach = metric(source, "reach");
  const destinationClicks = metric(source, "clicks", "destination_clicks", "clicks_on_destination");
  const allClicks = metric(source, "engagements", "clicks");
  const videoViews = metric(source, "video_play_actions", "video_views", "video_play");
  return {
    spend,
    impressions,
    reach,
    frequency: ratio(impressions, reach),
    destinationClicks,
    allClicks,
    destinationCtr: ratio(destinationClicks, impressions, 100),
    allClickCtr: ratio(allClicks, impressions, 100),
    destinationCpc: ratio(spend, destinationClicks),
    cpm: ratio(spend, impressions, 1000),
    videoViews,
  };
}

export function normalizeTikTokSelectedAdReport(rows: JsonRecord[], metadata: TikTokSelectedAdMetadata): TikTokSelectedAdDetail {
  const byDate = new Map<string, JsonRecord[]>();
  for (const row of rows) {
    const date = String(record(row.dimensions).stat_time_day ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    byDate.set(date, [...(byDate.get(date) ?? []), record(row.metrics)]);
  }

  const daily = Array.from(byDate.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([date, items]): TikTokSelectedAdDailyPoint => {
    const aggregate: JsonRecord = {};
    for (const key of ["spend", "impressions", "reach", "clicks", "engagements", "destination_clicks", "video_play_actions"]) {
      const value = sumNullable(items.map((item) => metric(item, key)));
      if (value !== null) aggregate[key] = value;
    }
    return { date, ...metricsFrom(aggregate) };
  });

  const dailyAggregate: JsonRecord = {};
  for (const key of ["spend", "impressions", "clicks", "engagements", "destination_clicks", "video_play_actions"]) {
    const value = sumNullable(rows.map((row) => metric(record(row.metrics), key)));
    if (value !== null) dailyAggregate[key] = value;
  }
  if (daily.length === 1 && daily[0]?.reach !== null) dailyAggregate.reach = daily[0]?.reach;

  return {
    adId: metadata.adId,
    adName: metadata.adName,
    identityName: metadata.identityName ?? null,
    identityType: metadata.identityType ?? null,
    source: metadata.source ?? null,
    durationSeconds: metadata.durationSeconds ?? null,
    currency: metadata.currency,
    timezone: metadata.timezone,
    metrics: metricsFrom({ ...dailyAggregate, ...record(metadata.aggregateMetrics) }),
    daily,
    warnings: metadata.warnings ?? [],
    providerRequestIds: metadata.providerRequestIds ?? [],
  };
}
