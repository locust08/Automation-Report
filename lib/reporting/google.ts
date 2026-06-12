import { emptyCampaignRow, hasReportableCampaignSpend } from "@/lib/reporting/metrics";
import {
  addSourceToAudienceItems,
  aggregateAudienceItems,
  coerceAudienceClicks,
  createAudienceClickBreakdownItem,
  createEmptyGoogleAudienceClickBreakdownResponse,
  limitAudienceItemsWithOthers,
  normalizeAudienceAgeLabel,
  normalizeAudienceGenderLabel,
  normalizeAudienceLocationLabel,
  sortAudienceItems,
} from "@/lib/reporting/audience-breakdown";
import {
  AudienceClickBreakdownItem,
  AudienceClickBreakdownResponse,
  AuctionInsightRow,
  CampaignRow,
  GoogleAdsAccessPathErrorPayload,
  PreviewCampaignNode,
  PreviewDetailField,
  GoogleFinalUrlSpendRow,
  GoogleImageCreativePerformanceRow,
  GoogleVideoCreativePerformanceRow,
  GooglePreviewBlockDiagnostic,
  GooglePreviewDiagnostics,
  GooglePreviewFatalError,
  GooglePreviewWarning,
  GoogleAudienceClickBreakdownResponse,
  GoogleAudienceSourceClickItem,
  PreviewImageAsset,
  PreviewSitelinkAsset,
  PreviewTextAsset,
  TopKeywordRow,
} from "@/lib/reporting/types";
import {
  DEFAULT_GOOGLE_ADS_FALLBACK_LOGIN_CUSTOMER_ID,
  formatGoogleAdsAccessPathErrorMessage,
  isDirectGoogleAdsAccessPath,
  normalizeGoogleAdsAccessPath,
  resolveGoogleAdsAccessPath,
  sanitizeGoogleAdsAccessPath,
} from "@/lib/reporting/google-access-path";

interface GoogleFetchInput {
  customerId: string;
  apiVersion: string;
  developerToken: string;
  accessToken: string | null;
  refreshToken: string | null;
  clientId: string | null;
  clientSecret: string | null;
  loginCustomerId: string | null;
  accessPath?: string | null;
  fallbackLoginCustomerId?: string | null;
  startDate: string;
  endDate: string;
}

type GooglePreviewStage = "campaigns" | "ad-groups" | "ads" | "preview" | "assets" | "full";

interface GooglePreviewSelection {
  platform: "meta" | "google" | null;
  campaignId: string | null;
  adGroupId: string | null;
  adId: string | null;
}

interface GoogleAccountNameInput {
  customerId: string;
  apiVersion: string;
  developerToken: string;
  accessToken: string | null;
  refreshToken: string | null;
  clientId: string | null;
  clientSecret: string | null;
  loginCustomerId: string | null;
}

export interface GooglePreviewAccountResolution {
  customerId: string;
  loginCustomerId: string | null;
  resolutionMode: "direct" | "manager";
}

export interface GooglePreviewFetchResult {
  data: PreviewCampaignNode[];
  warnings: GooglePreviewWarning[];
  fatalError: GooglePreviewFatalError | null;
  diagnostics: GooglePreviewDiagnostics;
}

interface GoogleGeoSegmentBreakdown {
  items: AudienceClickBreakdownItem[];
  countryItems: AudienceClickBreakdownItem[];
}

interface GoogleAdsStreamBatch {
  results?: GoogleAdsResult[];
  error?: {
    message?: string;
  };
}

