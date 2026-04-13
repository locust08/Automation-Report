import { emptyCampaignRow } from "@/lib/reporting/metrics";
import { AuctionInsightRow, CampaignRow, TopKeywordRow } from "@/lib/reporting/types";

interface GoogleFetchInput {
  customerId: string;
  apiVersion: string;
  developerToken: string;
  accessToken: string | null;
  refreshToken: string | null;
  clientId: string | null;
  clientSecret: string | null;
  loginCustomerId: string | null;
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
  campaign?: {
    id?: string;
    name?: string;
    advertisingChannelType?: string;
    status?: string;
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
}

const GOOGLE_ADS_MAX_RETRIES = 3;
const GOOGLE_ADS_STREAM_RETRIES = 2;
const ACCESSIBLE_CUSTOMERS_CACHE = new Map<string, Promise<string[]>>();

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
    throw new Error(parsed.errorMessage || `Google Ads API request failed with status ${parsed.status}.`);
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
  startDate,
  endDate,
}: GoogleFetchInput): Promise<CampaignRow[]> {
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
    customerId,
    apiVersion,
    developerToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    loginCustomerId,
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

export async function fetchGoogleTopKeywordRows({
  customerId,
  apiVersion,
  developerToken,
  accessToken,
  refreshToken,
  clientId,
  clientSecret,
  loginCustomerId,
  startDate,
  endDate,
}: GoogleFetchInput): Promise<TopKeywordRow[]> {
  const results = await fetchGoogleAdsResultsWithFallback({
    customerId,
    apiVersion,
    developerToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    loginCustomerId,
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
  startDate,
  endDate,
}: GoogleFetchInput): Promise<AuctionInsightRow[]> {
  const results = await fetchGoogleAdsResultsWithFallback({
    customerId,
    apiVersion,
    developerToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    loginCustomerId,
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
      lastError = error;
      if (!isInvalidArgumentError(error) || index === input.queries.length - 1) {
        throw error;
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("Google Ads API request failed for all fallback queries.");
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
      throw new Error(
        `Google Ads API returned non-JSON response (status ${parsed.status}, content-type ${parsed.contentType || "unknown"}). ${parsed.parseError}. Response starts with: ${parsed.textSnippet}`
      );
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
      throw new Error(
        "Google Ads API rate-limited (HTTP 429 / RESOURCE_EXHAUSTED) after retry attempts. Please wait and retry."
      );
    }

    throw new Error(failureMessage);
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

function isPermissionDeniedMessage(message: string | null | undefined): boolean {
  if (!message) {
    return false;
  }

  return /caller does not have permission|permission denied|authorization_error|forbidden/i.test(
    message
  );
}

function isPermissionDeniedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return isPermissionDeniedMessage(error.message);
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
    console.info(
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
  console.info(
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
    const json = JSON.parse(rawText) as GoogleAdsStreamBatch[] | { error?: { message?: string } };
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

async function parseGoogleAdsSearchResponse(response: Response): Promise<{
  status: number;
  ok: boolean;
  json: GoogleAdsSearchResponse | null;
  errorMessage: string | null;
}> {
  const rawText = await response.text();

  if (!rawText) {
    return {
      status: response.status,
      ok: response.ok,
      json: null,
      errorMessage: response.ok
        ? null
        : `Google Ads API request failed with status ${response.status}. Empty response body.`,
    };
  }

  try {
    const json = JSON.parse(rawText) as GoogleAdsSearchResponse;
    if (!response.ok || json.error?.message) {
      return {
        status: response.status,
        ok: false,
        json,
        errorMessage:
          json.error?.message ??
          `Google Ads API request failed with status ${response.status}. The customer ID may not be accessible.`,
      };
    }
    return {
      status: response.status,
      ok: true,
      json,
      errorMessage: null,
    };
  } catch {
    return {
      status: response.status,
      ok: false,
      json: null,
      errorMessage: `Google Ads API returned non-JSON response (status ${response.status}).`,
    };
  }
}

function normalizeCampaignType(channelType: string): string {
  return channelType
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
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
