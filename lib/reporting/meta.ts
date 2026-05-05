import {
  coerceAudienceClicks,
  createAudienceClickBreakdownItem,
  normalizeAudienceAgeLabel,
  normalizeAudienceGenderLabel,
  normalizeAudienceLocationLabel,
  sortAudienceItems,
} from "@/lib/reporting/audience-breakdown";
import { emptyCampaignRow, hasReportableCampaignSpend } from "@/lib/reporting/metrics";
import {
  CampaignRow,
  MetaPreviewBlockDiagnostic,
  MetaPreviewBlockIssue,
  PreviewCampaignNode,
  PreviewCreativeAsset,
  PreviewDemographicRow,
  PreviewDetailField,
  PreviewLinkAsset,
  PreviewPerformanceSummary,
  AudienceClickBreakdownResponse,
  AudienceClickBreakdownItem,
} from "@/lib/reporting/types";

interface MetaFetchInput {
  accountId: string;
  accessToken: string;
  startDate: string;
  endDate: string;
}

interface MetaAccountNameInput {
  accountId: string;
  accessToken: string;
}

interface MetaApiErrorShape {
  message?: string;
  code?: number;
  error_subcode?: number;
}

interface MetaGraphResponse<TItem> {
  data?: TItem[];
  paging?: {
    next?: string;
  };
  error?: MetaApiErrorShape;
}

interface MetaCampaignRow {
  id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  objective?: string;
  buying_type?: string;
  start_time?: string;
  stop_time?: string;
}

interface MetaAdSetRow {
  id?: string;
  name?: string;
  campaign_id?: string;
  status?: string;
  effective_status?: string;
  optimization_goal?: string;
  billing_event?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  end_time?: string;
  bid_strategy?: string;
  destination_type?: string;
  pacing_type?: string[];
  targeting?: {
    age_min?: number;
    age_max?: number;
    genders?: number[];
    geo_locations?: {
      countries?: string[];
    };
    publisher_platforms?: string[];
    facebook_positions?: string[];
    instagram_positions?: string[];
    audience_network_positions?: string[];
    device_platforms?: string[];
    targeting_automation?: {
      advantage_audience?: number;
      advantage_custom_audience?: number;
    };
  };
}

interface MetaAdRow {
  id?: string;
  name?: string;
  adset_id?: string;
  campaign_id?: string;
  status?: string;
  effective_status?: string;
  creative?: {
    id?: string;
    name?: string;
  };
}

interface MetaCreativeRow {
  id?: string;
  name?: string;
  title?: string;
  body?: string;
  image_url?: string;
  thumbnail_url?: string;
  object_type?: string;
  object_story_spec?: {
    link_data?: {
      link?: string;
      message?: string;
      call_to_action?: {
        type?: string;
      };
      name?: string;
      description?: string;
    };
    video_data?: {
      call_to_action?: {
        value?: {
          link?: string;
        };
        type?: string;
      };
      message?: string;
      title?: string;
      image_url?: string;
    };
  };
}

interface MetaInsightRow {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  objective?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  spend?: string;
  age?: string;
  gender?: string;
  actions?: Array<{
    action_type?: string;
    value?: string;
  }>;
  cost_per_action_type?: Array<{
    action_type?: string;
    value?: string;
  }>;
  country?: string;
  region?: string;
  city?: string;
}

interface MetaPreviewResponse {
  data: PreviewCampaignNode[];
  diagnostics: MetaPreviewBlockDiagnostic[];
  warnings: MetaPreviewBlockIssue[];
  fatalErrors: MetaPreviewBlockIssue[];
}

interface ParsedMetaResponse<TData> {
  status: number;
  ok: boolean;
  contentType: string;
  json: TData | null;
  textSnippet: string;
  parseError: string | null;
}

class MetaApiError extends Error {
  code: number | null;
  subcode: number | null;

  constructor(message: string, code?: number, subcode?: number) {
    super(message);
    this.name = "MetaApiError";
    this.code = code ?? null;
    this.subcode = subcode ?? null;
  }
}

const RESULT_ACTION_PRIORITY = [
  "lead",
  "omni_lead",
  "purchase",
  "complete_registration",
  "omni_complete_registration",
  "landing_page_view",
  "link_click",
] as const;

const META_PREVIEW_CAMPAIGN_FIELDS = [
  "id",
  "name",
  "status",
  "effective_status",
  "objective",
  "buying_type",
  "start_time",
  "stop_time",
] as const;

const META_PREVIEW_ADSET_FIELDS = [
  "id",
  "name",
  "campaign_id",
  "status",
  "effective_status",
  "optimization_goal",
  "billing_event",
  "daily_budget",
  "lifetime_budget",
  "start_time",
  "end_time",
  "bid_strategy",
  "destination_type",
] as const;

const META_PREVIEW_AD_FIELDS = [
  "id",
  "name",
  "adset_id",
  "campaign_id",
  "status",
  "effective_status",
  "creative{id,name}",
] as const;

const META_PREVIEW_CREATIVE_FIELDS = [
  "id",
  "name",
  "title",
  "body",
  "image_url",
  "thumbnail_url",
  "object_type",
  "object_story_spec",
] as const;

const META_PREVIEW_INSIGHT_FIELDS = [
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "spend",
  "actions",
  "cost_per_action_type",
] as const;

const META_PREVIEW_DEMOGRAPHIC_FIELDS = [
  "campaign_id",
  "adset_id",
  "ad_id",
  "impressions",
  "clicks",
  "spend",
  "actions",
  "cost_per_action_type",
] as const;

