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
  MetaCreativePerformanceRow,
  MetaPreviewBlockDiagnostic,
  MetaPreviewBlockIssue,
  PreviewCampaignNode,
  PreviewCreativeAsset,
  PreviewDemographicRow,
  PreviewDetailField,
  PreviewLinkAsset,
  PreviewPerformanceSummary,
  PreviewPlatformDistributionRow,
  AudienceClickBreakdownResponse,
  AudienceClickBreakdownItem,
} from "@/lib/reporting/types";

interface MetaFetchInput {
  accountId: string;
  accessToken: string;
  startDate: string;
  endDate: string;
}

type MetaPreviewStage = "campaigns" | "ad-groups" | "ads" | "preview" | "assets" | "full";

interface MetaPreviewSelection {
  platform: "meta" | "google" | null;
  campaignId: string | null;
  adGroupId: string | null;
  adId: string | null;
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
    age_range?: number[];
    genders?: number[];
    geo_locations?: {
      countries?: string[];
      cities?: Array<{
        country?: string;
        key?: string;
        name?: string;
        region?: string;
        region_id?: string;
      }>;
    };
    excluded_geo_locations?: {
      countries?: string[];
    };
    custom_audiences?: MetaTargetingItem[];
    excluded_custom_audiences?: MetaTargetingItem[];
    interests?: MetaTargetingItem[];
    behaviors?: MetaTargetingItem[];
    demographics?: MetaTargetingItem[];
    education_statuses?: MetaTargetingItem[];
    relationship_statuses?: MetaTargetingItem[];
    life_events?: MetaTargetingItem[];
    industries?: MetaTargetingItem[];
    income?: MetaTargetingItem[];
    family_statuses?: MetaTargetingItem[];
    work_positions?: MetaTargetingItem[];
    work_employers?: MetaTargetingItem[];
    flexible_spec?: MetaFlexibleTargetingSpec[];
    exclusions?: MetaFlexibleTargetingSpec;
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

interface MetaTargetingItem {
  id?: string;
  key?: string;
  name?: string;
}

type MetaFlexibleTargetingSpec = Partial<Record<MetaDetailedTargetingCategory, MetaTargetingItem[]>>;

type MetaDetailedTargetingCategory =
  | "interests"
  | "behaviors"
  | "demographics"
  | "education_statuses"
  | "relationship_statuses"
  | "life_events"
  | "industries"
  | "income"
  | "family_statuses"
  | "work_positions"
  | "work_employers"
  | "custom_audiences"
  | "excluded_custom_audiences";

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
  effective_object_story_id?: string;
  instagram_permalink_url?: string;
  effective_instagram_media_id?: string;
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
      video_id?: string;
      call_to_action?: {
        value?: {
          link?: string;
        };
        type?: string;
      };
      message?: string;
      title?: string;
      image_url?: string;
      thumbnail_url?: string;
    };
  };
}

interface MetaVideoRow {
  id?: string;
  source?: string;
  permalink_url?: string;
  picture?: string;
  thumbnails?: {
    data?: Array<{
      uri?: string;
      is_preferred?: boolean;
    }>;
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
  cpp?: string;
  spend?: string;
  optimization_goal?: string;
  objective_results?: MetaObjectiveResultMetricValue;
  cost_per_result?: MetaObjectiveResultMetricValue;
  cost_per_objective_result?: MetaObjectiveResultMetricValue;
  reach?: string;
  estimated_ad_recallers?: string;
  cost_per_estimated_ad_recallers?: string;
  video_thruplay_watched_actions?: MetaActionMetricValue;
  cost_per_thruplay?: MetaActionMetricValue;
  age?: string;
  gender?: string;
  publisher_platform?: string;
  device_platform?: string;
  actions?: MetaActionMetric[];
  cost_per_action_type?: MetaActionMetric[];
  country?: string;
  region?: string;
  city?: string;
}

type MetaActionMetric = {
  action_type?: string;
  value?: string | number;
};

type MetaActionMetricValue = MetaActionMetric | MetaActionMetric[] | string | number;

type MetaObjectiveResultMetric = {
  id?: string;
  indicator?: string;
  name?: string;
  title?: string;
  value?: string | number;
  values?: Array<{
    value?: string | number;
  }>;
  attribution_window?: string;
};

type MetaObjectiveResultMetricValue =
  | MetaObjectiveResultMetric
  | MetaObjectiveResultMetric[]
  | string
  | number;

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
  "onsite_conversion.messaging_conversation_started_7d",
  "landing_page_view",
  "link_click",
] as const;

const META_MESSAGING_RESULT_ACTION_PRIORITY = [
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.messaging_first_reply",
  "onsite_conversion.messaging_user_depth_2_message_send",
  "onsite_conversion.messaging_user_depth_3_message_send",
  "onsite_conversion.messaging_user_subscribed",
] as const;

const META_ENGAGEMENT_RESULT_ACTION_PRIORITY = [
  ...META_MESSAGING_RESULT_ACTION_PRIORITY,
  "post_engagement",
  "page_engagement",
  "video_view",
] as const;

const META_LEAD_RESULT_ACTION_PRIORITY = [
  "lead",
  "omni_lead",
  "onsite_conversion.lead_grouped",
  "onsite_conversion.lead",
  "offsite_conversion.fb_pixel_lead",
  ...META_MESSAGING_RESULT_ACTION_PRIORITY,
] as const;

const META_SALES_RESULT_ACTION_PRIORITY = [
  "purchase",
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
] as const;

const META_TRAFFIC_RESULT_ACTION_PRIORITY = [
  "landing_page_view",
  "link_click",
] as const;

const META_CAMPAIGN_INSIGHT_BASE_FIELDS = [
  "campaign_id",
  "campaign_name",
  "objective",
  "impressions",
  "clicks",
  "ctr",
  "cpm",
  "cpp",
  "spend",
] as const;

const META_OBJECTIVE_RESULT_FIELDS = [
  "objective_results",
  "cost_per_result",
  "cost_per_objective_result",
] as const;

const META_AWARENESS_RESULT_FIELDS = [
  "optimization_goal",
  "reach",
  "estimated_ad_recallers",
  "cost_per_estimated_ad_recallers",
  "video_thruplay_watched_actions",
  "cost_per_thruplay",
] as const;

const META_LEGACY_RESULT_FIELDS = [
  "actions",
  "cost_per_action_type",
] as const;

const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION?.trim() || "v24.0";
const META_GRAPH_API_BASE_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

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
  "pacing_type",
  "targeting",
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

const META_PREVIEW_ACTIVE_STATUSES = ["ACTIVE", "IN_PROCESS", "WITH_ISSUES"] as const;

const META_PREVIEW_CREATIVE_BASE_FIELDS = [
  "id",
  "name",
  "title",
  "body",
  "image_url",
  "thumbnail_url",
  "object_type",
  "object_story_spec",
] as const;

const META_PREVIEW_CREATIVE_PUBLIC_LINK_FIELDS = [
  "effective_object_story_id",
  "instagram_permalink_url",
  "effective_instagram_media_id",
] as const;

const META_PREVIEW_CREATIVE_FIELDS = [
  ...META_PREVIEW_CREATIVE_BASE_FIELDS,
  ...META_PREVIEW_CREATIVE_PUBLIC_LINK_FIELDS,
] as const;

const META_ADVANCED_CREATIVE_INSIGHT_FIELDS = [
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "objective",
  "impressions",
  "reach",
  "clicks",
  "ctr",
  "spend",
  "objective_results",
  "cost_per_result",
  "cost_per_objective_result",
  "actions",
  "cost_per_action_type",
] as const;

