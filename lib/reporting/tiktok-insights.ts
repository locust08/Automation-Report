import { computeDelta } from "@/lib/reporting/metrics";
import { listFrom, splitTikTokReportDateRange, totalPages } from "@/lib/tiktok/worker-reporting";
import type { TikTokAdsActionName } from "@/lib/tiktok/ads-actions";
import type { SummaryMetric } from "@/lib/reporting/types";

type JsonRecord = Record<string, unknown>;

export interface TikTokCoreTotals {
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
}

export interface TikTokTopAd {
  adId: string;
  adName: string;
  thumbnailUrl: string | null;
  impressions: number;
  spend: number;
  reach: number;
}

export interface TikTokPublicPostMedia {
  thumbnailUrl: string | null;
  publicPostUrl: string;
}

export interface TikTokDeviceOsRow {
  key: string;
  label: string;
  impressions: number;
  share: number;
}

export type TikTokTopAdMetric = "impressions" | "spend" | "reach";

export interface TikTokInsightsPayload {
  account: {
    advertiserId: string;
    advertiserName: string;
    currency: string;
    timezone: string;
    apiVersion: "v1.3";
    requestProvenance: "tiktok_api_v1.3";
  };
  totals: TikTokCoreTotals;
  topAds: TikTokTopAd[];
  deviceOs: TikTokDeviceOsRow[];
  warnings: string[];
  providerRequestIds: string[];
}

export interface TikTokInsightsClient {
  request(action: TikTokAdsActionName | string, input: Record<string, unknown>): Promise<{ data: unknown; requestId?: string }>;
}

function ratio(numerator: number | null, denominator: number | null, multiplier = 1): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return (numerator / denominator) * multiplier;
}

function summaryMetric(
  key: string,
  label: string,
  value: number | null,
  previousValue: number | null,
  format: SummaryMetric["format"],
): SummaryMetric {
  return {
    key,
    label,
    value,
    previousValue,
    delta: value === null || previousValue === null ? null : computeDelta(value, previousValue),
    format,
  };
}

export function buildTikTokCoreSummary(current: TikTokCoreTotals, previous: TikTokCoreTotals): SummaryMetric[] {
  return [
    summaryMetric("spend", "Ads Spent", current.spend, previous.spend, "currency"),
    summaryMetric("impressions", "Impressions", current.impressions, previous.impressions, "number"),
    summaryMetric("reach", "Reach", current.reach, previous.reach, "number"),
    summaryMetric("cpm", "CPM", ratio(current.spend, current.impressions, 1000), ratio(previous.spend, previous.impressions, 1000), "currency"),
    summaryMetric("ctr", "CTR (destination)", ratio(current.clicks, current.impressions, 100), ratio(previous.clicks, previous.impressions, 100), "percent"),
  ];
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? value as JsonRecord : {};
}

function osLabel(raw: string): { key: string; label: string } {
  const normalized = raw.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (normalized.includes("ANDROID")) return { key: "android", label: "Android" };
  if (normalized === "IOS" || normalized.includes("IPHONE")) return { key: "ios", label: "iOS" };
  if (normalized.includes("IPAD")) return { key: "ipad", label: "iPad" };
  if (normalized.includes("WEB") || normalized === "WAP") return { key: "web", label: "Web" };
  return { key: normalized.toLowerCase() || "unknown", label: normalized && normalized !== "UNKNOWN" ? raw : "Unknown" };
}

export function normalizeTikTokDeviceOsRows(rows: JsonRecord[]): TikTokDeviceOsRow[] {
  const totals = new Map<string, { label: string; impressions: number }>();
  for (const row of rows) {
    const dimensions = asRecord(row.dimensions);
    const metrics = asRecord(row.metrics);
    const os = osLabel(String(dimensions.platform ?? dimensions.operating_system ?? row.platform ?? "UNKNOWN"));
    const impressions = Number(metrics.impressions ?? row.impressions);
    if (!Number.isFinite(impressions) || impressions < 0) continue;
    const current = totals.get(os.key) ?? { label: os.label, impressions: 0 };
    current.impressions += impressions;
    totals.set(os.key, current);
  }
  const grandTotal = Array.from(totals.values()).reduce((sum, row) => sum + row.impressions, 0);
  return Array.from(totals.entries())
    .map(([key, row]) => ({
      key,
      label: row.label,
      impressions: row.impressions,
      share: grandTotal > 0 ? (row.impressions / grandTotal) * 100 : 0,
    }))
    .sort((a, b) => b.impressions - a.impressions || a.label.localeCompare(b.label));
}