export async function fetchMetaCampaignRows({
  accountId,
  accessToken,
  startDate,
  endDate,
}: MetaFetchInput): Promise<CampaignRow[]> {
  const params = new URLSearchParams({
    access_token: accessToken,
    level: "campaign",
    limit: "200",
    fields: [
      "campaign_id",
      "campaign_name",
      "objective",
      "impressions",
      "clicks",
      "ctr",
      "cpm",
      "spend",
      "actions",
    ].join(","),
    time_range: JSON.stringify({ since: startDate, until: endDate }),
  });

  const rows = await fetchMetaCollection<MetaInsightRow>(
    `https://graph.facebook.com/v22.0/act_${accountId}/insights?${params.toString()}`
  );

  const responseRows: CampaignRow[] = [];
  let totalSpend = 0;
  let maxSpend = 0;

  rows.forEach((item) => {
    const campaignId = item.campaign_id?.trim();
    const impressions = toNumber(item.impressions);
    const clicks = toNumber(item.clicks);
    const spend = toNumber(item.spend);
    totalSpend += spend;
    maxSpend = Math.max(maxSpend, spend);
    const resultMetric = pickResultMetric(item.actions, item.cost_per_action_type);

    const campaignName = item.campaign_name?.trim() || "Untitled Campaign";
    const campaignType = normalizeCampaignType(item.objective, campaignName);
    const row = emptyCampaignRow(
      campaignId ?? `${campaignType}-${campaignName}`,
      "meta",
      campaignType,
      campaignName
    );

    row.impressions = impressions;
    row.clicks = clicks;
    row.spend = spend;
    row.results = resultMetric.value;
    row.ctr = toNumber(item.ctr) || (impressions > 0 ? (clicks * 100) / impressions : 0);
    row.cpm = toNumber(item.cpm) || (impressions > 0 ? (spend * 1000) / impressions : 0);
    row.costPerResult = resultMetric.value > 0 ? spend / resultMetric.value : 0;
    row.avgCpc = clicks > 0 ? spend / clicks : 0;
    row.conversions = resultMetric.value;

    if (hasReportableCampaignSpend(row)) {
      responseRows.push(row);
    }
  });

  console.info(
    `[meta-campaigns] accountId=${accountId} startDate=${startDate} endDate=${endDate} rawRows=${rows.length} reportableRows=${responseRows.length} minSpend=1 totalSpend=${totalSpend.toFixed(2)} maxSpend=${maxSpend.toFixed(2)}`
  );

  return responseRows;
}

export async function fetchMetaAudienceBreakdown({
  accountId,
  accessToken,
  startDate,
  endDate,
}: MetaFetchInput): Promise<AudienceClickBreakdownResponse> {
  const [age, gender, country, region] = await Promise.all([
    fetchMetaAudienceBreakdownDimension({
      accountId,
      accessToken,
      startDate,
      endDate,
      dimension: "age",
    }),
    fetchMetaAudienceBreakdownDimension({
      accountId,
      accessToken,
      startDate,
      endDate,
      dimension: "gender",
    }),
    fetchMetaAudienceBreakdownDimension({
      accountId,
      accessToken,
      startDate,
      endDate,
      dimension: "country",
    }),
    fetchMetaAudienceBreakdownDimension({
      accountId,
      accessToken,
      startDate,
      endDate,
      dimension: "region",
    }),
  ]);

  return {
    age,
    gender,
    location: {
      country,
      region,
      city: [],
    },
  };
}