const META_PREVIEW_INSIGHT_FIELDS = [
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "objective",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "cpp",
  "spend",
  ...META_AWARENESS_RESULT_FIELDS,
  "objective_results",
  "cost_per_result",
  "cost_per_objective_result",
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

const META_PREVIEW_LINK_FORMATS = [
  {
    adFormat: "DESKTOP_FEED_STANDARD",
    label: "Desktop Feed Preview",
    placementKey: "facebookFeed",
    placementLabel: "Facebook Feed",
    device: "desktop",
  },
  {
    adFormat: "INSTAGRAM_STANDARD",
    label: "Instagram Placement Preview",
    placementKey: "instagramFeed",
    placementLabel: "Instagram Feed",
    device: "mobile",
  },
  {
    adFormat: "INSTAGRAM_STORY",
    label: "Instagram Story Preview",
    placementKey: "story",
    placementLabel: "Story",
    device: "mobile",
  },
] as const;

export async function fetchMetaCampaignRows({
  accountId,
  accessToken,
  startDate,
  endDate,
}: MetaFetchInput): Promise<CampaignRow[]> {
  const rows = await fetchMetaCampaignInsightRows({
    accountId,
    accessToken,
    startDate,
    endDate,
  });

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
    const resultMetric = pickResultMetric({
      objectiveResults: item.objective_results,
      costPerResult: item.cost_per_result,
      costPerObjectiveResult: item.cost_per_objective_result,
      reach: item.reach,
      cpp: item.cpp,
      estimatedAdRecallers: item.estimated_ad_recallers,
      costPerEstimatedAdRecallers: item.cost_per_estimated_ad_recallers,
      videoThruPlayWatchedActions: item.video_thruplay_watched_actions,
      costPerThruPlay: item.cost_per_thruplay,
      actions: item.actions,
      costs: item.cost_per_action_type,
      objective: item.objective,
      optimizationGoal: item.optimization_goal,
    });

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
    row.costPerResult =
      resultMetric.costPerResult ?? (resultMetric.value > 0 ? spend / resultMetric.value : 0);
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

export async function fetchMetaCreativePerformanceRows({
  accountId,
  accessToken,
  startDate,
  endDate,
}: MetaFetchInput): Promise<MetaCreativePerformanceRow[]> {
  const [ads, insights] = await Promise.all([
    fetchMetaAdCollection({
      accountId,
      accessToken,
      fields: [...META_PREVIEW_AD_FIELDS],
    }),
    fetchMetaInsightsCollection({
      accountId,
      accessToken,
      startDate,
      endDate,
      breakdowns: [],
      fields: [...META_ADVANCED_CREATIVE_INSIGHT_FIELDS],
    }),
  ]);
  const adById = new Map(
    ads
      .map((ad) => [ad.id?.trim() ?? "", ad] as const)
      .filter(([adId]) => Boolean(adId))
  );
  const creativeIds = Array.from(
    new Set(ads.map((ad) => ad.creative?.id?.trim()).filter(Boolean) as string[])
  );
  const creativeMap =
    creativeIds.length > 0
      ? await fetchMetaCreativeCollection({ accessToken, creativeIds })
      : new Map<string, PreviewCreativeAsset>();
  const rowsByAdId = new Map<string, MetaCreativePerformanceRow>();

  insights.forEach((insight) => {
    const adId = insight.ad_id?.trim();
    if (!adId) {
      return;
    }

    const ad = adById.get(adId);
    const creativeId = ad?.creative?.id?.trim() || null;
    const creative = creativeId ? creativeMap.get(creativeId) ?? null : null;
    const finalUrl = creative?.linkUrl?.trim() ?? "";
    if (!finalUrl) {
      return;
    }

    const spend = toNumber(insight.spend);
    const impressions = toNumber(insight.impressions);
    const clicks = toNumber(insight.clicks);
    const resultMetric = pickResultMetric({
      objectiveResults: insight.objective_results,
      costPerResult: insight.cost_per_result,
      costPerObjectiveResult: insight.cost_per_objective_result,
      reach: insight.reach,
      cpp: insight.cpp,
      estimatedAdRecallers: insight.estimated_ad_recallers,
      costPerEstimatedAdRecallers: insight.cost_per_estimated_ad_recallers,
      videoThruPlayWatchedActions: insight.video_thruplay_watched_actions,
      costPerThruPlay: insight.cost_per_thruplay,
      actions: insight.actions,
      costs: insight.cost_per_action_type,
      objective: insight.objective,
      optimizationGoal: insight.optimization_goal,
    });
    const existing = rowsByAdId.get(adId);
    const nextSpend = (existing?.cost ?? 0) + spend;
    const nextClicks = (existing?.clicks ?? 0) + clicks;
    const nextImpressions = (existing?.impressions ?? 0) + impressions;
    const nextConversions = (existing?.conversions ?? 0) + resultMetric.value;
    const mediaType =
      creative?.mediaType ??
      (creative?.videoUrl || creative?.objectType?.toUpperCase().includes("VIDEO") ? "video" : "image");

    rowsByAdId.set(adId, {
      id: existing?.id ?? `${accountId}:${adId}`,
      finalUrl,
      mediaType,
      imageUrl: creative?.imageUrl?.trim() || creative?.posterUrl?.trim() || creative?.thumbnailUrl?.trim() || null,
      videoUrl: creative?.videoUrl?.trim() || creative?.videoPermalinkUrl?.trim() || null,
      videoId: creative?.videoId?.trim() || null,
      videoSourceUrl: creative?.videoSourceUrl?.trim() || null,
      videoPermalinkUrl: creative?.videoPermalinkUrl?.trim() || null,
      thumbnailUrl: creative?.thumbnailUrl?.trim() || creative?.posterUrl?.trim() || creative?.imageUrl?.trim() || null,
      posterUrl: creative?.posterUrl?.trim() || creative?.imageUrl?.trim() || creative?.thumbnailUrl?.trim() || null,
      mediaWarning: creative?.mediaWarning?.trim() || null,
      campaignId: insight.campaign_id?.trim() || ad?.campaign_id?.trim() || null,
      campaignName: insight.campaign_name?.trim() || "Meta campaign",
      adSetId: insight.adset_id?.trim() || ad?.adset_id?.trim() || null,
      adSetName: insight.adset_name?.trim() || null,
      adId,
      adName: insight.ad_name?.trim() || ad?.name?.trim() || `Ad ${adId}`,
      creativeId,
      creativeName: creative?.name?.trim() || ad?.creative?.name?.trim() || null,
      primaryText: creative?.body?.trim() || null,
      headline: creative?.title?.trim() || null,
      description: creative?.description?.trim() || null,
      impressions: nextImpressions,
      reach: (existing?.reach ?? 0) + toNumber(insight.reach),
      clicks: nextClicks,
      ctr: nextImpressions > 0 ? (nextClicks * 100) / nextImpressions : null,
      conversions: nextConversions,
      cpa: nextConversions > 0 ? nextSpend / nextConversions : resultMetric.costPerResult,
      cost: nextSpend,
    });
  });

  return Array.from(rowsByAdId.values()).filter(
    (row) => row.cost > 0 || row.impressions > 0 || row.clicks > 0 || row.conversions > 0
  );
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

async function fetchMetaCampaignInsightRows(input: MetaFetchInput): Promise<MetaInsightRow[]> {
  const primaryFields = [
    ...META_CAMPAIGN_INSIGHT_BASE_FIELDS,
    ...META_AWARENESS_RESULT_FIELDS,
    ...META_OBJECTIVE_RESULT_FIELDS,
    ...META_LEGACY_RESULT_FIELDS,
  ];

  try {
    return await fetchMetaCampaignInsightRowsWithFields(input, primaryFields);
  } catch (error) {
    if (!isUnsupportedMetaInsightFieldError(error)) {
      throw error;
    }

    console.warn(
      `[meta-campaigns] accountId=${input.accountId} objective_result_fields_unavailable=true message="${escapeLogMessage(error.message)}"`
    );

    return fetchMetaCampaignInsightRowsWithFields(input, [
      ...META_CAMPAIGN_INSIGHT_BASE_FIELDS,
      ...META_AWARENESS_RESULT_FIELDS,
      ...META_LEGACY_RESULT_FIELDS,
    ]);
  }
}

async function fetchMetaCampaignInsightRowsWithFields(
  input: MetaFetchInput,
  fields: readonly string[]
): Promise<MetaInsightRow[]> {
  const params = new URLSearchParams({
    access_token: input.accessToken,
    level: "campaign",
    limit: "200",
    fields: fields.join(","),
    time_range: JSON.stringify({ since: input.startDate, until: input.endDate }),
  });
  applyMetaAdsManagerInsightParams(params);

  return fetchMetaCollection<MetaInsightRow>(
    `${META_GRAPH_API_BASE_URL}/act_${input.accountId}/insights?${params.toString()}`
  );
}

export async function fetchMetaPreviewData({
  accountId,
  accessToken,
  startDate,
  endDate,
  previewStage = "full",
  previewSelection = {
    platform: null,
    campaignId: null,
    adGroupId: null,
    adId: null,
  },
}: MetaFetchInput & {
  previewStage?: MetaPreviewStage;
  previewSelection?: MetaPreviewSelection;
}): Promise<MetaPreviewResponse> {
  const diagnostics: MetaPreviewBlockDiagnostic[] = [];
  const warnings: MetaPreviewBlockIssue[] = [];
  const fatalErrors: MetaPreviewBlockIssue[] = [];
  const selectedCampaignId =
    previewSelection.platform === "google" ? null : previewSelection.campaignId?.trim() || null;
  const selectedAdGroupId = previewSelection.adGroupId?.trim() || null;
  const selectedAdId = previewSelection.adId?.trim() || null;

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

  if (!campaignsBlock.data) {
    return { data: [], diagnostics, warnings, fatalErrors };
  }

  const campaigns = selectedCampaignId
    ? campaignsBlock.data.filter((campaign) => campaign.id?.trim() === selectedCampaignId)
    : campaignsBlock.data;

  if (previewStage === "campaigns") {
    return {
      data: buildMetaPreviewCampaignNodes(campaigns, new Map()),
      diagnostics,
      warnings,
      fatalErrors,
    };
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
        campaignId: selectedCampaignId,
        adSetId: selectedAdGroupId,
      }),
  });
  diagnostics.push(adsBlock.diagnostic);
  if (adsBlock.issue) {
    fatalErrors.push(adsBlock.issue);
  }

  if (!adsBlock.data) {
    return { data: [], diagnostics, warnings, fatalErrors };
  }

  const ads = selectedAdId
    ? adsBlock.data.filter((ad) => ad.id?.trim() === selectedAdId)
    : adsBlock.data;
  const visibleCampaignIds = new Set(campaigns.map((campaign) => campaign.id).filter(Boolean) as string[]);
  const campaignAds = ads.filter(
    (ad) =>
      Boolean(
        ad.id?.trim() &&
          ad.campaign_id?.trim() &&
          ad.adset_id?.trim() &&
          visibleCampaignIds.has(ad.campaign_id.trim())
      )
  );

  const adSetIds = Array.from(
    new Set(campaignAds.map((ad) => ad.adset_id?.trim()).filter(Boolean) as string[])
  );
  const adSetsBlock = await runMetaPreviewBlock({
    accountId,
    label: "meta-preview-adsets",
    required: false,
    fields: [...META_PREVIEW_ADSET_FIELDS],
    load: () =>
      fetchMetaAdSetCollectionByIds({
        accessToken,
        adSetIds,
        fields: [...META_PREVIEW_ADSET_FIELDS],
      }),
  });
  diagnostics.push(adSetsBlock.diagnostic);
  if (adSetsBlock.issue) {
    warnings.push(adSetsBlock.issue);
  }

  const visibleAdSets = buildVisiblePreviewAdSets(campaignAds, adSetsBlock.data ?? []);
  const visibleAdSetIds = new Set(visibleAdSets.map((adSet) => adSet.id?.trim()).filter(Boolean) as string[]);
  const visibleAds = campaignAds.filter((ad) => visibleAdSetIds.has(ad.adset_id?.trim() || ""));

  if (previewStage === "ad-groups") {
    const adSetsByCampaign = buildMetaPreviewAdSetsByCampaign(visibleAdSets, new Map());
    return {
      data: buildMetaPreviewCampaignNodes(campaigns, adSetsByCampaign),
      diagnostics,
      warnings,
      fatalErrors,
    };
  }

  const includeCreativeDetails = previewStage === "preview" || previewStage === "assets" || previewStage === "full";
  const includePreviewLinks = previewStage === "assets" || previewStage === "full";
  const includePerformance = previewStage === "preview" || previewStage === "assets" || previewStage === "full";
  const creativeIds = Array.from(
    new Set(visibleAds.map((ad) => ad.creative?.id?.trim()).filter(Boolean) as string[])
  );

  const creativesBlock = await runMetaPreviewBlock({
    accountId,
    label: "meta-preview-ad-creatives",
    required: false,
    fields: [...META_PREVIEW_CREATIVE_FIELDS],
    load: () =>
      includeCreativeDetails
        ? fetchMetaCreativeCollection({ accessToken, creativeIds })
        : Promise.resolve(new Map<string, PreviewCreativeAsset>()),
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
      includePreviewLinks
        ? fetchMetaPreviewLinks({
            accessToken,
            adIds: visibleAds.map((ad) => ad.id?.trim() || ""),
          })
        : Promise.resolve(new Map<string, PreviewLinkAsset[]>()),
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
      includePerformance
        ? fetchMetaInsightsCollection({
            accountId,
            accessToken,
            startDate,
            endDate,
            breakdowns: [],
            fields: [...META_PREVIEW_INSIGHT_FIELDS],
          })
        : Promise.resolve([]),
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
      includePerformance
        ? fetchMetaInsightsCollection({
            accountId,
            accessToken,
            startDate,
            endDate,
            breakdowns: ["age", "gender"],
            fields: [...META_PREVIEW_DEMOGRAPHIC_FIELDS],
          })
        : Promise.resolve([]),
  });
  diagnostics.push(demographicsBlock.diagnostic);
  if (demographicsBlock.issue) {
    warnings.push(demographicsBlock.issue);
  }

  const platformsBlock = await runMetaPreviewBlock({
    accountId,
    label: "meta-preview-platforms",
    required: false,
    fields: [...META_PREVIEW_DEMOGRAPHIC_FIELDS],
    load: () =>
      includePerformance
        ? fetchMetaInsightsCollection({
            accountId,
            accessToken,
            startDate,
            endDate,
            breakdowns: ["publisher_platform", "device_platform"],
            fields: [...META_PREVIEW_DEMOGRAPHIC_FIELDS],
          })
        : Promise.resolve([]),
  });
  diagnostics.push(platformsBlock.diagnostic);
  if (platformsBlock.issue) {
    warnings.push(platformsBlock.issue);
  }

  const creativeMap = creativesBlock.data ?? new Map<string, PreviewCreativeAsset>();
  const previewLinkMap = previewLinksBlock.data ?? new Map<string, PreviewLinkAsset[]>();
  const adPerformanceMap = buildPerformanceMap(insightsBlock.data ?? []);
  const adDemographicMap = buildDemographicMap(demographicsBlock.data ?? []);
  const adPlatformMap = buildPlatformDistributionMap(platformsBlock.data ?? []);

  const adsByAdSet = new Map<string, PreviewCampaignNode["children"][number]["ads"]>();
  visibleAds.forEach((ad) => {
    const adSetId = ad.adset_id?.trim();
    const adId = ad.id?.trim();
    if (!adSetId || !adId) {
      return;
    }

    const creative = creativeMap.get(ad.creative?.id?.trim() || "");
    const previewLinks = resolveMetaPreviewLinksForCreative(previewLinkMap.get(adId) ?? [], creative);
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
      previewLinks,
      performance: adPerformanceMap.get(adId) ?? null,
      demographics: adDemographicMap.get(adId) ?? [],
      platformDistribution: adPlatformMap.get(adId) ?? [],
      finalUrl: creative?.linkUrl ?? null,
    });
    adsByAdSet.set(adSetId, items);
  });

  const adSetsByCampaign = buildMetaPreviewAdSetsByCampaign(visibleAdSets, adsByAdSet);
  const data = buildMetaPreviewCampaignNodes(campaigns, adSetsByCampaign);

  return {
    data,
    diagnostics,
    warnings,
    fatalErrors,
  };
}

