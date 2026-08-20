import { TIKTOK_ADS_API_VERSION, type TikTokAdsActionName } from "@/lib/tiktok/ads-actions";
import { createTikTokAdsClient, TikTokAdsApiError, type TikTokLiveAdvertiserInfo } from "@/lib/tiktok/ads-client";
import { listFrom, splitTikTokReportDateRange, totalPages } from "@/lib/tiktok/worker-reporting";
import {
  fetchTikTokCoreTotalsWithClient,
  fetchTikTokInsightsWithClient,
  fetchPublicTikTokPostMedia,
  type TikTokCoreTotals,
  type TikTokInsightsPayload,
  type TikTokPublicPostMedia,
} from "@/lib/reporting/tiktok-insights";
import type { PreviewAdNode, PreviewCampaignNode, PreviewPerformanceSummary } from "@/lib/reporting/types";
import { normalizeTikTokSelectedAdReport } from "@/lib/reporting/tiktok-selected-ad";

type JsonRecord = Record<string, unknown>;

export type TikTokReportLevel = "campaign" | "adgroup" | "ad";

export interface TikTokReportingClient {
  request(action: TikTokAdsActionName, input: Record<string, unknown>): Promise<{ data: unknown; requestId?: string }>;
}

export interface NormalizedTikTokReportRow {
  id: string;
  name: string;
  impressions: number;
  clicks: number;
  spend: number;
  reach: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpm: number;
  costPerResult: number;
  resultLabel?: string;
}

export interface TikTokAccountMetadata {
  advertiserId: string;
  advertiserName: string;
  currency: string;
  timezone: string;
  connectionState: "connected" | "reconnect_required";
  apiVersion: typeof TIKTOK_ADS_API_VERSION;
  providerRequestIds: string[];
  requestProvenance: "tiktok_api_v1.3";
}

export interface TikTokCampaignReportResult {
  rows: NormalizedTikTokReportRow[];
  account: TikTokAccountMetadata;
  totals: TikTokCoreTotals;
}

const LEVEL_CONFIG: Record<TikTokReportLevel, { dataLevel: string; dimension: string }> = {
  campaign: { dataLevel: "AUCTION_CAMPAIGN", dimension: "campaign_id" },
  adgroup: { dataLevel: "AUCTION_ADGROUP", dimension: "adgroup_id" },
  ad: { dataLevel: "AUCTION_AD", dimension: "ad_id" },
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" ? value as JsonRecord : {};
}