export async function fetchMetaPreviewData({
  accountId,
  accessToken,
  startDate,
  endDate,
}: MetaFetchInput): Promise<MetaPreviewResponse> {
  const diagnostics: MetaPreviewBlockDiagnostic[] = [];
  const warnings: MetaPreviewBlockIssue[] = [];
  const fatalErrors: MetaPreviewBlockIssue[] = [];

  const campaignsBlock = await runMetaPreviewBlock({
    accountId,
    label: "meta-preview-campaigns",
    required: true,
    fields: [...META_PREVIEW_CAMPAIGN_FIELDS],
    load: () =>
      fetchMetaCampaignCollection({
        accountId,
        accessToken,
        fields: [...META_PREVIEW_CAMPAIGN_FIELDS],
      }),
  });
  diagnostics.push(campaignsBlock.diagnostic);
  if (campaignsBlock.issue) {
    fatalErrors.push(campaignsBlock.issue);
  }

  const adSetsBlock = await runMetaPreviewBlock({
    accountId,
    label: "meta-preview-adsets",
    required: true,
    fields: [...META_PREVIEW_ADSET_FIELDS],
    load: () =>
      fetchMetaAdSetCollection({
        accountId,
        accessToken,
        fields: [...META_PREVIEW_ADSET_FIELDS],
      }),
  });
  diagnostics.push(adSetsBlock.diagnostic);
  if (adSetsBlock.issue) {
    fatalErrors.push(adSetsBlock.issue);
  }

  const adsBlock = await runMetaPreviewBlock({
    accountId,
    label: "meta-preview-ads",
    required: true,
    fields: [...META_PREVIEW_AD_FIELDS],
    load: () =>
      fetchMetaAdCollection({
        accountId,
        accessToken,
        fields: [...META_PREVIEW_AD_FIELDS],
      }),
  });
  diagnostics.push(adsBlock.diagnostic);
  if (adsBlock.issue) {
    fatalErrors.push(adsBlock.issue);
  }

  if (!campaignsBlock.data || !adSetsBlock.data || !adsBlock.data) {
    return { data: [], diagnostics, warnings, fatalErrors };
  }

  const campaigns = campaignsBlock.data;
  const adSets = adSetsBlock.data;
  const ads = adsBlock.data;
  const visibleCampaignIds = new Set(campaigns.map((campaign) => campaign.id).filter(Boolean) as string[]);
  const visibleAdSets = adSets.filter(
    (adSet) =>
      Boolean(
        adSet.id?.trim() &&
          adSet.campaign_id?.trim() &&
          visibleCampaignIds.has(adSet.campaign_id.trim())
      )
  );
  const visibleAdSetIds = new Set(visibleAdSets.map((adSet) => adSet.id?.trim()).filter(Boolean) as string[]);
  const visibleAds = ads.filter(
    (ad) =>
      Boolean(
        ad.id?.trim() &&
          ad.campaign_id?.trim() &&
          ad.adset_id?.trim() &&
          visibleCampaignIds.has(ad.campaign_id.trim()) &&
          visibleAdSetIds.has(ad.adset_id.trim())
      )
  );
  const creativeIds = Array.from(
    new Set(visibleAds.map((ad) => ad.creative?.id?.trim()).filter(Boolean) as string[])
  );

  const creativesBlock = await runMetaPreviewBlock({
    accountId,
    label: "meta-preview-ad-creatives",
    required: false,
    fields: [...META_PREVIEW_CREATIVE_FIELDS],
    load: () => fetchMetaCreativeCollection({ accessToken, creativeIds }),
  });
  diagnostics.push(creativesBlock.diagnostic);
  if (creativesBlock.issue) {
    warnings.push(creativesBlock.issue);
  }

  const previewLinksBlock = await runMetaPreviewBlock({
    accountId,
    label: "meta-preview-preview-links",
    required: false,
    fields: ["body"],
    load: () =>
      fetchMetaPreviewLinks({
        accessToken,
        adIds: visibleAds.map((ad) => ad.id?.trim() || ""),
      }),
  });
  diagnostics.push(previewLinksBlock.diagnostic);
  if (previewLinksBlock.issue) {
    warnings.push(previewLinksBlock.issue);
  }

  const insightsBlock = await runMetaPreviewBlock({
    accountId,
    label: "meta-preview-insights",
    required: false,
    fields: [...META_PREVIEW_INSIGHT_FIELDS],
    load: () =>
      fetchMetaInsightsCollection({
        accountId,
        accessToken,
        startDate,
        endDate,
        breakdowns: [],
        fields: [...META_PREVIEW_INSIGHT_FIELDS],
      }),
  });
  diagnostics.push(insightsBlock.diagnostic);
  if (insightsBlock.issue) {
    warnings.push(insightsBlock.issue);
  }

  const demographicsBlock = await runMetaPreviewBlock({
    accountId,
    label: "meta-preview-demographics",
    required: false,
    fields: [...META_PREVIEW_DEMOGRAPHIC_FIELDS],
    load: () =>
      fetchMetaInsightsCollection({
        accountId,
        accessToken,
        startDate,
        endDate,
        breakdowns: ["age", "gender"],
        fields: [...META_PREVIEW_DEMOGRAPHIC_FIELDS],
      }),
  });
  diagnostics.push(demographicsBlock.diagnostic);
  if (demographicsBlock.issue) {
    warnings.push(demographicsBlock.issue);
  }

  const creativeMap = creativesBlock.data ?? new Map<string, PreviewCreativeAsset>();
  const previewLinkMap = previewLinksBlock.data ?? new Map<string, PreviewLinkAsset[]>();
  const adPerformanceMap = buildPerformanceMap(insightsBlock.data ?? []);
  const adDemographicMap = buildDemographicMap(demographicsBlock.data ?? []);

  const adsByAdSet = new Map<string, PreviewCampaignNode["children"][number]["ads"]>();
  visibleAds.forEach((ad) => {
    const adSetId = ad.adset_id?.trim();
    const adId = ad.id?.trim();
    if (!adSetId || !adId) {
      return;
    }

    const creative = creativeMap.get(ad.creative?.id?.trim() || "");
    const items = adsByAdSet.get(adSetId) ?? [];
    items.push({
      id: adId,
      name: ad.name?.trim() || `Ad ${adId}`,
      status: metaStatus(ad.status, ad.effective_status),
      details: compactDetailFields([
        detailField("Ad ID", adId),
        detailField("Creative", creative?.name ?? ad.creative?.name?.trim()),
        detailField("Creative ID", creative?.id ?? ad.creative?.id?.trim()),
        detailField("Primary text", creative?.body),
        detailField("Headline", creative?.title),
        detailField("Call to action", humanizeMetaValue(creative?.callToActionType || undefined)),
        detailField("Destination URL", creative?.linkUrl),
      ]),
      creative: creative ?? null,
      previewLinks: previewLinkMap.get(adId) ?? [],
      performance: adPerformanceMap.get(adId) ?? null,
      demographics: adDemographicMap.get(adId) ?? [],
      finalUrl: creative?.linkUrl ?? null,
    });
    adsByAdSet.set(adSetId, items);
  });

  const adSetsByCampaign = new Map<string, PreviewCampaignNode["children"]>();
  visibleAdSets.forEach((adSet) => {
    const campaignId = adSet.campaign_id?.trim();
    const adSetId = adSet.id?.trim();
    if (!campaignId || !adSetId) {
      return;
    }

    const items = adSetsByCampaign.get(campaignId) ?? [];
    const adItems = (adsByAdSet.get(adSetId) ?? []).sort((left, right) => left.name.localeCompare(right.name));
    items.push({
      id: adSetId,
      name: adSet.name?.trim() || `Ad Set ${adSetId}`,
      status: metaStatus(adSet.status, adSet.effective_status),
      details: compactDetailFields([
        detailField("Ad Set ID", adSetId),
        detailField("Conversion location", humanizeMetaValue(adSet.destination_type)),
        detailField("Budget", formatBudgetSummary(adSet.daily_budget, adSet.lifetime_budget)),
        detailField("Start date", formatMetaDate(adSet.start_time)),
        detailField("End date", formatMetaDate(adSet.end_time) || "Run as ongoing"),
        detailField("Locations included", formatLocationList(adSet.targeting?.geo_locations?.countries)),
        detailField("Minimum age", formatAgeValue(adSet.targeting?.age_min)),
        detailField("Age suggestion", formatAgeSuggestion(adSet.targeting?.age_min, adSet.targeting?.age_max)),
        detailField("Gender", formatGenderLabel(adSet.targeting?.genders)),
        detailField("Detailed targeting included", adSet.targeting ? "Yes" : null),
        detailField("Targeting expansion", formatTargetingExpansion(adSet.targeting)),
        detailField("Placements", formatPlacementSummary(adSet.targeting)),
        detailField("Performance goal", humanizeMetaValue(adSet.optimization_goal)),
        detailField("Bid strategy", humanizeMetaValue(adSet.bid_strategy)),
        detailField("Delivery type", humanizeMetaValue(adSet.pacing_type?.join(", "))),
        detailField("Billing event", humanizeMetaValue(adSet.billing_event)),
      ]),
      performance: mergePerformanceSummaries(adItems.map((ad) => ad.performance).filter(Boolean)),
      demographics: mergeDemographicRows(adItems.flatMap((ad) => ad.demographics || [])),
      ads: adItems,
    });
    adSetsByCampaign.set(campaignId, items);
  });

  const data: PreviewCampaignNode[] = [];
  campaigns.forEach((campaign) => {
    const campaignId = campaign.id?.trim();
    if (!campaignId) {
      return;
    }

    const children = (adSetsByCampaign.get(campaignId) ?? [])
      .sort((left, right) => left.name.localeCompare(right.name));

    data.push({
      id: campaignId,
      name: campaign.name?.trim() || `Campaign ${campaignId}`,
      status: metaStatus(campaign.status, campaign.effective_status),
      details: compactDetailFields([
        detailField("Campaign ID", campaignId),
        detailField("Objective", humanizeMetaValue(campaign.objective)),
        detailField("Buying Type", humanizeMetaValue(campaign.buying_type)),
        detailField("Start Time", formatMetaDate(campaign.start_time)),
        detailField("Stop Time", formatMetaDate(campaign.stop_time)),
      ]),
      performance: mergePerformanceSummaries(children.map((adSet) => adSet.performance)),
      demographics: mergeDemographicRows(children.flatMap((adSet) => adSet.demographics || [])),
      children,
    });
  });
  data.sort((left, right) => left.name.localeCompare(right.name));

  return {
    data,
    diagnostics,
    warnings,
    fatalErrors,
  };
}