function buildMetaPreviewAdSetsByCampaign(
  visibleAdSets: MetaAdSetRow[],
  adsByAdSet: Map<string, PreviewCampaignNode["children"][number]["ads"]>
): Map<string, PreviewCampaignNode["children"]> {
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
        detailField("Detailed targeting included", formatDetailedTargeting(adSet.targeting)),
        detailField("Targeting expansion", formatTargetingExpansion(adSet.targeting)),
        detailField("Placements", formatPlacementSummary(adSet.targeting)),
        detailField("Performance goal", humanizeMetaValue(adSet.optimization_goal)),
        detailField("Bid strategy", humanizeMetaValue(adSet.bid_strategy)),
        detailField("Delivery type", humanizeMetaValue(adSet.pacing_type?.join(", "))),
        detailField("Billing event", humanizeMetaValue(adSet.billing_event)),
      ]),
      performance: mergePerformanceSummaries(adItems.map((ad) => ad.performance).filter(Boolean)),
      demographics: mergeDemographicRows(adItems.flatMap((ad) => ad.demographics || [])),
      platformDistribution: mergePlatformDistributionRows(
        adItems.flatMap((ad) => ad.platformDistribution || [])
      ),
      ads: adItems,
    });
    adSetsByCampaign.set(campaignId, items);
  });

  return adSetsByCampaign;
}