interface GoogleAdsSearchResponse {
  results?: Array<{
    customer?: {
      descriptiveName?: string;
      descriptive_name?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface GoogleProximityGeoPoint {
  latitudeInMicroDegrees?: string | number;
  longitudeInMicroDegrees?: string | number;
}

interface GoogleProximityInfo {
  address?: {
    cityName?: string;
    countryCode?: string;
    postalCode?: string;
    provinceCode?: string;
    provinceName?: string;
    streetAddress?: string;
  };
  geoPoint?: GoogleProximityGeoPoint;
  radius?: string | number;
  radiusUnits?: string;
}

interface GoogleAdsResult {
  ageRangeView?: {
    ageRange?: string;
  };
  customer?: {
    id?: string;
  };
  genderView?: {
    gender?: string;
  };
  geographicView?: {
    countryCriterionId?: string | number;
    locationType?: string;
  };
  userLocationView?: {
    countryCriterionId?: string | number;
    targetingLocation?: string | boolean;
  };
  locationView?: {
    resourceName?: string;
  };
  detailPlacementView?: {
    placement?: string;
    displayName?: string;
  };
  groupPlacementView?: {
    targetUrl?: string;
  };
  topicView?: {
    topic?: string;
  };
  customerClient?: {
    id?: string;
    clientCustomer?: string;
    level?: string | number;
    manager?: boolean;
  };
  campaign?: {
    id?: string;
    name?: string;
    advertisingChannelType?: string;
    status?: string;
    servingStatus?: string;
    biddingStrategyType?: string;
    startDate?: string;
    endDate?: string;
    networkSettings?: {
      targetGoogleSearch?: boolean;
      targetSearchNetwork?: boolean;
      targetPartnerSearchNetwork?: boolean;
      targetContentNetwork?: boolean;
    };
  };
  campaignBudget?: {
    amountMicros?: string | number;
  };
  assetGroup?: {
    id?: string;
    name?: string;
    finalUrls?: string[];
    status?: string;
  };
  assetGroupAsset?: {
    asset?: string;
    fieldType?: string;
    status?: string;
  };
  adGroup?: {
    id?: string;
    name?: string;
    status?: string;
    type?: string;
    cpcBidMicros?: string | number;
  };
  campaignCriterion?: {
    resourceName?: string;
    criterionId?: string;
    type?: string;
    negative?: boolean;
    status?: string;
    location?: {
      geoTargetConstant?: string;
    };
    proximity?: GoogleProximityInfo;
  };
  geoTargetConstant?: {
    resourceName?: string;
    id?: string | number;
    name?: string;
    canonicalName?: string;
    countryCode?: string;
    targetType?: string;
    status?: string;
  };
  languageConstant?: {
    name?: string;
  };
  adGroupAd?: {
    status?: string;
    ad?: {
      id?: string;
      name?: string;
      type?: string;
      finalUrls?: string[];
      displayUrl?: string;
      responsiveSearchAd?: {
        path1?: string;
        path2?: string;
        headlines?: Array<{
          text?: string;
          pinnedField?: string;
        }>;
        descriptions?: Array<{
          text?: string;
          pinnedField?: string;
        }>;
      };
      expandedTextAd?: {
        headlinePart1?: string;
        headlinePart2?: string;
        headlinePart3?: string;
        description?: string;
        description2?: string;
        path1?: string;
        path2?: string;
      };
      imageAd?: {
        imageUrl?: string;
        previewImageUrl?: string;
        name?: string;
        imageAsset?: {
          asset?: string;
        };
      };
      responsiveDisplayAd?: {
        headlines?: Array<{
          text?: string;
        }>;
        longHeadline?: {
          text?: string;
        };
        descriptions?: Array<{
          text?: string;
        }>;
        marketingImages?: Array<{
          asset?: string;
        }>;
        squareMarketingImages?: Array<{
          asset?: string;
        }>;
      };
      videoResponsiveAd?: {
        headlines?: Array<{
          text?: string;
        }>;
        longHeadlines?: Array<{
          text?: string;
        }>;
        descriptions?: Array<{
          text?: string;
        }>;
        videos?: Array<{
          asset?: string;
        }>;
      };
    };
  };
  asset?: {
    resourceName?: string;
    id?: string;
    name?: string;
    type?: string;
    finalUrls?: string[];
    textAsset?: {
      text?: string;
    };
    sitelinkAsset?: {
      linkText?: string;
      description1?: string;
      description2?: string;
    };
    imageAsset?: {
      fullSize?: {
        url?: string;
      };
    };
    youtubeVideoAsset?: {
      youtubeVideoId?: string;
      youtubeVideoTitle?: string;
    };
  };
  adGroupAsset?: {
    fieldType?: string;
  };
  campaignAsset?: {
    fieldType?: string;
  };
  customerAsset?: {
    fieldType?: string;
  };
  segments?: {
    auctionInsightDomain?: string;
    geoTargetCity?: string;
    geoTargetCountry?: string;
    geoTargetMostSpecificLocation?: string;
    geoTargetProvince?: string;
    geoTargetRegion?: string;
    geoTargetState?: string;
  };
  adGroupCriterion?: {
    criterionId?: string;
    ageRange?: {
      type?: string;
    };
    gender?: {
      type?: string;
    };
    keyword?: {
      text?: string;
    };
  };
  metrics?: {
    impressions?: string | number;
    clicks?: string | number;
    ctr?: number | string;
    averageCpc?: string | number;
    conversions?: string | number;
    costMicros?: string | number;
    engagements?: string | number;
    interactions?: string | number;
    conversionRate?: number | string;
    searchImpressionShare?: number | string;
    searchBudgetLostImpressionShare?: number | string;
    searchRankLostImpressionShare?: number | string;
    videoViews?: string | number;
    videoTrueviewViews?: string | number;
    auctionInsightSearchImpressionShare?: number | string;
    auctionInsightSearchOverlapRate?: number | string;
    auctionInsightSearchPositionAboveRate?: number | string;
    auctionInsightSearchTopImpressionPercentage?: number | string;
    auctionInsightSearchAbsoluteTopImpressionPercentage?: number | string;
    auctionInsightSearchOutrankingShare?: number | string;
  };
}

interface ParsedGoogleResponse {
  status: number;
  ok: boolean;
  contentType: string;
  json: GoogleAdsStreamBatch[] | { error?: { message?: string } } | null;
  textSnippet: string;
  parseError: string | null;
  requestId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

const GOOGLE_ADS_MAX_RETRIES = 3;
const GOOGLE_ADS_STREAM_RETRIES = 2;
const ACCESSIBLE_CUSTOMERS_CACHE = new Map<string, Promise<string[]>>();

interface GoogleHierarchyNode {
  id: string;
  campaignId: string;
  name: string;
  status: string;
  details: PreviewDetailField[];
  finalUrl?: string | null;
  displayPathParts?: string[];
  headlines?: PreviewTextAsset[];
  descriptions?: PreviewTextAsset[];
  keywords?: string[];
  images?: PreviewImageAsset[];
  businessName?: string | null;
  businessLogoUrl?: string | null;
  sitelinks?: PreviewSitelinkAsset[];
}

interface GoogleAssetLinkResult {
  ownerId: string;
  fieldType: string;
  assetId: string;
  text?: string | null;
  linkText?: string | null;
  description1?: string | null;
  description2?: string | null;
  finalUrl?: string | null;
  imageUrl?: string | null;
}

interface GoogleYoutubeVideoAssetDetails {
  resourceName: string;
  youtubeVideoId: string | null;
  youtubeVideoTitle: string | null;
}

interface GoogleImpressionShareMetrics {
  impressionShare: number | null;
  lostImpressionShareBudget: number | null;
  lostImpressionShareRank: number | null;
}

interface GoogleFinalUrlImpressionShareLookup {
  byAdGroupId: Map<string, GoogleImpressionShareMetrics>;
  byCampaignId: Map<string, GoogleImpressionShareMetrics>;
}

interface WeightedMetricAccumulator {
  sum: number;
  weight: number;
}

interface GoogleFinalUrlAccumulator {
  row: GoogleFinalUrlSpendRow;
  impressionShare: WeightedMetricAccumulator;
  lostImpressionShareBudget: WeightedMetricAccumulator;
  lostImpressionShareRank: WeightedMetricAccumulator;
  sawAdGroupShare: boolean;
  sawCampaignShare: boolean;
}

interface GooglePreviewBlockDefinition {
  label:
    | "preview-campaigns"
    | "preview-ad-groups"
    | "preview-ads"
    | "preview-keywords"
    | "preview-ad-group-assets"
    | "preview-campaign-assets"
    | "preview-customer-assets"
    | "preview-campaign-locations"
    | "preview-campaign-languages";
  required: boolean;
  queries: string[];
}

interface GooglePreviewContext {
  customerId: string;
  loginCustomerId: string | null;
  accessPath: string | null;
  originalAccessPath: string | null;
  resolvedAccessPath: string;
  fallbackUsed: boolean;
  resolutionMode: "direct" | "manager";
}

interface GooglePreviewBlockSuccess {
  results: GoogleAdsResult[];
  diagnostic: GooglePreviewBlockDiagnostic;
}

interface GoogleAdsRequestErrorDetails {
  status: number | null;
  requestId: string | null;
  errorCode: string | null;
  errorMessage: string;
  category:
    | "account-resolution"
    | "permission"
    | "invalid-gaql"
    | "unsupported-resource"
    | "empty-result"
    | "rate-limit"
    | "network"
    | "unknown";
}

class GoogleAdsRequestError extends Error {
  readonly status: number | null;
  readonly requestId: string | null;
  readonly errorCode: string | null;
  readonly category: GoogleAdsRequestErrorDetails["category"];

  constructor(details: GoogleAdsRequestErrorDetails) {
    super(details.errorMessage);
    this.name = "GoogleAdsRequestError";
    this.status = details.status;
    this.requestId = details.requestId;
    this.errorCode = details.errorCode;
    this.category = details.category;
  }
}

class GooglePreviewFatalErrorWrapper extends Error {
  readonly fatalError: GooglePreviewFatalError;

  constructor(fatalError: GooglePreviewFatalError) {
    super(fatalError.message);
    this.name = "GooglePreviewFatalErrorWrapper";
    this.fatalError = fatalError;
  }
}

export class GoogleAdsAccessPathError extends Error {
  readonly payload: GoogleAdsAccessPathErrorPayload;
  readonly httpStatus: number;

  constructor(payload: GoogleAdsAccessPathErrorPayload, httpStatus = 502) {
    super(payload.message);
    this.name = "GoogleAdsAccessPathError";
    this.payload = payload;
    this.httpStatus = httpStatus;
  }
}

export function isGoogleAdsAccessPathError(error: unknown): error is GoogleAdsAccessPathError {
  return error instanceof GoogleAdsAccessPathError;
}

export async function fetchGoogleAccountName({
  customerId,
  apiVersion,
  developerToken,
  accessToken,
  refreshToken,
  clientId,
  clientSecret,
  loginCustomerId,
}: GoogleAccountNameInput): Promise<string | null> {
  const normalizedCustomerId = normalizeGoogleAdsId(customerId);
  const normalizedLoginCustomerId = normalizeOptionalGoogleAdsId(loginCustomerId);
  const canRefresh = Boolean(refreshToken && clientId && clientSecret);
  let activeAccessToken = accessToken;

  if (canRefresh) {
    activeAccessToken = await refreshGoogleAccessToken({
      refreshToken: refreshToken!,
      clientId: clientId!,
      clientSecret: clientSecret!,
    });
  }

  if (!activeAccessToken) {
    throw new Error(
      "Missing Google Ads access token. Set GOOGLE_ADS_ACCESS_TOKEN (or GOOGLE_OAUTH_ACCESS_TOKEN), or provide refresh credentials."
    );
  }

  const endpoint = `https://googleads.googleapis.com/${apiVersion}/customers/${normalizedCustomerId}/googleAds:search`;
  const body = {
    query: "SELECT customer.descriptive_name FROM customer LIMIT 1",
  };

  await logAccessibleGoogleAdsCustomers({
    apiVersion,
    developerToken,
    accessToken: activeAccessToken,
    customerId: normalizedCustomerId,
    loginCustomerId: normalizedLoginCustomerId,
  });
  logGoogleAdsRequestRouting(normalizedCustomerId, normalizedLoginCustomerId);

  const firstAttempt = await requestGoogleAdsSearch(
    endpoint,
    body,
    developerToken,
    activeAccessToken,
    normalizedLoginCustomerId
  );

  let parsed = await parseGoogleAdsSearchResponse(firstAttempt);

  if ((parsed.status === 401 || parsed.status === 403) && canRefresh) {
    activeAccessToken = await refreshGoogleAccessToken({
      refreshToken: refreshToken!,
      clientId: clientId!,
      clientSecret: clientSecret!,
    });
    const secondAttempt = await requestGoogleAdsSearch(
      endpoint,
      body,
      developerToken,
      activeAccessToken,
      normalizedLoginCustomerId
    );
    parsed = await parseGoogleAdsSearchResponse(secondAttempt);
  }

  if (!parsed.ok) {
    throw new GoogleAdsRequestError({
      status: parsed.status,
      requestId: parsed.requestId,
      errorCode: parsed.errorCode,
      errorMessage:
        parsed.errorMessage || `Google Ads API request failed with status ${parsed.status}.`,
      category: classifyGoogleAdsFailure(
        parsed.status,
        parsed.errorCode,
        parsed.errorMessage || `Google Ads API request failed with status ${parsed.status}.`
      ),
    });
  }

  const firstResult = parsed.json?.results?.[0];
  const name = firstResult?.customer?.descriptiveName || firstResult?.customer?.descriptive_name;
  return name?.trim() || null;
}

export async function fetchGoogleCampaignRows({
  customerId,
  apiVersion,
  developerToken,
  accessToken,
  refreshToken,
  clientId,
  clientSecret,
  loginCustomerId,
  accessPath,
  fallbackLoginCustomerId,
  startDate,
  endDate,
}: GoogleFetchInput): Promise<CampaignRow[]> {
  const context = await resolveVerifiedGoogleAdsContext({
    customerId,
    apiVersion,
    developerToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    loginCustomerId,
    accessPath: accessPath ?? null,
    fallbackLoginCustomerId: fallbackLoginCustomerId ?? null,
  });

  const baseSelect = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.advertising_channel_type,
      campaign.status,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions,
      metrics.cost_micros
    FROM campaign
    WHERE campaign.status = 'ENABLED'
      AND segments.date BETWEEN '${startDate}' AND '${endDate}'
  `;

  const results = await fetchGoogleAdsResultsWithFallback({
    customerId: context.customerId,
    apiVersion,
    developerToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    loginCustomerId: context.loginCustomerId,
    queries: [
      `
        SELECT
          campaign.id,
          campaign.name,
          campaign.advertising_channel_type,
          campaign.status,
          metrics.impressions,
          metrics.clicks,
          metrics.ctr,
          metrics.average_cpc,
          metrics.conversions,
          metrics.cost_micros,
          metrics.engagements,
          metrics.interactions
        FROM campaign
        WHERE campaign.status = 'ENABLED'
          AND segments.date BETWEEN '${startDate}' AND '${endDate}'
      `,
      baseSelect,
    ],
  });

  return results
    .map((result) => {
      const campaignName = result.campaign?.name?.trim() || "Untitled Campaign";
      const channelType = result.campaign?.advertisingChannelType || "UNKNOWN";
      const platform = channelType === "VIDEO" ? "googleYoutube" : "google";
      const campaignType = normalizeCampaignType(channelType);

      const row = emptyCampaignRow(
        result.campaign?.id ?? `${campaignType}-${campaignName}`,
        platform,
        campaignType,
        campaignName
      );

      const impressions = toNumber(result.metrics?.impressions);
      const clicks = toNumber(result.metrics?.clicks);
      const spend = microsToCurrency(result.metrics?.costMicros);
      const conversions = toNumber(result.metrics?.conversions);

      row.impressions = impressions;
      row.clicks = clicks;
      row.spend = spend;
      row.conversions = conversions;
      row.results = conversions;
      row.ctr = normalizeCtr(result.metrics?.ctr, impressions, clicks);
      row.avgCpc = microsToCurrency(result.metrics?.averageCpc) || (clicks > 0 ? spend / clicks : 0);
      row.cpm = impressions > 0 ? (spend * 1000) / impressions : 0;
      row.costPerResult = conversions > 0 ? spend / conversions : 0;
      row.youtubeEarnedLikes = toNumber(result.metrics?.engagements);
      row.youtubeEarnedShares = toNumber(result.metrics?.interactions);

      return row;
    })
    .filter(hasReportableCampaignSpend);
}

export async function fetchGoogleAudienceClickBreakdown({
  customerId,
  apiVersion,
  developerToken,
  accessToken,
  refreshToken,
  clientId,
  clientSecret,
  loginCustomerId,
  accessPath,
  fallbackLoginCustomerId,
  startDate,
  endDate,
}: GoogleFetchInput): Promise<GoogleAudienceClickBreakdownResponse> {
  const context = await resolveVerifiedGoogleAdsContext({
    customerId,
    apiVersion,
    developerToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    loginCustomerId,
    accessPath: accessPath ?? null,
    fallbackLoginCustomerId: fallbackLoginCustomerId ?? null,
  });

  const [age, gender, location, keywords, content] = await Promise.all([
    fetchGoogleAudienceAgeBreakdown({
      customerId: context.customerId,
      apiVersion,
      developerToken,
      accessToken,
      refreshToken,
      clientId,
      clientSecret,
      loginCustomerId: context.loginCustomerId,
      startDate,
      endDate,
    }),
    fetchGoogleAudienceGenderBreakdown({
      customerId: context.customerId,
      apiVersion,
      developerToken,
      accessToken,
      refreshToken,
      clientId,
      clientSecret,
      loginCustomerId: context.loginCustomerId,
      startDate,
      endDate,
    }),
    fetchGoogleAudienceLocationBreakdown({
      customerId: context.customerId,
      apiVersion,
      developerToken,
      accessToken,
      refreshToken,
      clientId,
      clientSecret,
      loginCustomerId: context.loginCustomerId,
      startDate,
      endDate,
    }),
    fetchGoogleAudienceKeywordBreakdown({
      customerId: context.customerId,
      apiVersion,
      developerToken,
      accessToken,
      refreshToken,
      clientId,
      clientSecret,
      loginCustomerId: context.loginCustomerId,
      startDate,
      endDate,
    }),
    fetchGoogleAudienceContentBreakdown({
      customerId: context.customerId,
      apiVersion,
      developerToken,
      accessToken,
      refreshToken,
      clientId,
      clientSecret,
      loginCustomerId: context.loginCustomerId,
      startDate,
      endDate,
    }),
  ]);

  return {
    age: addSourceToAudienceItems(age, "audiences", "age"),
    gender: addSourceToAudienceItems(gender, "audiences", "gender"),
    location,
    sources: {
      keywords,
      content,
    },
  };
}

export async function fetchGoogleAudienceBreakdown(
  input: GoogleFetchInput
): Promise<AudienceClickBreakdownResponse> {
  const context = await resolveVerifiedGoogleAdsContext({
    customerId: input.customerId,
    apiVersion: input.apiVersion,
    developerToken: input.developerToken,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    loginCustomerId: input.loginCustomerId,
    accessPath: input.accessPath ?? null,
    fallbackLoginCustomerId: input.fallbackLoginCustomerId ?? null,
  });
  const scopedInput = {
    customerId: context.customerId,
    apiVersion: input.apiVersion,
    developerToken: input.developerToken,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    loginCustomerId: context.loginCustomerId,
    startDate: input.startDate,
    endDate: input.endDate,
  };
  const [age, gender, location] = await Promise.all([
    fetchGoogleAudienceAgeBreakdown(scopedInput),
    fetchGoogleAudienceGenderBreakdown(scopedInput),
    fetchGoogleAudienceLocationBreakdown(scopedInput),
  ]);

  return {
    age,
    gender,
    location: {
      country: location.country.map(stripGoogleAudienceSource),
      region: location.region.map(stripGoogleAudienceSource),
      city: location.city.map(stripGoogleAudienceSource),
    },
  };
}

async function fetchGoogleAudienceAgeBreakdown(
  input: Omit<GoogleFetchInput, "accessPath" | "fallbackLoginCustomerId">
): Promise<AudienceClickBreakdownItem[]> {
  const label = "[audience-breakdown][google][age]";
  const query = buildGoogleAudienceAgeQuery(input.startDate, input.endDate);

  try {
    logGoogleAudienceGaql(`${label}[gaql]`, input.customerId, input.loginCustomerId, query);
    const results = await fetchGoogleAdsResultsWithFallback({
      customerId: input.customerId,
      apiVersion: input.apiVersion,
      developerToken: input.developerToken,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      loginCustomerId: input.loginCustomerId,
      queries: [query],
    });

    const items = sortAudienceItems(
      aggregateAudienceItems(
        results
          .map((result) =>
            createAudienceClickBreakdownItem({
              platform: "google",
              dimension: "age",
              label: normalizeAudienceAgeLabel(result.adGroupCriterion?.ageRange?.type),
              clicks: coerceAudienceClicks(result.metrics?.clicks),
            })
          )
          .filter((item) => item.clicks > 0)
      ),
      "age"
    );
    console.info(`${label} customerId=${input.customerId} rows=${items.length}`);
    return items;
  } catch (error) {
    logGoogleAudienceBreakdownFailure(label, input.customerId, error);
    return [];
  }
}

async function fetchGoogleAudienceGenderBreakdown(
  input: Omit<GoogleFetchInput, "accessPath" | "fallbackLoginCustomerId">
): Promise<AudienceClickBreakdownItem[]> {
  const label = "[audience-breakdown][google][gender]";
  const query = buildGoogleAudienceGenderQuery(input.startDate, input.endDate);

  try {
    logGoogleAudienceGaql(`${label}[gaql]`, input.customerId, input.loginCustomerId, query);
    const results = await fetchGoogleAdsResultsWithFallback({
      customerId: input.customerId,
      apiVersion: input.apiVersion,
      developerToken: input.developerToken,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      loginCustomerId: input.loginCustomerId,
      queries: [query],
    });

    const items = sortAudienceItems(
      aggregateAudienceItems(
        results
          .map((result) =>
            createAudienceClickBreakdownItem({
              platform: "google",
              dimension: "gender",
              label: normalizeAudienceGenderLabel(result.adGroupCriterion?.gender?.type),
              clicks: coerceAudienceClicks(result.metrics?.clicks),
            })
          )
          .filter((item) => item.clicks > 0)
      ),
      "gender"
    );
    console.info(`${label} customerId=${input.customerId} rows=${items.length}`);
    return items;
  } catch (error) {
    logGoogleAudienceBreakdownFailure(label, input.customerId, error);
    return [];
  }
}

async function fetchGoogleAudienceLocationBreakdown(
  input: Omit<GoogleFetchInput, "accessPath" | "fallbackLoginCustomerId">
): Promise<GoogleAudienceClickBreakdownResponse["location"]> {
  const label = "[audience-breakdown][google][location]";

  try {
    const [regionBreakdown, cityBreakdown] = await Promise.all([
      fetchGoogleAudienceGeoSegmentBreakdown(input, "region"),
      fetchGoogleAudienceGeoSegmentBreakdown(input, "city"),
    ]);
    const countryRows =
      cityBreakdown.countryItems.length > 0
        ? cityBreakdown.countryItems
        : regionBreakdown.countryItems;

    const country = addSourceToAudienceItems(
      countryRows,
      "locations",
      "country"
    );
    const region = addSourceToAudienceItems(
      regionBreakdown.items.length > 0
        ? regionBreakdown.items
        : await fetchGoogleTargetLocationBreakdown(input, "region"),
      "locations",
      "region"
    );
    const city = addSourceToAudienceItems(
      cityBreakdown.items.length > 0
        ? cityBreakdown.items
        : await fetchGoogleTargetLocationBreakdown(input, "city"),
      "locations",
      "city"
    );

    console.info(
      `${label} customerId=${input.customerId} country=${country.length} region=${region.length} city=${city.length}`
    );

    return {
      country,
      region,
      city,
    };
  } catch (error) {
    logGoogleAudienceBreakdownFailure(label, input.customerId, error);
    return createEmptyGoogleAudienceClickBreakdownResponse().location;
  }
}

async function fetchGoogleAudienceGeoSegmentBreakdown(
  input: Omit<GoogleFetchInput, "accessPath" | "fallbackLoginCustomerId">,
  dimension: "region" | "city"
): Promise<GoogleGeoSegmentBreakdown> {
  const label = `[audience-breakdown][google][location-${dimension}]`;
  const query = buildGoogleAudienceGeoSegmentQuery(input.startDate, input.endDate, dimension);

  try {
    logGoogleAudienceGaql(`${label}[gaql]`, input.customerId, input.loginCustomerId, query);
    const results = await fetchGoogleAdsResultsWithFallback({
      customerId: input.customerId,
      apiVersion: input.apiVersion,
      developerToken: input.developerToken,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      loginCustomerId: input.loginCustomerId,
      queries: [query],
    });

    const resourceNames = collectGoogleGeoSegmentResourceNames(results, dimension);
    const geoTargetsByResourceName = await fetchGoogleGeoTargetsForResourceNames({
      input,
      resourceNames,
      label,
    });
    const items = buildGoogleGeoSegmentAudienceItems(results, geoTargetsByResourceName, dimension);
    const countryItems = buildGoogleGeoSegmentCountryAudienceItems(
      results,
      geoTargetsByResourceName,
      dimension
    );
    console.info(
      `${label} customerId=${input.customerId} rows=${results.length} resources=${resourceNames.length} items=${items.length}`
    );
    return { items, countryItems };
  } catch (error) {
    logGoogleAudienceBreakdownFailure(label, input.customerId, error);
    return { items: [], countryItems: [] };
  }
}

async function fetchGoogleTargetLocationBreakdown(
  input: Omit<GoogleFetchInput, "accessPath" | "fallbackLoginCustomerId">,
  dimension: "country" | "region" | "city"
): Promise<AudienceClickBreakdownItem[]> {
  const label = `[audience-breakdown][google][target-location-${dimension}]`;
  const query = buildGoogleAudienceLocationViewQuery(input.startDate, input.endDate);

  try {
    logGoogleAudienceGaql(`${label}[gaql]`, input.customerId, input.loginCustomerId, query);
    const results = await fetchGoogleAdsResultsWithFallback({
      customerId: input.customerId,
      apiVersion: input.apiVersion,
      developerToken: input.developerToken,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      loginCustomerId: input.loginCustomerId,
      queries: [query],
    });
    const totalClicks = results.reduce(
      (total, result) => total + coerceAudienceClicks(result.metrics?.clicks),
      0
    );

    const criteriaByResourceName = await resolveGoogleLocationViewCriteria({
      input,
      results,
      label,
    });
    const geoTargetsByResourceName = await resolveGoogleAudienceLocationTargets({
      input,
      results,
      criteriaByResourceName,
    });
    const items = buildGoogleTargetLocationAudienceItems(
      results,
      geoTargetsByResourceName,
      criteriaByResourceName,
      dimension
    );
    console.info(
      `${label} customerId=${input.customerId} rows=${results.length} clicks=${totalClicks} criteria=${criteriaByResourceName.size} items=${items.length}`
    );
    return items;
  } catch (error) {
    logGoogleAudienceBreakdownFailure(label, input.customerId, error);
    return [];
  }
}

async function resolveGoogleAudienceLocationTargets(input: {
  input: Omit<GoogleFetchInput, "accessPath" | "fallbackLoginCustomerId">;
  results: GoogleAdsResult[];
  criteriaByResourceName?: Map<string, GoogleAdsResult["campaignCriterion"]>;
}): Promise<Map<string, GoogleAdsResult["geoTargetConstant"]>> {
  const label = "[audience-breakdown][google][geo-resolver]";
  const resourceNames = new Set<string>();

  input.results.forEach((result) => {
    const criterion = resolveGoogleLocationViewCriterion(result, input.criteriaByResourceName);
    const resourceName =
      criterion?.location?.geoTargetConstant?.trim() ||
      result.campaignCriterion?.location?.geoTargetConstant?.trim() ||
      getGoogleLocationViewGeoTargetResourceName(result);
    if (resourceName) {
      resourceNames.add(resourceName);
    }
  });

  if (resourceNames.size === 0) {
    console.info(`${label} customerId=${input.input.customerId} requested=0 resolved=0`);
    return new Map();
  }

  try {
    const geoTargets = await fetchGoogleGeoTargetConstantsByResourceName({
      customerId: input.input.customerId,
      apiVersion: input.input.apiVersion,
      developerToken: input.input.developerToken,
      accessToken: input.input.accessToken,
      refreshToken: input.input.refreshToken,
      clientId: input.input.clientId,
      clientSecret: input.input.clientSecret,
      loginCustomerId: input.input.loginCustomerId,
      resourceNames: Array.from(resourceNames),
    });
    console.info(
      `${label} customerId=${input.input.customerId} requested=${resourceNames.size} resolved=${geoTargets.size}`
    );
    return geoTargets;
  } catch (error) {
    logGoogleAudienceBreakdownFailure(label, input.input.customerId, error);
    return new Map();
  }
}

async function fetchGoogleGeoTargetsForResourceNames(input: {
  input: Omit<GoogleFetchInput, "accessPath" | "fallbackLoginCustomerId">;
  resourceNames: string[];
  label: string;
}): Promise<Map<string, GoogleAdsResult["geoTargetConstant"]>> {
  if (input.resourceNames.length === 0) {
    console.info(`${input.label}[geo-resolver] customerId=${input.input.customerId} requested=0 resolved=0`);
    return new Map();
  }

  try {
    const geoTargets = await fetchGoogleGeoTargetConstantsByResourceName({
      customerId: input.input.customerId,
      apiVersion: input.input.apiVersion,
      developerToken: input.input.developerToken,
      accessToken: input.input.accessToken,
      refreshToken: input.input.refreshToken,
      clientId: input.input.clientId,
      clientSecret: input.input.clientSecret,
      loginCustomerId: input.input.loginCustomerId,
      resourceNames: input.resourceNames,
    });
    console.info(
      `${input.label}[geo-resolver] customerId=${input.input.customerId} requested=${input.resourceNames.length} resolved=${geoTargets.size}`
    );
    return geoTargets;
  } catch (error) {
    logGoogleAudienceBreakdownFailure(`${input.label}[geo-resolver]`, input.input.customerId, error);
    return new Map();
  }
}

async function resolveGoogleLocationViewCriteria(input: {
  input: Omit<GoogleFetchInput, "accessPath" | "fallbackLoginCustomerId">;
  results: GoogleAdsResult[];
  label: string;
}): Promise<Map<string, GoogleAdsResult["campaignCriterion"]>> {
  const resourceNames = collectGoogleLocationViewCampaignCriterionResourceNames(
    input.input.customerId,
    input.results
  );
  if (resourceNames.length === 0) {
    console.info(`${input.label}[criteria] customerId=${input.input.customerId} requested=0 resolved=0`);
    return new Map();
  }

  try {
    const criteriaByResourceName = await fetchGoogleCampaignCriteriaByResourceName({
      customerId: input.input.customerId,
      apiVersion: input.input.apiVersion,
      developerToken: input.input.developerToken,
      accessToken: input.input.accessToken,
      refreshToken: input.input.refreshToken,
      clientId: input.input.clientId,
      clientSecret: input.input.clientSecret,
      loginCustomerId: input.input.loginCustomerId,
      resourceNames,
    });
    console.info(
      `${input.label}[criteria] customerId=${input.input.customerId} requested=${resourceNames.length} resolved=${criteriaByResourceName.size}`
    );
    return criteriaByResourceName;
  } catch (error) {
    logGoogleAudienceBreakdownFailure(`${input.label}[criteria]`, input.input.customerId, error);
    return new Map();
  }
}

function collectGoogleLocationViewCampaignCriterionResourceNames(
  customerId: string,
  results: GoogleAdsResult[]
): string[] {
  const resourceNames = new Set<string>();

  results.forEach((result) => {
    const resourceName = getGoogleLocationViewCampaignCriterionResourceName(customerId, result);
    if (resourceName) {
      resourceNames.add(resourceName);
    }
  });

  return Array.from(resourceNames);
}

function collectGoogleGeoSegmentResourceNames(
  results: GoogleAdsResult[],
  dimension: "country" | "region" | "city"
): string[] {
  const resourceNames = new Set<string>();

  results.forEach((result) => {
    const resourceName = getGoogleGeoSegmentResourceName(result, dimension);
    if (resourceName) {
      resourceNames.add(resourceName);
    }
  });

  return Array.from(resourceNames);
}

function buildGoogleGeoSegmentAudienceItems(
  results: GoogleAdsResult[],
  geoTargetsByResourceName: Map<string, GoogleAdsResult["geoTargetConstant"]>,
  dimension: "region" | "city"
): AudienceClickBreakdownItem[] {
  const totals = new Map<string, number>();

  results.forEach((result) => {
    const clicks = coerceAudienceClicks(result.metrics?.clicks);
    if (clicks <= 0) {
      return;
    }

    const resourceName = getGoogleGeoSegmentResourceName(result, dimension);
    if (!resourceName) {
      return;
    }

    const label = resolveGoogleGeoSegmentLabel(resourceName, geoTargetsByResourceName);
    if (!label) {
      return;
    }

    totals.set(label, (totals.get(label) ?? 0) + clicks);
  });

  return limitAudienceItemsWithOthers(
    sortAudienceItems(
      Array.from(totals.entries()).map(([label, clicks]) =>
        createAudienceClickBreakdownItem({
          platform: "google",
          dimension,
          label,
          clicks,
        })
      ),
      dimension
    ),
    10
  );
}

function buildGoogleGeoSegmentCountryAudienceItems(
  results: GoogleAdsResult[],
  geoTargetsByResourceName: Map<string, GoogleAdsResult["geoTargetConstant"]>,
  dimension: "region" | "city"
): AudienceClickBreakdownItem[] {
  const totals = new Map<string, number>();

  results.forEach((result) => {
    const clicks = coerceAudienceClicks(result.metrics?.clicks);
    if (clicks <= 0) {
      return;
    }

    const resourceName = getGoogleGeoSegmentResourceName(result, dimension);
    if (!resourceName) {
      return;
    }

    const geoTarget = geoTargetsByResourceName.get(resourceName);
    const country = deriveGoogleGeoTargetHierarchy(geoTarget).country;
    if (!country) {
      return;
    }

    totals.set(country, (totals.get(country) ?? 0) + clicks);
  });

  return limitAudienceItemsWithOthers(
    sortAudienceItems(
      Array.from(totals.entries()).map(([label, clicks]) =>
        createAudienceClickBreakdownItem({
          platform: "google",
          dimension: "country",
          label,
          clicks,
        })
      ),
      "country"
    ),
    10
  );
}

function getGoogleGeoSegmentResourceName(
  result: GoogleAdsResult,
  dimension: "country" | "region" | "city"
): string | null {
  if (dimension === "country") {
    return result.segments?.geoTargetCountry?.trim() || null;
  }
  if (dimension === "region") {
    return (
      result.segments?.geoTargetRegion?.trim() ||
      result.segments?.geoTargetState?.trim() ||
      result.segments?.geoTargetProvince?.trim() ||
      null
    );
  }
  return result.segments?.geoTargetCity?.trim() || null;
}

function resolveGoogleGeoSegmentLabel(
  resourceName: string,
  geoTargetsByResourceName: Map<string, GoogleAdsResult["geoTargetConstant"]>
): string | null {
  const geoTarget = geoTargetsByResourceName.get(resourceName);
  return normalizeAudienceLocationLabel(
    geoTarget?.name?.trim() || geoTarget?.canonicalName?.trim(),
    ""
  ).trim() || null;
}

function getGoogleLocationViewGeoTargetResourceName(result: GoogleAdsResult): string | null {
  const explicitResourceName = result.campaignCriterion?.location?.geoTargetConstant?.trim();
  if (explicitResourceName) {
    return explicitResourceName;
  }

  const criterionId = parseGoogleLocationViewCriterionId(result.locationView?.resourceName);
  return criterionId ? `geoTargetConstants/${criterionId}` : null;
}

function resolveGoogleLocationViewCriterion(
  result: GoogleAdsResult,
  criteriaByResourceName: Map<string, GoogleAdsResult["campaignCriterion"]> | undefined
): GoogleAdsResult["campaignCriterion"] | undefined {
  if (result.campaignCriterion?.type) {
    return result.campaignCriterion;
  }

  if (!criteriaByResourceName) {
    return undefined;
  }

  const resourceName = getGoogleLocationViewCampaignCriterionResourceName(
    "",
    result
  );
  return resourceName ? criteriaByResourceName.get(resourceName) : undefined;
}

function getGoogleLocationViewCampaignCriterionResourceName(
  customerId: string,
  result: GoogleAdsResult
): string | null {
  const explicitResourceName = result.campaignCriterion?.resourceName?.trim();
  if (explicitResourceName) {
    return explicitResourceName;
  }

  const resourceName = result.locationView?.resourceName?.trim();
  if (!resourceName) {
    return null;
  }

  const idPair = resourceName.split("/").pop() ?? "";
  const [campaignId, criterionId] = idPair.split("~").map((part) => part.trim());
  if (!campaignId || !criterionId) {
    return null;
  }

  const resourceCustomerId =
    customerId.trim() || resourceName.match(/^customers\/([^/]+)\//)?.[1]?.trim() || "";
  return resourceCustomerId
    ? `customers/${resourceCustomerId}/campaignCriteria/${campaignId}~${criterionId}`
    : null;
}

function parseGoogleLocationViewCriterionId(resourceName: string | undefined): string | null {
  const normalized = resourceName?.trim();
  if (!normalized) {
    return null;
  }

  const idPair = normalized.split("/").pop() ?? "";
  const criterionId = idPair.split("~").pop()?.trim();
  return criterionId || null;
}

function buildGoogleTargetLocationAudienceItems(
  results: GoogleAdsResult[],
  geoTargetsByResourceName: Map<string, GoogleAdsResult["geoTargetConstant"]>,
  criteriaByResourceName: Map<string, GoogleAdsResult["campaignCriterion"]>,
  dimension: "country" | "region" | "city"
): AudienceClickBreakdownItem[] {
  const totals = new Map<string, number>();

  results.forEach((result) => {
    const clicks = coerceAudienceClicks(result.metrics?.clicks);
    if (clicks <= 0) {
      return;
    }

    const label = resolveGoogleTargetLocationDimensionLabel(
      result,
      geoTargetsByResourceName,
      criteriaByResourceName,
      dimension
    );
    if (!label) {
      return;
    }

    totals.set(label, (totals.get(label) ?? 0) + clicks);
  });

  return limitAudienceItemsWithOthers(
    sortAudienceItems(
      Array.from(totals.entries()).map(([label, clicks]) =>
        createAudienceClickBreakdownItem({
          platform: "google",
          dimension,
          label,
          clicks,
        })
      ),
      dimension
    ),
    10
  );
}

function resolveGoogleTargetLocationDimensionLabel(
  result: GoogleAdsResult,
  geoTargetsByResourceName: Map<string, GoogleAdsResult["geoTargetConstant"]>,
  criteriaByResourceName: Map<string, GoogleAdsResult["campaignCriterion"]>,
  dimension: "country" | "region" | "city"
): string | null {
  const criterion = resolveGoogleLocationViewCriterion(result, criteriaByResourceName);
  const proximityHierarchy = deriveGoogleProximityTargetHierarchy(criterion?.proximity);
  if (proximityHierarchy) {
    if (dimension === "country") {
      return proximityHierarchy.country;
    }
    if (dimension === "region") {
      return proximityHierarchy.region;
    }
    return proximityHierarchy.city;
  }

  const resolvedResourceName =
    criterion?.location?.geoTargetConstant?.trim() ||
    result.campaignCriterion?.location?.geoTargetConstant?.trim() ||
    getGoogleLocationViewGeoTargetResourceName(result);
  if (!resolvedResourceName) {
    return null;
  }

  const geoTarget = geoTargetsByResourceName.get(resolvedResourceName);
  const hierarchy = deriveGoogleGeoTargetHierarchy(geoTarget);

  if (dimension === "country") {
    return hierarchy.country;
  }
  if (dimension === "region") {
    return hierarchy.region;
  }
  return hierarchy.city;
}

function deriveGoogleGeoTargetHierarchy(
  geoTarget: GoogleAdsResult["geoTargetConstant"] | undefined
): {
  country: string | null;
  region: string | null;
  city: string | null;
} {
  const name = normalizeAudienceLocationLabel(
    geoTarget?.name?.trim() || geoTarget?.canonicalName?.trim(),
    ""
  ).trim();
  const canonicalParts = (geoTarget?.canonicalName ?? "")
    .split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  const canonicalLeaf = canonicalParts[0] ?? "";
  const normalizedName = name || canonicalLeaf || null;
  const targetType = (geoTarget?.targetType ?? "").trim().toUpperCase();
  const country =
    targetType === "COUNTRY"
      ? normalizedName
      : canonicalParts.length > 0
        ? canonicalParts[canonicalParts.length - 1] ?? null
        : null;

  if (!normalizedName) {
    return {
      country: country || null,
      region: null,
      city: null,
    };
  }

  if (isGoogleRegionTargetType(targetType)) {
    return {
      country: country || null,
      region: normalizedName,
      city: null,
    };
  }

  if (targetType === "COUNTRY") {
    return {
      country: normalizedName,
      region: null,
      city: null,
    };
  }

  return {
    country: country || null,
    region: canonicalParts.length >= 2 ? canonicalParts[canonicalParts.length - 2] ?? null : null,
    city: normalizedName,
  };
}

function deriveGoogleProximityTargetHierarchy(
  proximity: GoogleProximityInfo | undefined
):
  | {
      country: string | null;
      region: string | null;
      city: string | null;
    }
  | null {
  if (!proximity) {
    return null;
  }

  const address = proximity.address;
  const radius = toNumber(proximity.radius);
  const unitLabel = formatGoogleProximityRadiusUnit(proximity.radiusUnits);
  const addressParts = [
    address?.streetAddress,
    address?.cityName,
    address?.provinceName || address?.provinceCode,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  const fallbackCoordinateLabel = formatGoogleProximityCoordinateLabel(proximity.geoPoint);
  const centerLabel = addressParts.length > 0 ? addressParts.join(", ") : fallbackCoordinateLabel;

  if (!centerLabel) {
    return null;
  }

  const detailedLabel = radius > 0 ? `${formatCompactDecimal(radius)} ${unitLabel} around ${centerLabel}` : centerLabel;

  return {
    country: formatGoogleCountryCode(address?.countryCode),
    region: normalizeAudienceLocationLabel(address?.provinceName || address?.provinceCode, ""),
    city: detailedLabel,
  };
}

function formatGoogleProximityRadiusUnit(value: string | undefined): string {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "MILES") {
    return "mi";
  }
  return "km";
}

function formatCompactDecimal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function formatGoogleProximityCoordinateLabel(geoPoint: GoogleProximityGeoPoint | undefined): string | null {
  const latitude = toNumber(geoPoint?.latitudeInMicroDegrees) / 1_000_000;
  const longitude = toNumber(geoPoint?.longitudeInMicroDegrees) / 1_000_000;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) {
    return null;
  }
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function formatGoogleCountryCode(value: string | undefined): string | null {
  const code = value?.trim().toUpperCase();
  if (!code) {
    return null;
  }

  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function isGoogleRegionTargetType(targetType: string): boolean {
  return (
    targetType === "REGION" ||
    targetType === "STATE" ||
    targetType === "PROVINCE" ||
    targetType === "CANTON" ||
    targetType === "DEPARTMENT" ||
    targetType === "GOVERNORATE" ||
    targetType === "ADM1"
  );
}

async function fetchGoogleAudienceKeywordBreakdown(
  input: Omit<GoogleFetchInput, "accessPath" | "fallbackLoginCustomerId">
): Promise<GoogleAudienceSourceClickItem[]> {
  const label = "[audience-breakdown][google][keywords]";

  try {
    const results = await fetchGoogleAdsResultsWithFallback({
      customerId: input.customerId,
      apiVersion: input.apiVersion,
      developerToken: input.developerToken,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      loginCustomerId: input.loginCustomerId,
      queries: [buildGoogleAudienceKeywordQuery(input.startDate, input.endDate)],
    });

    const items = buildGoogleSourceItems({
      results,
      source: "keywords",
      labelResolver: (result) =>
        normalizeAudienceLocationLabel(result.adGroupCriterion?.keyword?.text, "Unknown keyword"),
    });
    console.info(`${label} customerId=${input.customerId} rows=${items.length}`);
    return items;
  } catch (error) {
    logGoogleAudienceBreakdownFailure(label, input.customerId, error);
    return [];
  }
}

async function fetchGoogleAudienceContentBreakdown(
  input: Omit<GoogleFetchInput, "accessPath" | "fallbackLoginCustomerId">
): Promise<GoogleAudienceSourceClickItem[]> {
  const label = "[audience-breakdown][google][content]";

  try {
    const results = await fetchGoogleAdsResultsWithFallback({
      customerId: input.customerId,
      apiVersion: input.apiVersion,
      developerToken: input.developerToken,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      loginCustomerId: input.loginCustomerId,
      queries: buildGoogleAudienceContentQueries(input.startDate, input.endDate),
    });

    const items = buildGoogleSourceItems({
      results,
      source: "content",
      labelResolver: (result) =>
        normalizeAudienceLocationLabel(
          result.detailPlacementView?.displayName?.trim() ||
            result.detailPlacementView?.placement?.trim() ||
            result.groupPlacementView?.targetUrl?.trim() ||
            result.topicView?.topic?.trim(),
          "Unknown content"
        ),
    });
    console.info(`${label} customerId=${input.customerId} rows=${items.length}`);
    return items;
  } catch (error) {
    logGoogleAudienceBreakdownFailure(label, input.customerId, error);
    return [];
  }
}

function buildGoogleAudienceAgeQuery(startDate: string, endDate: string): string {
  return `
    SELECT
      ad_group_criterion.age_range.type,
      metrics.clicks
    FROM age_range_view
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
  `;
}

function buildGoogleAudienceGenderQuery(startDate: string, endDate: string): string {
  return `
    SELECT
      ad_group_criterion.gender.type,
      metrics.clicks
    FROM gender_view
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
  `;
}

function buildGoogleAudienceLocationViewQuery(startDate: string, endDate: string): string {
  return `
    SELECT
      location_view.resource_name,
      campaign.id,
      campaign_criterion.criterion_id,
      campaign_criterion.location.geo_target_constant,
      metrics.clicks
    FROM location_view
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
  `;
}

function buildGoogleAudienceGeoSegmentQuery(
  startDate: string,
  endDate: string,
  dimension: "region" | "city"
): string {
  const segmentField =
    dimension === "region" ? "segments.geo_target_region" : "segments.geo_target_city";

  return `
    SELECT
      ${segmentField},
      metrics.clicks
    FROM geographic_view
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
  `;
}

function buildGoogleAudienceKeywordQuery(startDate: string, endDate: string): string {
  return `
    SELECT
      ad_group_criterion.keyword.text,
      metrics.clicks
    FROM keyword_view
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
  `;
}

function buildGoogleAudienceContentQueries(startDate: string, endDate: string): string[] {
  return [
    `
      SELECT
        detail_placement_view.placement,
        metrics.clicks
      FROM detail_placement_view
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    `,
    `
      SELECT
        group_placement_view.target_url,
        metrics.clicks
      FROM group_placement_view
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    `,
    `
      SELECT
        topic_view.topic,
        metrics.clicks
      FROM topic_view
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    `,
  ];
}

function logGoogleAudienceBreakdownFailure(
  label: string,
  customerId: string,
  error: unknown
) {
  const requestError = asGoogleAdsRequestError(error);
  const message =
    requestError?.message ?? (error instanceof Error ? error.message : "Google audience breakdown failed.");
  console.warn(
    `${label} customerId=${customerId} requestId=${requestError?.requestId ?? "(none)"} errorCode=${requestError?.errorCode ?? "(none)"} message=${JSON.stringify(message)}`
  );
}

function logGoogleAudienceGaql(
  label: string,
  customerId: string,
  loginCustomerId: string | null,
  gaql: string
) {
  console.info(
    `${label} customerId=${customerId} loginCustomerId=${loginCustomerId ?? "(none)"} gaql=${JSON.stringify(compactWhitespace(gaql))}`
  );
}

function stripGoogleAudienceSource(item: {
  platform: "google";
  label: string;
  clicks: number;
  dimension: AudienceClickBreakdownItem["dimension"];
}): AudienceClickBreakdownItem {
  return {
    platform: item.platform,
    dimension: item.dimension,
    label: item.label,
    clicks: item.clicks,
  };
}

function buildGoogleSourceItems(input: {
  results: GoogleAdsResult[];
  source: "keywords" | "content";
  labelResolver: (result: GoogleAdsResult) => string;
}): GoogleAudienceSourceClickItem[] {
  const totals = new Map<string, number>();

  input.results.forEach((result) => {
    const clicks = coerceAudienceClicks(result.metrics?.clicks);
    if (clicks <= 0) {
      return;
    }

    const label = input.labelResolver(result).trim();
    if (!label) {
      return;
    }

    totals.set(label, (totals.get(label) ?? 0) + clicks);
  });

  return Array.from(totals.entries())
    .map(([label, clicks]) => ({
      platform: "google" as const,
      source: input.source,
      label,
      clicks,
    }))
    .sort((left, right) => {
      if (right.clicks !== left.clicks) {
        return right.clicks - left.clicks;
      }
      return left.label.localeCompare(right.label);
    });
}

export async function fetchGooglePreviewHierarchy({
  customerId,
  apiVersion,
  developerToken,
  accessToken,
  refreshToken,
  clientId,
  clientSecret,
  loginCustomerId,
  accessPath,
  fallbackLoginCustomerId,
  startDate,
  endDate,
}: GoogleFetchInput): Promise<PreviewCampaignNode[]> {
  const preview = await fetchGooglePreviewData({
    customerId,
    apiVersion,
    developerToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    loginCustomerId,
    accessPath: accessPath ?? (loginCustomerId ? formatGoogleAccessPath(loginCustomerId) : "Personal"),
    fallbackLoginCustomerId,
    startDate,
    endDate,
  });

  if (preview.fatalError) {
    throw new GooglePreviewFatalErrorWrapper(preview.fatalError);
  }

  return preview.data;
}

export async function fetchGooglePreviewData(
  input: GoogleFetchInput & {
    accessPath?: string | null;
    previewStage?: GooglePreviewStage;
    previewSelection?: GooglePreviewSelection;
  }
): Promise<GooglePreviewFetchResult> {
  const previewStage = input.previewStage ?? "full";
  const previewSelection = input.previewSelection ?? {
    platform: null,
    campaignId: null,
    adGroupId: null,
    adId: null,
  };
  const context = await resolveGooglePreviewAccountContext({
    customerId: input.customerId,
    apiVersion: input.apiVersion,
    developerToken: input.developerToken,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    loginCustomerId: input.loginCustomerId,
    fallbackLoginCustomerId: input.fallbackLoginCustomerId ?? null,
    accessPath: input.accessPath ?? null,
  });

  const diagnostics: GooglePreviewDiagnostics = {
    customerId: context.customerId,
    loginCustomerId: context.loginCustomerId,
    resolutionMode: context.resolutionMode,
    blocks: [],
    warnings: [],
    fatalError: null,
  };

  try {
    const campaignsBlock = await runGooglePreviewBlock(
      {
        label: "preview-campaigns",
        required: true,
        queries: buildGooglePreviewCampaignQueries(input.startDate, input.endDate, previewSelection),
      },
      context,
      input
    );
    diagnostics.blocks.push(campaignsBlock.diagnostic);

    if (previewStage === "campaigns") {
      return {
        data: buildGooglePreviewHierarchyData({
          customerId: context.customerId,
          campaignResults: campaignsBlock.results,
          adGroupResults: [],
          adResults: [],
          keywordResults: [],
          adGroupAssetResults: [],
          campaignAssetResults: [],
          customerAssetResults: [],
          campaignCriterionResults: [],
        }),
        warnings: [],
        fatalError: null,
        diagnostics,
      };
    }

    const adGroupsBlock = await runGooglePreviewBlock(
      {
        label: "preview-ad-groups",
        required: true,
        queries: buildGooglePreviewAdGroupQueries(input.startDate, input.endDate, previewSelection),
      },
      context,
      input
    );
    diagnostics.blocks.push(adGroupsBlock.diagnostic);

    if (previewStage === "ad-groups") {
      return {
        data: buildGooglePreviewHierarchyData({
          customerId: context.customerId,
          campaignResults: campaignsBlock.results,
          adGroupResults: adGroupsBlock.results,
          adResults: [],
          keywordResults: [],
          adGroupAssetResults: [],
          campaignAssetResults: [],
          customerAssetResults: [],
          campaignCriterionResults: [],
        }),
        warnings: [],
        fatalError: null,
        diagnostics,
      };
    }

    const adsBlock = await runGooglePreviewBlock(
      {
        label: "preview-ads",
        required: true,
        queries: buildGooglePreviewAdQueries(input.startDate, input.endDate, previewSelection),
      },
      context,
      input
    );
    diagnostics.blocks.push(adsBlock.diagnostic);

    if (previewStage === "ads") {
      return {
        data: buildGooglePreviewHierarchyData({
          customerId: context.customerId,
          campaignResults: campaignsBlock.results,
          adGroupResults: adGroupsBlock.results,
          adResults: adsBlock.results,
          keywordResults: [],
          adGroupAssetResults: [],
          campaignAssetResults: [],
          customerAssetResults: [],
          campaignCriterionResults: [],
        }),
        warnings: [],
        fatalError: null,
        diagnostics,
      };
    }

    const includeAssetBlocks = previewStage === "assets" || previewStage === "full";

    const optionalResults = await Promise.all([
      runGoogleOptionalPreviewBlock(
        {
          label: "preview-keywords",
          required: false,
          queries: buildGooglePreviewKeywordQueries(input.startDate, input.endDate, previewSelection),
        },
        context,
        input
      ),
      runGoogleOptionalPreviewBlock(
        {
          label: "preview-ad-group-assets",
          required: false,
          queries: includeAssetBlocks ? buildGooglePreviewAdGroupAssetQueries(previewSelection) : [],
        },
        context,
        input
      ),
      runGoogleOptionalPreviewBlock(
        {
          label: "preview-campaign-assets",
          required: false,
          queries: includeAssetBlocks ? buildGooglePreviewCampaignAssetQueries(previewSelection) : [],
        },
        context,
        input
      ),
      runGoogleOptionalPreviewBlock(
        {
          label: "preview-customer-assets",
          required: false,
          queries: includeAssetBlocks ? buildGooglePreviewCustomerAssetQueries() : [],
        },
        context,
        input
      ),
      runGooglePreviewCampaignLocationBlock(
        {
          label: "preview-campaign-locations",
          required: false,
          queries: includeAssetBlocks ? buildGooglePreviewCampaignLocationQueries(previewSelection) : [],
        },
        context,
        input
      ),
      runGoogleOptionalPreviewBlock(
        {
          label: "preview-campaign-languages",
          required: false,
          queries: includeAssetBlocks ? buildGooglePreviewCampaignLanguageQueries(previewSelection) : [],
        },
        context,
        input
      ),
    ]);

    const optionalWarnings = optionalResults.flatMap((result) => result.warnings);
    diagnostics.blocks.push(...optionalResults.map((result) => result.diagnostic));
    diagnostics.warnings.push(...optionalWarnings);

    return {
      data: buildGooglePreviewHierarchyData({
        customerId: context.customerId,
        campaignResults: campaignsBlock.results,
        adGroupResults: adGroupsBlock.results,
        adResults: adsBlock.results,
        keywordResults: optionalResults[0].results,
        adGroupAssetResults: optionalResults[1].results,
        campaignAssetResults: optionalResults[2].results,
        customerAssetResults: optionalResults[3].results,
        campaignCriterionResults: [
          ...optionalResults[4].results,
          ...optionalResults[5].results,
        ],
      }),
      warnings: optionalWarnings,
      fatalError: null,
      diagnostics,
    };
  } catch (error) {
    const fatalError =
      error instanceof GooglePreviewFatalErrorWrapper
        ? error.fatalError
        : createGooglePreviewFatalError({
            code: "google-preview-required-block-failed",
            label: "preview-unknown",
            context,
            message:
              error instanceof Error
                ? error.message
                : "Unknown Google Ads preview failure.",
            reason:
              error instanceof Error
                ? error.message
                : "Unknown Google Ads preview failure.",
            category: "unknown",
            requestId: null,
            errorCode: null,
            errorMessage:
              error instanceof Error
                ? error.message
                : "Unknown Google Ads preview failure.",
          });

    diagnostics.fatalError = fatalError;
    return {
      data: [],
      warnings: diagnostics.warnings,
      fatalError,
      diagnostics,
    };
  }
}

export async function resolveGooglePreviewAccount(
  input: Omit<GoogleFetchInput, "startDate" | "endDate">
): Promise<GooglePreviewAccountResolution> {
  const resolution = await resolveGooglePreviewAccountContext({
    ...input,
    accessPath: input.loginCustomerId ? formatGoogleAccessPath(input.loginCustomerId) : "Personal",
  });
  return {
    customerId: resolution.customerId,
    loginCustomerId: resolution.loginCustomerId,
    resolutionMode: resolution.resolutionMode,
  };
}

export async function fetchGoogleTopKeywordRows({
  customerId,
  apiVersion,
  developerToken,
  accessToken,
  refreshToken,
  clientId,
  clientSecret,
  loginCustomerId,
  accessPath,
  fallbackLoginCustomerId,
  startDate,
  endDate,
}: GoogleFetchInput): Promise<TopKeywordRow[]> {
  const context = await resolveVerifiedGoogleAdsContext({
    customerId,
    apiVersion,
    developerToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    loginCustomerId,
    accessPath: accessPath ?? null,
    fallbackLoginCustomerId: fallbackLoginCustomerId ?? null,
  });

  const results = await fetchGoogleAdsResultsWithFallback({
    customerId: context.customerId,
    apiVersion,
    developerToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    loginCustomerId: context.loginCustomerId,
    queries: [
      `
        SELECT
          ad_group_criterion.criterion_id,
          ad_group_criterion.keyword.text,
          metrics.impressions,
          metrics.clicks,
          metrics.ctr,
          metrics.average_cpc,
          metrics.conversions,
          metrics.conversion_rate,
          metrics.cost_micros
        FROM keyword_view
        WHERE campaign.status = 'ENABLED'
          AND segments.date BETWEEN '${startDate}' AND '${endDate}'
      `,
      `
        SELECT
          ad_group_criterion.criterion_id,
          ad_group_criterion.keyword.text,
          metrics.impressions,
          metrics.clicks,
          metrics.ctr,
          metrics.average_cpc,
          metrics.conversions,
          metrics.cost_micros
        FROM keyword_view
        WHERE campaign.status = 'ENABLED'
          AND segments.date BETWEEN '${startDate}' AND '${endDate}'
      `,
    ],
  });

  const byKeyword = new Map<string, TopKeywordRow>();

  results.forEach((result, index) => {
    const keyword =
      result.adGroupCriterion?.keyword?.text?.trim() ||
      result.campaign?.name?.trim() ||
      "Unknown keyword";
    const keywordKey = keyword.toLowerCase();
    const keywordId = result.adGroupCriterion?.criterionId || `${customerId}-${keywordKey}-${index}`;
    const impressions = toNumber(result.metrics?.impressions);
    const clicks = toNumber(result.metrics?.clicks);
    const conversions = toNumber(result.metrics?.conversions);
    const cost = microsToCurrency(result.metrics?.costMicros);
    const existing = byKeyword.get(keywordKey);

    if (!existing) {
      byKeyword.set(keywordKey, {
        id: keywordId,
        keyword,
        impressions,
        clicks,
        avgCpc: microsToCurrency(result.metrics?.averageCpc),
        ctr: normalizeCtr(result.metrics?.ctr, impressions, clicks),
        conversions,
        conversionRate: normalizePercent(result.metrics?.conversionRate, clicks, conversions),
        costPerConversion: conversions > 0 ? cost / conversions : 0,
        cost,
      });
      return;
    }

    existing.impressions += impressions;
    existing.clicks += clicks;
    existing.conversions += conversions;
    existing.cost += cost;
    existing.ctr = existing.impressions > 0 ? (existing.clicks * 100) / existing.impressions : 0;
    existing.avgCpc = existing.clicks > 0 ? existing.cost / existing.clicks : 0;
    existing.conversionRate =
      existing.clicks > 0 ? (existing.conversions * 100) / existing.clicks : 0;
    existing.costPerConversion =
      existing.conversions > 0 ? existing.cost / existing.conversions : 0;
  });

  return Array.from(byKeyword.values()).sort((a, b) => {
    if (b.conversions !== a.conversions) {
      return b.conversions - a.conversions;
    }
    if (b.clicks !== a.clicks) {
      return b.clicks - a.clicks;
    }
    return b.impressions - a.impressions;
  });
}

export async function fetchGoogleFinalUrlSpendRows({
  customerId,
  apiVersion,
  developerToken,
  accessToken,
  refreshToken,
  clientId,
  clientSecret,
  loginCustomerId,
  accessPath,
  fallbackLoginCustomerId,
  startDate,
  endDate,
}: GoogleFetchInput): Promise<GoogleFinalUrlSpendRow[]> {
  const context = await resolveVerifiedGoogleAdsContext({
    customerId,
    apiVersion,
    developerToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    loginCustomerId,
    accessPath: accessPath ?? null,
    fallbackLoginCustomerId: fallbackLoginCustomerId ?? null,
  });

  const results = await fetchGoogleAdsResultsWithFallback({
    customerId: context.customerId,
    apiVersion,
    developerToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    loginCustomerId: context.loginCustomerId,
    queries: [
      `
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          ad_group.id,
          ad_group.name,
          ad_group.status,
          ad_group_ad.status,
          ad_group_ad.ad.id,
          ad_group_ad.ad.final_urls,
          metrics.impressions,
          metrics.clicks,
          metrics.conversions,
          metrics.cost_micros
        FROM ad_group_ad
        WHERE campaign.status = 'ENABLED'
          AND ad_group.status = 'ENABLED'
          AND ad_group_ad.status = 'ENABLED'
          AND segments.date BETWEEN '${startDate}' AND '${endDate}'
      `,
    ],
  });

  const impressionShareLookup = await fetchGoogleFinalUrlImpressionShareLookup({
    customerId: context.customerId,
    apiVersion,
    developerToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    loginCustomerId: context.loginCustomerId,
    startDate,
    endDate,
  }).catch((): GoogleFinalUrlImpressionShareLookup => {
    return {
      byAdGroupId: new Map<string, GoogleImpressionShareMetrics>(),
      byCampaignId: new Map<string, GoogleImpressionShareMetrics>(),
    };
  });

  const byUrl = new Map<string, GoogleFinalUrlAccumulator>();
  results.forEach((result, index) => {
    const cost = microsToCurrency(result.metrics?.costMicros);

    const urls = result.adGroupAd?.ad?.finalUrls ?? [];
    urls.forEach((rawUrl) => {
      const finalUrl = rawUrl?.trim();
      if (!finalUrl) {
        return;
      }

      const existing = byUrl.get(finalUrl);
      const campaignId = result.campaign?.id?.trim();
      const campaignName = result.campaign?.name?.trim();
      const adGroupId = result.adGroup?.id?.trim();
      const adGroupName = result.adGroup?.name?.trim();
      const impressions = toNumber(result.metrics?.impressions);
      const clicks = toNumber(result.metrics?.clicks);
      const conversions = toNumber(result.metrics?.conversions);
      const impressionShareMatch = pickFinalUrlImpressionShareMetrics(
        impressionShareLookup,
        campaignId,
        adGroupId
      );
      const metricWeight = impressions > 0 ? impressions : 1;

      if (!existing) {
        byUrl.set(finalUrl, {
          row: {
            id: result.adGroupAd?.ad?.id ?? `${customerId}-final-url-${index}`,
            finalUrl,
            campaignIds: campaignId ? [campaignId] : [],
            campaignNames: campaignName ? [campaignName] : [],
            adGroupIds: adGroupId ? [adGroupId] : [],
            adGroupNames: adGroupName ? [adGroupName] : [],
            impressions,
            clicks,
            conversions,
            cost,
            impressionShare: null,
            lostImpressionShareBudget: null,
            lostImpressionShareRank: null,
            impressionShareSource: null,
          },
          impressionShare: createWeightedMetricAccumulator(),
          lostImpressionShareBudget: createWeightedMetricAccumulator(),
          lostImpressionShareRank: createWeightedMetricAccumulator(),
          sawAdGroupShare: false,
          sawCampaignShare: false,
        });
        const created = byUrl.get(finalUrl);
        if (created) {
          addFinalUrlImpressionShareMetrics(created, impressionShareMatch, metricWeight);
        }
        return;
      }

      if (campaignId && !existing.row.campaignIds.includes(campaignId)) {
        existing.row.campaignIds.push(campaignId);
      }
      if (campaignName && !existing.row.campaignNames.includes(campaignName)) {
        existing.row.campaignNames.push(campaignName);
      }
      if (adGroupId && !existing.row.adGroupIds.includes(adGroupId)) {
        existing.row.adGroupIds.push(adGroupId);
      }
      if (adGroupName && !existing.row.adGroupNames.includes(adGroupName)) {
        existing.row.adGroupNames.push(adGroupName);
      }
      existing.row.impressions += impressions;
      existing.row.clicks += clicks;
      existing.row.conversions += conversions;
      existing.row.cost += cost;
      addFinalUrlImpressionShareMetrics(existing, impressionShareMatch, metricWeight);
    });
  });

  return Array.from(byUrl.values())
    .map(finalizeGoogleFinalUrlAccumulator)
    .sort((a, b) => b.cost - a.cost);
}

export async function fetchGoogleImageCreativePerformanceRows({
  customerId,
  apiVersion,
  developerToken,
  accessToken,
  refreshToken,
  clientId,
  clientSecret,
  loginCustomerId,
  accessPath,
  fallbackLoginCustomerId,
  startDate,
  endDate,
}: GoogleFetchInput): Promise<GoogleImageCreativePerformanceRow[]> {
  const context = await resolveVerifiedGoogleAdsContext({
    customerId,
    apiVersion,
    developerToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    loginCustomerId,
    accessPath: accessPath ?? null,
    fallbackLoginCustomerId: fallbackLoginCustomerId ?? null,
  });

  const requestContext = {
    customerId: context.customerId,
    apiVersion,
    developerToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    loginCustomerId: context.loginCustomerId,
  };

  const [imageAdResults, responsiveDisplayResults, performanceMaxResults] = await Promise.all([
    fetchOptionalGoogleCreativeResults({
      ...requestContext,
      query: buildGoogleImageAdCreativeQuery(startDate, endDate),
      label: "google-image-ad-creatives",
    }),
    fetchOptionalGoogleCreativeResults({
      ...requestContext,
      query: buildGoogleResponsiveDisplayCreativeQuery(startDate, endDate),
      label: "google-responsive-display-creatives",
    }),
    fetchOptionalGoogleCreativeResults({
      ...requestContext,
      query: buildGooglePerformanceMaxImageAssetQuery(startDate, endDate),
      label: "google-performance-max-image-assets",
    }),
  ]);

  const responsiveAssetResourceNames = collectResponsiveDisplayImageAssetResourceNames(responsiveDisplayResults);
  const responsiveImageUrlByResourceName = await fetchGoogleAssetImageUrls({
    ...requestContext,
    resourceNames: responsiveAssetResourceNames,
  }).catch(() => new Map<string, string>());

  return dedupeGoogleImageCreativeRows([
    ...buildImageAdCreativeRows(imageAdResults, context.customerId),
    ...buildResponsiveDisplayCreativeRows(
      responsiveDisplayResults,
      responsiveImageUrlByResourceName,
      context.customerId
    ),
    ...buildPerformanceMaxImageCreativeRows(performanceMaxResults, context.customerId),
  ]).sort(compareGoogleImageCreativeRows);
}

export async function fetchGoogleVideoCreativePerformanceRows({
  customerId,
  apiVersion,
  developerToken,
  accessToken,
  refreshToken,
  clientId,
  clientSecret,
  loginCustomerId,
  accessPath,
  fallbackLoginCustomerId,
  startDate,
  endDate,
}: GoogleFetchInput): Promise<GoogleVideoCreativePerformanceRow[]> {
  const context = await resolveVerifiedGoogleAdsContext({
    customerId,
    apiVersion,
    developerToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    loginCustomerId,
    accessPath: accessPath ?? null,
    fallbackLoginCustomerId: fallbackLoginCustomerId ?? null,
  });

  const requestContext = {
    customerId: context.customerId,
    apiVersion,
    developerToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    loginCustomerId: context.loginCustomerId,
  };

  const [videoResponsiveResults, performanceMaxResults] = await Promise.all([
    fetchOptionalGoogleCreativeResultsWithFallback({
      ...requestContext,
      queries: buildGoogleVideoResponsiveAdCreativeQueries(apiVersion, startDate, endDate),
      label: "google-video-responsive-creatives",
    }),
    fetchOptionalGoogleCreativeResultsWithFallback({
      ...requestContext,
      queries: buildGooglePerformanceMaxVideoAssetQueries(apiVersion, startDate, endDate),
      label: "google-performance-max-video-assets",
    }),
  ]);

  const videoAssetResourceNames = collectVideoAssetResourceNames(videoResponsiveResults);
  const videoAssetByResourceName = await fetchGoogleYoutubeVideoAssetDetails({
    ...requestContext,
    resourceNames: videoAssetResourceNames,
  }).catch(() => new Map<string, GoogleYoutubeVideoAssetDetails>());

  return dedupeGoogleVideoCreativeRows([
    ...buildVideoResponsiveCreativeRows(
      videoResponsiveResults,
      videoAssetByResourceName,
      context.customerId
    ),
    ...buildPerformanceMaxVideoCreativeRows(performanceMaxResults, context.customerId),
  ]).sort(compareGoogleVideoCreativeRows);
}

async function fetchOptionalGoogleCreativeResults(
  input: Omit<GoogleFetchInput, "startDate" | "endDate" | "accessPath" | "fallbackLoginCustomerId"> & {
    query: string;
    label: string;
  }
): Promise<GoogleAdsResult[]> {
  try {
    return await fetchGoogleAdsResults(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Google Ads creative query failure.";
    console.warn(`[google-creatives] label=${input.label} accountId=${input.customerId} message=${JSON.stringify(message)}`);
    return [];
  }
}

async function fetchOptionalGoogleCreativeResultsWithFallback(
  input: Omit<GoogleFetchInput, "startDate" | "endDate" | "accessPath" | "fallbackLoginCustomerId"> & {
    queries: string[];
    label: string;
  }
): Promise<GoogleAdsResult[]> {
  try {
    return await fetchGoogleAdsResultsWithFallback(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Google Ads creative query failure.";
    console.warn(`[google-creatives] label=${input.label} accountId=${input.customerId} message=${JSON.stringify(message)}`);
    return [];
  }
}

function buildGoogleImageAdCreativeQuery(startDate: string, endDate: string): string {
  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.advertising_channel_type,
      ad_group.id,
      ad_group.name,
      ad_group_ad.status,
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.type,
      ad_group_ad.ad.final_urls,
      ad_group_ad.ad.image_ad.name,
      ad_group_ad.ad.image_ad.image_url,
      ad_group_ad.ad.image_ad.preview_image_url,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.conversions,
      metrics.cost_micros
    FROM ad_group_ad
    WHERE campaign.status = 'ENABLED'
      AND ad_group.status = 'ENABLED'
      AND ad_group_ad.status = 'ENABLED'
      AND ad_group_ad.ad.type = 'IMAGE_AD'
      AND segments.date BETWEEN '${startDate}' AND '${endDate}'
  `;
}

function buildGoogleResponsiveDisplayCreativeQuery(startDate: string, endDate: string): string {
  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.advertising_channel_type,
      ad_group.id,
      ad_group.name,
      ad_group_ad.status,
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.type,
      ad_group_ad.ad.final_urls,
      ad_group_ad.ad.responsive_display_ad.headlines,
      ad_group_ad.ad.responsive_display_ad.long_headline,
      ad_group_ad.ad.responsive_display_ad.descriptions,
      ad_group_ad.ad.responsive_display_ad.marketing_images,
      ad_group_ad.ad.responsive_display_ad.square_marketing_images,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.conversions,
      metrics.cost_micros
    FROM ad_group_ad
    WHERE campaign.status = 'ENABLED'
      AND ad_group.status = 'ENABLED'
      AND ad_group_ad.status = 'ENABLED'
      AND ad_group_ad.ad.type = 'RESPONSIVE_DISPLAY_AD'
      AND segments.date BETWEEN '${startDate}' AND '${endDate}'
  `;
}

function buildGooglePerformanceMaxImageAssetQuery(startDate: string, endDate: string): string {
  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.advertising_channel_type,
      asset_group.id,
      asset_group.name,
      asset_group.final_urls,
      asset_group.status,
      asset_group_asset.asset,
      asset_group_asset.field_type,
      asset_group_asset.status,
      asset.resource_name,
      asset.id,
      asset.name,
      asset.type,
      asset.image_asset.full_size.url,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.conversions,
      metrics.cost_micros
    FROM asset_group_asset
    WHERE campaign.status = 'ENABLED'
      AND campaign.advertising_channel_type = 'PERFORMANCE_MAX'
      AND asset_group.status = 'ENABLED'
      AND asset_group_asset.status != 'REMOVED'
      AND asset_group_asset.field_type IN ('MARKETING_IMAGE', 'SQUARE_MARKETING_IMAGE')
      AND segments.date BETWEEN '${startDate}' AND '${endDate}'
  `;
}

function buildGoogleVideoResponsiveAdCreativeQueries(
  apiVersion: string,
  startDate: string,
  endDate: string
): string[] {
  return buildGoogleVideoMetricFieldNames(apiVersion).map((videoViewsField) => `
    SELECT
      campaign.id,
      campaign.name,
      campaign.advertising_channel_type,
      ad_group.id,
      ad_group.name,
      ad_group_ad.status,
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.type,
      ad_group_ad.ad.final_urls,
      ad_group_ad.ad.video_responsive_ad.headlines,
      ad_group_ad.ad.video_responsive_ad.long_headlines,
      ad_group_ad.ad.video_responsive_ad.descriptions,
      ad_group_ad.ad.video_responsive_ad.videos,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.conversions,
      ${videoViewsField},
      metrics.cost_micros
    FROM ad_group_ad
    WHERE campaign.status = 'ENABLED'
      AND ad_group.status = 'ENABLED'
      AND ad_group_ad.status = 'ENABLED'
      AND ad_group_ad.ad.type = 'VIDEO_RESPONSIVE_AD'
      AND segments.date BETWEEN '${startDate}' AND '${endDate}'
  `);
}

function buildGooglePerformanceMaxVideoAssetQueries(
  apiVersion: string,
  startDate: string,
  endDate: string
): string[] {
  return buildGoogleVideoMetricFieldNames(apiVersion).map((videoViewsField) => `
    SELECT
      campaign.id,
      campaign.name,
      campaign.advertising_channel_type,
      asset_group.id,
      asset_group.name,
      asset_group.final_urls,
      asset_group.status,
      asset_group_asset.asset,
      asset_group_asset.field_type,
      asset_group_asset.status,
      asset.resource_name,
      asset.id,
      asset.name,
      asset.type,
      asset.youtube_video_asset.youtube_video_id,
      asset.youtube_video_asset.youtube_video_title,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.conversions,
      ${videoViewsField},
      metrics.cost_micros
    FROM asset_group_asset
    WHERE campaign.status = 'ENABLED'
      AND campaign.advertising_channel_type = 'PERFORMANCE_MAX'
      AND asset_group.status = 'ENABLED'
      AND asset_group_asset.status != 'REMOVED'
      AND asset_group_asset.field_type IN ('YOUTUBE_VIDEO', 'VIDEO')
      AND segments.date BETWEEN '${startDate}' AND '${endDate}'
  `);
}

function buildGoogleVideoMetricFieldNames(apiVersion: string): string[] {
  const versionNumber = Number.parseInt(apiVersion.replace(/\D/g, ""), 10);
  const preferred = Number.isFinite(versionNumber) && versionNumber >= 22
    ? "metrics.video_trueview_views"
    : "metrics.video_views";
  const fallback = preferred === "metrics.video_trueview_views"
    ? "metrics.video_views"
    : "metrics.video_trueview_views";
  return [preferred, fallback];
}

function collectResponsiveDisplayImageAssetResourceNames(results: GoogleAdsResult[]): string[] {
  const resourceNames = new Set<string>();
  results.forEach((result) => {
    [
      ...(result.adGroupAd?.ad?.responsiveDisplayAd?.marketingImages ?? []),
      ...(result.adGroupAd?.ad?.responsiveDisplayAd?.squareMarketingImages ?? []),
    ].forEach((image) => {
      const resourceName = image.asset?.trim();
      if (resourceName) {
        resourceNames.add(resourceName);
      }
    });
  });
  return Array.from(resourceNames);
}

function collectVideoAssetResourceNames(results: GoogleAdsResult[]): string[] {
  const resourceNames = new Set<string>();
  results.forEach((result) => {
    (result.adGroupAd?.ad?.videoResponsiveAd?.videos ?? []).forEach((video) => {
      const resourceName = video.asset?.trim();
      if (resourceName) {
        resourceNames.add(resourceName);
      }
    });
  });
  return Array.from(resourceNames);
}

async function fetchGoogleAssetImageUrls(
  input: Omit<GoogleFetchInput, "startDate" | "endDate" | "accessPath" | "fallbackLoginCustomerId"> & {
    resourceNames: string[];
  }
): Promise<Map<string, string>> {
  const imageUrlByResourceName = new Map<string, string>();
  const resourceNameChunks = chunkArray(input.resourceNames, 100);

  for (const resourceNameChunk of resourceNameChunks) {
    if (resourceNameChunk.length === 0) {
      continue;
    }

    const quotedResourceNames = resourceNameChunk.map((resourceName) => `'${escapeGaqlString(resourceName)}'`);
    const results = await fetchGoogleAdsResults({
      customerId: input.customerId,
      apiVersion: input.apiVersion,
      developerToken: input.developerToken,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      loginCustomerId: input.loginCustomerId,
      query: `
        SELECT
          asset.resource_name,
          asset.image_asset.full_size.url
        FROM asset
        WHERE asset.resource_name IN (${quotedResourceNames.join(", ")})
      `,
    });

    results.forEach((result) => {
      const resourceName = result.asset?.resourceName?.trim();
      const imageUrl = result.asset?.imageAsset?.fullSize?.url?.trim();
      if (resourceName && imageUrl) {
        imageUrlByResourceName.set(resourceName, imageUrl);
      }
    });
  }

  return imageUrlByResourceName;
}

async function fetchGoogleYoutubeVideoAssetDetails(
  input: Omit<GoogleFetchInput, "startDate" | "endDate" | "accessPath" | "fallbackLoginCustomerId"> & {
    resourceNames: string[];
  }
): Promise<Map<string, GoogleYoutubeVideoAssetDetails>> {
  const detailsByResourceName = new Map<string, GoogleYoutubeVideoAssetDetails>();
  const resourceNameChunks = chunkArray(input.resourceNames, 100);

  for (const resourceNameChunk of resourceNameChunks) {
    if (resourceNameChunk.length === 0) {
      continue;
    }

    const quotedResourceNames = resourceNameChunk.map((resourceName) => `'${escapeGaqlString(resourceName)}'`);
    const results = await fetchGoogleAdsResults({
      customerId: input.customerId,
      apiVersion: input.apiVersion,
      developerToken: input.developerToken,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      loginCustomerId: input.loginCustomerId,
      query: `
        SELECT
          asset.resource_name,
          asset.youtube_video_asset.youtube_video_id,
          asset.youtube_video_asset.youtube_video_title
        FROM asset
        WHERE asset.resource_name IN (${quotedResourceNames.join(", ")})
      `,
    });

    results.forEach((result) => {
      const resourceName = result.asset?.resourceName?.trim();
      if (!resourceName) {
        return;
      }
      detailsByResourceName.set(resourceName, {
        resourceName,
        youtubeVideoId: result.asset?.youtubeVideoAsset?.youtubeVideoId?.trim() || null,
        youtubeVideoTitle: result.asset?.youtubeVideoAsset?.youtubeVideoTitle?.trim() || null,
      });
    });
  }

  return detailsByResourceName;
}

function buildImageAdCreativeRows(
  results: GoogleAdsResult[],
  customerId: string
): GoogleImageCreativePerformanceRow[] {
  return results.flatMap((result, index) => {
    const imageUrl = result.adGroupAd?.ad?.imageAd?.imageUrl?.trim() || result.adGroupAd?.ad?.imageAd?.previewImageUrl?.trim();
    if (!imageUrl) {
      return [];
    }
    return buildRowsForFinalUrls(result, customerId, index, {
      source: "image_ad",
      imageUrl,
      assetId: result.adGroupAd?.ad?.imageAd?.imageAsset?.asset ?? null,
      headline: result.adGroupAd?.ad?.name ?? result.adGroupAd?.ad?.imageAd?.name ?? null,
      description: null,
    });
  });
}

function buildResponsiveDisplayCreativeRows(
  results: GoogleAdsResult[],
  imageUrlByResourceName: Map<string, string>,
  customerId: string
): GoogleImageCreativePerformanceRow[] {
  return results.flatMap((result, index) => {
    const imageResourceNames = collectResponsiveDisplayImageAssetResourceNames([result]);
    const imageResourceName = imageResourceNames.find((resourceName) => imageUrlByResourceName.has(resourceName));
    const imageUrl = imageResourceName ? imageUrlByResourceName.get(imageResourceName) : null;
    if (!imageUrl) {
      return [];
    }

    return buildRowsForFinalUrls(result, customerId, index, {
      source: "responsive_display_ad",
      imageUrl,
      assetId: imageResourceName ?? null,
      headline: pickFirstText([
        result.adGroupAd?.ad?.responsiveDisplayAd?.longHeadline?.text,
        ...(result.adGroupAd?.ad?.responsiveDisplayAd?.headlines ?? []).map((item) => item.text),
        result.adGroupAd?.ad?.name,
      ]),
      description: pickFirstText(
        (result.adGroupAd?.ad?.responsiveDisplayAd?.descriptions ?? []).map((item) => item.text)
      ),
    });
  });
}

function buildPerformanceMaxImageCreativeRows(
  results: GoogleAdsResult[],
  customerId: string
): GoogleImageCreativePerformanceRow[] {
  return results.flatMap((result, index) => {
    const imageUrl = result.asset?.imageAsset?.fullSize?.url?.trim();
    const finalUrls = result.assetGroup?.finalUrls ?? [];
    if (!imageUrl || finalUrls.length === 0) {
      return [];
    }

    return finalUrls.flatMap((rawUrl) => {
      const finalUrl = rawUrl?.trim();
      if (!finalUrl) {
        return [];
      }

      return [
        createGoogleImageCreativeRow(result, customerId, index, finalUrl, {
          source: "performance_max_asset",
          imageUrl,
          assetId: result.asset?.resourceName ?? result.assetGroupAsset?.asset ?? result.asset?.id ?? null,
          headline: result.asset?.name ?? result.assetGroup?.name ?? null,
          description: null,
        }),
      ];
    });
  });
}

function buildRowsForFinalUrls(
  result: GoogleAdsResult,
  customerId: string,
  index: number,
  creative: {
    source: GoogleImageCreativePerformanceRow["source"];
    imageUrl: string;
    assetId: string | null;
    headline: string | null;
    description: string | null;
  }
): GoogleImageCreativePerformanceRow[] {
  return (result.adGroupAd?.ad?.finalUrls ?? []).flatMap((rawUrl) => {
    const finalUrl = rawUrl?.trim();
    if (!finalUrl) {
      return [];
    }
    return [createGoogleImageCreativeRow(result, customerId, index, finalUrl, creative)];
  });
}

function createGoogleImageCreativeRow(
  result: GoogleAdsResult,
  customerId: string,
  index: number,
  finalUrl: string,
  creative: {
    source: GoogleImageCreativePerformanceRow["source"];
    imageUrl: string;
    assetId: string | null;
    headline: string | null;
    description: string | null;
  }
): GoogleImageCreativePerformanceRow {
  const impressions = toNumber(result.metrics?.impressions);
  const clicks = toNumber(result.metrics?.clicks);
  const conversions = toNumber(result.metrics?.conversions);
  const cost = microsToCurrency(result.metrics?.costMicros);
  const adId = result.adGroupAd?.ad?.id?.trim() ?? null;
  const assetGroupId = result.assetGroup?.id?.trim() ?? null;
  const assetId = creative.assetId?.trim() || null;

  return {
    id: [
      customerId,
      creative.source,
      finalUrl,
      adId ?? assetGroupId ?? "creative",
      assetId ?? index,
    ].join(":"),
    source: creative.source,
    finalUrl,
    campaignId: result.campaign?.id?.trim() ?? null,
    campaignName: result.campaign?.name?.trim() || "Untitled Campaign",
    adGroupId: result.adGroup?.id?.trim() ?? assetGroupId,
    adGroupName: result.adGroup?.name?.trim() ?? result.assetGroup?.name?.trim() ?? null,
    adId,
    adName:
      result.adGroupAd?.ad?.name?.trim() ||
      result.adGroupAd?.ad?.imageAd?.name?.trim() ||
      result.assetGroup?.name?.trim() ||
      result.asset?.name?.trim() ||
      "Untitled Creative",
    adType: humanizeEnum(result.adGroupAd?.ad?.type) || (creative.source === "performance_max_asset" ? "Performance Max Image Asset" : "Image Creative"),
    assetId,
    imageUrl: creative.imageUrl,
    headline: creative.headline?.trim() || null,
    description: creative.description?.trim() || null,
    impressions,
    clicks,
    ctr: impressions > 0 ? (clicks * 100) / impressions : normalizeOptionalPercent(result.metrics?.ctr),
    conversions,
    cpa: conversions > 0 ? cost / conversions : null,
    cost,
  };
}

function dedupeGoogleImageCreativeRows(
  rows: GoogleImageCreativePerformanceRow[]
): GoogleImageCreativePerformanceRow[] {
  const byId = new Map<string, GoogleImageCreativePerformanceRow>();
  rows.forEach((row) => {
    if (!row.finalUrl.trim() || !row.imageUrl.trim()) {
      return;
    }
    byId.set(row.id, row);
  });
  return Array.from(byId.values());
}

function compareGoogleImageCreativeRows(
  left: GoogleImageCreativePerformanceRow,
  right: GoogleImageCreativePerformanceRow
): number {
  if (right.conversions !== left.conversions) {
    return right.conversions - left.conversions;
  }

  const leftCpa = left.cpa ?? Number.POSITIVE_INFINITY;
  const rightCpa = right.cpa ?? Number.POSITIVE_INFINITY;
  if (leftCpa !== rightCpa) {
    return leftCpa - rightCpa;
  }

  const leftCtr = left.ctr ?? 0;
  const rightCtr = right.ctr ?? 0;
  if (rightCtr !== leftCtr) {
    return rightCtr - leftCtr;
  }

  return right.cost - left.cost;
}

function buildVideoResponsiveCreativeRows(
  results: GoogleAdsResult[],
  videoAssetByResourceName: Map<string, GoogleYoutubeVideoAssetDetails>,
  customerId: string
): GoogleVideoCreativePerformanceRow[] {
  return results.flatMap((result, index) => {
    const videoResourceName = collectVideoAssetResourceNames([result])[0] ?? null;
    const videoDetails = videoResourceName ? videoAssetByResourceName.get(videoResourceName) : undefined;
    const youtubeVideoId = videoDetails?.youtubeVideoId ?? null;

    if (!videoResourceName && !youtubeVideoId) {
      return [];
    }

    return buildVideoRowsForFinalUrls(result, customerId, index, {
      source: "video_responsive_ad",
      videoAssetResourceName: videoResourceName,
      youtubeVideoId,
      videoUrl: buildYoutubeVideoUrl(youtubeVideoId),
      thumbnailUrl: buildYoutubeThumbnailUrl(youtubeVideoId),
      assetId: videoResourceName,
      headline: pickFirstText([
        ...(result.adGroupAd?.ad?.videoResponsiveAd?.longHeadlines ?? []).map((item) => item.text),
        ...(result.adGroupAd?.ad?.videoResponsiveAd?.headlines ?? []).map((item) => item.text),
        videoDetails?.youtubeVideoTitle,
        result.adGroupAd?.ad?.name,
      ]),
      description: pickFirstText(
        (result.adGroupAd?.ad?.videoResponsiveAd?.descriptions ?? []).map((item) => item.text)
      ),
    });
  });
}

function buildPerformanceMaxVideoCreativeRows(
  results: GoogleAdsResult[],
  customerId: string
): GoogleVideoCreativePerformanceRow[] {
  return results.flatMap((result, index) => {
    const youtubeVideoId = result.asset?.youtubeVideoAsset?.youtubeVideoId?.trim() || null;
    const finalUrls = result.assetGroup?.finalUrls ?? [];
    if (!youtubeVideoId || finalUrls.length === 0) {
      return [];
    }

    return finalUrls.flatMap((rawUrl) => {
      const finalUrl = rawUrl?.trim();
      if (!finalUrl) {
        return [];
      }

      return [
        createGoogleVideoCreativeRow(result, customerId, index, finalUrl, {
          source: "performance_max_youtube_asset",
          videoAssetResourceName: result.asset?.resourceName ?? result.assetGroupAsset?.asset ?? null,
          youtubeVideoId,
          videoUrl: buildYoutubeVideoUrl(youtubeVideoId),
          thumbnailUrl: buildYoutubeThumbnailUrl(youtubeVideoId),
          assetId: result.asset?.resourceName ?? result.assetGroupAsset?.asset ?? result.asset?.id ?? null,
          headline:
            result.asset?.youtubeVideoAsset?.youtubeVideoTitle ??
            result.asset?.name ??
            result.assetGroup?.name ??
            null,
          description: null,
        }),
      ];
    });
  });
}

function buildVideoRowsForFinalUrls(
  result: GoogleAdsResult,
  customerId: string,
  index: number,
  creative: {
    source: GoogleVideoCreativePerformanceRow["source"];
    videoAssetResourceName: string | null;
    youtubeVideoId: string | null;
    videoUrl: string | null;
    thumbnailUrl: string | null;
    assetId: string | null;
    headline: string | null;
    description: string | null;
  }
): GoogleVideoCreativePerformanceRow[] {
  return (result.adGroupAd?.ad?.finalUrls ?? []).flatMap((rawUrl) => {
    const finalUrl = rawUrl?.trim();
    if (!finalUrl) {
      return [];
    }
    return [createGoogleVideoCreativeRow(result, customerId, index, finalUrl, creative)];
  });
}

function createGoogleVideoCreativeRow(
  result: GoogleAdsResult,
  customerId: string,
  index: number,
  finalUrl: string,
  creative: {
    source: GoogleVideoCreativePerformanceRow["source"];
    videoAssetResourceName: string | null;
    youtubeVideoId: string | null;
    videoUrl: string | null;
    thumbnailUrl: string | null;
    assetId: string | null;
    headline: string | null;
    description: string | null;
  }
): GoogleVideoCreativePerformanceRow {
  const impressions = toNumber(result.metrics?.impressions);
  const clicks = toNumber(result.metrics?.clicks);
  const conversions = toNumber(result.metrics?.conversions);
  const cost = microsToCurrency(result.metrics?.costMicros);
  const views = readGoogleVideoViews(result);
  const adId = result.adGroupAd?.ad?.id?.trim() ?? null;
  const assetGroupId = result.assetGroup?.id?.trim() ?? null;
  const assetId = creative.assetId?.trim() || null;

  return {
    id: [
      customerId,
      creative.source,
      finalUrl,
      adId ?? assetGroupId ?? "video",
      assetId ?? creative.youtubeVideoId ?? index,
    ].join(":"),
    source: creative.source,
    finalUrl,
    campaignId: result.campaign?.id?.trim() ?? null,
    campaignName: result.campaign?.name?.trim() || "Untitled Campaign",
    adGroupId: result.adGroup?.id?.trim() ?? assetGroupId,
    adGroupName: result.adGroup?.name?.trim() ?? result.assetGroup?.name?.trim() ?? null,
    adId,
    adName:
      result.adGroupAd?.ad?.name?.trim() ||
      creative.headline?.trim() ||
      result.assetGroup?.name?.trim() ||
      result.asset?.name?.trim() ||
      "Untitled Video Creative",
    adType:
      humanizeEnum(result.adGroupAd?.ad?.type) ||
      (creative.source === "performance_max_youtube_asset"
        ? "Performance Max YouTube Asset"
        : "Video Creative"),
    assetId,
    videoAssetResourceName: creative.videoAssetResourceName,
    youtubeVideoId: creative.youtubeVideoId,
    videoUrl: creative.videoUrl,
    thumbnailUrl: creative.thumbnailUrl,
    headline: creative.headline?.trim() || null,
    description: creative.description?.trim() || null,
    impressions,
    views,
    clicks,
    ctr: impressions > 0 ? (clicks * 100) / impressions : normalizeOptionalPercent(result.metrics?.ctr),
    conversions,
    cpa: conversions > 0 ? cost / conversions : null,
    cost,
  };
}

function dedupeGoogleVideoCreativeRows(
  rows: GoogleVideoCreativePerformanceRow[]
): GoogleVideoCreativePerformanceRow[] {
  const byId = new Map<string, GoogleVideoCreativePerformanceRow>();
  rows.forEach((row) => {
    if (!row.finalUrl.trim() || (!row.videoUrl?.trim() && !row.youtubeVideoId?.trim())) {
      return;
    }
    byId.set(row.id, row);
  });
  return Array.from(byId.values());
}

function compareGoogleVideoCreativeRows(
  left: GoogleVideoCreativePerformanceRow,
  right: GoogleVideoCreativePerformanceRow
): number {
  if (right.conversions !== left.conversions) {
    return right.conversions - left.conversions;
  }

  const leftCpa = left.cpa ?? Number.POSITIVE_INFINITY;
  const rightCpa = right.cpa ?? Number.POSITIVE_INFINITY;
  if (leftCpa !== rightCpa) {
    return leftCpa - rightCpa;
  }

  const leftCtr = left.ctr ?? 0;
  const rightCtr = right.ctr ?? 0;
  if (rightCtr !== leftCtr) {
    return rightCtr - leftCtr;
  }

  if (right.views !== left.views) {
    return right.views - left.views;
  }

  return right.cost - left.cost;
}

function readGoogleVideoViews(result: GoogleAdsResult): number {
  return toNumber(result.metrics?.videoTrueviewViews ?? result.metrics?.videoViews);
}

function buildYoutubeVideoUrl(youtubeVideoId: string | null): string | null {
  const id = youtubeVideoId?.trim();
  return id ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` : null;
}

function buildYoutubeThumbnailUrl(youtubeVideoId: string | null): string | null {
  const id = youtubeVideoId?.trim();
  return id ? `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg` : null;
}

function pickFirstText(values: Array<string | null | undefined>): string | null {
  return values.map((value) => value?.trim() ?? "").find(Boolean) ?? null;
}

async function fetchGoogleFinalUrlImpressionShareLookup(
  input: Omit<GoogleFetchInput, "accessPath" | "fallbackLoginCustomerId">
): Promise<GoogleFinalUrlImpressionShareLookup> {
  const adGroupResults = await fetchGoogleAdsResults({
    customerId: input.customerId,
    apiVersion: input.apiVersion,
    developerToken: input.developerToken,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    loginCustomerId: input.loginCustomerId,
    query: `
      SELECT
        campaign.id,
        ad_group.id,
        metrics.search_impression_share,
        metrics.search_budget_lost_impression_share,
        metrics.search_rank_lost_impression_share
      FROM ad_group
      WHERE campaign.status = 'ENABLED'
        AND ad_group.status = 'ENABLED'
        AND segments.date BETWEEN '${input.startDate}' AND '${input.endDate}'
    `,
  }).catch(() => [] as GoogleAdsResult[]);
  const campaignResults = await fetchGoogleAdsResults({
    customerId: input.customerId,
    apiVersion: input.apiVersion,
    developerToken: input.developerToken,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    loginCustomerId: input.loginCustomerId,
    query: `
      SELECT
        campaign.id,
        metrics.search_impression_share,
        metrics.search_budget_lost_impression_share,
        metrics.search_rank_lost_impression_share
      FROM campaign
      WHERE campaign.status = 'ENABLED'
        AND segments.date BETWEEN '${input.startDate}' AND '${input.endDate}'
    `,
  }).catch(() => [] as GoogleAdsResult[]);

  const byAdGroupId = new Map<string, GoogleImpressionShareMetrics>();
  adGroupResults.forEach((result) => {
    const adGroupId = result.adGroup?.id?.trim();
    if (adGroupId) {
      byAdGroupId.set(adGroupId, readGoogleImpressionShareMetrics(result));
    }
  });

  const byCampaignId = new Map<string, GoogleImpressionShareMetrics>();
  campaignResults.forEach((result) => {
    const campaignId = result.campaign?.id?.trim();
    if (campaignId) {
      byCampaignId.set(campaignId, readGoogleImpressionShareMetrics(result));
    }
  });

  return { byAdGroupId, byCampaignId };
}

function pickFinalUrlImpressionShareMetrics(
  lookup: GoogleFinalUrlImpressionShareLookup,
  campaignId: string | undefined,
  adGroupId: string | undefined
): { metrics: GoogleImpressionShareMetrics | null; source: "ad_group" | "campaign" | null } {
  if (adGroupId) {
    const adGroupMetrics = lookup.byAdGroupId.get(adGroupId);
    if (adGroupMetrics && hasAnyImpressionShareMetric(adGroupMetrics)) {
      return { metrics: adGroupMetrics, source: "ad_group" };
    }
  }

  if (campaignId) {
    const campaignMetrics = lookup.byCampaignId.get(campaignId);
    if (campaignMetrics && hasAnyImpressionShareMetric(campaignMetrics)) {
      return { metrics: campaignMetrics, source: "campaign" };
    }
  }

  return { metrics: null, source: null };
}

function readGoogleImpressionShareMetrics(result: GoogleAdsResult): GoogleImpressionShareMetrics {
  return {
    impressionShare: normalizeOptionalPercent(result.metrics?.searchImpressionShare),
    lostImpressionShareBudget: normalizeOptionalPercent(result.metrics?.searchBudgetLostImpressionShare),
    lostImpressionShareRank: normalizeOptionalPercent(result.metrics?.searchRankLostImpressionShare),
  };
}

function hasAnyImpressionShareMetric(metrics: GoogleImpressionShareMetrics): boolean {
  return (
    metrics.impressionShare !== null ||
    metrics.lostImpressionShareBudget !== null ||
    metrics.lostImpressionShareRank !== null
  );
}

function createWeightedMetricAccumulator(): WeightedMetricAccumulator {
  return { sum: 0, weight: 0 };
}

function addFinalUrlImpressionShareMetrics(
  accumulator: GoogleFinalUrlAccumulator,
  match: { metrics: GoogleImpressionShareMetrics | null; source: "ad_group" | "campaign" | null },
  weight: number
) {
  if (!match.metrics) {
    return;
  }

  addWeightedMetric(accumulator.impressionShare, match.metrics.impressionShare, weight);
  addWeightedMetric(accumulator.lostImpressionShareBudget, match.metrics.lostImpressionShareBudget, weight);
  addWeightedMetric(accumulator.lostImpressionShareRank, match.metrics.lostImpressionShareRank, weight);

  if (match.source === "ad_group") {
    accumulator.sawAdGroupShare = true;
  } else if (match.source === "campaign") {
    accumulator.sawCampaignShare = true;
  }
}

function addWeightedMetric(accumulator: WeightedMetricAccumulator, value: number | null, weight: number) {
  if (!Number.isFinite(value)) {
    return;
  }

  const safeWeight = Number.isFinite(weight) && weight > 0 ? weight : 1;
  accumulator.sum += Number(value) * safeWeight;
  accumulator.weight += safeWeight;
}

function finalizeGoogleFinalUrlAccumulator(accumulator: GoogleFinalUrlAccumulator): GoogleFinalUrlSpendRow {
  return {
    ...accumulator.row,
    impressionShare: finalizeWeightedMetric(accumulator.impressionShare),
    lostImpressionShareBudget: finalizeWeightedMetric(accumulator.lostImpressionShareBudget),
    lostImpressionShareRank: finalizeWeightedMetric(accumulator.lostImpressionShareRank),
    impressionShareSource: accumulator.sawAdGroupShare
      ? "ad_group"
      : accumulator.sawCampaignShare
        ? "campaign"
        : null,
  };
}

function finalizeWeightedMetric(accumulator: WeightedMetricAccumulator): number | null {
  return accumulator.weight > 0 ? accumulator.sum / accumulator.weight : null;
}

export async function fetchGoogleAuctionInsightRows({
  customerId,
  apiVersion,
  developerToken,
  accessToken,
  refreshToken,
  clientId,
  clientSecret,
  loginCustomerId,
  accessPath,
  fallbackLoginCustomerId,
  startDate,
  endDate,
}: GoogleFetchInput): Promise<AuctionInsightRow[]> {
  const context = await resolveVerifiedGoogleAdsContext({
    customerId,
    apiVersion,
    developerToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    loginCustomerId,
    accessPath: accessPath ?? null,
    fallbackLoginCustomerId: fallbackLoginCustomerId ?? null,
  });

  const results = await fetchGoogleAdsResultsWithFallback({
    customerId: context.customerId,
    apiVersion,
    developerToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    loginCustomerId: context.loginCustomerId,
    queries: [
      `
        SELECT
          segments.auction_insight_domain,
          metrics.auction_insight_search_impression_share,
          metrics.auction_insight_search_overlap_rate,
          metrics.auction_insight_search_position_above_rate,
          metrics.auction_insight_search_top_impression_percentage,
          metrics.auction_insight_search_absolute_top_impression_percentage,
          metrics.auction_insight_search_outranking_share
        FROM campaign
        WHERE campaign.status = 'ENABLED'
          AND segments.date BETWEEN '${startDate}' AND '${endDate}'
      `,
      `
        SELECT
          segments.auction_insight_domain,
          metrics.auction_insight_search_impression_share,
          metrics.auction_insight_search_overlap_rate,
          metrics.auction_insight_search_position_above_rate,
          metrics.auction_insight_search_outranking_share
        FROM campaign
        WHERE campaign.status = 'ENABLED'
          AND segments.date BETWEEN '${startDate}' AND '${endDate}'
      `,
    ],
  });

  const byDomain = new Map<string, AuctionInsightRow>();

  results.forEach((result, index) => {
    const displayDomain = result.segments?.auctionInsightDomain?.trim();
    if (!displayDomain) {
      return;
    }

    const domainKey = displayDomain.toLowerCase();
    const existing = byDomain.get(domainKey);
    const impressionShare = normalizePercent(result.metrics?.auctionInsightSearchImpressionShare);
    const overlapRate = normalizePercent(result.metrics?.auctionInsightSearchOverlapRate);
    const positionAboveRate = normalizePercent(result.metrics?.auctionInsightSearchPositionAboveRate);
    const topOfPageRate = normalizePercent(
      result.metrics?.auctionInsightSearchTopImpressionPercentage
    );
    const absoluteTopOfPageRate = normalizePercent(
      result.metrics?.auctionInsightSearchAbsoluteTopImpressionPercentage
    );
    const outrankingShare = normalizePercent(result.metrics?.auctionInsightSearchOutrankingShare);

    if (!existing) {
      byDomain.set(domainKey, {
        id: `${customerId}-${domainKey}-${index}`,
        displayDomain,
        impressionShare,
        overlapRate,
        positionAboveRate,
        topOfPageRate,
        absoluteTopOfPageRate,
        outrankingShare,
        observations: 1,
      });
      return;
    }

    existing.observations += 1;
    existing.impressionShare += impressionShare;
    existing.overlapRate += overlapRate;
    existing.positionAboveRate += positionAboveRate;
    existing.topOfPageRate += topOfPageRate;
    existing.absoluteTopOfPageRate += absoluteTopOfPageRate;
    existing.outrankingShare += outrankingShare;
  });

  return Array.from(byDomain.values())
    .map((row) => {
      const divisor = row.observations || 1;
      return {
        ...row,
        impressionShare: row.impressionShare / divisor,
        overlapRate: row.overlapRate / divisor,
        positionAboveRate: row.positionAboveRate / divisor,
        topOfPageRate: row.topOfPageRate / divisor,
        absoluteTopOfPageRate: row.absoluteTopOfPageRate / divisor,
        outrankingShare: row.outrankingShare / divisor,
      };
    })
    .sort((a, b) => b.impressionShare - a.impressionShare);
}

async function resolveGooglePreviewAccountContext(
  input: Omit<GoogleFetchInput, "startDate" | "endDate"> & { accessPath: string | null }
): Promise<GooglePreviewContext> {
  try {
    return await resolveVerifiedGoogleAdsContext(input);
  } catch (error) {
    if (isGoogleAdsAccessPathError(error)) {
      throw new GooglePreviewFatalErrorWrapper(
        createGooglePreviewFatalError({
          code: "google-account-resolution-failed",
          label: "account-resolution",
          context: {
            customerId: error.payload.customerId,
            loginCustomerId: error.payload.loginCustomerId,
            accessPath: error.payload.resolvedAccessPath,
            originalAccessPath: error.payload.originalAccessPath,
            resolvedAccessPath: error.payload.resolvedAccessPath ?? "Personal",
            fallbackUsed: error.payload.fallbackUsed,
            resolutionMode: error.payload.loginCustomerId ? "manager" : "direct",
          },
          message: error.payload.message,
          reason: error.payload.errorMessage,
          category: "account-resolution",
          requestId: null,
          errorCode: error.payload.errorCode,
          errorMessage: error.payload.errorMessage,
        })
      );
    }

    const requestError = asGoogleAdsRequestError(error);
    const customerId = normalizeGoogleAdsId(input.customerId);
    const loginCustomerId = normalizeOptionalGoogleAdsId(input.loginCustomerId);
    const accessPath = normalizeGooglePreviewAccessPath(input.accessPath);
    throw new GooglePreviewFatalErrorWrapper(
      createGooglePreviewFatalError({
        code: "google-account-resolution-failed",
        label: "account-resolution",
        context: {
          customerId,
          loginCustomerId,
          accessPath: accessPath ?? (loginCustomerId ? formatGoogleAccessPath(loginCustomerId) : "Personal"),
          originalAccessPath: sanitizeGoogleAdsAccessPath(input.accessPath),
          resolvedAccessPath: accessPath ?? (loginCustomerId ? formatGoogleAccessPath(loginCustomerId) : "Personal"),
          fallbackUsed: false,
          resolutionMode: loginCustomerId ? "manager" : "direct",
        },
        message:
          requestError?.message ??
          (error instanceof Error
            ? error.message
            : "Google Ads preview account resolution failed."),
        reason:
          requestError?.message ??
          (error instanceof Error
            ? error.message
            : "Google Ads preview account resolution failed."),
        category: requestError?.category ?? "account-resolution",
        requestId: requestError?.requestId ?? null,
        errorCode: requestError?.errorCode ?? null,
        errorMessage:
          requestError?.message ??
          (error instanceof Error
            ? error.message
            : "Google Ads preview account resolution failed."),
      })
    );
  }
}

async function runGooglePreviewBlock(
  block: GooglePreviewBlockDefinition,
  context: GooglePreviewContext,
  credentials: Omit<GoogleFetchInput, "customerId" | "loginCustomerId">
): Promise<GooglePreviewBlockSuccess> {
  const gaql = block.queries[0];
  logGooglePreviewInfo(
    `[google-preview] label=${block.label} required=${block.required} accountId=${context.customerId} customerId=${context.customerId} loginCustomerId=${context.loginCustomerId ?? "(none)"} gaql=${JSON.stringify(compactWhitespace(gaql))}`
  );

  try {
    const results = await fetchGoogleAdsResultsWithFallback({
      customerId: context.customerId,
      apiVersion: credentials.apiVersion,
      developerToken: credentials.developerToken,
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      loginCustomerId: context.loginCustomerId,
      queries: block.queries,
    });

    logGooglePreviewInfo(
      `[google-preview] label=${block.label} required=${block.required} accountId=${context.customerId} customerId=${context.customerId} loginCustomerId=${context.loginCustomerId ?? "(none)"} requestId=(success) status=passed rowCount=${results.length}`
    );

    return {
      results,
      diagnostic: {
        label: block.label,
        required: block.required,
        status: results.length === 0 ? "empty" : "passed",
        customerId: context.customerId,
        loginCustomerId: context.loginCustomerId,
        rowCount: results.length,
        requestId: null,
        errorCode: null,
        message: null,
      },
    };
  } catch (error) {
    const requestError = asGoogleAdsRequestError(error);
    logGooglePreviewBlockFailure(block, context, gaql, requestError, error);

    throw new GooglePreviewFatalErrorWrapper(
      createGooglePreviewFatalError({
        code: "google-preview-required-block-failed",
        label: block.label,
        context,
        message: `Google Ads preview block "${block.label}" failed.`,
        reason:
          requestError?.message ??
          (error instanceof Error ? error.message : "Unknown Google Ads block failure."),
        category: requestError?.category ?? "unknown",
        requestId: requestError?.requestId ?? null,
        errorCode: requestError?.errorCode ?? null,
        errorMessage:
          requestError?.message ??
          (error instanceof Error ? error.message : "Unknown Google Ads block failure."),
      })
    );
  }
}

async function runGoogleOptionalPreviewBlock(
  block: GooglePreviewBlockDefinition,
  context: GooglePreviewContext,
  credentials: Omit<GoogleFetchInput, "customerId" | "loginCustomerId">
): Promise<{
  results: GoogleAdsResult[];
  warnings: GooglePreviewWarning[];
  diagnostic: GooglePreviewBlockDiagnostic;
}> {
  if (block.queries.length === 0) {
    return {
      results: [],
      warnings: [],
      diagnostic: {
        label: block.label,
        required: block.required,
        status: "empty",
        customerId: context.customerId,
        loginCustomerId: context.loginCustomerId,
        rowCount: 0,
        requestId: null,
        errorCode: null,
        message: null,
      },
    };
  }

  const gaql = block.queries[0];
  logGooglePreviewInfo(
    `[google-preview] label=${block.label} required=${block.required} accountId=${context.customerId} customerId=${context.customerId} loginCustomerId=${context.loginCustomerId ?? "(none)"} gaql=${JSON.stringify(compactWhitespace(gaql))}`
  );

  try {
    const results = await fetchGoogleAdsResultsWithFallback({
      customerId: context.customerId,
      apiVersion: credentials.apiVersion,
      developerToken: credentials.developerToken,
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      loginCustomerId: context.loginCustomerId,
      queries: block.queries,
    });

    const status = results.length === 0 ? "empty" : "passed";
    const message =
      results.length === 0 ? `Optional Google Ads preview block "${block.label}" returned zero rows.` : null;
    if (status === "empty") {
      logGooglePreviewInfo(
        `[google-preview] label=${block.label} required=${block.required} accountId=${context.customerId} customerId=${context.customerId} loginCustomerId=${context.loginCustomerId ?? "(none)"} requestId=(success) status=empty rowCount=0`
      );
    } else {
      logGooglePreviewInfo(
        `[google-preview] label=${block.label} required=${block.required} accountId=${context.customerId} customerId=${context.customerId} loginCustomerId=${context.loginCustomerId ?? "(none)"} requestId=(success) status=passed rowCount=${results.length}`
      );
    }

    return {
      results,
      warnings: [],
      diagnostic: {
        label: block.label,
        required: block.required,
        status,
        customerId: context.customerId,
        loginCustomerId: context.loginCustomerId,
        rowCount: results.length,
        requestId: null,
        errorCode: null,
        message,
      },
    };
  } catch (error) {
    const requestError = asGoogleAdsRequestError(error);
    logGooglePreviewBlockFailure(block, context, gaql, requestError, error);

    const warning = createGooglePreviewWarning({
      label: block.label,
      context,
      reason:
        requestError?.message ??
        (error instanceof Error ? error.message : "Unknown Google Ads optional block failure."),
      category: requestError?.category ?? "unknown",
      requestId: requestError?.requestId ?? null,
      errorCode: requestError?.errorCode ?? null,
    });

    return {
      results: [],
      warnings: [warning],
      diagnostic: {
        label: block.label,
        required: block.required,
        status: "failed",
        customerId: context.customerId,
        loginCustomerId: context.loginCustomerId,
        rowCount: 0,
        requestId: warning.requestId,
        errorCode: warning.errorCode,
        message: warning.reason,
      },
    };
  }
}

async function runGooglePreviewCampaignLocationBlock(
  block: GooglePreviewBlockDefinition,
  context: GooglePreviewContext,
  credentials: Omit<GoogleFetchInput, "customerId" | "loginCustomerId">
): Promise<{
  results: GoogleAdsResult[];
  warnings: GooglePreviewWarning[];
  diagnostic: GooglePreviewBlockDiagnostic;
}> {
  if (block.queries.length === 0) {
    return {
      results: [],
      warnings: [],
      diagnostic: {
        label: block.label,
        required: block.required,
        status: "empty",
        customerId: context.customerId,
        loginCustomerId: context.loginCustomerId,
        rowCount: 0,
        requestId: null,
        errorCode: null,
        message: null,
      },
    };
  }

  const gaql = block.queries[0];
  logGooglePreviewInfo(
    `[google-preview] label=${block.label} required=${block.required} accountId=${context.customerId} customerId=${context.customerId} loginCustomerId=${context.loginCustomerId ?? "(none)"} gaql=${JSON.stringify(compactWhitespace(gaql))}`
  );

  try {
    const criteriaResults = await fetchGoogleAdsResultsWithFallback({
      customerId: context.customerId,
      apiVersion: credentials.apiVersion,
      developerToken: credentials.developerToken,
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      loginCustomerId: context.loginCustomerId,
      queries: block.queries,
    });

    const resourceNames = collectCampaignLocationResourceNames(criteriaResults);
    let warning: GooglePreviewWarning | null = null;
    let geoTargetsByResourceName = new Map<string, GoogleAdsResult["geoTargetConstant"]>();

    if (resourceNames.length > 0) {
      try {
        geoTargetsByResourceName = await fetchGoogleGeoTargetConstantsByResourceName({
          customerId: context.customerId,
          apiVersion: credentials.apiVersion,
          developerToken: credentials.developerToken,
          accessToken: credentials.accessToken,
          refreshToken: credentials.refreshToken,
          clientId: credentials.clientId,
          clientSecret: credentials.clientSecret,
          loginCustomerId: context.loginCustomerId,
          resourceNames,
        });
      } catch (error) {
        const requestError = asGoogleAdsRequestError(error);
        const reason =
          requestError?.message ??
          (error instanceof Error ? error.message : "Unknown Google Ads geo target lookup failure.");
        console.warn(
          `[google-preview] label=${block.label} required=${block.required} accountId=${context.customerId} customerId=${context.customerId} loginCustomerId=${context.loginCustomerId ?? "(none)"} requestId=${requestError?.requestId ?? "(none)"} errorCode=${requestError?.errorCode ?? "(none)"} category=${requestError?.category ?? "unknown"} message=${JSON.stringify(reason)}`
        );
        warning = createGooglePreviewWarning({
          label: block.label,
          context,
          reason,
          category: requestError?.category ?? "unknown",
          requestId: requestError?.requestId ?? null,
          errorCode: requestError?.errorCode ?? null,
        });
      }
    }

    const results = attachGeoTargetConstants(criteriaResults, geoTargetsByResourceName);
    const status = results.length === 0 ? "empty" : "passed";
    const message =
      results.length === 0 ? `Optional Google Ads preview block "${block.label}" returned zero rows.` : null;
    logGooglePreviewInfo(
      `[google-preview] label=${block.label} required=${block.required} accountId=${context.customerId} customerId=${context.customerId} loginCustomerId=${context.loginCustomerId ?? "(none)"} requestId=(success) status=${status} rowCount=${results.length}`
    );

    return {
      results,
      warnings: warning ? [warning] : [],
      diagnostic: {
        label: block.label,
        required: block.required,
        status,
        customerId: context.customerId,
        loginCustomerId: context.loginCustomerId,
        rowCount: results.length,
        requestId: warning?.requestId ?? null,
        errorCode: warning?.errorCode ?? null,
        message: warning?.reason ?? message,
      },
    };
  } catch (error) {
    const requestError = asGoogleAdsRequestError(error);
    logGooglePreviewBlockFailure(block, context, gaql, requestError, error);

    const warning = createGooglePreviewWarning({
      label: block.label,
      context,
      reason:
        requestError?.message ??
        (error instanceof Error ? error.message : "Unknown Google Ads optional block failure."),
      category: requestError?.category ?? "unknown",
      requestId: requestError?.requestId ?? null,
      errorCode: requestError?.errorCode ?? null,
    });

    return {
      results: [],
      warnings: [warning],
      diagnostic: {
        label: block.label,
        required: block.required,
        status: "failed",
        customerId: context.customerId,
        loginCustomerId: context.loginCustomerId,
        rowCount: 0,
        requestId: warning.requestId,
        errorCode: warning.errorCode,
        message: warning.reason,
      },
    };
  }
}

async function resolveVerifiedGoogleAdsContext(
  input: Omit<GoogleFetchInput, "startDate" | "endDate"> & { accessPath?: string | null }
): Promise<GooglePreviewContext> {
  const customerId = normalizeGoogleAdsId(input.customerId);
  const originalAccessPath = sanitizeGoogleAdsAccessPath(input.accessPath);
  const fallbackLoginCustomerId =
    normalizeOptionalGoogleAdsId(input.fallbackLoginCustomerId ?? null) ??
    DEFAULT_GOOGLE_ADS_FALLBACK_LOGIN_CUSTOMER_ID;
  const baseRoute = resolveGoogleAdsAccessPath({
    accountId: customerId,
    originalAccessPath,
    fallbackLoginCustomerId,
  });
  const originalManagerCustomerId =
    originalAccessPath && !isDirectGoogleAdsAccessPath(originalAccessPath)
      ? normalizeOptionalGoogleAdsId(originalAccessPath)
      : null;
  const candidates: Array<{ loginCustomerId: string | null; resolvedAccessPath: string; fallbackUsed: boolean }> =
    [];
  const addCandidate = (candidate: {
    loginCustomerId: string | null;
    resolvedAccessPath: string;
    fallbackUsed: boolean;
  }) => {
    if (candidates.some((existing) => existing.loginCustomerId === candidate.loginCustomerId)) {
      return;
    }

    candidates.push(candidate);
  };

  if (baseRoute.resolutionMode === "direct") {
    addCandidate({
      loginCustomerId: null,
      resolvedAccessPath: "Personal",
      fallbackUsed: false,
    });
  } else {
    if (originalManagerCustomerId) {
      addCandidate({
        loginCustomerId: originalManagerCustomerId,
        resolvedAccessPath: formatGoogleAccessPath(originalManagerCustomerId),
        fallbackUsed: false,
      });
    }

    if (!originalManagerCustomerId) {
      const discoveredCandidates = await discoverGoogleAdsRouteCandidates({
        customerId,
        apiVersion: input.apiVersion,
        developerToken: input.developerToken,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
      });

      discoveredCandidates.forEach((candidate) => addCandidate(candidate));
    }

    if (!originalManagerCustomerId || fallbackLoginCustomerId !== originalManagerCustomerId) {
      addCandidate({
        loginCustomerId: fallbackLoginCustomerId,
        resolvedAccessPath: formatGoogleAccessPath(fallbackLoginCustomerId),
        fallbackUsed: true,
      });
    }
  }

  let lastError: unknown = null;
  let lastCandidate = candidates[0] ?? {
    loginCustomerId: baseRoute.loginCustomerId,
    resolvedAccessPath: baseRoute.resolvedAccessPath,
    fallbackUsed: baseRoute.fallbackUsed,
  };

  for (const candidate of candidates) {
    lastCandidate = candidate;

    try {
      if (!candidate.loginCustomerId) {
        await verifyDirectGoogleAdsCustomerAccess({
          ...input,
          customerId,
          loginCustomerId: null,
        });
      } else {
        await verifyGoogleAdsCustomerReachableUnderManager({
          ...input,
          customerId,
          loginCustomerId: candidate.loginCustomerId,
        });
      }

      return {
        customerId,
        loginCustomerId: candidate.loginCustomerId,
        accessPath: candidate.resolvedAccessPath,
        originalAccessPath,
        resolvedAccessPath: candidate.resolvedAccessPath,
        fallbackUsed: candidate.fallbackUsed,
        resolutionMode: candidate.loginCustomerId ? "manager" : "direct",
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw createGoogleAdsAccessPathError({
    accountId: customerId,
    customerId,
    originalAccessPath,
    resolvedAccessPath: lastCandidate.resolvedAccessPath,
    fallbackUsed: lastCandidate.fallbackUsed,
    loginCustomerId: lastCandidate.loginCustomerId,
    error: lastError,
  });
}

async function discoverGoogleAdsRouteCandidates(input: {
  customerId: string;
  apiVersion: string;
  developerToken: string;
  accessToken: string | null;
  refreshToken: string | null;
  clientId: string | null;
  clientSecret: string | null;
}): Promise<Array<{ loginCustomerId: string | null; resolvedAccessPath: string; fallbackUsed: boolean }>> {
  try {
    const activeAccessToken = await resolveGoogleAccessToken({
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
    });
    const accessibleCustomerIds = await getAccessibleGoogleAdsCustomerIds({
      apiVersion: input.apiVersion,
      developerToken: input.developerToken,
      accessToken: activeAccessToken,
      customerId: input.customerId,
      loginCustomerId: null,
    });
    const discovered: Array<{
      loginCustomerId: string | null;
      resolvedAccessPath: string;
      fallbackUsed: boolean;
    }> = [];

    if (accessibleCustomerIds.includes(input.customerId)) {
      discovered.push({
        loginCustomerId: null,
        resolvedAccessPath: "Personal",
        fallbackUsed: false,
      });
    }

    accessibleCustomerIds
      .filter((candidateId) => candidateId !== input.customerId)
      .forEach((candidateId) => {
        discovered.push({
          loginCustomerId: candidateId,
          resolvedAccessPath: formatGoogleAccessPath(candidateId),
          fallbackUsed: false,
        });
      });

    return discovered;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to inspect accessible Google Ads customers for route discovery.";
    console.warn(`[google-routing] candidate_discovery_failed message=${message}`);
    return [];
  }
}

function buildGooglePreviewHierarchyData(input: {
  customerId: string;
  campaignResults: GoogleAdsResult[];
  adGroupResults: GoogleAdsResult[];
  adResults: GoogleAdsResult[];
  keywordResults: GoogleAdsResult[];
  adGroupAssetResults: GoogleAdsResult[];
  campaignAssetResults: GoogleAdsResult[];
  customerAssetResults: GoogleAdsResult[];
  campaignCriterionResults: GoogleAdsResult[];
}): PreviewCampaignNode[] {
  const locationsByCampaign = collectCampaignCriterionNames(input.campaignCriterionResults, "LOCATION");
  const languagesByCampaign = collectCampaignCriterionNames(input.campaignCriterionResults, "LANGUAGE");
  const visibleCampaigns = input.campaignResults
    .map((result) => {
      const campaignId = result.campaign?.id?.trim();
      const campaignStatus = result.campaign?.status?.trim();
      if (!campaignId || campaignStatus !== "ENABLED") {
        return null;
      }

      return {
        id: campaignId,
        name: result.campaign?.name?.trim() || `Campaign ${campaignId}`,
        status: humanizeStatus(result.campaign?.status),
        type: humanizeEnum(result.campaign?.advertisingChannelType) || "Other",
        details: compactDetailFields([
          detailField("Campaign ID", campaignId),
          detailField("Channel", humanizeEnum(result.campaign?.advertisingChannelType)),
          detailField("Networks", formatGoogleCampaignNetworks(result)),
          detailField("Budget", formatMicrosCurrency(result.campaignBudget?.amountMicros)),
          detailField("Locations", joinDetailValues(locationsByCampaign.get(campaignId))),
          detailField("Languages", joinDetailValues(languagesByCampaign.get(campaignId))),
          detailField("Serving Status", humanizeEnum(result.campaign?.servingStatus)),
          detailField("Bidding Strategy", humanizeEnum(result.campaign?.biddingStrategyType)),
          detailField("Start Date", result.campaign?.startDate),
          detailField("End Date", result.campaign?.endDate),
        ]),
      };
    })
    .filter((campaign): campaign is NonNullable<typeof campaign> => Boolean(campaign));

  if (visibleCampaigns.length === 0) {
    return [];
  }

  const visibleCampaignIds = new Set(visibleCampaigns.map((campaign) => campaign.id));
  const adGroupsByCampaign = new Map<string, GoogleHierarchyNode[]>();
  input.adGroupResults.forEach((result) => {
    const campaignId = result.campaign?.id?.trim();
    const adGroupId = result.adGroup?.id?.trim();
    if (!campaignId || !adGroupId || !visibleCampaignIds.has(campaignId)) {
      return;
    }

    const items = adGroupsByCampaign.get(campaignId) ?? [];
    if (items.some((item) => item.id === adGroupId)) {
      return;
    }

    items.push({
      id: adGroupId,
      campaignId,
      name: result.adGroup?.name?.trim() || `Ad Group ${adGroupId}`,
      status: humanizeStatus(result.adGroup?.status),
      details: compactDetailFields([
        detailField("Ad Group ID", adGroupId),
        detailField("Type", humanizeEnum(result.adGroup?.type)),
        detailField("Bid", formatMicrosCurrency(result.adGroup?.cpcBidMicros)),
      ]),
    });
    adGroupsByCampaign.set(campaignId, items);
  });

  const keywordsByAdGroup = new Map<string, string[]>();
  input.keywordResults.forEach((result) => {
    const campaignId = result.campaign?.id?.trim();
    const adGroupId = result.adGroup?.id?.trim();
    const keywordText = result.adGroupCriterion?.keyword?.text?.trim();
    if (!campaignId || !adGroupId || !keywordText || !visibleCampaignIds.has(campaignId)) {
      return;
    }

    const items = keywordsByAdGroup.get(adGroupId) ?? [];
    if (!items.includes(keywordText)) {
      items.push(keywordText);
      keywordsByAdGroup.set(adGroupId, items);
    }
  });

  const adGroupAssetMap = buildAssetMap(input.adGroupAssetResults, "adGroup");
  const campaignAssetMap = buildAssetMap(input.campaignAssetResults, "campaign");
  const customerAssetMap = buildAssetMap(input.customerAssetResults, "customer");
  const adsByAdGroup = new Map<string, GoogleHierarchyNode[]>();

  input.adResults.forEach((result) => {
    const campaignId = result.campaign?.id?.trim();
    const adGroupId = result.adGroup?.id?.trim();
    const adId = result.adGroupAd?.ad?.id?.trim();
    if (!campaignId || !adGroupId || !adId || !visibleCampaignIds.has(campaignId)) {
      return;
    }

    const items = adsByAdGroup.get(adGroupId) ?? [];
    if (items.some((item) => item.id === adId)) {
      return;
    }

    items.push({
      id: adId,
      campaignId,
      name:
        result.adGroupAd?.ad?.name?.trim() ||
        `${humanizeEnum(result.adGroupAd?.ad?.type) || "Ad"} ${adId}`,
      status: humanizeStatus(result.adGroupAd?.status),
      details: compactDetailFields([
        detailField("Ad ID", adId),
        detailField("Type", humanizeEnum(result.adGroupAd?.ad?.type)),
        detailField("Ad Group", result.adGroup?.name?.trim()),
        detailField("Final URL", result.adGroupAd?.ad?.finalUrls?.[0]),
      ]),
      finalUrl: result.adGroupAd?.ad?.finalUrls?.[0] ?? null,
      displayPathParts: pickPreviewDisplayPathParts(result),
      headlines: pickPreviewHeadlines(result),
      descriptions: pickPreviewDescriptions(result),
      keywords: keywordsByAdGroup.get(adGroupId) ?? [],
      images: pickImageAssets(
        adGroupAssetMap.get(adGroupId) ?? [],
        campaignAssetMap.get(campaignId) ?? []
      ),
      businessName:
        pickBusinessName(campaignAssetMap.get(campaignId) ?? []) ||
        pickBusinessName(customerAssetMap.get(input.customerId) ?? []),
      businessLogoUrl:
        pickBusinessLogo(campaignAssetMap.get(campaignId) ?? []) ||
        pickBusinessLogo(customerAssetMap.get(input.customerId) ?? []),
      sitelinks: pickSitelinks(
        adGroupAssetMap.get(adGroupId) ?? [],
        campaignAssetMap.get(campaignId) ?? [],
        customerAssetMap.get(input.customerId) ?? []
      ),
    });
    adsByAdGroup.set(adGroupId, items);
  });

  return visibleCampaigns
    .map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      type: campaign.type,
      details: campaign.details,
      children: (adGroupsByCampaign.get(campaign.id) ?? [])
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((adGroup) => ({
          id: adGroup.id,
          name: adGroup.name,
          status: adGroup.status,
          details: adGroup.details,
          ads: (adsByAdGroup.get(adGroup.id) ?? [])
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((ad) => ({
              id: ad.id,
              name: ad.name,
              status: ad.status,
              details: ad.details,
              finalUrl: ad.finalUrl ?? null,
              displayPathParts: ad.displayPathParts ?? [],
              headlines: ad.headlines ?? [],
              descriptions: ad.descriptions ?? [],
              keywords: ad.keywords ?? [],
              images: ad.images ?? [],
              businessName: ad.businessName ?? null,
              businessLogoUrl: ad.businessLogoUrl ?? null,
              sitelinks: ad.sitelinks ?? [],
            })),
        })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function verifyDirectGoogleAdsCustomerAccess(
  input: Omit<GoogleFetchInput, "startDate" | "endDate"> & { loginCustomerId: null }
): Promise<void> {
  const results = await fetchGoogleAdsResults({
    customerId: input.customerId,
    apiVersion: input.apiVersion,
    developerToken: input.developerToken,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    loginCustomerId: null,
    query: "SELECT customer.id FROM customer LIMIT 1",
  });

  const resolvedCustomerId = results[0]?.customer?.id?.trim();
  if (!resolvedCustomerId || normalizeOptionalGoogleAdsId(resolvedCustomerId) !== input.customerId) {
    throw new Error(
      `Google Ads preview account resolution failed: direct access to customer ${input.customerId} could not be verified.`
    );
  }
}

async function verifyGoogleAdsCustomerReachableUnderManager(
  input: Omit<GoogleFetchInput, "startDate" | "endDate"> & { loginCustomerId: string }
): Promise<void> {
  if (input.customerId === input.loginCustomerId) {
    const results = await fetchGoogleAdsResults({
      customerId: input.customerId,
      apiVersion: input.apiVersion,
      developerToken: input.developerToken,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      loginCustomerId: input.loginCustomerId,
      query: "SELECT customer.id FROM customer LIMIT 1",
    });

    const resolvedCustomerId = results[0]?.customer?.id?.trim();
    if (
      !resolvedCustomerId ||
      normalizeOptionalGoogleAdsId(resolvedCustomerId) !== input.customerId
    ) {
      throw new Error(
        `Google Ads preview account resolution failed: manager ${input.loginCustomerId} could not be verified for customer ${input.customerId}.`
      );
    }

    return;
  }

  const results = await fetchGoogleAdsResults({
    customerId: input.loginCustomerId,
    apiVersion: input.apiVersion,
    developerToken: input.developerToken,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    loginCustomerId: input.loginCustomerId,
    query: `
      SELECT
        customer_client.id,
        customer_client.client_customer,
        customer_client.level,
        customer_client.manager
      FROM customer_client
      WHERE customer_client.id = ${input.customerId}
    `,
  });

  const reachable = results.some((result) => {
    const candidateId =
      normalizeOptionalGoogleAdsId(result.customerClient?.id?.trim() ?? null) ??
      normalizeOptionalGoogleAdsId(result.customerClient?.clientCustomer?.trim() ?? null);
    return candidateId === input.customerId;
  });

  if (!reachable) {
    throw new Error(
      `Google Ads preview account resolution failed: customer ${input.customerId} is not reachable under manager ${input.loginCustomerId}.`
    );
  }
}

async function fetchGoogleAdsResults(
  input: Omit<GoogleFetchInput, "startDate" | "endDate"> & { query: string }
): Promise<GoogleAdsResult[]> {
  const normalizedCustomerId = normalizeGoogleAdsId(input.customerId);
  const normalizedLoginCustomerId = normalizeOptionalGoogleAdsId(input.loginCustomerId);
  const body = { query: input.query };
  const endpoint = `https://googleads.googleapis.com/${input.apiVersion}/customers/${normalizedCustomerId}/googleAds:searchStream`;
  const canRefresh = Boolean(input.refreshToken && input.clientId && input.clientSecret);
  const activeAccessToken = await resolveGoogleAccessToken({
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
  });

  await logAccessibleGoogleAdsCustomers({
    apiVersion: input.apiVersion,
    developerToken: input.developerToken,
    accessToken: activeAccessToken,
    customerId: normalizedCustomerId,
    loginCustomerId: normalizedLoginCustomerId,
  });
  logGoogleAdsRequestRouting(normalizedCustomerId, normalizedLoginCustomerId);

  const streamBatches = await executeGoogleAdsStreamRequest({
    endpoint,
    body,
    developerToken: input.developerToken,
    accessToken: activeAccessToken,
    loginCustomerId: normalizedLoginCustomerId,
    canRefresh,
    refreshToken: input.refreshToken,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
  });

  const results: GoogleAdsResult[] = [];
  streamBatches.forEach((batch) => {
    results.push(...(batch.results ?? []));
  });

  return results;
}

async function resolveGoogleAccessToken(input: {
  accessToken: string | null;
  refreshToken: string | null;
  clientId: string | null;
  clientSecret: string | null;
}): Promise<string> {
  if (input.refreshToken && input.clientId && input.clientSecret) {
    return refreshGoogleAccessToken({
      refreshToken: input.refreshToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
    });
  }

  if (input.accessToken) {
    return input.accessToken;
  }

  throw new Error(
    "Missing Google Ads access token. Set GOOGLE_ADS_ACCESS_TOKEN (or GOOGLE_OAUTH_ACCESS_TOKEN), or provide refresh credentials."
  );
}

async function fetchGoogleAdsResultsWithFallback(
  input: Omit<GoogleFetchInput, "startDate" | "endDate"> & { queries: string[] }
): Promise<GoogleAdsResult[]> {
  let lastError: unknown = null;

  for (let index = 0; index < input.queries.length; index += 1) {
    const query = input.queries[index];
    try {
      return await fetchGoogleAdsResults({
        customerId: input.customerId,
        apiVersion: input.apiVersion,
        developerToken: input.developerToken,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        loginCustomerId: input.loginCustomerId,
        query,
      });
    } catch (error) {
      lastError = wrapGoogleAdsRequestError(error);
      if (!isInvalidArgumentError(error) || index === input.queries.length - 1) {
        throw lastError;
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("Google Ads API request failed for all fallback queries.");
}

async function fetchGoogleGeoTargetConstantsByResourceName(
  input: Omit<GoogleFetchInput, "startDate" | "endDate"> & { resourceNames: string[] }
): Promise<Map<string, GoogleAdsResult["geoTargetConstant"]>> {
  const geoTargetsByResourceName = new Map<string, GoogleAdsResult["geoTargetConstant"]>();
  const resourceNameChunks = chunkArray(input.resourceNames, 100);

  for (const resourceNameChunk of resourceNameChunks) {
    const query = buildGooglePreviewGeoTargetConstantQuery(resourceNameChunk);
    logGooglePreviewInfo(
      `[google-preview] label=preview-campaign-locations-geo-lookup required=false accountId=${input.customerId} customerId=${input.customerId} loginCustomerId=${input.loginCustomerId ?? "(none)"} gaql=${JSON.stringify(compactWhitespace(query))}`
    );

    const results = await fetchGoogleAdsResults({
      customerId: input.customerId,
      apiVersion: input.apiVersion,
      developerToken: input.developerToken,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      loginCustomerId: input.loginCustomerId,
      query,
    });

    results.forEach((result) => {
      const resourceName = result.geoTargetConstant?.resourceName?.trim();
      if (!resourceName) {
        return;
      }

      geoTargetsByResourceName.set(resourceName, result.geoTargetConstant);
    });
  }

  return geoTargetsByResourceName;
}

async function fetchGoogleCampaignCriteriaByResourceName(
  input: Omit<GoogleFetchInput, "startDate" | "endDate"> & { resourceNames: string[] }
): Promise<Map<string, GoogleAdsResult["campaignCriterion"]>> {
  const criteriaByResourceName = new Map<string, GoogleAdsResult["campaignCriterion"]>();
  const resourceNameChunks = chunkArray(input.resourceNames, 100);

  for (const resourceNameChunk of resourceNameChunks) {
    const query = buildGoogleCampaignCriteriaLocationDetailQuery(resourceNameChunk);
    logGooglePreviewInfo(
      `[google-preview] label=location-view-criteria-lookup required=false accountId=${input.customerId} customerId=${input.customerId} loginCustomerId=${input.loginCustomerId ?? "(none)"} gaql=${JSON.stringify(compactWhitespace(query))}`
    );

    const results = await fetchGoogleAdsResults({
      customerId: input.customerId,
      apiVersion: input.apiVersion,
      developerToken: input.developerToken,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      loginCustomerId: input.loginCustomerId,
      query,
    });

    results.forEach((result) => {
      const resourceName = result.campaignCriterion?.resourceName?.trim();
      if (!resourceName) {
        return;
      }
      criteriaByResourceName.set(resourceName, result.campaignCriterion);
    });
  }

  return criteriaByResourceName;
}

async function executeGoogleAdsStreamRequest(input: {
  endpoint: string;
  body: object;
  developerToken: string;
  accessToken: string;
  loginCustomerId: string | null;
  canRefresh: boolean;
  refreshToken: string | null;
  clientId: string | null;
  clientSecret: string | null;
}): Promise<GoogleAdsStreamBatch[]> {
  let accessToken = input.accessToken;

  for (let attempt = 0; attempt <= GOOGLE_ADS_STREAM_RETRIES; attempt += 1) {
    let response = await requestGoogleAdsStreamWithRetry(
      input.endpoint,
      input.body,
      input.developerToken,
      accessToken,
      input.loginCustomerId
    );
    let parsed = await parseGoogleResponse(response);

    if ((parsed.status === 401 || parsed.status === 403 || parsed.parseError) && input.canRefresh) {
      accessToken = await refreshGoogleAccessToken({
        refreshToken: input.refreshToken!,
        clientId: input.clientId!,
        clientSecret: input.clientSecret!,
      });

      response = await requestGoogleAdsStreamWithRetry(
        input.endpoint,
        input.body,
        input.developerToken,
        accessToken,
        input.loginCustomerId
      );
      parsed = await parseGoogleResponse(response);
    }

    if (parsed.parseError) {
      throw new GoogleAdsRequestError({
        status: parsed.status,
        requestId: parsed.requestId,
        errorCode: parsed.errorCode,
        errorMessage: `Google Ads API returned non-JSON response (status ${parsed.status}, content-type ${parsed.contentType || "unknown"}). ${parsed.parseError}. Response starts with: ${parsed.textSnippet}`,
        category: classifyGoogleAdsFailure(
          parsed.status,
          parsed.errorCode,
          parsed.errorMessage ??
            `Google Ads API returned non-JSON response (status ${parsed.status}).`
        ),
      });
    }

    const topLevelError =
      parsed.json && !Array.isArray(parsed.json) && "error" in parsed.json
        ? parsed.json.error?.message
        : undefined;
    const streamBatches = Array.isArray(parsed.json) ? parsed.json : [];
    const streamError = findStreamBatchError(streamBatches);
    const failureMessage =
      streamError ??
      topLevelError ??
      (!parsed.ok
        ? `Google Ads API request failed with status ${parsed.status}. The customer ID may not be accessible.`
        : undefined);

    if (!failureMessage) {
      return streamBatches;
    }

    if (
      shouldRetryGoogleFailure(parsed.status, failureMessage) &&
      attempt < GOOGLE_ADS_STREAM_RETRIES
    ) {
      await sleep(getRetryDelayMs(null, attempt + 1));
      continue;
    }

    if (isRateLimitError(failureMessage) || parsed.status === 429) {
      throw new GoogleAdsRequestError({
        status: parsed.status,
        requestId: parsed.requestId,
        errorCode: parsed.errorCode,
        errorMessage:
          "Google Ads API rate-limited (HTTP 429 / RESOURCE_EXHAUSTED) after retry attempts. Please wait and retry.",
        category: "rate-limit",
      });
    }

    throw new GoogleAdsRequestError({
      status: parsed.status,
      requestId: parsed.requestId,
      errorCode: parsed.errorCode,
      errorMessage: failureMessage,
      category: classifyGoogleAdsFailure(parsed.status, parsed.errorCode, failureMessage),
    });
  }

  throw new Error("Google Ads API request failed after retry attempts.");
}

async function requestGoogleAdsStreamWithRetry(
  endpoint: string,
  body: object,
  developerToken: string,
  accessToken: string,
  loginCustomerId: string | null
): Promise<Response> {
  let response = await requestGoogleAdsStream(
    endpoint,
    body,
    developerToken,
    accessToken,
    loginCustomerId
  );

  for (let attempt = 1; attempt <= GOOGLE_ADS_MAX_RETRIES; attempt += 1) {
    if (!shouldRetryResponse(response.status)) {
      return response;
    }

    const delayMs = getRetryDelayMs(response.headers.get("retry-after"), attempt);
    await sleep(delayMs);

    response = await requestGoogleAdsStream(
      endpoint,
      body,
      developerToken,
      accessToken,
      loginCustomerId
    );
  }

  return response;
}

async function requestGoogleAdsStream(
  endpoint: string,
  body: object,
  developerToken: string,
  accessToken: string,
  loginCustomerId: string | null
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  };

  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId;
  }

  return fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

async function requestGoogleAdsSearch(
  endpoint: string,
  body: object,
  developerToken: string,
  accessToken: string,
  loginCustomerId: string | null
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  };

  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId;
  }

  return fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

function shouldRetryResponse(status: number): boolean {
  return status === 429 || status >= 500;
}

function shouldRetryGoogleFailure(status: number, message: string): boolean {
  if (shouldRetryResponse(status)) {
    return true;
  }

  return /internal_failure|temporar|unavailable|deadline_exceeded|resource_exhausted/i.test(
    message
  );
}

function getRetryDelayMs(retryAfter: string | null, attempt: number): number {
  const fromHeader = parseRetryAfterMs(retryAfter);
  if (fromHeader !== null) {
    return fromHeader;
  }

  const backoffMs = Math.min(12_000, 1_000 * 2 ** (attempt - 1));
  const jitterMs = Math.floor(Math.random() * 250);
  return backoffMs + jitterMs;
}

function parseRetryAfterMs(retryAfter: string | null): number | null {
  if (!retryAfter) {
    return null;
  }

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(500, Math.floor(seconds * 1_000));
  }

  const retryDate = Date.parse(retryAfter);
  if (Number.isNaN(retryDate)) {
    return null;
  }

  return Math.max(500, retryDate - Date.now());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(message: string | undefined): boolean {
  if (!message) {
    return false;
  }
  return /resource_exhausted|rate.?limit|too many requests|429/i.test(message);
}

function isInvalidArgumentError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /invalid argument|field.*(cannot|not).*select|request contains an invalid argument/i.test(
    error.message
  );
}

async function logAccessibleGoogleAdsCustomers(input: {
  apiVersion: string;
  developerToken: string;
  accessToken: string;
  customerId: string;
  loginCustomerId: string | null;
}): Promise<void> {
  try {
    const accessibleCustomers = await getAccessibleGoogleAdsCustomerIds(input);
    logGooglePreviewInfo(
      `[google-routing] accessible_customers=${accessibleCustomers.join(",") || "(none)"} target_customer_id=${input.customerId} login_customer_id=${input.loginCustomerId ?? "(none)"}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to inspect accessible Google Ads customers.";
    console.warn(`[google-routing] accessible_customer_check_failed message=${message}`);
  }
}

async function getAccessibleGoogleAdsCustomerIds(input: {
  apiVersion: string;
  developerToken: string;
  accessToken: string;
  customerId: string;
  loginCustomerId: string | null;
}): Promise<string[]> {
  const cacheKey = `${input.apiVersion}:${input.developerToken}:${input.accessToken}`;
  const cached = ACCESSIBLE_CUSTOMERS_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = fetchAccessibleGoogleAdsCustomerIds(input);
  ACCESSIBLE_CUSTOMERS_CACHE.set(cacheKey, pending);
  return pending;
}

async function fetchAccessibleGoogleAdsCustomerIds(input: {
  apiVersion: string;
  developerToken: string;
  accessToken: string;
  customerId: string;
  loginCustomerId: string | null;
}): Promise<string[]> {
  const endpoint = `https://googleads.googleapis.com/${input.apiVersion}/customers:listAccessibleCustomers`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "developer-token": input.developerToken,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Google Ads accessible customer check failed with status ${response.status}. ${rawText.trim() || "Empty response body."}`
    );
  }

  const json = JSON.parse(rawText) as { resourceNames?: string[] };
  return (json.resourceNames ?? [])
    .map((resourceName) => resourceName.split("/").pop() ?? "")
    .map((value) => normalizeOptionalGoogleAdsId(value))
    .filter((value): value is string => Boolean(value));
}

function logGoogleAdsRequestRouting(customerId: string, loginCustomerId: string | null) {
  logGooglePreviewInfo(
    `[google-routing] target_customer_id=${customerId} access_mode=${loginCustomerId ? "manager" : "direct"} login_customer_id=${loginCustomerId ?? "(none)"}`
  );
}

function normalizeGoogleAdsId(value: string): string {
  const normalized = value.replace(/\D/g, "");
  if (!normalized) {
    throw new Error("Google Ads customer ID is missing.");
  }
  return normalized;
}

function normalizeOptionalGoogleAdsId(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\D/g, "");
  return normalized || null;
}

function findStreamBatchError(streamBatches: GoogleAdsStreamBatch[]): string | undefined {
  return streamBatches.find((batch) => batch.error?.message)?.error?.message;
}

async function refreshGoogleAccessToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    client_secret: input.clientSecret,
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const rawText = await response.text();
  let json: {
    access_token?: string;
    error?: string;
    error_description?: string;
  } = {};

  try {
    json = JSON.parse(rawText) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
  } catch {
    throw new Error(
      `Google OAuth token refresh returned non-JSON response (status ${response.status}, content-type ${response.headers.get("content-type") || "unknown"}).`
    );
  }

  if (!response.ok || !json.access_token) {
    throw new Error(
      json.error_description ||
        json.error ||
        `Google OAuth token refresh failed with status ${response.status}.`
    );
  }

  return json.access_token;
}

async function parseGoogleResponse(response: Response): Promise<ParsedGoogleResponse> {
  const rawText = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const requestId = response.headers.get("request-id");
  const textSnippet = JSON.stringify(rawText.slice(0, 120));

  if (!rawText) {
    return {
      status: response.status,
      ok: response.ok,
      contentType,
      json: null,
      textSnippet,
      parseError: null,
      requestId,
      errorCode: null,
      errorMessage: response.ok
        ? null
        : `Google Ads API request failed with status ${response.status}. Empty response body.`,
    };
  }

  try {
    const json = JSON.parse(rawText) as GoogleAdsStreamBatch[] | { error?: { message?: string } };
    const errorInfo = extractGoogleAdsErrorInfo(json);
    return {
      status: response.status,
      ok: response.ok,
      contentType,
      json,
      textSnippet,
      parseError: null,
      requestId,
      errorCode: errorInfo.errorCode,
      errorMessage: errorInfo.errorMessage,
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
      requestId,
      errorCode: null,
      errorMessage: `Google Ads API returned non-JSON response (status ${response.status}).`,
    };
  }
}

async function parseGoogleAdsSearchResponse(response: Response): Promise<{
  status: number;
  ok: boolean;
  json: GoogleAdsSearchResponse | null;
  errorMessage: string | null;
  requestId: string | null;
  errorCode: string | null;
}> {
  const rawText = await response.text();
  const requestId = response.headers.get("request-id");

  if (!rawText) {
    return {
      status: response.status,
      ok: response.ok,
      json: null,
      requestId,
      errorCode: null,
      errorMessage: response.ok
        ? null
        : `Google Ads API request failed with status ${response.status}. Empty response body.`,
    };
  }

  try {
    const json = JSON.parse(rawText) as GoogleAdsSearchResponse;
    const errorInfo = extractGoogleAdsErrorInfo(json);
    if (!response.ok || json.error?.message) {
      return {
        status: response.status,
        ok: false,
        json,
        requestId,
        errorCode: errorInfo.errorCode,
        errorMessage:
          errorInfo.errorMessage ??
          `Google Ads API request failed with status ${response.status}. The customer ID may not be accessible.`,
      };
    }
    return {
      status: response.status,
      ok: true,
      json,
      requestId,
      errorCode: null,
      errorMessage: null,
    };
  } catch {
    return {
      status: response.status,
      ok: false,
      json: null,
      requestId,
      errorCode: null,
      errorMessage: `Google Ads API returned non-JSON response (status ${response.status}).`,
    };
  }
}

function extractGoogleAdsErrorInfo(
  json: GoogleAdsStreamBatch[] | GoogleAdsSearchResponse | { error?: { message?: string } } | null
): { errorCode: string | null; errorMessage: string | null } {
  if (!json || typeof json !== "object") {
    return { errorCode: null, errorMessage: null };
  }

  const topLevel = Array.isArray(json) ? undefined : "error" in json ? json.error : undefined;
  const errorMessage = topLevel?.message ?? findStreamBatchError(Array.isArray(json) ? json : []);
  const candidate = topLevel as
    | {
        details?: Array<{
          errors?: Array<{ errorCode?: Record<string, string | null | undefined> }>;
        }>;
      }
    | undefined;

  const detailErrorCode = candidate?.details
    ?.flatMap((detail) => detail.errors ?? [])
    .map((item) => item.errorCode ?? {})
    .flatMap((errorCodeRecord) => Object.entries(errorCodeRecord))
    .find(([, value]) => Boolean(value));

  return {
    errorCode: detailErrorCode ? `${detailErrorCode[0]}:${detailErrorCode[1]}` : null,
    errorMessage: errorMessage ?? null,
  };
}

function classifyGoogleAdsFailure(
  status: number | null,
  errorCode: string | null,
  message: string
): GoogleAdsRequestErrorDetails["category"] {
  const normalized = `${errorCode ?? ""} ${message}`.toLowerCase();
  if (/customer.*not reachable|account resolution|accessible customer/i.test(message)) {
    return "account-resolution";
  }
  if (status === 429 || /resource_exhausted|rate.?limit|too many requests/.test(normalized)) {
    return "rate-limit";
  }
  if (
    status === 401 ||
    status === 403 ||
    /permission denied|authorization_error|caller does not have permission|forbidden/.test(normalized)
  ) {
    return "permission";
  }
  if (
    /invalid argument|query_error|request_error|field.*(cannot|not).*select|unsupported|prohibited/.test(
      normalized
    )
  ) {
    return /unsupported/.test(normalized) ? "unsupported-resource" : "invalid-gaql";
  }
  if (/network|fetch failed|econn|socket|timeout|deadline exceeded/.test(normalized)) {
    return "network";
  }
  return "unknown";
}

function wrapGoogleAdsRequestError(error: unknown): Error {
  if (error instanceof GoogleAdsRequestError) {
    return error;
  }
  if (error instanceof Error) {
    return new GoogleAdsRequestError({
      status: null,
      requestId: null,
      errorCode: null,
      errorMessage: error.message,
      category: classifyGoogleAdsFailure(null, null, error.message),
    });
  }
  return new GoogleAdsRequestError({
    status: null,
    requestId: null,
    errorCode: null,
    errorMessage: "Unknown Google Ads request failure.",
    category: "unknown",
  });
}

function asGoogleAdsRequestError(error: unknown): GoogleAdsRequestError | null {
  return error instanceof GoogleAdsRequestError ? error : null;
}

function normalizeCampaignType(channelType: string): string {
  return channelType
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function buildGooglePreviewCampaignQueries(
  _startDate: string,
  _endDate: string,
  selection?: GooglePreviewSelection
): string[] {
  void _startDate;
  void _endDate;
  const selectionFilters = buildGooglePreviewSelectionFilters(selection, "campaign");
  return [
    `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign.serving_status,
        campaign.bidding_strategy_type,
        campaign.start_date,
        campaign.end_date,
        campaign.network_settings.target_google_search,
        campaign.network_settings.target_search_network,
        campaign.network_settings.target_partner_search_network,
        campaign.network_settings.target_content_network,
        campaign_budget.amount_micros
      FROM campaign
      WHERE campaign.status = 'ENABLED'
        ${selectionFilters}
      ORDER BY campaign.name
    `,
  ];
}

function buildGooglePreviewAdGroupQueries(
  _startDate: string,
  _endDate: string,
  selection?: GooglePreviewSelection
): string[] {
  void _startDate;
  void _endDate;
  const selectionFilters = buildGooglePreviewSelectionFilters(selection, "ad-group");
  return [
    `
      SELECT
        campaign.id,
        ad_group.id,
        ad_group.name,
        ad_group.status,
        ad_group.type,
        ad_group.cpc_bid_micros
      FROM ad_group
      WHERE campaign.status = 'ENABLED'
        AND ad_group.status != 'REMOVED'
        ${selectionFilters}
      ORDER BY campaign.id, ad_group.name
    `,
  ];
}

function buildGooglePreviewAdQueries(
  _startDate: string,
  _endDate: string,
  selection?: GooglePreviewSelection
): string[] {
  void _startDate;
  void _endDate;
  const selectionFilters = buildGooglePreviewSelectionFilters(selection, "ad");
  return [
    `
      SELECT
        campaign.id,
        ad_group.id,
        ad_group.name,
        ad_group_ad.status,
        ad_group_ad.ad.id,
        ad_group_ad.ad.name,
        ad_group_ad.ad.type,
        ad_group_ad.ad.final_urls,
        ad_group_ad.ad.display_url,
        ad_group_ad.ad.responsive_search_ad.path1,
        ad_group_ad.ad.responsive_search_ad.path2,
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions
      FROM ad_group_ad
      WHERE campaign.status = 'ENABLED'
        AND ad_group.status != 'REMOVED'
        AND ad_group_ad.status != 'REMOVED'
        ${selectionFilters}
      ORDER BY campaign.id, ad_group.id, ad_group_ad.ad.id
    `,
  ];
}

function buildGooglePreviewKeywordQueries(
  _startDate: string,
  _endDate: string,
  selection?: GooglePreviewSelection
): string[] {
  void _startDate;
  void _endDate;
  const selectionFilters = buildGooglePreviewSelectionFilters(selection, "ad-group");
  return [
    `
      SELECT
        campaign.id,
        ad_group.id,
        ad_group_criterion.criterion_id,
        ad_group_criterion.keyword.text
      FROM keyword_view
      WHERE campaign.status = 'ENABLED'
        AND ad_group.status = 'ENABLED'
        AND ad_group_criterion.status = 'ENABLED'
        ${selectionFilters}
      ORDER BY campaign.id, ad_group.id, ad_group_criterion.criterion_id
    `,
  ];
}

function buildGooglePreviewCampaignLocationQueries(selection?: GooglePreviewSelection): string[] {
  const selectionFilters = buildGooglePreviewSelectionFilters(selection, "campaign");
  return [
    `
      SELECT
        campaign.id,
        campaign.name,
        campaign_criterion.criterion_id,
        campaign_criterion.type,
        campaign_criterion.negative,
        campaign_criterion.status,
        campaign_criterion.location.geo_target_constant
      FROM campaign_criterion
      WHERE campaign.status = 'ENABLED'
        AND campaign_criterion.type = 'LOCATION'
        AND campaign_criterion.negative = FALSE
        AND campaign_criterion.status != 'REMOVED'
        ${selectionFilters}
      ORDER BY campaign.id, campaign_criterion.type, campaign_criterion.criterion_id
    `,
  ];
}

function buildGooglePreviewGeoTargetConstantQuery(resourceNames: string[]): string {
  const quotedResourceNames = resourceNames.map((resourceName) => `'${escapeGaqlString(resourceName)}'`);

  return `
    SELECT
      geo_target_constant.resource_name,
      geo_target_constant.id,
      geo_target_constant.name,
      geo_target_constant.canonical_name,
      geo_target_constant.country_code,
      geo_target_constant.target_type,
      geo_target_constant.status
    FROM geo_target_constant
    WHERE geo_target_constant.resource_name IN (${quotedResourceNames.join(", ")})
  `;
}

function buildGoogleCampaignCriteriaLocationDetailQuery(resourceNames: string[]): string {
  const quotedResourceNames = resourceNames.map((resourceName) => `'${escapeGaqlString(resourceName)}'`);

  return `
    SELECT
      campaign_criterion.resource_name,
      campaign_criterion.criterion_id,
      campaign_criterion.type,
      campaign_criterion.status,
      campaign_criterion.location.geo_target_constant,
      campaign_criterion.proximity.address.city_name,
      campaign_criterion.proximity.address.country_code,
      campaign_criterion.proximity.address.postal_code,
      campaign_criterion.proximity.address.province_code,
      campaign_criterion.proximity.address.province_name,
      campaign_criterion.proximity.address.street_address,
      campaign_criterion.proximity.geo_point.latitude_in_micro_degrees,
      campaign_criterion.proximity.geo_point.longitude_in_micro_degrees,
      campaign_criterion.proximity.radius,
      campaign_criterion.proximity.radius_units
    FROM campaign_criterion
    WHERE campaign_criterion.resource_name IN (${quotedResourceNames.join(", ")})
      AND campaign_criterion.type IN ('LOCATION', 'PROXIMITY')
      AND campaign_criterion.negative = FALSE
  `;
}

function buildGooglePreviewCampaignLanguageQueries(selection?: GooglePreviewSelection): string[] {
  const selectionFilters = buildGooglePreviewSelectionFilters(selection, "campaign");
  return [
    `
      SELECT
        campaign.id,
        campaign_criterion.criterion_id,
        campaign_criterion.type,
        campaign_criterion.negative,
        language_constant.name
      FROM campaign_criterion
      WHERE campaign.status = 'ENABLED'
        AND campaign_criterion.type = 'LANGUAGE'
        AND campaign_criterion.negative = FALSE
        ${selectionFilters}
      ORDER BY campaign.id, campaign_criterion.type, campaign_criterion.criterion_id
    `,
  ];
}

function buildGooglePreviewAdGroupAssetQueries(selection?: GooglePreviewSelection): string[] {
  const selectionFilters = buildGooglePreviewSelectionFilters(selection, "ad-group");
  return [
    `
      SELECT
        ad_group.id,
        ad_group_asset.field_type,
        asset.id,
        asset.name,
        asset.type,
        asset.text_asset.text,
        asset.sitelink_asset.link_text,
        asset.sitelink_asset.description1,
        asset.sitelink_asset.description2,
        asset.image_asset.full_size.url
      FROM ad_group_asset
      WHERE ad_group_asset.status != 'REMOVED'
        ${selectionFilters}
    `,
  ];
}

function buildGooglePreviewCampaignAssetQueries(selection?: GooglePreviewSelection): string[] {
  const selectionFilters = buildGooglePreviewSelectionFilters(selection, "campaign");
  return [
    `
      SELECT
        campaign.id,
        campaign_asset.field_type,
        asset.id,
        asset.name,
        asset.type,
        asset.text_asset.text,
        asset.sitelink_asset.link_text,
        asset.sitelink_asset.description1,
        asset.sitelink_asset.description2,
        asset.image_asset.full_size.url
      FROM campaign_asset
      WHERE campaign_asset.status != 'REMOVED'
        ${selectionFilters}
    `,
  ];
}

function buildGooglePreviewCustomerAssetQueries(): string[] {
  return [
    `
      SELECT
        customer.id,
        customer_asset.field_type,
        asset.id,
        asset.name,
        asset.type,
        asset.text_asset.text,
        asset.sitelink_asset.link_text,
        asset.sitelink_asset.description1,
        asset.sitelink_asset.description2,
        asset.image_asset.full_size.url
      FROM customer_asset
      WHERE customer_asset.status != 'REMOVED'
    `,
  ];
}

function buildGooglePreviewSelectionFilters(
  selection: GooglePreviewSelection | undefined,
  level: "campaign" | "ad-group" | "ad"
): string {
  if (!selection || selection.platform === "meta") {
    return "";
  }

  const filters: string[] = [];
  const campaignId = selection.campaignId?.trim();
  const adGroupId = selection.adGroupId?.trim();
  const adId = selection.adId?.trim();

  if (campaignId) {
    filters.push(`campaign.id = ${googleIdLiteral(campaignId)}`);
  }
  if ((level === "ad-group" || level === "ad") && adGroupId) {
    filters.push(`ad_group.id = ${googleIdLiteral(adGroupId)}`);
  }
  if (level === "ad" && adId) {
    filters.push(`ad_group_ad.ad.id = ${googleIdLiteral(adId)}`);
  }

  return filters.length ? filters.map((filter) => `AND ${filter}`).join("\n        ") : "";
}

function googleIdLiteral(value: string): string {
  return /^\d+$/.test(value) ? value : `'${escapeGaqlString(value)}'`;
}

function normalizeGooglePreviewAccessPath(value: string | null): string | null {
  return normalizeGoogleAdsAccessPath(value);
}

function formatGoogleAccessPath(value: string): string {
  const normalized = normalizeGoogleAdsId(value);
  return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`;
}

function createGooglePreviewWarning(input: {
  label: string;
  context: GooglePreviewContext;
  reason: string;
  category: GooglePreviewWarning["category"];
  requestId: string | null;
  errorCode: string | null;
}): GooglePreviewWarning {
  return {
    code: "google-preview-warning",
    label: input.label,
    required: false,
    customerId: input.context.customerId,
    loginCustomerId: input.context.loginCustomerId,
    message: `Optional Google Ads preview block "${input.label}" failed.`,
    reason: input.reason,
    category: input.category,
    requestId: input.requestId,
    errorCode: input.errorCode,
  };
}

function createGoogleAdsAccessPathError(input: {
  accountId: string;
  customerId: string;
  originalAccessPath: string | null;
  resolvedAccessPath: string | null;
  fallbackUsed: boolean;
  loginCustomerId: string | null;
  error: unknown;
}): GoogleAdsAccessPathError {
  const requestError = asGoogleAdsRequestError(input.error);
  const errorCode =
    requestError?.errorCode ??
    (input.fallbackUsed ? "GOOGLE_ADS_FALLBACK_ROUTE_NOT_FOUND" : "GOOGLE_ADS_ACCESS_PATH_NOT_FOUND");
  const errorMessage =
    requestError?.message ??
    (input.error instanceof Error
      ? input.error.message
      : "Google Ads access-path verification failed.");
  const payload: GoogleAdsAccessPathErrorPayload = {
    success: false,
    stage: "google_ads_access_path",
    errorCode,
    message: formatGoogleAdsAccessPathErrorMessage({
      accountId: input.accountId,
      originalAccessPath: input.originalAccessPath,
      resolvedAccessPath: input.resolvedAccessPath,
      fallbackUsed: input.fallbackUsed,
      errorCode,
      errorMessage,
    }),
    accountId: input.accountId,
    originalAccessPath: input.originalAccessPath,
    resolvedAccessPath: input.resolvedAccessPath,
    fallbackUsed: input.fallbackUsed,
    loginCustomerId: input.loginCustomerId,
    customerId: input.customerId,
    errorMessage,
  };

  console.warn(
    `[google-routing] accountId=${payload.accountId} originalAccessPath=${payload.originalAccessPath ?? "(missing)"} resolvedAccessPath=${payload.resolvedAccessPath ?? "(none)"} fallbackUsed=${payload.fallbackUsed} loginCustomerId=${payload.loginCustomerId ?? "(none)"} customerId=${payload.customerId} errorCode=${payload.errorCode} errorMessage=${JSON.stringify(payload.errorMessage)}`
  );

  return new GoogleAdsAccessPathError(payload);
}

function createGooglePreviewFatalError(input: {
  code: GooglePreviewFatalError["code"];
  label: string;
  context: GooglePreviewContext;
  message: string;
  reason: string;
  category: GooglePreviewFatalError["category"];
  requestId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}): GooglePreviewFatalError {
  return {
    code: input.code,
    label: input.label,
    customerId: input.context.customerId,
    loginCustomerId: input.context.loginCustomerId,
    targetCustomerId: input.context.customerId,
    accessPath: input.context.accessPath,
    originalAccessPath: input.context.originalAccessPath,
    resolvedAccessPath: input.context.resolvedAccessPath,
    fallbackUsed: input.context.fallbackUsed,
    reason: input.reason,
    message: input.message,
    category: input.category,
    requestId: input.requestId,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
  };
}

function logGooglePreviewBlockFailure(
  block: GooglePreviewBlockDefinition,
  context: GooglePreviewContext,
  gaql: string,
  requestError: GoogleAdsRequestError | null,
  error: unknown
) {
  const message =
    requestError?.message ??
    (error instanceof Error ? error.message : "Unknown Google Ads block failure.");
  console.warn(
    `[google-preview] label=${block.label} required=${block.required} accountId=${context.customerId} customerId=${context.customerId} loginCustomerId=${context.loginCustomerId ?? "(none)"} requestId=${requestError?.requestId ?? "(none)"} errorCode=${requestError?.errorCode ?? "(none)"} category=${requestError?.category ?? "unknown"} message=${JSON.stringify(message)} gaql=${JSON.stringify(compactWhitespace(gaql))}`
  );
}

function logGooglePreviewInfo(message: string) {
  if (!isGooglePreviewDiagnosticsLoggingEnabled()) {
    return;
  }
  console.info(message);
}

function isGooglePreviewDiagnosticsLoggingEnabled(): boolean {
  const value = process.env.GOOGLE_ADS_PREVIEW_DIAGNOSTICS;
  return typeof value === "string" && /^(1|true|yes|on)$/i.test(value.trim());
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeGaqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function chunkArray<T>(values: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

function normalizeCtr(ctr: number | string | undefined, impressions: number, clicks: number): number {
  const normalized = normalizePercent(ctr);
  if (normalized > 0) {
    return normalized;
  }
  return impressions > 0 ? (clicks * 100) / impressions : 0;
}

function normalizePercent(value: number | string | undefined, fallbackBase = 0, fallbackCount = 0): number {
  const numeric = toNumber(value);
  if (numeric > 0) {
    return numeric <= 1 ? numeric * 100 : numeric;
  }
  if (fallbackBase > 0) {
    return (fallbackCount * 100) / fallbackBase;
  }
  return 0;
}

function normalizeOptionalPercent(value: number | string | undefined): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric <= 1 ? numeric * 100 : numeric;
}

function microsToCurrency(value: string | number | undefined): number {
  const micros = toNumber(value);
  return micros / 1_000_000;
}

function toNumber(value: string | number | undefined): number {
  if (value === undefined || value === null || value === "") {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function humanizeStatus(value: string | undefined): string {
  return humanizeEnum(value) || "Unknown";
}

function humanizeEnum(value: string | undefined): string {
  if (!value) {
    return "";
  }

  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function detailField(label: string, value: string | undefined | null): PreviewDetailField | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return { label, value: normalized };
}

function compactDetailFields(
  fields: Array<PreviewDetailField | null>
): PreviewDetailField[] {
  return fields.filter((field): field is PreviewDetailField => Boolean(field));
}

function formatMicrosCurrency(value: string | number | undefined): string | null {
  const amount = microsToCurrency(value);
  if (!amount) {
    return null;
  }

  return `RM ${amount.toFixed(2)}`;
}

function joinDetailValues(values: string[] | undefined): string | null {
  if (!values || values.length === 0) {
    return null;
  }

  return values.join(", ");
}

function collectCampaignLocationResourceNames(results: GoogleAdsResult[]): string[] {
  const resourceNames = new Set<string>();

  results.forEach((result) => {
    const resourceName = result.campaignCriterion?.location?.geoTargetConstant?.trim();
    if (resourceName) {
      resourceNames.add(resourceName);
    }
  });

  return Array.from(resourceNames);
}

function attachGeoTargetConstants(
  results: GoogleAdsResult[],
  geoTargetsByResourceName: Map<string, GoogleAdsResult["geoTargetConstant"]>
): GoogleAdsResult[] {
  return results.map((result) => {
    const resourceName = result.campaignCriterion?.location?.geoTargetConstant?.trim();
    if (!resourceName) {
      return result;
    }

    const geoTarget = geoTargetsByResourceName.get(resourceName);
    const fallbackName = formatGeoTargetFallbackName(resourceName, result.campaignCriterion?.criterionId);

    return {
      ...result,
      geoTargetConstant: {
        resourceName,
        id: result.campaignCriterion?.criterionId,
        ...geoTarget,
        name: geoTarget?.name?.trim() || geoTarget?.canonicalName?.trim() || fallbackName,
      },
    };
  });
}

function formatGeoTargetFallbackName(resourceName: string, criterionId: string | undefined): string {
  const resourceId = resourceName.split("/").pop()?.trim() || criterionId?.trim();
  return resourceId ? `${resourceName} (${resourceId})` : resourceName;
}

function collectCampaignCriterionNames(
  results: GoogleAdsResult[],
  criterionType: "LOCATION" | "LANGUAGE"
): Map<string, string[]> {
  const namesByCampaign = new Map<string, string[]>();

  results.forEach((result) => {
    const campaignId = result.campaign?.id?.trim();
    const type = result.campaignCriterion?.type?.trim();
    if (!campaignId || type !== criterionType) {
      return;
    }

    const name =
      criterionType === "LOCATION"
        ? result.geoTargetConstant?.name?.trim()
        : result.languageConstant?.name?.trim();
    if (!name) {
      return;
    }

    const items = namesByCampaign.get(campaignId) ?? [];
    if (!items.includes(name)) {
      items.push(name);
      namesByCampaign.set(campaignId, items);
    }
  });

  return namesByCampaign;
}

function formatGoogleCampaignNetworks(result: GoogleAdsResult): string | null {
  const labels: string[] = [];
  const settings = result.campaign?.networkSettings;

  if (settings?.targetGoogleSearch) {
    labels.push("Google Search");
  }
  if (settings?.targetSearchNetwork || settings?.targetPartnerSearchNetwork) {
    labels.push("Search Partners");
  }
  if (settings?.targetContentNetwork) {
    labels.push("Display Network");
  }

  if (labels.length > 0) {
    return labels.join(", ");
  }

  const channel = result.campaign?.advertisingChannelType?.trim();
  if (channel === "SEARCH") {
    return "Google Search";
  }
  if (channel === "DISPLAY") {
    return "Display Network";
  }

  return humanizeEnum(channel);
}

function compactStrings(values: Array<string | undefined | null>): string[] {
  return values.map((value) => value?.trim() ?? "").filter((value) => value.length > 0);
}

function normalizePreviewTextAssets(
  items:
    | Array<{
        text?: string;
        pinnedField?: string;
      }>
    | undefined
): PreviewTextAsset[] {
  if (!items?.length) {
    return [];
  }

  return items
    .map((item) => ({
      text: item.text?.trim() ?? "",
      pinnedField: humanizeEnum(item.pinnedField),
    }))
    .filter((item) => item.text.length > 0);
}

function pickPreviewDisplayPathParts(result: GoogleAdsResult): string[] {
  const explicitParts = compactStrings([
    result.adGroupAd?.ad?.responsiveSearchAd?.path1,
    result.adGroupAd?.ad?.responsiveSearchAd?.path2,
    result.adGroupAd?.ad?.expandedTextAd?.path1,
    result.adGroupAd?.ad?.expandedTextAd?.path2,
  ]);

  if (explicitParts.length > 0) {
    return explicitParts.slice(0, 2);
  }

  const displayUrl = result.adGroupAd?.ad?.displayUrl?.trim();
  if (!displayUrl) {
    return [];
  }

  const withoutProtocol = displayUrl.replace(/^https?:\/\//i, "");
  const [, ...pathSegments] = withoutProtocol.split("/").filter(Boolean);
  return pathSegments.slice(0, 2);
}

function pickPreviewHeadlines(result: GoogleAdsResult): PreviewTextAsset[] {
  const responsiveHeadlines = normalizePreviewTextAssets(
    result.adGroupAd?.ad?.responsiveSearchAd?.headlines
  );
  if (responsiveHeadlines.length > 0) {
    return responsiveHeadlines;
  }

  return compactStrings([
    result.adGroupAd?.ad?.expandedTextAd?.headlinePart1,
    result.adGroupAd?.ad?.expandedTextAd?.headlinePart2,
    result.adGroupAd?.ad?.expandedTextAd?.headlinePart3,
  ]).map((text) => ({ text }));
}

function pickPreviewDescriptions(result: GoogleAdsResult): PreviewTextAsset[] {
  const responsiveDescriptions = normalizePreviewTextAssets(
    result.adGroupAd?.ad?.responsiveSearchAd?.descriptions
  );
  if (responsiveDescriptions.length > 0) {
    return responsiveDescriptions;
  }

  return compactStrings([
    result.adGroupAd?.ad?.expandedTextAd?.description,
    result.adGroupAd?.ad?.expandedTextAd?.description2,
  ]).map((text) => ({ text }));
}

function buildAssetMap(
  results: GoogleAdsResult[],
  scope: "adGroup" | "campaign" | "customer"
): Map<string, GoogleAssetLinkResult[]> {
  const assetsByOwner = new Map<string, GoogleAssetLinkResult[]>();

  results.forEach((result) => {
    const ownerId =
      scope === "adGroup"
        ? result.adGroup?.id?.trim()
        : scope === "campaign"
          ? result.campaign?.id?.trim()
          : result.customer?.id?.trim();
    const fieldType =
      scope === "adGroup"
        ? result.adGroupAsset?.fieldType?.trim()
        : scope === "campaign"
          ? result.campaignAsset?.fieldType?.trim()
          : result.customerAsset?.fieldType?.trim();
    const assetId = result.asset?.id?.trim();

    if (!ownerId || !fieldType || !assetId) {
      return;
    }

    const items = assetsByOwner.get(ownerId) ?? [];
    const uniqueKey = `${fieldType}:${assetId}`;
    if (
      items.some((item) => `${item.fieldType}:${item.assetId}` === uniqueKey)
    ) {
      return;
    }

    items.push({
      ownerId,
      fieldType,
      assetId,
      text: result.asset?.textAsset?.text?.trim() ?? null,
      linkText: result.asset?.sitelinkAsset?.linkText?.trim() ?? null,
      description1: result.asset?.sitelinkAsset?.description1?.trim() ?? null,
      description2: result.asset?.sitelinkAsset?.description2?.trim() ?? null,
      finalUrl: result.asset?.finalUrls?.[0]?.trim() ?? null,
      imageUrl: result.asset?.imageAsset?.fullSize?.url?.trim() ?? null,
    });
    assetsByOwner.set(ownerId, items);
  });

  return assetsByOwner;
}

function pickImageAssets(...assetGroups: GoogleAssetLinkResult[][]): PreviewImageAsset[] {
  const picked = new Map<string, PreviewImageAsset>();

  assetGroups.flat().forEach((asset) => {
    if (!asset.imageUrl || !isMarketingImageField(asset.fieldType)) {
      return;
    }

    if (picked.has(asset.assetId)) {
      return;
    }

    picked.set(asset.assetId, {
      id: asset.assetId,
      url: asset.imageUrl,
      alt: asset.text || `Image ${asset.assetId}`,
    });
  });

  return Array.from(picked.values());
}

function pickBusinessName(assets: GoogleAssetLinkResult[]): string | null {
  return assets.find((asset) => asset.fieldType === "BUSINESS_NAME")?.text ?? null;
}

function pickBusinessLogo(assets: GoogleAssetLinkResult[]): string | null {
  return (
    assets.find((asset) => asset.fieldType === "BUSINESS_LOGO" && asset.imageUrl)?.imageUrl ?? null
  );
}

function pickSitelinks(...assetGroups: GoogleAssetLinkResult[][]): PreviewSitelinkAsset[] {
  const sitelinks = new Map<string, PreviewSitelinkAsset>();

  assetGroups.flat().forEach((asset) => {
    if (asset.fieldType !== "SITELINK" || !asset.linkText) {
      return;
    }

    if (sitelinks.has(asset.assetId)) {
      return;
    }

    sitelinks.set(asset.assetId, {
      id: asset.assetId,
      linkText: asset.linkText,
      description1: asset.description1 ?? null,
      description2: asset.description2 ?? null,
      finalUrl: asset.finalUrl ?? null,
    });
  });

  return Array.from(sitelinks.values());
}

function isMarketingImageField(fieldType: string): boolean {
  return fieldType === "MARKETING_IMAGE" || fieldType === "SQUARE_MARKETING_IMAGE";
}