export async function fetchMetaAccountName({
  accountId,
  accessToken,
}: MetaAccountNameInput): Promise<string | null> {
  const endpoint = `https://graph.facebook.com/v22.0/act_${accountId}?fields=name&access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(endpoint, { cache: "no-store" });
  const rawText = await response.text();

  if (!rawText) {
    return null;
  }

  try {
    const json = JSON.parse(rawText) as { name?: string; error?: { message?: string } };
    if (!response.ok || json.error?.message) {
      return null;
    }
    const accountName = json.name?.trim();
    return accountName || null;
  } catch {
    return null;
  }
}

async function fetchMetaCampaignCollection(input: {
  accountId: string;
  accessToken: string;
  fields: string[];
}): Promise<MetaCampaignRow[]> {
  const params = new URLSearchParams({
    access_token: input.accessToken,
    limit: "200",
    fields: input.fields.join(","),
  });

  return fetchMetaCollection<MetaCampaignRow>(
    `https://graph.facebook.com/v22.0/act_${input.accountId}/campaigns?${params.toString()}`
  );
}

async function fetchMetaAdSetCollection(input: {
  accountId: string;
  accessToken: string;
  fields: string[];
}): Promise<MetaAdSetRow[]> {
  const params = new URLSearchParams({
    access_token: input.accessToken,
    limit: "200",
    fields: input.fields.join(","),
  });

  return fetchMetaCollection<MetaAdSetRow>(
    `https://graph.facebook.com/v22.0/act_${input.accountId}/adsets?${params.toString()}`
  );
}

async function fetchMetaAdCollection(input: {
  accountId: string;
  accessToken: string;
  fields: string[];
}): Promise<MetaAdRow[]> {
  const params = new URLSearchParams({
    access_token: input.accessToken,
    limit: "200",
    fields: input.fields.join(","),
  });

  return fetchMetaCollection<MetaAdRow>(
    `https://graph.facebook.com/v22.0/act_${input.accountId}/ads?${params.toString()}`
  );
}

async function fetchMetaCreativeCollection(input: {
  accessToken: string;
  creativeIds: string[];
}): Promise<Map<string, PreviewCreativeAsset>> {
  const assets = new Map<string, PreviewCreativeAsset>();
  const chunks = chunkItems(input.creativeIds.filter(Boolean), 25);

  for (const chunk of chunks) {
    const params = new URLSearchParams({
      access_token: input.accessToken,
      ids: chunk.join(","),
      fields: META_PREVIEW_CREATIVE_FIELDS.join(","),
    });
    const response = await fetch(`https://graph.facebook.com/v22.0/?${params.toString()}`, {
      cache: "no-store",
    });
    const parsed = await parseMetaResponse<Record<string, MetaCreativeRow | { error?: MetaApiErrorShape }>>(
      response
    );

    if (parsed.parseError) {
      throw new MetaApiError(
        `Meta API returned non-JSON response (status ${parsed.status}, content-type ${parsed.contentType || "unknown"}). ${parsed.parseError}. Response starts with: ${parsed.textSnippet}`
      );
    }

    const json = (parsed.json ?? {}) as Record<string, MetaCreativeRow | { error?: MetaApiErrorShape }> & {
      error?: MetaApiErrorShape;
    };
    if (!parsed.ok && json.error) {
      throw new MetaApiError(
        json.error.message ?? `Meta API request failed with status ${parsed.status}.`,
        json.error.code,
        json.error.error_subcode
      );
    }

    for (const creativeId of chunk) {
      const row = json[creativeId];
      if (!row || !isMetaCreativeRow(row)) {
        continue;
      }
      assets.set(creativeId, mapCreativeAsset(row));
    }
  }

  return assets;
}