function buildMetaPreviewCampaignNodes(
  campaigns: MetaCampaignRow[],
  adSetsByCampaign: Map<string, PreviewCampaignNode["children"]>
): PreviewCampaignNode[] {
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
      objective: humanizeMetaValue(campaign.objective) || "Other",
      details: compactDetailFields([
        detailField("Campaign ID", campaignId),
        detailField("Objective", humanizeMetaValue(campaign.objective)),
        detailField("Buying Type", humanizeMetaValue(campaign.buying_type)),
        detailField("Start Time", formatMetaDate(campaign.start_time)),
        detailField("Stop Time", formatMetaDate(campaign.stop_time)),
      ]),
      performance: mergePerformanceSummaries(children.map((adSet) => adSet.performance)),
      demographics: mergeDemographicRows(children.flatMap((adSet) => adSet.demographics || [])),
      platformDistribution: mergePlatformDistributionRows(
        children.flatMap((adSet) => adSet.platformDistribution || [])
      ),
      children,
    });
  });

  return data.sort((left, right) => left.name.localeCompare(right.name));
}

export async function fetchMetaAccountName({
  accountId,
  accessToken,
}: MetaAccountNameInput): Promise<string | null> {
  const endpoint = `${META_GRAPH_API_BASE_URL}/act_${accountId}?fields=name&access_token=${encodeURIComponent(accessToken)}`;
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
    filtering: buildMetaEffectiveStatusFilter(),
  });

  return fetchMetaCollection<MetaCampaignRow>(
    `${META_GRAPH_API_BASE_URL}/act_${input.accountId}/campaigns?${params.toString()}`
  );
}

async function fetchMetaAdSetCollectionByIds(input: {
  accessToken: string;
  adSetIds: string[];
  fields: string[];
}): Promise<MetaAdSetRow[]> {
  const rows: MetaAdSetRow[] = [];
  const chunks = chunkItems(input.adSetIds.filter(Boolean), 50);

  for (const chunk of chunks) {
    const params = new URLSearchParams({
      access_token: input.accessToken,
      ids: chunk.join(","),
      fields: input.fields.join(","),
    });
    const response = await fetch(`${META_GRAPH_API_BASE_URL}/?${params.toString()}`, {
      cache: "no-store",
    });
    const parsed = await parseMetaResponse<Record<string, MetaAdSetRow | { error?: MetaApiErrorShape }>>(
      response
    );

    if (parsed.parseError) {
      throw new MetaApiError(
        `Meta API returned non-JSON response (status ${parsed.status}, content-type ${parsed.contentType || "unknown"}). ${parsed.parseError}. Response starts with: ${parsed.textSnippet}`
      );
    }

    const json = (parsed.json ?? {}) as Record<string, MetaAdSetRow | { error?: MetaApiErrorShape }> & {
      error?: MetaApiErrorShape;
    };
    if (!parsed.ok && json.error) {
      throw new MetaApiError(
        json.error.message ?? `Meta API request failed with status ${parsed.status}.`,
        json.error.code,
        json.error.error_subcode
      );
    }

    for (const adSetId of chunk) {
      const row = json[adSetId];
      if (!row || !isMetaAdSetRow(row)) {
        continue;
      }
      rows.push(row);
    }
  }

  return rows;
}

async function fetchMetaAdCollection(input: {
  accountId: string;
  accessToken: string;
  fields: string[];
  campaignId?: string | null;
  adSetId?: string | null;
}): Promise<MetaAdRow[]> {
  const params = new URLSearchParams({
    access_token: input.accessToken,
    limit: "200",
    fields: input.fields.join(","),
    filtering: buildMetaEffectiveStatusFilter(),
  });
  const parentId = input.adSetId?.trim() || input.campaignId?.trim();
  const endpoint = parentId
    ? `${META_GRAPH_API_BASE_URL}/${parentId}/ads?${params.toString()}`
    : `${META_GRAPH_API_BASE_URL}/act_${input.accountId}/ads?${params.toString()}`;

  return fetchMetaCollection<MetaAdRow>(endpoint);
}

function buildMetaEffectiveStatusFilter(): string {
  return JSON.stringify([
    {
      field: "effective_status",
      operator: "IN",
      value: [...META_PREVIEW_ACTIVE_STATUSES],
    },
  ]);
}

async function fetchMetaCreativeCollection(input: {
  accessToken: string;
  creativeIds: string[];
}): Promise<Map<string, PreviewCreativeAsset>> {
  const assets = new Map<string, PreviewCreativeAsset>();
  const chunks = chunkItems(input.creativeIds.filter(Boolean), 25);

  for (const chunk of chunks) {
    const json = await fetchMetaCreativeChunk({
      accessToken: input.accessToken,
      creativeIds: chunk,
      fields: [...META_PREVIEW_CREATIVE_FIELDS],
    }).catch((error) => {
      if (!isUnsupportedMetaCreativePublicLinkFieldError(error)) {
        throw error;
      }

      console.warn(
        `[meta-preview] creative public link fields unavailable; retrying with base creative fields. message="${escapeLogMessage(error.message)}"`
      );

      return fetchMetaCreativeChunk({
        accessToken: input.accessToken,
        creativeIds: chunk,
        fields: [...META_PREVIEW_CREATIVE_BASE_FIELDS],
      });
    });

    for (const creativeId of chunk) {
      const row = json[creativeId];
      if (!row || !isMetaCreativeRow(row)) {
        continue;
      }
      assets.set(creativeId, mapCreativeAsset(row));
    }
  }

  await enrichMetaVideoCreativeAssets(input.accessToken, assets);

  return assets;
}