export function rankTikTokTopAds(ads: TikTokTopAd[], metric: TikTokTopAdMetric): TikTokTopAd[] {
  return [...ads]
    .sort((a, b) => b[metric] - a[metric] || a.adName.localeCompare(b.adName) || a.adId.localeCompare(b.adId))
    .slice(0, 3);
}

function finite(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowMetric(row: JsonRecord, name: string): number | null {
  return finite(asRecord(row.metrics)[name] ?? row[name]);
}

function rowDimension(row: JsonRecord, name: string): string {
  return String(asRecord(row.dimensions)[name] ?? row[name] ?? "").trim();
}

function nestedValue(row: JsonRecord, keys: string[]): unknown {
  for (const key of keys) {
    const direct = row[key];
    if (direct !== undefined && direct !== null && direct !== "") return direct;
  }
  for (const value of Object.values(row)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object") {
          const nested = nestedValue(item as JsonRecord, keys);
          if (nested !== undefined && nested !== null && nested !== "") return nested;
        }
      }
    } else if (value && typeof value === "object") {
      const nested = nestedValue(value as JsonRecord, keys);
      if (nested !== undefined && nested !== null && nested !== "") return nested;
    }
  }
  return undefined;
}

async function fetchPaginated(
  client: TikTokInsightsClient,
  action: TikTokAdsActionName,
  input: Record<string, unknown>,
  requestIds: string[],
): Promise<JsonRecord[]> {
  const rows: JsonRecord[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const response = await client.request(action, { ...input, page, page_size: 1000 });
    if (response.requestId) requestIds.push(response.requestId);
    rows.push(...listFrom(response.data));
    if (page >= totalPages(response.data, page)) break;
  }
  return rows;
}

async function fetchReportWindows(
  client: TikTokInsightsClient,
  input: {
    advertiserId: string;
    startDate: string;
    endDate: string;
    reportType: "BASIC" | "AUDIENCE";
    dataLevel: string;
    dimensions: string[];
    metrics: string[];
  },
  requestIds: string[],
): Promise<JsonRecord[]> {
  const rows: JsonRecord[] = [];
  for (const window of splitTikTokReportDateRange(input.startDate, input.endDate)) {
    rows.push(...await fetchPaginated(client, "report.sync", {
      advertiser_id: input.advertiserId,
      report_type: input.reportType,
      data_level: input.dataLevel,
      dimensions: input.dimensions,
      metrics: input.metrics,
      start_date: window.startDate,
      end_date: window.endDate,
    }, requestIds));
  }
  return rows;
}

function aggregateTotals(rows: JsonRecord[]): TikTokCoreTotals {
  return rows.reduce<TikTokCoreTotals>((totals, row) => ({
    spend: (totals.spend ?? 0) + (rowMetric(row, "spend") ?? 0),
    impressions: (totals.impressions ?? 0) + (rowMetric(row, "impressions") ?? 0),
    reach: (totals.reach ?? 0) + (rowMetric(row, "reach") ?? 0),
    clicks: (totals.clicks ?? 0) + (rowMetric(row, "clicks") ?? 0),
  }), { spend: 0, impressions: 0, reach: 0, clicks: 0 });
}

export async function fetchTikTokCoreTotalsWithClient(
  client: TikTokInsightsClient,
  input: { advertiserId: string; startDate: string; endDate: string },
  requestIds: string[] = [],
): Promise<TikTokCoreTotals> {
  const rows = await fetchPaginated(client, "report.sync", {
    advertiser_id: input.advertiserId,
    report_type: "BASIC",
    data_level: "AUCTION_ADVERTISER",
    dimensions: ["advertiser_id"],
    metrics: ["spend", "impressions", "clicks", "reach"],
    start_date: input.startDate,
    end_date: input.endDate,
  }, requestIds);
  return aggregateTotals(rows);
}