async function fetchMetaPreviewLinks(input: {
  accessToken: string;
  adIds: string[];
}): Promise<Map<string, PreviewLinkAsset[]>> {
  const linksByAdId = new Map<string, PreviewLinkAsset[]>();

  for (const adId of input.adIds.filter(Boolean)) {
    const params = new URLSearchParams({
      access_token: input.accessToken,
      ad_format: "DESKTOP_FEED_STANDARD",
      fields: "body",
    });

    const response = await fetch(
      `https://graph.facebook.com/v22.0/${adId}/previews?${params.toString()}`,
      { cache: "no-store" }
    );
    const parsed = await parseMetaResponse<MetaGraphResponse<{ body?: string }>>(response);

    if (parsed.parseError) {
      throw new MetaApiError(
        `Meta API returned non-JSON response (status ${parsed.status}, content-type ${parsed.contentType || "unknown"}). ${parsed.parseError}. Response starts with: ${parsed.textSnippet}`
      );
    }

    const json = parsed.json ?? {};
    if (!parsed.ok || json.error) {
      throw new MetaApiError(
        json.error?.message ?? `Meta API request failed with status ${parsed.status}.`,
        json.error?.code,
        json.error?.error_subcode
      );
    }

    const linkAssets = (json.data ?? [])
      .map((item, index) => {
        const url = extractPreviewUrl(item.body);
        if (!url) {
          return null;
        }
        return {
          label: index === 0 ? "Desktop feed preview" : `Preview ${index + 1}`,
          url,
        } satisfies PreviewLinkAsset;
      })
      .filter((item): item is PreviewLinkAsset => Boolean(item));

    if (linkAssets.length > 0) {
      linksByAdId.set(adId, linkAssets);
    }
  }

  return linksByAdId;
}

async function fetchMetaInsightsCollection(input: {
  accountId: string;
  accessToken: string;
  startDate: string;
  endDate: string;
  breakdowns: string[];
  fields: string[];
}): Promise<MetaInsightRow[]> {
  const params = new URLSearchParams({
    access_token: input.accessToken,
    level: "ad",
    limit: "200",
    fields: input.fields.join(","),
    time_range: JSON.stringify({ since: input.startDate, until: input.endDate }),
  });

  if (input.breakdowns.length > 0) {
    params.set("breakdowns", input.breakdowns.join(","));
  }

  return fetchMetaCollection<MetaInsightRow>(
    `https://graph.facebook.com/v22.0/act_${input.accountId}/insights?${params.toString()}`
  );
}

async function fetchMetaAudienceBreakdownDimension(input: {
  accountId: string;
  accessToken: string;
  startDate: string;
  endDate: string;
  dimension: "age" | "gender" | "country" | "region" | "city";
}): Promise<AudienceClickBreakdownItem[]> {
  const breakdownLabel = `[audience-breakdown][meta][${input.dimension}]`;

  try {
    const rows = await fetchMetaInsightsCollection({
      accountId: input.accountId,
      accessToken: input.accessToken,
      startDate: input.startDate,
      endDate: input.endDate,
      breakdowns: [input.dimension],
      fields: ["clicks"],
    });

    const items = sortAudienceItems(
      aggregateMetaAudienceItems(rows, input.dimension),
      input.dimension
    );
    console.info(`${breakdownLabel} accountId=${input.accountId} rows=${items.length}`);
    return items;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Meta audience breakdown request failed.";
    console.warn(`${breakdownLabel} accountId=${input.accountId} message=${JSON.stringify(message)}`);
    return [];
  }
}

function aggregateMetaAudienceItems(
  rows: MetaInsightRow[],
  dimension: "age" | "gender" | "country" | "region" | "city"
): AudienceClickBreakdownItem[] {
  const totals = new Map<string, number>();

  rows.forEach((row) => {
    const clicks = coerceAudienceClicks(row.clicks);
    if (clicks <= 0) {
      return;
    }

    const label = resolveMetaAudienceLabel(row, dimension);
    totals.set(label, (totals.get(label) ?? 0) + clicks);
  });

  return Array.from(totals.entries()).map(([label, clicks]) =>
    createAudienceClickBreakdownItem({
      platform: "meta",
      dimension,
      label,
      clicks,
    })
  );
}

function resolveMetaAudienceLabel(
  row: MetaInsightRow,
  dimension: "age" | "gender" | "country" | "region" | "city"
): string {
  if (dimension === "age") {
    return normalizeAudienceAgeLabel(row.age);
  }
  if (dimension === "gender") {
    return normalizeAudienceGenderLabel(row.gender);
  }
  if (dimension === "country") {
    return normalizeAudienceLocationLabel(row.country);
  }
  if (dimension === "region") {
    return normalizeAudienceLocationLabel(row.region);
  }
  return normalizeAudienceLocationLabel(row.city);
}

async function fetchMetaCollection<TItem>(initialUrl: string): Promise<TItem[]> {
  const items: TItem[] = [];
  let nextUrl = initialUrl;

  while (nextUrl) {
    const json = await fetchMetaGraphPage<TItem>(nextUrl);

    items.push(...(json.data ?? []));
    nextUrl = json.paging?.next ?? "";
  }

  return items;
}

async function fetchMetaGraphPage<TItem>(url: string): Promise<MetaGraphResponse<TItem>> {
  let attempt = 0;

  while (true) {
    const response = await fetch(url, { cache: "no-store" });
    const parsed = await parseMetaResponse<MetaGraphResponse<TItem>>(response);

    if (parsed.parseError) {
      throw new MetaApiError(
        `Meta API returned non-JSON response (status ${parsed.status}, content-type ${parsed.contentType || "unknown"}). ${parsed.parseError}. Response starts with: ${parsed.textSnippet}`
      );
    }

    const json = parsed.json ?? {};
    if (!parsed.ok || json.error?.message) {
      const error = new MetaApiError(
        json.error?.message ??
          `Meta API request failed with status ${parsed.status}. The ad account may not be accessible.`,
        json.error?.code,
        json.error?.error_subcode
      );

      if (isRetryableMetaError(error) && attempt < 3) {
        await sleepMetaRetry(attempt);
        attempt += 1;
        continue;
      }

      throw error;
    }

    return json;
  }
}