async function fetchMetaCreativeChunk(input: {
  accessToken: string;
  creativeIds: string[];
  fields: string[];
}): Promise<Record<string, MetaCreativeRow | { error?: MetaApiErrorShape }>> {
  const params = new URLSearchParams({
    access_token: input.accessToken,
    ids: input.creativeIds.join(","),
    fields: input.fields.join(","),
  });
  const response = await fetch(`${META_GRAPH_API_BASE_URL}/?${params.toString()}`, {
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

  return json;
}

async function enrichMetaVideoCreativeAssets(
  accessToken: string,
  assets: Map<string, PreviewCreativeAsset>
): Promise<void> {
  const videoIds = Array.from(
    new Set(
      Array.from(assets.values())
        .map((asset) => asset.videoId?.trim())
        .filter(Boolean) as string[]
    )
  );

  if (videoIds.length === 0) {
    return;
  }

  const videoDetails = await fetchMetaVideoDetailsCollection({ accessToken, videoIds }).catch((error) => {
    console.warn(
      `[meta-preview] video source fields unavailable; using poster fallback. message="${escapeLogMessage(
        error instanceof Error ? error.message : String(error)
      )}"`
    );
    return new Map<string, MetaVideoRow>();
  });

  assets.forEach((asset) => {
    if (asset.mediaType !== "video" || !asset.videoId) {
      return;
    }

    const video = videoDetails.get(asset.videoId);
    const videoSourceUrl = video?.source?.trim() || null;
    const videoPermalinkUrl = video?.permalink_url?.trim() || asset.videoPermalinkUrl || asset.videoUrl || null;
    const posterUrl = pickMetaVideoPosterUrl(video, asset.posterUrl || asset.imageUrl || asset.thumbnailUrl || null);

    asset.videoSourceUrl = videoSourceUrl;
    asset.videoPermalinkUrl = videoPermalinkUrl;
    asset.videoUrl = videoSourceUrl || videoPermalinkUrl;
    asset.posterUrl = posterUrl;
    asset.imageUrl = asset.imageUrl || posterUrl;
    asset.thumbnailUrl = asset.thumbnailUrl || posterUrl;
    asset.mediaWarning = videoSourceUrl
      ? null
      : "Meta did not expose a direct playable video source for this creative. Open the Meta post/video to play it.";
  });
}

async function fetchMetaVideoDetailsCollection(input: {
  accessToken: string;
  videoIds: string[];
}): Promise<Map<string, MetaVideoRow>> {
  const details = new Map<string, MetaVideoRow>();
  const chunks = chunkItems(input.videoIds.filter(Boolean), 25);

  for (const chunk of chunks) {
    const params = new URLSearchParams({
      access_token: input.accessToken,
      ids: chunk.join(","),
      fields: "id,source,permalink_url,picture,thumbnails{uri,is_preferred}",
    });
    const response = await fetch(`${META_GRAPH_API_BASE_URL}/?${params.toString()}`, {
      cache: "no-store",
    });
    const parsed = await parseMetaResponse<Record<string, MetaVideoRow | { error?: MetaApiErrorShape }>>(
      response
    );

    if (parsed.parseError) {
      throw new MetaApiError(
        `Meta API returned non-JSON response (status ${parsed.status}, content-type ${parsed.contentType || "unknown"}). ${parsed.parseError}. Response starts with: ${parsed.textSnippet}`
      );
    }

    const json = (parsed.json ?? {}) as Record<string, MetaVideoRow | { error?: MetaApiErrorShape }> & {
      error?: MetaApiErrorShape;
    };
    if (!parsed.ok && json.error) {
      throw new MetaApiError(
        json.error.message ?? `Meta API video request failed with status ${parsed.status}.`,
        json.error.code,
        json.error.error_subcode
      );
    }

    for (const videoId of chunk) {
      const row = json[videoId];
      if (!row || isMetaErrorRow(row)) {
        continue;
      }
      details.set(videoId, row as MetaVideoRow);
    }
  }

  return details;
}

function pickMetaVideoPosterUrl(video: MetaVideoRow | undefined, fallback: string | null): string | null {
  const preferred = video?.thumbnails?.data?.find((thumbnail) => thumbnail.is_preferred && thumbnail.uri?.trim());
  const first = video?.thumbnails?.data?.find((thumbnail) => thumbnail.uri?.trim());
  return preferred?.uri?.trim() || first?.uri?.trim() || video?.picture?.trim() || fallback;
}

async function fetchMetaPreviewLinks(input: {
  accessToken: string;
  adIds: string[];
}): Promise<Map<string, PreviewLinkAsset[]>> {
  const linksByAdId = new Map<string, PreviewLinkAsset[]>();

  for (const adId of input.adIds.filter(Boolean)) {
    const linkAssets: PreviewLinkAsset[] = [];
    const seenKeys = new Set<string>();

    for (const format of META_PREVIEW_LINK_FORMATS) {
      const params = new URLSearchParams({
        access_token: input.accessToken,
        ad_format: format.adFormat,
        fields: "body",
      });

      const response = await fetch(
        `${META_GRAPH_API_BASE_URL}/${adId}/previews?${params.toString()}`,
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
        continue;
      }

      const url = extractPreviewUrl(json.data?.[0]?.body);
      if (!url) {
        continue;
      }

      const uniqueKey = `${format.placementKey}:${url}`;
      if (seenKeys.has(uniqueKey)) {
        continue;
      }

      seenKeys.add(uniqueKey);
      linkAssets.push({
        label: format.label,
        url,
        placementKey: format.placementKey,
        placementLabel: format.placementLabel,
        device: format.device,
        adFormat: format.adFormat,
        previewUrl: url,
        publicPostUrl: null,
        linkKind: "metaPreview",
      });
    }

    if (linkAssets.length > 0) {
      linksByAdId.set(adId, linkAssets);
    }
  }

  return linksByAdId;
}

function resolveMetaPreviewLinksForCreative(
  previewLinks: PreviewLinkAsset[],
  creative: PreviewCreativeAsset | null | undefined
): PreviewLinkAsset[] {
  return previewLinks.map((link) => {
    const publicPostUrl =
      link.placementKey === "instagramFeed" || link.placementKey === "story"
        ? creative?.instagramPermalinkUrl?.trim() || null
        : link.placementKey === "facebookFeed"
          ? creative?.facebookPermalinkUrl?.trim() || null
          : null;
    const previewUrl = link.previewUrl?.trim() || link.url.trim();

    return {
      ...link,
      url: previewUrl,
      previewUrl,
      publicPostUrl,
      linkKind: publicPostUrl ? "publicPost" : "metaPreview",
    };
  });
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
  applyMetaAdsManagerInsightParams(params);

  if (input.breakdowns.length > 0) {
    params.set("breakdowns", input.breakdowns.join(","));
  }

  return fetchMetaCollection<MetaInsightRow>(
    `${META_GRAPH_API_BASE_URL}/act_${input.accountId}/insights?${params.toString()}`
  );
}

function applyMetaAdsManagerInsightParams(params: URLSearchParams): void {
  params.set("use_unified_attribution_setting", "true");
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

function isUnsupportedMetaInsightFieldError(error: unknown): error is Error {
  if (!(error instanceof MetaApiError)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    error.code === 100 &&
    message.includes("field") &&
    (message.includes("objective_results") ||
      message.includes("cost_per_result") ||
      message.includes("cost_per_objective_result") ||
      message.includes("optimization_goal") ||
      message.includes("valid for fields param"))
  );
}

function isUnsupportedMetaCreativePublicLinkFieldError(error: unknown): error is Error {
  if (!(error instanceof MetaApiError)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    error.code === 100 &&
    message.includes("field") &&
    META_PREVIEW_CREATIVE_PUBLIC_LINK_FIELDS.some((field) => message.includes(field))
  );
}

function escapeLogMessage(message: string): string {
  return message.replaceAll('"', '\\"').replaceAll("\n", " ");
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
      resultCostTotal: number;
      hasNativeResultCost: boolean;
    }
  >();

  rows.forEach((row) => {
    const adId = row.ad_id?.trim();
    if (!adId) {
      return;
    }

    const resultMetric = pickResultMetric({
      objectiveResults: row.objective_results,
      costPerResult: row.cost_per_result,
      costPerObjectiveResult: row.cost_per_objective_result,
      reach: row.reach,
      cpp: row.cpp,
      estimatedAdRecallers: row.estimated_ad_recallers,
      costPerEstimatedAdRecallers: row.cost_per_estimated_ad_recallers,
      videoThruPlayWatchedActions: row.video_thruplay_watched_actions,
      costPerThruPlay: row.cost_per_thruplay,
      actions: row.actions,
      costs: row.cost_per_action_type,
      objective: row.objective,
      optimizationGoal: row.optimization_goal,
    });
    const current = performanceByAdId.get(adId) ?? {
      resultLabel: resultMetric.label,
      results: 0,
      spend: 0,
      impressions: 0,
      clicks: 0,
      landingPageViews: 0,
      linkClicks: 0,
      resultCostTotal: 0,
      hasNativeResultCost: false,
    };

    current.resultLabel =
      current.resultLabel === resultMetric.label ? current.resultLabel : "Results";
    current.results += resultMetric.value;
    if (resultMetric.costPerResult !== null && resultMetric.value > 0) {
      current.resultCostTotal += resultMetric.costPerResult * resultMetric.value;
      current.hasNativeResultCost = true;
    }
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
      finalizePerformanceSummary({
        ...item,
        costPerResult:
          item.hasNativeResultCost && item.results > 0
            ? item.resultCostTotal / item.results
            : undefined,
      }),
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
    const resultMetric = pickResultMetric({
      objectiveResults: row.objective_results,
      costPerResult: row.cost_per_result,
      costPerObjectiveResult: row.cost_per_objective_result,
      reach: row.reach,
      cpp: row.cpp,
      estimatedAdRecallers: row.estimated_ad_recallers,
      costPerEstimatedAdRecallers: row.cost_per_estimated_ad_recallers,
      videoThruPlayWatchedActions: row.video_thruplay_watched_actions,
      costPerThruPlay: row.cost_per_thruplay,
      actions: row.actions,
      costs: row.cost_per_action_type,
      objective: row.objective,
      optimizationGoal: row.optimization_goal,
    });
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

function buildPlatformDistributionMap(
  rows: MetaInsightRow[]
): Map<string, PreviewPlatformDistributionRow[]> {
  const rowsByAd = new Map<string, PreviewPlatformDistributionRow[]>();

  rows.forEach((row) => {
    const adId = row.ad_id?.trim();
    if (!adId) {
      return;
    }

    const resultMetric = pickResultMetric({
      objectiveResults: row.objective_results,
      costPerResult: row.cost_per_result,
      costPerObjectiveResult: row.cost_per_objective_result,
      reach: row.reach,
      cpp: row.cpp,
      estimatedAdRecallers: row.estimated_ad_recallers,
      costPerEstimatedAdRecallers: row.cost_per_estimated_ad_recallers,
      videoThruPlayWatchedActions: row.video_thruplay_watched_actions,
      costPerThruPlay: row.cost_per_thruplay,
      actions: row.actions,
      costs: row.cost_per_action_type,
      objective: row.objective,
      optimizationGoal: row.optimization_goal,
    });
    const results = resultMetric.value;
    const spend = toNumber(row.spend);
    const item: PreviewPlatformDistributionRow = {
      platform: humanizeMetaValue(row.publisher_platform) || "Unknown platform",
      device: humanizeMetaValue(row.device_platform) || "Unknown device",
      results,
      costPerResult: results > 0 ? spend / results : null,
    };
    rowsByAd.set(adId, [...(rowsByAd.get(adId) ?? []), item]);
  });

  return new Map(
    Array.from(rowsByAd.entries()).map(([adId, items]) => [
      adId,
      mergePlatformDistributionRows(items),
    ])
  );
}

function mapCreativeAsset(row: MetaCreativeRow): PreviewCreativeAsset {
  const storyLink = row.object_story_spec?.link_data?.link?.trim();
  const videoLink = row.object_story_spec?.video_data?.call_to_action?.value?.link?.trim();
  const videoId = row.object_story_spec?.video_data?.video_id?.trim();
  const isVideo = Boolean(videoId || row.object_type?.toUpperCase().includes("VIDEO"));
  const primaryImageUrl = row.image_url?.trim() || null;
  const videoPosterUrl =
    row.object_story_spec?.video_data?.image_url?.trim() ||
    primaryImageUrl ||
    row.object_story_spec?.video_data?.thumbnail_url?.trim() ||
    row.thumbnail_url?.trim() ||
    null;
  const imageUrl = isVideo ? videoPosterUrl : primaryImageUrl || row.thumbnail_url?.trim() || null;
  const thumbnailUrl =
    row.thumbnail_url?.trim() ||
    row.object_story_spec?.video_data?.thumbnail_url?.trim() ||
    videoPosterUrl ||
    imageUrl ||
    null;
  const effectiveObjectStoryId = row.effective_object_story_id?.trim() || null;
  const instagramPermalinkUrl = row.instagram_permalink_url?.trim() || null;
  const facebookPermalinkUrl = effectiveObjectStoryId ? `https://www.facebook.com/${effectiveObjectStoryId}` : null;
  const videoPermalinkUrl = videoId ? `https://www.facebook.com/watch/?v=${encodeURIComponent(videoId)}` : null;

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
    description: row.object_story_spec?.link_data?.description?.trim() || null,
    mediaType: isVideo ? "video" : "image",
    imageUrl,
    videoUrl: videoPermalinkUrl,
    videoId: videoId || null,
    videoSourceUrl: null,
    videoPermalinkUrl,
    thumbnailUrl,
    posterUrl: isVideo ? videoPosterUrl : imageUrl,
    mediaWarning: isVideo
      ? "Meta did not expose a direct playable video source for this creative yet."
      : null,
    linkUrl: storyLink || videoLink || null,
    callToActionType:
      row.object_story_spec?.link_data?.call_to_action?.type?.trim() ||
      row.object_story_spec?.video_data?.call_to_action?.type?.trim() ||
      null,
    objectType: row.object_type?.trim() || null,
    effectiveObjectStoryId,
    instagramPermalinkUrl,
    effectiveInstagramMediaId: row.effective_instagram_media_id?.trim() || null,
    facebookPermalinkUrl,
  };
}

function isMetaCreativeRow(
  value: MetaCreativeRow | { error?: MetaApiErrorShape }
): value is MetaCreativeRow {
  return !isMetaErrorRow(value);
}

function isMetaErrorRow(value: unknown): value is { error: MetaApiErrorShape } {
  return Boolean(
    value &&
      typeof value === "object" &&
      "error" in value &&
      (value as { error?: MetaApiErrorShape }).error
  );
}

function isMetaAdSetRow(value: MetaAdSetRow | { error?: MetaApiErrorShape }): value is MetaAdSetRow {
  return !isMetaErrorRow(value);
}

function buildVisiblePreviewAdSets(ads: MetaAdRow[], adSets: MetaAdSetRow[]): MetaAdSetRow[] {
  const adSetsById = new Map<string, MetaAdSetRow>();

  adSets.forEach((adSet) => {
    const adSetId = adSet.id?.trim();
    if (!adSetId) {
      return;
    }
    adSetsById.set(adSetId, adSet);
  });

  ads.forEach((ad) => {
    const adSetId = ad.adset_id?.trim();
    const campaignId = ad.campaign_id?.trim();
    if (!adSetId || !campaignId || adSetsById.has(adSetId)) {
      return;
    }
    adSetsById.set(adSetId, {
      id: adSetId,
      name: `Ad Set ${adSetId}`,
      campaign_id: campaignId,
      status: ad.status,
      effective_status: ad.effective_status,
    });
  });

  return Array.from(adSetsById.values());
}

function finalizePerformanceSummary(input: {
  resultLabel: string;
  results: number;
  spend: number;
  impressions: number;
  clicks: number;
  landingPageViews: number;
  linkClicks: number;
  costPerResult?: number;
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
    costPerResult:
      input.results > 0
        ? input.costPerResult ?? input.spend / input.results
        : null,
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

function mergePlatformDistributionRows(
  rows: PreviewPlatformDistributionRow[]
): PreviewPlatformDistributionRow[] {
  const totals = new Map<string, { platform: string; device: string; results: number; spend: number }>();

  rows.forEach((row) => {
    const key = `${row.platform}\u0000${row.device}`;
    const current = totals.get(key) ?? {
      platform: row.platform,
      device: row.device,
      results: 0,
      spend: 0,
    };
    current.results += row.results;
    current.spend += (row.costPerResult ?? 0) * row.results;
    totals.set(key, current);
  });

  return Array.from(totals.values())
    .map((row) => ({
      platform: row.platform,
      device: row.device,
      results: row.results,
      costPerResult: row.results > 0 ? row.spend / row.results : null,
    }))
    .sort((left, right) =>
      left.device.localeCompare(right.device) || left.platform.localeCompare(right.platform)
    );
}

function pickResultMetric(input: {
  objectiveResults?: MetaObjectiveResultMetricValue;
  costPerResult?: MetaObjectiveResultMetricValue;
  costPerObjectiveResult?: MetaObjectiveResultMetricValue;
  reach?: string;
  cpp?: string;
  estimatedAdRecallers?: string;
  costPerEstimatedAdRecallers?: string;
  videoThruPlayWatchedActions?: MetaActionMetricValue;
  costPerThruPlay?: MetaActionMetricValue;
  actions?: MetaActionMetric[];
  costs?: MetaActionMetric[];
  objective?: string;
  optimizationGoal?: string;
}): { actionType: string; label: string; value: number; costPerResult: number | null } {
  // Awareness campaigns use delivery outcomes rather than conversion actions.
  // Preserve Meta's configured awareness result so the preview KPIs match Ads
  // Manager instead of forcing Results and Cost per result to zero.
  const awarenessResultMetric = pickAwarenessResultMetric(input);
  if (awarenessResultMetric) {
    return awarenessResultMetric;
  }

  // Meta Ads Manager exposes the campaign's selected Results definition through
  // cost_per_result.indicator. Prefer that explicit action mapping over broad
  // objective fallbacks because a messaging lead campaign can contain both
  // generic lead actions and messaging-conversation actions.
  const configuredResultCostMetric = input.actions?.length
    ? pickConfiguredResultCostMetric(
        input.costPerResult,
        input.costPerObjectiveResult,
        input.actions,
        input.costs
      )
    : null;
  if (configuredResultCostMetric) {
    return configuredResultCostMetric;
  }

  const trafficResultMetric = pickTrafficResultMetric(input);
  if (trafficResultMetric) {
    return trafficResultMetric;
  }

  const salesResultMetric = pickSalesResultMetric(input);
  if (salesResultMetric) {
    return salesResultMetric;
  }

  const leadResultMetric = pickLeadResultMetric(input);
  if (leadResultMetric) {
    return leadResultMetric;
  }

  const objectiveResultMetric = pickObjectiveResultMetric(
    input.objectiveResults,
    input.costPerResult,
    input.costPerObjectiveResult
  );
  if (objectiveResultMetric) {
    return objectiveResultMetric;
  }

  if (isLeadResult(input.objective, input.optimizationGoal)) {
    return {
      actionType: "lead",
      label: "Lead",
      value: 0,
      costPerResult: null,
    };
  }

  const actions = input.actions;
  const costs = input.costs;

  if (!actions?.length) {
    return { actionType: "results", label: "Results", value: 0, costPerResult: null };
  }

  const prioritizedActionTypes = uniqueActionTypes([
    ...resultActionPriorityForObjective(input.objective, input.optimizationGoal),
    ...RESULT_ACTION_PRIORITY,
  ]);

  for (const actionType of prioritizedActionTypes) {
    const matched = actions.find((action) => action.action_type === actionType);
    if (!matched) {
      continue;
    }

    return createResultMetric(actionType, matched, costs);
  }

  const inferredMessagingMatch = actions.find((action) =>
    isMessagingConversationAction(action.action_type)
  );
  if (inferredMessagingMatch?.action_type) {
    return createResultMetric(inferredMessagingMatch.action_type, inferredMessagingMatch, costs);
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

function pickConfiguredResultCostMetric(
  costPerResult: MetaObjectiveResultMetricValue | undefined,
  costPerObjectiveResult: MetaObjectiveResultMetricValue | undefined,
  actions: MetaActionMetric[],
  costs: MetaActionMetric[] | undefined
): { actionType: string; label: string; value: number; costPerResult: number | null } | null {
  const costMetrics = [
    ...normalizeMetaObjectiveResultMetrics(costPerResult),
    ...normalizeMetaObjectiveResultMetrics(costPerObjectiveResult),
  ].filter((metric) => readMetaObjectiveResultValue(metric) > 0);

  for (const costMetric of costMetrics) {
    const action = findActionForObjectiveCost(costMetric, actions);
    if (action?.action_type && toNumber(action.value) > 0) {
      const actionCost =
        costs?.find((cost) => cost.action_type === action.action_type) ?? null;

      return {
        actionType: action.action_type,
        label: humanizeObjectiveResultLabel(costMetric, action.action_type),
        value: toNumber(action.value),
        costPerResult: actionCost
          ? toNumber(actionCost.value)
          : readMetaObjectiveResultValue(costMetric),
      };
    }
  }

  return null;
}

function findActionForObjectiveCost(
  costMetric: MetaObjectiveResultMetric,
  actions: MetaActionMetric[]
): MetaActionMetric | null {
  const candidates = buildObjectiveCostActionCandidates(readMetaObjectiveResultKey(costMetric));

  for (const candidate of candidates) {
    const exactMatch = actions.find((action) => action.action_type === candidate);
    if (exactMatch) {
      return exactMatch;
    }
  }

  return null;
}

function buildObjectiveCostActionCandidates(actionType: string): string[] {
  const stripped = actionType
    .trim()
    .replace(/^(actions|conversions):/i, "")
    .trim();
  const candidates = [stripped];
  const customConversionPrefix = "offsite_conversion.fb_pixel_custom.";

  if (stripped.startsWith(customConversionPrefix)) {
    candidates.push("offsite_conversion.fb_pixel_custom");
  }

  return uniqueActionTypes(candidates.filter(Boolean));
}

function pickAwarenessResultMetric(input: {
  objective?: string;
  optimizationGoal?: string;
  reach?: string;
  cpp?: string;
  estimatedAdRecallers?: string;
  costPerEstimatedAdRecallers?: string;
  videoThruPlayWatchedActions?: MetaActionMetricValue;
  costPerThruPlay?: MetaActionMetricValue;
}): { actionType: string; label: string; value: number; costPerResult: number | null } | null {
  const objective = input.objective?.trim().toUpperCase() ?? "";
  const optimizationGoal = input.optimizationGoal?.trim().toUpperCase() ?? "";
  const isAwarenessResult =
    objective.includes("AWARENESS") ||
    optimizationGoal.includes("THRUPLAY") ||
    optimizationGoal.includes("AD_RECALL") ||
    optimizationGoal.includes("REACH");

  if (!isAwarenessResult) {
    return null;
  }

  const estimatedAdRecallers = toNumber(input.estimatedAdRecallers);
  const costPerEstimatedAdRecaller = toNumber(input.costPerEstimatedAdRecallers);
  const thruPlays = readMetaMetricValue(input.videoThruPlayWatchedActions);
  const costPerThruPlay = readMetaMetricValue(input.costPerThruPlay);
  const reach = toNumber(input.reach);

  if (optimizationGoal.includes("THRUPLAY") && thruPlays > 0) {
    return {
      actionType: "video_thruplay_watched_actions",
      label: "ThruPlays",
      value: thruPlays,
      costPerResult: costPerThruPlay > 0 ? costPerThruPlay : null,
    };
  }

  if (estimatedAdRecallers > 0) {
    return {
      actionType: "estimated_ad_recallers",
      label: "Estimated ad recallers",
      value: estimatedAdRecallers,
      costPerResult: costPerEstimatedAdRecaller > 0 ? costPerEstimatedAdRecaller : null,
    };
  }

  if (thruPlays > 0) {
    return {
      actionType: "video_thruplay_watched_actions",
      label: "ThruPlays",
      value: thruPlays,
      costPerResult: costPerThruPlay > 0 ? costPerThruPlay : null,
    };
  }

  if (reach > 0) {
    return {
      actionType: "reach",
      label: "Reach",
      value: reach,
      costPerResult: toNumber(input.cpp) > 0 ? toNumber(input.cpp) : null,
    };
  }

  return {
    actionType: "awareness",
    label: "Awareness",
    value: 0,
    costPerResult: null,
  };
}

function readMetaMetricValue(value: MetaActionMetricValue | undefined): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + toNumber(item.value), 0);
  }
  if (typeof value === "object") {
    return toNumber(value.value);
  }
  return toNumber(value);
}

function pickTrafficResultMetric(input: {
  objective?: string;
  optimizationGoal?: string;
  actions?: MetaActionMetric[];
  costs?: MetaActionMetric[];
}): { actionType: string; label: string; value: number; costPerResult: number | null } | null {
  const objective = input.objective?.trim().toUpperCase() ?? "";
  const optimizationGoal = input.optimizationGoal?.trim().toUpperCase() ?? "";
  const isTrafficResult =
    objective.includes("TRAFFIC") ||
    objective.includes("LINK_CLICKS") ||
    optimizationGoal.includes("LANDING_PAGE") ||
    optimizationGoal.includes("LINK_CLICK");

  if (!isTrafficResult || !input.actions?.length) {
    return null;
  }

  const preferredActionTypes =
    optimizationGoal.includes("LINK_CLICK") && !optimizationGoal.includes("LANDING_PAGE")
      ? ["link_click", "landing_page_view"]
      : ["landing_page_view", "link_click"];

  for (const actionType of preferredActionTypes) {
    const matched = input.actions.find(
      (action) => action.action_type === actionType && toNumber(action.value) > 0
    );
    if (matched) {
      return createResultMetric(actionType, matched, input.costs);
    }
  }

  return null;
}

function pickLeadResultMetric(input: {
  objective?: string;
  optimizationGoal?: string;
  actions?: MetaActionMetric[];
  costs?: MetaActionMetric[];
}): { actionType: string; label: string; value: number; costPerResult: number | null } | null {
  if (!isLeadResult(input.objective, input.optimizationGoal)) {
    return null;
  }

  for (const actionType of META_LEAD_RESULT_ACTION_PRIORITY) {
    const matched = input.actions?.find(
      (action) => action.action_type === actionType && toNumber(action.value) > 0
    );
    if (matched) {
      return createResultMetric(actionType, matched, input.costs);
    }
  }

  return null;
}

function pickSalesResultMetric(input: {
  objective?: string;
  optimizationGoal?: string;
  actions?: MetaActionMetric[];
  costs?: MetaActionMetric[];
}): { actionType: string; label: string; value: number; costPerResult: number | null } | null {
  const objective = input.objective?.trim().toUpperCase() ?? "";
  const optimizationGoal = input.optimizationGoal?.trim().toUpperCase() ?? "";
  const isSalesResult =
    objective.includes("SALES") ||
    objective.includes("CONVERSION") ||
    optimizationGoal.includes("PURCHASE") ||
    optimizationGoal.includes("VALUE");

  if (!isSalesResult) {
    return null;
  }

  for (const actionType of META_SALES_RESULT_ACTION_PRIORITY) {
    const matched = input.actions?.find(
      (action) => action.action_type === actionType && toNumber(action.value) > 0
    );
    if (matched) {
      return createResultMetric(actionType, matched, input.costs);
    }
  }

  return {
    actionType: "purchase",
    label: "Purchase",
    value: 0,
    costPerResult: null,
  };
}

function pickObjectiveResultMetric(
  objectiveResults: MetaObjectiveResultMetricValue | undefined,
  costPerResult: MetaObjectiveResultMetricValue | undefined,
  costPerObjectiveResult: MetaObjectiveResultMetricValue | undefined
): { actionType: string; label: string; value: number; costPerResult: number | null } | null {
  const validResults = normalizeMetaObjectiveResultMetrics(objectiveResults).filter(
    (result) => readMetaObjectiveResultValue(result) > 0
  );
  if (validResults.length === 0) {
    return null;
  }

  const preferredResult = validResults[0];
  const actionType = readMetaObjectiveResultKey(preferredResult);
  const value = validResults.reduce(
    (total, result) => total + readMetaObjectiveResultValue(result),
    0
  );
  const costMetric =
    findMatchingObjectiveCost(actionType, costPerResult) ??
    findMatchingObjectiveCost(actionType, costPerObjectiveResult);

  return {
    actionType,
    label: humanizeObjectiveResultLabel(preferredResult, actionType),
    value,
    costPerResult: costMetric ? readMetaObjectiveResultValue(costMetric) : null,
  };
}

function resultActionPriorityForObjective(
  objective: string | undefined,
  optimizationGoal: string | undefined
): readonly string[] {
  const normalizedObjective = objective?.trim().toUpperCase() ?? "";
  const normalizedOptimizationGoal = optimizationGoal?.trim().toUpperCase() ?? "";

  if (
    normalizedOptimizationGoal.includes("MESSAGE") ||
    normalizedOptimizationGoal.includes("CONVERSATION")
  ) {
    return META_MESSAGING_RESULT_ACTION_PRIORITY;
  }

  if (normalizedObjective.includes("ENGAGEMENT")) {
    return META_ENGAGEMENT_RESULT_ACTION_PRIORITY;
  }

  if (normalizedObjective.includes("LEAD")) {
    return META_LEAD_RESULT_ACTION_PRIORITY;
  }

  if (normalizedObjective.includes("SALES") || normalizedObjective.includes("CONVERSION")) {
    return META_SALES_RESULT_ACTION_PRIORITY;
  }

  if (normalizedObjective.includes("TRAFFIC")) {
    return META_TRAFFIC_RESULT_ACTION_PRIORITY;
  }

  return [];
}

function isLeadResult(
  objective: string | undefined,
  optimizationGoal: string | undefined
): boolean {
  const normalizedObjective = objective?.trim().toUpperCase() ?? "";
  const normalizedOptimizationGoal = optimizationGoal?.trim().toUpperCase() ?? "";

  return (
    normalizedObjective.includes("LEAD") ||
    normalizedOptimizationGoal.includes("LEAD") ||
    normalizedOptimizationGoal.includes("FORM")
  );
}

function findMatchingObjectiveCost(
  actionType: string,
  costs: MetaObjectiveResultMetricValue | undefined
): MetaObjectiveResultMetric | null {
  const normalizedCosts = normalizeMetaObjectiveResultMetrics(costs);
  if (normalizedCosts.length === 0) {
    return null;
  }

  return (
    normalizedCosts.find((cost) => readMetaObjectiveResultKey(cost) === actionType) ??
    normalizedCosts.find((cost) => readMetaObjectiveResultValue(cost) > 0) ??
    null
  );
}

function normalizeMetaObjectiveResultMetrics(
  value: MetaObjectiveResultMetricValue | undefined
): MetaObjectiveResultMetric[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    return [{ value }];
  }

  return [value];
}

function readMetaObjectiveResultKey(result: MetaObjectiveResultMetric): string {
  return (
    result.indicator?.trim() ||
    result.id?.trim() ||
    result.name?.trim() ||
    result.title?.trim() ||
    "objective_results"
  );
}

function readMetaObjectiveResultValue(result: MetaObjectiveResultMetric): number {
  const directValue = toNumber(result.value);
  if (directValue > 0) {
    return directValue;
  }

  return result.values?.reduce((total, item) => total + toNumber(item.value), 0) ?? 0;
}

function humanizeObjectiveResultLabel(
  result: MetaObjectiveResultMetric,
  actionType: string
): string {
  const explicitLabel = result.title?.trim() || result.name?.trim();
  if (explicitLabel) {
    return explicitLabel;
  }

  if (actionType === "objective_results") {
    return "Results";
  }

  return humanizeActionType(actionType);
}

function createResultMetric(
  actionType: string,
  action: MetaActionMetric,
  costs: MetaActionMetric[] | undefined
): { actionType: string; label: string; value: number; costPerResult: number | null } {
  const costMatched = costs?.find((cost) => cost.action_type === actionType);
  return {
    actionType,
    label: humanizeActionType(actionType),
    value: toNumber(action.value),
    costPerResult: costMatched?.value ? toNumber(costMatched.value) : null,
  };
}

function uniqueActionTypes(actionTypes: readonly string[]): string[] {
  return Array.from(new Set(actionTypes));
}

function isMessagingConversationAction(actionType: string | undefined): boolean {
  const normalizedActionType = actionType?.trim().toLowerCase();
  return Boolean(
    normalizedActionType &&
      normalizedActionType.includes("messaging") &&
      normalizedActionType.includes("conversation")
  );
}

function pickActionValue(
  actions: MetaActionMetric[] | undefined,
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

const META_DETAILED_TARGETING_CATEGORIES: Array<{
  key: MetaDetailedTargetingCategory;
  label: string;
}> = [
  { key: "interests", label: "Interests" },
  { key: "behaviors", label: "Behaviors" },
  { key: "demographics", label: "Demographics" },
  { key: "education_statuses", label: "Education" },
  { key: "relationship_statuses", label: "Relationship status" },
  { key: "life_events", label: "Life events" },
  { key: "industries", label: "Industries" },
  { key: "income", label: "Income" },
  { key: "family_statuses", label: "Family status" },
  { key: "work_positions", label: "Job titles" },
  { key: "work_employers", label: "Employers" },
  { key: "custom_audiences", label: "Custom audiences" },
];

function formatDetailedTargeting(targeting: MetaAdSetRow["targeting"]): string | null {
  if (!targeting) {
    return "None";
  }

  const sections: string[] = [];
  const directMatches = formatDetailedTargetingGroup(targeting, "People who match:");
  if (directMatches) {
    sections.push(directMatches);
  }

  targeting.flexible_spec?.forEach((spec, index) => {
    const heading = sections.length === 0 && index === 0 ? "People who match:" : "And must also match:";
    const group = formatDetailedTargetingGroup(spec, heading);
    if (group) {
      sections.push(group);
    }
  });

  const exclusions = formatDetailedTargetingExclusions(targeting);
  if (exclusions) {
    sections.push(exclusions);
  }

  return sections.length > 0 ? sections.join("\n\n") : "None";
}

function formatDetailedTargetingGroup(
  spec: MetaFlexibleTargetingSpec,
  heading: string
): string | null {
  const lines = META_DETAILED_TARGETING_CATEGORIES
    .map(({ key, label }) => formatDetailedTargetingCategoryLine(label, spec[key]))
    .filter((line): line is string => Boolean(line));

  if (lines.length === 0) {
    return null;
  }

  return [heading, ...lines].join("\n");
}

function formatDetailedTargetingExclusions(targeting: MetaAdSetRow["targeting"]): string | null {
  const lines: string[] = [];
  const excludedCustomAudiences = formatDetailedTargetingCategoryLine(
    "Custom audiences",
    targeting?.excluded_custom_audiences
  );
  if (excludedCustomAudiences) {
    lines.push(excludedCustomAudiences);
  }

  if (targeting?.exclusions) {
    const exclusionLines = META_DETAILED_TARGETING_CATEGORIES
      .filter(({ key }) => key !== "custom_audiences")
      .map(({ key, label }) => formatDetailedTargetingCategoryLine(label, targeting.exclusions?.[key]))
      .filter((line): line is string => Boolean(line));
    lines.push(...exclusionLines);
  }

  return lines.length > 0 ? ["Exclude people who match:", ...lines].join("\n") : null;
}

function formatDetailedTargetingCategoryLine(
  label: string,
  items: MetaTargetingItem[] | undefined
): string | null {
  const names = uniqueNonEmpty(items?.map((item) => item.name?.trim()) ?? []);
  if (names.length === 0) {
    return null;
  }

  return `- ${label}: ${names.join(", ")}`;
}

function uniqueNonEmpty(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
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