function finiteMetric(row: JsonRecord, name: string): number {
  const raw = record(row.metrics)[name] ?? row[name];
  if (raw === undefined || raw === null || raw === "") {
    throw new Error(`TikTok report metric is unavailable: ${name}`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`TikTok report metric is invalid: ${name}`);
  return value;
}

function dimension(row: JsonRecord, name: string): string {
  return String(record(row.dimensions)[name] ?? row[name] ?? "").trim();
}

function divide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export function normalizeTikTokReportRows(
  rows: JsonRecord[],
  idDimension: string,
  names: ReadonlyMap<string, string> = new Map(),
): NormalizedTikTokReportRow[] {
  const totals = new Map<string, Omit<NormalizedTikTokReportRow, "ctr" | "cpc" | "cpm" | "costPerResult" | "resultLabel">>();
  for (const row of rows) {
    const id = dimension(row, idDimension);
    if (!id) continue;
    const current = totals.get(id) ?? {
      id,
      name: names.get(id) ?? id,
      impressions: 0,
      clicks: 0,
      spend: 0,
      reach: 0,
      conversions: 0,
    };
    current.impressions += finiteMetric(row, "impressions");
    current.clicks += finiteMetric(row, "clicks");
    current.spend += finiteMetric(row, "spend");
    current.reach += finiteMetric(row, "reach");
    current.conversions += finiteMetric(row, "result");
    totals.set(id, current);
  }
  return Array.from(totals.values()).map((row) => ({
    ...row,
    ctr: divide(row.clicks * 100, row.impressions),
    cpc: divide(row.spend, row.clicks),
    cpm: divide(row.spend * 1000, row.impressions),
    costPerResult: divide(row.spend, row.conversions),
  }));
}

export async function fetchTikTokReportLevel(
  client: TikTokReportingClient,
  input: {
    advertiserId: string;
    startDate: string;
    endDate: string;
    level: TikTokReportLevel;
    dimensions?: string[];
    metrics?: string[];
    filtering?: unknown;
  },
): Promise<{ rows: JsonRecord[]; requestIds: string[] }> {
  const config = LEVEL_CONFIG[input.level];
  const rows: JsonRecord[] = [];
  const requestIds: string[] = [];
  for (const window of splitTikTokReportDateRange(input.startDate, input.endDate)) {
    for (let page = 1; page <= 100; page += 1) {
      const response = await client.request("report.sync", {
        advertiser_id: input.advertiserId,
        report_type: "BASIC",
        data_level: config.dataLevel,
        dimensions: input.dimensions ?? [config.dimension],
        metrics: input.metrics ?? ["spend", "impressions", "clicks", "result", "reach"],
        filtering: input.filtering,
        start_date: window.startDate,
        end_date: window.endDate,
        page,
        page_size: 1000,
      });
      if (response.requestId) requestIds.push(response.requestId);
      rows.push(...listFrom(response.data));
      if (page >= totalPages(response.data, page)) break;
    }
  }
  return { rows, requestIds };
}

export function isTikTokReconnectError(error: unknown): boolean {
  if (error instanceof TikTokAdsApiError) {
    return error.details.httpStatus === 401 || error.details.httpStatus === 403 || error.details.providerCode === 40001;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /authorization|access token|allowlist|not confirm exact advertiser|missing or revoked/i.test(message);
}

export async function validateTikTokAdvertiser(
  advertiserId: string,
): Promise<{ client: Awaited<ReturnType<typeof createTikTokAdsClient>>; advertiser: TikTokLiveAdvertiserInfo }> {
  if (!/^\d{1,32}$/.test(advertiserId)) {
    throw new Error(`Invalid TikTok advertiser ID: ${advertiserId}`);
  }
  const client = await createTikTokAdsClient();
  const advertiser = await client.getLiveAdvertiserInfo(advertiserId);
  if (advertiser.advertiser_id !== advertiserId) {
    throw new Error(`TikTok did not confirm exact advertiser access: ${advertiserId}`);
  }
  return { client, advertiser };
}

async function fetchAllObjects(
  client: TikTokReportingClient,
  advertiserId: string,
  action: "campaign.list" | "adgroup.list" | "ad.list",
): Promise<JsonRecord[]> {
  const rows: JsonRecord[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const response = await client.request(action, { advertiser_id: advertiserId, page, page_size: 1000 });
    rows.push(...listFrom(response.data));
    if (page >= totalPages(response.data, page)) break;
  }
  return rows;
}

function objectiveResultLabel(value: unknown): string {
  const goal = String(value ?? "").trim().toUpperCase();
  if (goal === "REACH") return "Reach";
  if (goal === "FOLLOWERS") return "Followers";
  if (goal === "PROFILE_VISIT" || goal === "PROFILE_VISITS") return "Profile Visits";
  if (goal === "VIDEO_VIEW" || goal === "VIDEO_VIEWS") return "Video Views";
  if (goal === "CLICK" || goal === "CLICKS") return "Clicks";
  return "Results";
}

export function resolveTikTokCampaignResultRows(input: {
  campaignRows: NormalizedTikTokReportRow[];
  campaignObjects: JsonRecord[];
  adGroupRows: NormalizedTikTokReportRow[];
  adGroupObjects: JsonRecord[];
}): NormalizedTikTokReportRow[] {
  const campaignsById = new Map(
    input.campaignObjects.map((campaign) => [String(campaign.campaign_id ?? "").trim(), campaign]),
  );
  const adGroupsById = new Map(
    input.adGroupObjects.map((adGroup) => [String(adGroup.adgroup_id ?? "").trim(), adGroup]),
  );
  const childResults = new Map<string, { results: number; labels: Set<string> }>();

  for (const row of input.adGroupRows) {
    const adGroup = adGroupsById.get(row.id);
    const campaignId = String(adGroup?.campaign_id ?? "").trim();
    if (!campaignId || row.conversions <= 0) continue;
    const current = childResults.get(campaignId) ?? { results: 0, labels: new Set<string>() };
    current.results += row.conversions;
    current.labels.add(objectiveResultLabel(adGroup?.optimization_goal));
    childResults.set(campaignId, current);
  }

  return input.campaignRows.map((row) => {
    const campaign = campaignsById.get(row.id);
    const objective = String(campaign?.objective_type ?? "").trim().toUpperCase();
    const children = childResults.get(row.id);
    let results = row.conversions;
    let resultLabel = objectiveResultLabel(objective);

    if (objective === "REACH") {
      results = row.reach;
      resultLabel = "Reach";
    } else if (results <= 0 && children?.results) {
      results = children.results;
      resultLabel = children.labels.size === 1 ? Array.from(children.labels)[0] : "Results";
    }

    return {
      ...row,
      conversions: results,
      costPerResult: divide(row.spend, results),
      resultLabel,
    };
  });
}

function previewPerformance(row: NormalizedTikTokReportRow | undefined): PreviewPerformanceSummary | null {
  if (!row) return null;
  return {
    resultLabel: row.resultLabel ?? "Results",
    results: row.conversions,
    spend: row.spend,
    impressions: row.impressions,
    clicks: row.clicks,
    ctr: row.ctr,
    cpc: row.clicks > 0 ? row.cpc : null,
    cpm: row.impressions > 0 ? row.cpm : null,
    costPerResult: row.conversions > 0 ? row.costPerResult : null,
    landingPageViews: 0,
    linkClicks: row.clicks,
  };
}

export async function fetchTikTokPreviewHierarchy(input: {
  advertiserId: string;
  startDate: string;
  endDate: string;
  selectedAdId?: string | null;
}): Promise<{ account: TikTokAccountMetadata; campaigns: PreviewCampaignNode[] }> {
  const { client, advertiser } = await validateTikTokAdvertiser(input.advertiserId);
  const campaigns = await fetchAllObjects(client, input.advertiserId, "campaign.list");
  const adGroups = await fetchAllObjects(client, input.advertiserId, "adgroup.list");
  const ads = await fetchAllObjects(client, input.advertiserId, "ad.list");
  const campaignReport = await fetchTikTokReportLevel(client, { ...input, level: "campaign" });
  const adGroupReport = await fetchTikTokReportLevel(client, { ...input, level: "adgroup" });
  const adReport = await fetchTikTokReportLevel(client, { ...input, level: "ad" });
  const normalizedAdGroupRows = normalizeTikTokReportRows(adGroupReport.rows, "adgroup_id");
  const resolvedCampaignRows = resolveTikTokCampaignResultRows({
    campaignRows: normalizeTikTokReportRows(campaignReport.rows, "campaign_id"),
    campaignObjects: campaigns,
    adGroupRows: normalizedAdGroupRows,
    adGroupObjects: adGroups,
  });
  const campaignMetrics = new Map(resolvedCampaignRows.map((row) => [row.id, row]));
  const adGroupMetrics = new Map(normalizedAdGroupRows.map((row) => [row.id, row]));
  const adMetrics = new Map(normalizeTikTokReportRows(adReport.rows, "ad_id").map((row) => [row.id, row]));
  const selectedAd = input.selectedAdId
    ? ads.find((ad) => String(ad.ad_id ?? "").trim() === input.selectedAdId)
    : null;
  const selectedItemId = String(selectedAd?.tiktok_item_id ?? "").trim();
  const selectedMedia = selectedItemId
    ? await fetchPublicTikTokPostMedia(selectedItemId)
    : null;
  let selectedDetail: PreviewAdNode["tiktokDetail"] = null;
  if (input.selectedAdId && selectedAd) {
    const adName = String(selectedAd.ad_name ?? input.selectedAdId);
    const aggregateRow = adReport.rows.find((row) => dimension(row, "ad_id") === input.selectedAdId);
    const detailMetadata = {
      adId: input.selectedAdId,
      adName,
      currency: advertiser.currency,
      timezone: advertiser.timezone,
      identityName: String(selectedAd.identity_name ?? selectedAd.display_name ?? "").trim() || null,
      identityType: String(selectedAd.identity_type ?? "").trim() || null,
      source: selectedItemId ? "TikTok account (Spark Ad)" : "Your own content",
      durationSeconds: Number.isFinite(Number(selectedAd.video_duration)) ? Number(selectedAd.video_duration) : null,
      aggregateMetrics: record(aggregateRow?.metrics),
    };
    try {
      const dailyInput = {
        ...input,
        level: "ad" as const,
        dimensions: ["ad_id", "stat_time_day"],
        filtering: [{
          field_name: "ad_ids",
          filter_type: "IN",
          filter_value: JSON.stringify([input.selectedAdId]),
        }],
      };
      let dailyReport;
      try {
        dailyReport = await fetchTikTokReportLevel(client, {
          ...dailyInput,
          metrics: ["spend", "impressions", "reach", "clicks", "engagements", "video_play_actions"],
        });
      } catch {
        dailyReport = await fetchTikTokReportLevel(client, {
          ...dailyInput,
          metrics: ["spend", "impressions", "reach", "clicks"],
        });
      }
      selectedDetail = normalizeTikTokSelectedAdReport(dailyReport.rows, {
        ...detailMetadata,
        providerRequestIds: dailyReport.requestIds,
      });
    } catch {
      selectedDetail = normalizeTikTokSelectedAdReport([], {
        ...detailMetadata,
        warnings: ["TikTok daily performance is unavailable for this ad."],
      });
    }
  }

  const nodes: PreviewCampaignNode[] = campaigns.flatMap((campaign) => {
    const campaignId = String(campaign.campaign_id ?? "").trim();
    if (!campaignId) return [];
    return [{
      id: campaignId,
      name: String(campaign.campaign_name ?? campaignId),
      status: String(campaign.operation_status ?? campaign.secondary_status ?? "UNKNOWN"),
      type: "TikTok Auction",
      objective: String(campaign.objective_type ?? ""),
      details: [
        { label: "Objective", value: String(campaign.objective_type ?? "—") },
        { label: "Budget mode", value: String(campaign.budget_mode ?? "—") },
      ],
      performance: previewPerformance(campaignMetrics.get(campaignId)),
      children: adGroups.flatMap((adGroup) => {
        if (String(adGroup.campaign_id ?? "") !== campaignId) return [];
        const adGroupId = String(adGroup.adgroup_id ?? "").trim();
        if (!adGroupId) return [];
        return [{
          id: adGroupId,
          name: String(adGroup.adgroup_name ?? adGroupId),
          status: String(adGroup.operation_status ?? adGroup.secondary_status ?? "UNKNOWN"),
          details: [
            { label: "Placement", value: String(adGroup.placement_type ?? "—") },
            { label: "Optimization", value: String(adGroup.optimization_goal ?? "—") },
          ],
          performance: previewPerformance(adGroupMetrics.get(adGroupId)),
          ads: ads.flatMap((ad) => {
            if (String(ad.adgroup_id ?? "") !== adGroupId) return [];
            const adId = String(ad.ad_id ?? "").trim();
            if (!adId) return [];
            const mediaFields = buildTikTokPreviewMediaFields(
              ad,
              adId === input.selectedAdId ? selectedMedia : null,
            );
            return [{
              id: adId,
              name: String(ad.ad_name ?? adId),
              status: String(ad.operation_status ?? ad.secondary_status ?? "UNKNOWN"),
              details: [
                { label: "Creative type", value: String(ad.creative_type ?? ad.ad_format ?? "Video") },
                ...(ad.ad_text ? [{ label: "Primary text", value: String(ad.ad_text) }] : []),
              ],
              ...mediaFields,
              performance: previewPerformance(adMetrics.get(adId)),
              tiktokDetail: adId === input.selectedAdId ? selectedDetail : null,
            }];
          }),
        }];
      }),
    }];
  });

  return {
    campaigns: nodes,
    account: {
      advertiserId: advertiser.advertiser_id,
      advertiserName: advertiser.advertiser_name,
      currency: advertiser.currency,
      timezone: advertiser.timezone,
      connectionState: "connected",
      apiVersion: TIKTOK_ADS_API_VERSION,
      providerRequestIds: [...campaignReport.requestIds, ...adGroupReport.requestIds, ...adReport.requestIds],
      requestProvenance: "tiktok_api_v1.3",
    },
  };
}

export function buildTikTokPreviewMediaFields(
  ad: JsonRecord,
  media: TikTokPublicPostMedia | null,
): Pick<PreviewAdNode, "creative" | "previewLinks"> {
  const itemId = String(ad.tiktok_item_id ?? "").trim();
  const adName = String(ad.ad_name ?? (itemId || "TikTok ad"));
  const thumbnailUrl = media?.thumbnailUrl ?? null;
  const publicPostUrl = media?.publicPostUrl ?? null;

  return {
    creative: itemId ? {
      id: itemId,
      name: adName,
      body: typeof ad.ad_text === "string" ? ad.ad_text : null,
      mediaType: "video",
      imageUrl: thumbnailUrl,
      thumbnailUrl,
      posterUrl: thumbnailUrl,
      videoPermalinkUrl: publicPostUrl,
      mediaWarning: publicPostUrl ? "Open the TikTok post to play this creative." : null,
    } : null,
    previewLinks: publicPostUrl ? [{
      label: "Open TikTok post",
      url: publicPostUrl,
      publicPostUrl,
      linkKind: "publicPost",
    }] : [],
  };
}

export async function fetchTikTokCampaignReport(input: {
  advertiserId: string;
  startDate: string;
  endDate: string;
}): Promise<TikTokCampaignReportResult> {
  const { client, advertiser } = await validateTikTokAdvertiser(input.advertiserId);
  const [report, adGroupReport, campaigns, adGroups, totals] = await Promise.all([
    fetchTikTokReportLevel(client, { ...input, level: "campaign" }),
    fetchTikTokReportLevel(client, { ...input, level: "adgroup" }),
    fetchAllObjects(client, input.advertiserId, "campaign.list"),
    fetchAllObjects(client, input.advertiserId, "adgroup.list"),
    fetchTikTokCoreTotalsWithClient(client, input).catch((): TikTokCoreTotals => ({
      spend: null,
      impressions: null,
      reach: null,
      clicks: null,
    })),
  ]);
  const names = new Map(
    campaigns.map((campaign) => {
      const id = String(campaign.campaign_id ?? "").trim();
      return [id, String(campaign.campaign_name ?? id).trim() || id];
    }),
  );
  const campaignRows = normalizeTikTokReportRows(report.rows, "campaign_id", names);
  const adGroupRows = normalizeTikTokReportRows(adGroupReport.rows, "adgroup_id");
  return {
    rows: resolveTikTokCampaignResultRows({ campaignRows, campaignObjects: campaigns, adGroupRows, adGroupObjects: adGroups }),
    totals,
    account: {
      advertiserId: advertiser.advertiser_id,
      advertiserName: advertiser.advertiser_name,
      currency: advertiser.currency,
      timezone: advertiser.timezone,
      connectionState: "connected",
      apiVersion: TIKTOK_ADS_API_VERSION,
      providerRequestIds: [...report.requestIds, ...adGroupReport.requestIds],
      requestProvenance: "tiktok_api_v1.3",
    },
  };
}

export async function fetchTikTokInsights(input: {
  advertiserId: string;
  startDate: string;
  endDate: string;
}): Promise<TikTokInsightsPayload> {
  const { client, advertiser } = await validateTikTokAdvertiser(input.advertiserId);
  return fetchTikTokInsightsWithClient(client, {
    ...input,
    advertiserName: advertiser.advertiser_name,
    currency: advertiser.currency,
    timezone: advertiser.timezone,
  });
}