async function runMetaPreviewBlock<T>(input: {
  accountId: string;
  label: MetaPreviewBlockDiagnostic["label"];
  required: boolean;
  fields: string[];
  load: () => Promise<T>;
}): Promise<{
  data: T | null;
  diagnostic: MetaPreviewBlockDiagnostic;
  issue: MetaPreviewBlockIssue | null;
}> {
  try {
    const data = await input.load();
    const rowCount = resolveBlockRowCount(data);
    return {
      data,
      diagnostic: {
        label: input.label,
        required: input.required,
        fields: input.fields,
        status: rowCount > 0 ? "passed" : "empty",
        rowCount,
        errorCode: null,
        errorSubcode: null,
        message: null,
      },
      issue: null,
    };
  } catch (error) {
    const issue = createMetaPreviewIssue({
      accountId: input.accountId,
      label: input.label,
      required: input.required,
      fields: input.fields,
      error,
    });
    logMetaPreviewIssue(issue);
    return {
      data: null,
      diagnostic: {
        label: input.label,
        required: input.required,
        fields: input.fields,
        status: "failed",
        rowCount: 0,
        errorCode: issue.errorCode,
        errorSubcode: issue.errorSubcode,
        message: issue.message,
      },
      issue,
    };
  }
}

function resolveBlockRowCount(data: unknown): number {
  if (Array.isArray(data)) {
    return data.length;
  }
  if (data instanceof Map) {
    return data.size;
  }
  return data ? 1 : 0;
}

function createMetaPreviewIssue(input: {
  accountId: string;
  label: MetaPreviewBlockIssue["label"];
  required: boolean;
  fields: string[];
  error: unknown;
}): MetaPreviewBlockIssue {
  const metaError =
    input.error instanceof MetaApiError
      ? input.error
      : new MetaApiError(
          input.error instanceof Error ? input.error.message : "Unknown Meta API error."
        );

  return {
    label: input.label,
    required: input.required,
    fields: input.fields,
    accountId: input.accountId,
    errorCode: metaError.code,
    errorSubcode: metaError.subcode,
    message: metaError.message,
  };
}

function logMetaPreviewIssue(issue: MetaPreviewBlockIssue) {
  const prefix = issue.required ? "Meta preview fatal block failure" : "Meta preview optional block failure";
  const parts = [
    prefix,
    `label=${issue.label}`,
    `fields=${issue.fields.join(",")}`,
    `code=${issue.errorCode ?? "n/a"}`,
    `subcode=${issue.errorSubcode ?? "n/a"}`,
    `message=${issue.message}`,
  ];

  if (issue.required) {
    console.error(parts.join(" | "));
    return;
  }

  console.warn(parts.join(" | "));
}

function isRetryableMetaError(error: MetaApiError): boolean {
  return (
    error.code === 4 ||
    error.code === 17 ||
    error.code === 32 ||
    error.code === 613 ||
    error.subcode === 2446079
  );
}

