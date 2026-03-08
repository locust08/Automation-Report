import { emptyCampaignRow } from "@/lib/reporting/metrics";
import { CampaignRow } from "@/lib/reporting/types";

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
  };
  metrics?: {
    impressions?: string;
    clicks?: string;
    ctr?: number;
    averageCpc?: string;
    conversions?: string;
    costMicros?: string;
    engagements?: string;
    interactions?: string;
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

  const endpoint = `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/googleAds:search`;
  const body = {
    query: "SELECT customer.descriptive_name FROM customer LIMIT 1",
  };

  const firstAttempt = await requestGoogleAdsSearch(
    endpoint,
    body,
    developerToken,
    activeAccessToken,
    loginCustomerId
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
      loginCustomerId
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
  const body = {
    query: `
      SELECT
        campaign.id,
        campaign.name,
        campaign.advertising_channel_type,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.average_cpc,
        metrics.conversions,
        metrics.cost_micros,
        metrics.engagements,
        metrics.interactions
      FROM campaign
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    `,
  };

  const endpoint = `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/googleAds:searchStream`;
  const canRefresh = Boolean(refreshToken && clientId && clientSecret);
  let activeAccessToken = accessToken;

  // Prefer a fresh OAuth token when refresh credentials are available.
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

  const streamBatches = await executeGoogleAdsStreamRequest({
    endpoint,
    body,
    developerToken,
    accessToken: activeAccessToken,
    loginCustomerId,
    canRefresh,
    refreshToken,
    clientId,
    clientSecret,
  });

  const rows: CampaignRow[] = [];
  streamBatches.forEach((batch) => {
    (batch.results ?? []).forEach((result) => {
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

      rows.push(row);
    });
  });

  return rows;
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

function normalizeCtr(ctr: number | undefined, impressions: number, clicks: number): number {
  if (typeof ctr === "number" && Number.isFinite(ctr)) {
    return ctr <= 1 ? ctr * 100 : ctr;
  }
  return impressions > 0 ? (clicks * 100) / impressions : 0;
}

function microsToCurrency(value: string | undefined): number {
  const micros = toNumber(value);
  return micros / 1_000_000;
}

function toNumber(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
