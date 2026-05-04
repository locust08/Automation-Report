import { emptyCampaignRow } from "@/lib/reporting/metrics";
import {
  AuctionInsightRow,
  CampaignRow,
  GoogleAdsAccessPathErrorPayload,
  PreviewCampaignNode,
  PreviewDetailField,
  GooglePreviewBlockDiagnostic,
  GooglePreviewDiagnostics,
  GooglePreviewFatalError,
  GooglePreviewWarning,
  PreviewImageAsset,
  PreviewSitelinkAsset,
  PreviewTextAsset,
  TopKeywordRow,
} from "@/lib/reporting/types";
import {
  DEFAULT_GOOGLE_ADS_FALLBACK_LOGIN_CUSTOMER_ID,
  formatGoogleAdsAccessPathErrorMessage,
  formatGoogleAdsCustomerId,
  isDirectGoogleAdsAccessPath,
  normalizeGoogleAdsAccessPath,
  normalizeGoogleAdsCustomerId,
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

interface GoogleAdsResult {
  customer?: {
    id?: string;
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
  adGroup?: {
    id?: string;
    name?: string;
    status?: string;
    type?: string;
    cpcBidMicros?: string | number;
  };
  campaignCriterion?: {
    criterionId?: string;
    type?: string;
    negative?: boolean;
    status?: string;
    location?: {
      geoTargetConstant?: string;
    };
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
    };
  };
  asset?: {
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
  };
  adGroupCriterion?: {
    criterionId?: string;
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

  const metricResults = await fetchGoogleAdsResultsWithFallback({
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
  const results =
    metricResults.length > 0
      ? metricResults
      : await fetchGoogleAdsResultsWithFallback({
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
                campaign.status
              FROM campaign
              WHERE campaign.status = 'ENABLED'
            `,
          ],
        });

  return results
    .filter((result) => result.campaign?.status === "ENABLED")
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
  input: GoogleFetchInput & { accessPath?: string | null }
): Promise<GooglePreviewFetchResult> {
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
        queries: buildGooglePreviewCampaignQueries(input.startDate, input.endDate),
      },
      context,
      input
    );
    diagnostics.blocks.push(campaignsBlock.diagnostic);

    const adGroupsBlock = await runGooglePreviewBlock(
      {
        label: "preview-ad-groups",
        required: true,
        queries: buildGooglePreviewAdGroupQueries(input.startDate, input.endDate),
      },
      context,
      input
    );
    diagnostics.blocks.push(adGroupsBlock.diagnostic);

    const adsBlock = await runGooglePreviewBlock(
      {
        label: "preview-ads",
        required: true,
        queries: buildGooglePreviewAdQueries(input.startDate, input.endDate),
      },
      context,
      input
    );
    diagnostics.blocks.push(adsBlock.diagnostic);

    const optionalResults = await Promise.all([
      runGoogleOptionalPreviewBlock(
        {
          label: "preview-keywords",
          required: false,
          queries: buildGooglePreviewKeywordQueries(input.startDate, input.endDate),
        },
        context,
        input
      ),
      runGoogleOptionalPreviewBlock(
        {
          label: "preview-ad-group-assets",
          required: false,
          queries: buildGooglePreviewAdGroupAssetQueries(),
        },
        context,
        input
      ),
      runGoogleOptionalPreviewBlock(
        {
          label: "preview-campaign-assets",
          required: false,
          queries: buildGooglePreviewCampaignAssetQueries(),
        },
        context,
        input
      ),
      runGoogleOptionalPreviewBlock(
        {
          label: "preview-customer-assets",
          required: false,
          queries: buildGooglePreviewCustomerAssetQueries(),
        },
        context,
        input
      ),
      runGooglePreviewCampaignLocationBlock(
        {
          label: "preview-campaign-locations",
          required: false,
          queries: buildGooglePreviewCampaignLocationQueries(),
        },
        context,
        input
      ),
      runGoogleOptionalPreviewBlock(
        {
          label: "preview-campaign-languages",
          required: false,
          queries: buildGooglePreviewCampaignLanguageQueries(),
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

  if (baseRoute.resolutionMode === "direct") {
    candidates.push({
      loginCustomerId: null,
      resolvedAccessPath: "Personal",
      fallbackUsed: false,
    });
  } else {
    if (originalManagerCustomerId) {
      candidates.push({
        loginCustomerId: originalManagerCustomerId,
        resolvedAccessPath: formatGoogleAccessPath(originalManagerCustomerId),
        fallbackUsed: false,
      });
    }

    if (!originalManagerCustomerId || fallbackLoginCustomerId !== originalManagerCustomerId) {
      candidates.push({
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
  let activeAccessToken = input.accessToken;

  if (canRefresh) {
    activeAccessToken = await refreshGoogleAccessToken({
      refreshToken: input.refreshToken!,
      clientId: input.clientId!,
      clientSecret: input.clientSecret!,
    });
  }

  if (!activeAccessToken) {
    throw new Error(
      "Missing Google Ads access token. Set GOOGLE_ADS_ACCESS_TOKEN (or GOOGLE_OAUTH_ACCESS_TOKEN), or provide refresh credentials."
    );
  }

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

function buildGooglePreviewCampaignQueries(startDate: string, endDate: string): string[] {
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
      ORDER BY campaign.name
    `,
  ];
}

function buildGooglePreviewAdGroupQueries(startDate: string, endDate: string): string[] {
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
      ORDER BY campaign.id, ad_group.name
    `,
  ];
}

function buildGooglePreviewAdQueries(startDate: string, endDate: string): string[] {
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
      ORDER BY campaign.id, ad_group.id, ad_group_ad.ad.id
    `,
  ];
}

function buildGooglePreviewKeywordQueries(startDate: string, endDate: string): string[] {
  return [
    `
      SELECT
        campaign.id,
        ad_group.id,
        ad_group_criterion.criterion_id,
        ad_group_criterion.keyword.text
      FROM keyword_view
      WHERE campaign.status = 'ENABLED'
        AND ad_group.status != 'REMOVED'
        AND ad_group_criterion.status != 'REMOVED'
      ORDER BY campaign.id, ad_group.id, ad_group_criterion.criterion_id
    `,
  ];
}

function buildGooglePreviewCampaignLocationQueries(): string[] {
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

function buildGooglePreviewCampaignLanguageQueries(): string[] {
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
      ORDER BY campaign.id, campaign_criterion.type, campaign_criterion.criterion_id
    `,
  ];
}

function buildGooglePreviewAdGroupAssetQueries(): string[] {
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
    `,
  ];
}

function buildGooglePreviewCampaignAssetQueries(): string[] {
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

function normalizeGooglePreviewAccessPath(value: string | null): string | null {
  return normalizeGoogleAdsAccessPath(value);
}

function isDirectGoogleAccessPath(value: string): boolean {
  return isDirectGoogleAdsAccessPath(value);
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