function mediaUrl(row: JsonRecord): string | null {
  for (const value of [row.cover_url, row.video_cover_url, row.thumbnail_url, row.preview_url, row.image_url, row.poster_url]) {
    if (typeof value === "string" && /^https:\/\//i.test(value)) return value;
  }
  for (const value of Object.values(row)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = mediaUrl(value as JsonRecord);
      if (nested) return nested;
    }
  }
  return null;
}

function recordsFrom(data: unknown, keys: string[]): JsonRecord[] {
  const record = asRecord(data);
  const nested = asRecord(record.data);
  for (const key of keys) {
    const value = record[key] ?? nested[key];
    if (Array.isArray(value)) return value.filter((row): row is JsonRecord => Boolean(row) && typeof row === "object");
  }
  return [];
}

function sparkItemId(item: JsonRecord): string {
  return String(item.item_id ?? asRecord(item.item_info).item_id ?? "").trim();
}

export async function fetchTikTokInsightsWithClient(
  client: TikTokInsightsClient,
  input: {
    advertiserId: string;
    advertiserName: string;
    currency: string;
    timezone: string;
    startDate: string;
    endDate: string;
    resolvePublicThumbnail?: (itemId: string) => Promise<string | null>;
  },
): Promise<TikTokInsightsPayload> {
  const providerRequestIds: string[] = [];
  const warnings: string[] = [];

  let totals: TikTokCoreTotals = { spend: null, impressions: null, reach: null, clicks: null };
  try {
    totals = await fetchTikTokCoreTotalsWithClient(client, input, providerRequestIds);
  } catch {
    warnings.push("TikTok performance totals are unavailable for this date range.");
  }

  let topAds: TikTokTopAd[] = [];
  try {
    const reportRows = await fetchReportWindows(client, {
      advertiserId: input.advertiserId,
      startDate: input.startDate,
      endDate: input.endDate,
      reportType: "BASIC",
      dataLevel: "AUCTION_AD",
      dimensions: ["ad_id"],
      metrics: ["spend", "impressions", "reach"],
    }, providerRequestIds);
    const adObjects = await fetchPaginated(client, "ad.list", {
      advertiser_id: input.advertiserId,
      fields: ["ad_id", "ad_name", "creative_type", "identity_id", "identity_type", "tiktok_item_id", "video_id"],
    }, providerRequestIds);
    const adsById = new Map(adObjects.map((ad) => [String(ad.ad_id ?? ""), ad]));
    const candidates = reportRows.flatMap((row): TikTokTopAd[] => {
      const adId = rowDimension(row, "ad_id");
      if (!adId) return [];
      const ad = adsById.get(adId) ?? {};
      return [{
        adId,
        adName: String(ad.ad_name ?? adId),
        thumbnailUrl: mediaUrl(ad),
        impressions: rowMetric(row, "impressions") ?? 0,
        spend: rowMetric(row, "spend") ?? 0,
        reach: rowMetric(row, "reach") ?? 0,
      }];
    });
    topAds = rankTikTokTopAds(candidates, "impressions");
    const videoIds = topAds.flatMap((topAd) => {
      const videoId = nestedValue(adsById.get(topAd.adId) ?? {}, ["video_id"]);
      return typeof videoId === "string" && videoId ? [videoId] : [];
    });
    if (videoIds.length > 0) {
      try {
        const response = await client.request("asset.video-search", {
          advertiser_id: input.advertiserId,
          filtering: { video_ids: videoIds },
          page: 1,
          page_size: 100,
        });
        if (response.requestId) providerRequestIds.push(response.requestId);
        const videos = new Map(listFrom(response.data).map((video) => [String(video.video_id ?? ""), video]));
        topAds = topAds.map((topAd) => {
          const videoId = nestedValue(adsById.get(topAd.adId) ?? {}, ["video_id"]);
          const video = typeof videoId === "string" ? videos.get(videoId) : undefined;
          return { ...topAd, thumbnailUrl: topAd.thumbnailUrl ?? (video ? mediaUrl(video) : null) };
        });
      } catch {
        warnings.push("Some TikTok creative media is unavailable.");
      }
    }
    const itemIds = topAds.flatMap((topAd) => {
      const itemId = nestedValue(adsById.get(topAd.adId) ?? {}, ["tiktok_item_id", "item_id"]);
      return typeof itemId === "string" && itemId ? [itemId] : [];
    });
    if (itemIds.length > 0 && topAds.some((ad) => !ad.thumbnailUrl)) {
      try {
        const sparkRows: JsonRecord[] = [];
        for (let page = 1; page <= 100; page += 1) {
          const response = await client.request("spark.list", {
            advertiser_id: input.advertiserId,
            page,
            page_size: 100,
          });
          if (response.requestId) providerRequestIds.push(response.requestId);
          sparkRows.push(...recordsFrom(response.data, ["item_list", "list"]));
          if (page >= totalPages(response.data, page)) break;
        }
        const wanted = new Set(itemIds);
        const sparkItems = new Map(sparkRows.filter((item) => wanted.has(sparkItemId(item))).map((item) => [sparkItemId(item), item]));
        topAds = topAds.map((topAd) => {
          const itemId = nestedValue(adsById.get(topAd.adId) ?? {}, ["tiktok_item_id", "item_id"]);
          const item = typeof itemId === "string" ? sparkItems.get(itemId) : undefined;
          return { ...topAd, thumbnailUrl: topAd.thumbnailUrl ?? (item ? mediaUrl(item) : null) };
        });
      } catch {
        warnings.push("Some TikTok Spark media is unavailable.");
      }
    }
    if (itemIds.length > 0 && topAds.some((ad) => !ad.thumbnailUrl)) {
      const resolvePublicThumbnail = input.resolvePublicThumbnail ?? fetchPublicTikTokThumbnail;
      topAds = await Promise.all(topAds.map(async (topAd) => {
        if (topAd.thumbnailUrl) return topAd;
        const itemId = nestedValue(adsById.get(topAd.adId) ?? {}, ["tiktok_item_id", "item_id"]);
        if (typeof itemId !== "string" || !/^\d{10,32}$/.test(itemId)) return topAd;
        return { ...topAd, thumbnailUrl: await resolvePublicThumbnail(itemId) };
      }));
    }
    if (topAds.length > 0 && topAds.every((ad) => Boolean(ad.thumbnailUrl))) {
      const sparkWarningIndex = warnings.indexOf("Some TikTok Spark media is unavailable.");
      if (sparkWarningIndex >= 0) warnings.splice(sparkWarningIndex, 1);
    }
  } catch {
    warnings.push("TikTok Top Ads are unavailable for this date range.");
  }

  let deviceOs: TikTokDeviceOsRow[] = [];
  try {
    const audienceRows = await fetchReportWindows(client, {
      advertiserId: input.advertiserId,
      startDate: input.startDate,
      endDate: input.endDate,
      reportType: "AUDIENCE",
      dataLevel: "AUCTION_ADVERTISER",
      dimensions: ["platform"],
      metrics: ["impressions"],
    }, providerRequestIds);
    deviceOs = normalizeTikTokDeviceOsRows(audienceRows);
  } catch {
    warnings.push("TikTok Device OS data is unavailable for this date range.");
  }

  return {
    account: {
      advertiserId: input.advertiserId,
      advertiserName: input.advertiserName,
      currency: input.currency,
      timezone: input.timezone,
      apiVersion: "v1.3",
      requestProvenance: "tiktok_api_v1.3",
    },
    totals,
    topAds,
    deviceOs,
    warnings,
    providerRequestIds: Array.from(new Set(providerRequestIds)),
  };
}

export async function fetchPublicTikTokPostMedia(itemId: string): Promise<TikTokPublicPostMedia | null> {
  if (!/^\d{10,32}$/.test(itemId)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const postUrl = `https://www.tiktok.com/@_/video/${encodeURIComponent(itemId)}`;
    const response = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(postUrl)}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = asRecord(await response.json());
    const thumbnailUrl = mediaUrl(payload);
    const authorUrl = typeof payload.author_url === "string" && /^https:\/\/(?:www\.)?tiktok\.com\/@/i.test(payload.author_url)
      ? payload.author_url.replace(/\/$/, "")
      : "https://www.tiktok.com/@_";
    return {
      thumbnailUrl,
      publicPostUrl: `${authorUrl}/video/${encodeURIComponent(itemId)}`,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPublicTikTokThumbnail(itemId: string): Promise<string | null> {
  return (await fetchPublicTikTokPostMedia(itemId))?.thumbnailUrl ?? null;
}