async function sleepMetaRetry(attempt: number) {
  const delayMs = 750 * 2 ** attempt;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function buildPerformanceMap(rows: MetaInsightRow[]): Map<string, PreviewPerformanceSummary> {
  const performanceByAdId = new Map<
    string,
    {
      resultLabel: string;
      results: number;
      spend: number;
      impressions: number;
      clicks: number;
      landingPageViews: number;
      linkClicks: number;
    }
  >();

  rows.forEach((row) => {
    const adId = row.ad_id?.trim();
    if (!adId) {
      return;
    }

    const resultMetric = pickResultMetric(row.actions, row.cost_per_action_type);
    const current = performanceByAdId.get(adId) ?? {
      resultLabel: resultMetric.label,
      results: 0,
      spend: 0,
      impressions: 0,
      clicks: 0,
      landingPageViews: 0,
      linkClicks: 0,
    };

    current.resultLabel =
      current.resultLabel === resultMetric.label ? current.resultLabel : "Results";
    current.results += resultMetric.value;
    current.spend += toNumber(row.spend);
    current.impressions += toNumber(row.impressions);
    current.clicks += toNumber(row.clicks);
    current.landingPageViews += pickActionValue(row.actions, "landing_page_view");
    current.linkClicks += pickActionValue(row.actions, "link_click");
    performanceByAdId.set(adId, current);
  });

  return new Map(
    Array.from(performanceByAdId.entries()).map(([adId, item]) => [
      adId,
      finalizePerformanceSummary(item),
    ])
  );
}

function buildDemographicMap(rows: MetaInsightRow[]): Map<string, PreviewDemographicRow[]> {
  const breakdownByAdId = new Map<
    string,
    Map<
      string,
      {
        maleResults: number;
        femaleResults: number;
        unknownResults: number;
        maleSpend: number;
        femaleSpend: number;
        unknownSpend: number;
      }
    >
  >();

  rows.forEach((row) => {
    const adId = row.ad_id?.trim();
    const ageRange = normalizeAgeRange(row.age);
    const gender = normalizeGender(row.gender);
    if (!adId || !ageRange) {
      return;
    }

    const perAge = breakdownByAdId.get(adId) ?? new Map();
    const current = perAge.get(ageRange) ?? {
      maleResults: 0,
      femaleResults: 0,
      unknownResults: 0,
      maleSpend: 0,
      femaleSpend: 0,
      unknownSpend: 0,
    };
    const resultMetric = pickResultMetric(row.actions, row.cost_per_action_type);
    const spend = toNumber(row.spend);

    if (gender === "male") {
      current.maleResults += resultMetric.value;
      current.maleSpend += spend;
    } else if (gender === "female") {
      current.femaleResults += resultMetric.value;
      current.femaleSpend += spend;
    } else {
      current.unknownResults += resultMetric.value;
      current.unknownSpend += spend;
    }

    perAge.set(ageRange, current);
    breakdownByAdId.set(adId, perAge);
  });

  return new Map(
    Array.from(breakdownByAdId.entries()).map(([adId, rowsByAge]) => [
      adId,
      Array.from(rowsByAge.entries())
        .map(([ageRange, row]) => ({
          ageRange,
          maleResults: row.maleResults,
          femaleResults: row.femaleResults,
          unknownResults: row.unknownResults,
          maleCostPerResult: row.maleResults > 0 ? row.maleSpend / row.maleResults : null,
          femaleCostPerResult: row.femaleResults > 0 ? row.femaleSpend / row.femaleResults : null,
          unknownCostPerResult: row.unknownResults > 0 ? row.unknownSpend / row.unknownResults : null,
        }))
        .sort((left, right) => sortAgeRange(left.ageRange, right.ageRange)),
    ])
  );
}

function mapCreativeAsset(row: MetaCreativeRow): PreviewCreativeAsset {
  const storyLink = row.object_story_spec?.link_data?.link?.trim();
  const videoLink = row.object_story_spec?.video_data?.call_to_action?.value?.link?.trim();
  const imageUrl =
    row.image_url?.trim() ||
    row.thumbnail_url?.trim() ||
    row.object_story_spec?.video_data?.image_url?.trim() ||
    null;

  return {
    id: row.id?.trim() || "",
    name: row.name?.trim() || null,
    title:
      row.title?.trim() ||
      row.object_story_spec?.link_data?.name?.trim() ||
      row.object_story_spec?.video_data?.title?.trim() ||
      null,
    body:
      row.body?.trim() ||
      row.object_story_spec?.link_data?.message?.trim() ||
      row.object_story_spec?.video_data?.message?.trim() ||
      null,
    imageUrl,
    thumbnailUrl: row.thumbnail_url?.trim() || null,
    linkUrl: storyLink || videoLink || null,
    callToActionType:
      row.object_story_spec?.link_data?.call_to_action?.type?.trim() ||
      row.object_story_spec?.video_data?.call_to_action?.type?.trim() ||
      null,
    objectType: row.object_type?.trim() || null,
  };
}

function isMetaCreativeRow(
  value: MetaCreativeRow | { error?: MetaApiErrorShape }
): value is MetaCreativeRow {
  return !("error" in value);
}

function finalizePerformanceSummary(input: {
  resultLabel: string;
  results: number;
  spend: number;
  impressions: number;
  clicks: number;
  landingPageViews: number;
  linkClicks: number;
}): PreviewPerformanceSummary {
  return {
    resultLabel: input.resultLabel || "Results",
    results: input.results,
    spend: input.spend,
    impressions: input.impressions,
    clicks: input.clicks,
    ctr: input.impressions > 0 ? (input.clicks * 100) / input.impressions : 0,
    cpc: input.clicks > 0 ? input.spend / input.clicks : null,
    cpm: input.impressions > 0 ? (input.spend * 1000) / input.impressions : null,
    costPerResult: input.results > 0 ? input.spend / input.results : null,
    landingPageViews: input.landingPageViews,
    linkClicks: input.linkClicks,
  };
}

function mergePerformanceSummaries(
  summaries: Array<PreviewPerformanceSummary | null | undefined>
): PreviewPerformanceSummary | null {
  const validSummaries = summaries.filter(
    (summary): summary is PreviewPerformanceSummary => Boolean(summary)
  );
  if (validSummaries.length === 0) {
    return null;
  }

  const aggregate = validSummaries.reduce(
    (accumulator, summary) => {
      accumulator.resultLabel =
        accumulator.resultLabel === summary.resultLabel ? accumulator.resultLabel : "Results";
      accumulator.results += summary.results;
      accumulator.spend += summary.spend;
      accumulator.impressions += summary.impressions;
      accumulator.clicks += summary.clicks;
      accumulator.landingPageViews += summary.landingPageViews;
      accumulator.linkClicks += summary.linkClicks;
      return accumulator;
    },
    {
      resultLabel: validSummaries[0].resultLabel,
      results: 0,
      spend: 0,
      impressions: 0,
      clicks: 0,
      landingPageViews: 0,
      linkClicks: 0,
    }
  );

  return finalizePerformanceSummary(aggregate);
}

function mergeDemographicRows(rows: PreviewDemographicRow[]): PreviewDemographicRow[] {
  if (rows.length === 0) {
    return [];
  }

  const totalsByAge = new Map<
    string,
    {
      maleResults: number;
      femaleResults: number;
      unknownResults: number;
      maleSpend: number;
      femaleSpend: number;
      unknownSpend: number;
    }
  >();

  rows.forEach((row) => {
    const current = totalsByAge.get(row.ageRange) ?? {
      maleResults: 0,
      femaleResults: 0,
      unknownResults: 0,
      maleSpend: 0,
      femaleSpend: 0,
      unknownSpend: 0,
    };

    current.maleResults += row.maleResults;
    current.femaleResults += row.femaleResults;
    current.unknownResults += row.unknownResults;
    current.maleSpend += (row.maleCostPerResult ?? 0) * row.maleResults;
    current.femaleSpend += (row.femaleCostPerResult ?? 0) * row.femaleResults;
    current.unknownSpend += (row.unknownCostPerResult ?? 0) * row.unknownResults;
    totalsByAge.set(row.ageRange, current);
  });

  return Array.from(totalsByAge.entries())
    .map(([ageRange, row]) => ({
      ageRange,
      maleResults: row.maleResults,
      femaleResults: row.femaleResults,
      unknownResults: row.unknownResults,
      maleCostPerResult: row.maleResults > 0 ? row.maleSpend / row.maleResults : null,
      femaleCostPerResult: row.femaleResults > 0 ? row.femaleSpend / row.femaleResults : null,
      unknownCostPerResult: row.unknownResults > 0 ? row.unknownSpend / row.unknownResults : null,
    }))
    .sort((left, right) => sortAgeRange(left.ageRange, right.ageRange));
}

function pickResultMetric(
  actions: Array<{ action_type?: string; value?: string }> | undefined,
  costs: Array<{ action_type?: string; value?: string }> | undefined
): { actionType: string; label: string; value: number; costPerResult: number | null } {
  if (!actions?.length) {
    return { actionType: "results", label: "Results", value: 0, costPerResult: null };
  }

  for (const actionType of RESULT_ACTION_PRIORITY) {
    const matched = actions.find((action) => action.action_type === actionType);
    if (!matched) {
      continue;
    }

    const costMatched = costs?.find((cost) => cost.action_type === actionType);
    return {
      actionType,
      label: humanizeActionType(actionType),
      value: toNumber(matched.value),
      costPerResult: costMatched?.value ? toNumber(costMatched.value) : null,
    };
  }

  const fallback = actions[0];
  const fallbackType = fallback?.action_type ?? "results";
  return {
    actionType: fallbackType,
    label: humanizeActionType(fallbackType),
    value: toNumber(fallback?.value),
    costPerResult: null,
  };
}

function pickActionValue(
  actions: Array<{ action_type?: string; value?: string }> | undefined,
  actionType: string
): number {
  const match = actions?.find((action) => action.action_type === actionType);
  return toNumber(match?.value);
}

function extractPreviewUrl(body: string | undefined): string | null {
  const normalized = body?.trim();
  if (!normalized) {
    return null;
  }

  const iframeMatch = normalized.match(/src=["']([^"']+)["']/i);
  if (iframeMatch?.[1]) {
    return iframeMatch[1];
  }

  const hrefMatch = normalized.match(/href=["']([^"']+)["']/i);
  if (hrefMatch?.[1]) {
    return hrefMatch[1];
  }

  return null;
}

function normalizeCampaignType(objective: string | undefined, campaignName: string): string {
  if (objective) {
    return objective
      .toLowerCase()
      .replaceAll("_", " ")
      .replace(/\b\w/g, (segment) => segment.toUpperCase());
  }

  if (campaignName.includes("-")) {
    return campaignName.split("-")[0].trim();
  }

  return "General";
}

function normalizeAgeRange(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized || normalized === "unknown") {
    return null;
  }
  return normalized.replace("_", "-");
}

function normalizeGender(value: string | undefined): "male" | "female" | "unknown" {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "male") {
    return "male";
  }
  if (normalized === "female") {
    return "female";
  }
  return "unknown";
}

function sortAgeRange(left: string, right: string): number {
  return ageRangeOrder(left) - ageRangeOrder(right);
}

function ageRangeOrder(value: string): number {
  const normalized = value.toLowerCase();
  if (normalized === "unknown") {
    return 9999;
  }
  if (normalized.endsWith("+")) {
    return Number.parseInt(normalized, 10) || 999;
  }
  const firstPart = normalized.split("-")[0];
  return Number.parseInt(firstPart, 10) || 0;
}

function toNumber(value: string | number | undefined | null): number {
  if (value === undefined || value === null) {
    return 0;
  }
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : 0;
}

function detailField(label: string, value: string | undefined | null): PreviewDetailField | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return { label, value: normalized };
}

function compactDetailFields(fields: Array<PreviewDetailField | null>): PreviewDetailField[] {
  return fields.filter((field): field is PreviewDetailField => Boolean(field));
}

function humanizeMetaValue(value: string | undefined): string {
  if (!value) {
    return "";
  }

  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function humanizeActionType(value: string): string {
  return humanizeMetaValue(value) || "Results";
}

function metaStatus(status: string | undefined, effectiveStatus: string | undefined): string {
  return humanizeMetaValue(effectiveStatus || status) || "Unknown";
}

function formatMetaCurrency(value: string | undefined): string | null {
  const amount = toNumber(value);
  if (!amount) {
    return null;
  }

  return `RM ${(amount / 100).toFixed(2)}`;
}

function formatBudgetSummary(dailyBudget: string | undefined, lifetimeBudget: string | undefined): string | null {
  const daily = formatMetaCurrency(dailyBudget);
  const lifetime = formatMetaCurrency(lifetimeBudget);
  if (daily && lifetime) {
    return `${daily} daily / ${lifetime} lifetime`;
  }
  return daily || lifetime;
}

function formatMetaDate(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(date);
}

function formatLocationList(countries: string[] | undefined): string | null {
  if (!countries?.length) {
    return null;
  }
  return countries.join(", ");
}

function formatAgeValue(value: number | undefined): string | null {
  if (!value) {
    return null;
  }
  return `${value}`;
}

function formatAgeSuggestion(minAge: number | undefined, maxAge: number | undefined): string | null {
  if (!minAge && !maxAge) {
    return null;
  }
  return `${minAge || 13} - ${maxAge || "65+"}`;
}

function formatGenderLabel(genders: number[] | undefined): string | null {
  if (!genders?.length) {
    return "All";
  }
  const labels = genders
    .map((gender) => {
      if (gender === 1) {
        return "Male";
      }
      if (gender === 2) {
        return "Female";
      }
      return null;
    })
    .filter((gender): gender is "Male" | "Female" => gender !== null);

  return labels.length > 0 ? labels.join(", ") : "All";
}

function formatTargetingExpansion(targeting: MetaAdSetRow["targeting"]): string | null {
  if (!targeting) {
    return null;
  }
  if (targeting.targeting_automation?.advantage_audience) {
    return "Enabled";
  }
  if (targeting.targeting_automation?.advantage_custom_audience) {
    return "Enabled";
  }
  return "No";
}

function formatPlacementSummary(targeting: MetaAdSetRow["targeting"]): string | null {
  if (!targeting) {
    return null;
  }

  const placements = [
    ...(targeting.publisher_platforms || []),
    ...(targeting.facebook_positions || []),
    ...(targeting.instagram_positions || []),
    ...(targeting.audience_network_positions || []),
    ...(targeting.device_platforms || []),
  ].filter(Boolean);

  if (placements.length === 0) {
    return "Advantage+ placements";
  }

  return placements
    .map((placement) => humanizeMetaValue(placement))
    .filter(Boolean)
    .join(", ");
}

function chunkItems<T>(items: T[], size: number): T[][] {
  if (items.length === 0) {
    return [];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function parseMetaResponse<TData>(response: Response): Promise<ParsedMetaResponse<TData>> {
  const rawText = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const textSnippet = JSON.stringify(rawText.slice(0, 120));

  if (!rawText) {
    return {
      status: response.status,
      ok: response.ok,
      contentType,
      json: null,
      textSnippet,
      parseError: null,
    };
  }

  try {
    const json = JSON.parse(rawText) as TData;
    return {
      status: response.status,
      ok: response.ok,
      contentType,
      json,
      textSnippet,
      parseError: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON response";
    return {
      status: response.status,
      ok: response.ok,
      contentType,
      json: null,
      textSnippet,
      parseError: message,
    };
  }
}
