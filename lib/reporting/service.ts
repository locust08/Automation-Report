import { buildDateRange } from "@/lib/reporting/date";
import {
  getCredentials,
  normalizeGoogleAccountId,
  normalizeMetaAccountId,
  resolveCompanyNameFromAccountId,
} from "@/lib/reporting/env";
import { fetchGoogleAccountName, fetchGoogleCampaignRows } from "@/lib/reporting/google";
import { buildGroups, computeDelta, emptyCampaignRow, mergeCampaignRows } from "@/lib/reporting/metrics";
import { fetchMetaAccountName, fetchMetaCampaignRows } from "@/lib/reporting/meta";
import {
  CampaignComparisonPayload,
  CampaignRow,
  OverallReportPayload,
  Platform,
  SummaryMetric,
  SummarySection,
} from "@/lib/reporting/types";

interface OverallInput {
  accountId: string | null;
  metaAccountId: string | null;
  googleAccountId: string | null;
  startDate: string | null;
  endDate: string | null;
}

interface CampaignInput extends OverallInput {
  campaignType: string;
  platform: Platform;
}

interface ResolvedAccountIds {
  metaAccountIds: string[];
  googleAccountIds: string[];
}

export async function getOverallReport(input: OverallInput): Promise<OverallReportPayload> {
  const credentials = getCredentials();
  const dateRange = buildDateRange(input.startDate, input.endDate);

  const resolvedAccountIds = resolveAccountIds(
    input.accountId,
    input.metaAccountId,
    input.googleAccountId
  );
  const mappedCompanyName = resolveCompanyNameFromAccountId(
    {
      companyName: credentials.companyName,
      companyNameMap: credentials.companyNameMap,
      accountId: input.accountId,
      metaAccountId: resolvedAccountIds.metaAccountIds,
      googleAccountId: resolvedAccountIds.googleAccountIds,
    },
    { fallback: false }
  );
  const [resolvedMetaAccountName, resolvedGoogleAccountName] = await Promise.all([
    tryFetchMetaAccountNames(resolvedAccountIds.metaAccountIds, credentials.metaAccessToken),
    tryFetchGoogleAccountNames(resolvedAccountIds.googleAccountIds, credentials),
  ]);
  const fallbackCompanyName =
    resolveCompanyNameFromAccountId({
      companyName: credentials.companyName,
      companyNameMap: credentials.companyNameMap,
      accountId: input.accountId,
      metaAccountId: resolvedAccountIds.metaAccountIds,
      googleAccountId: resolvedAccountIds.googleAccountIds,
    }) ?? credentials.companyName;
  const preferredLiveCompanyName =
    resolvedAccountIds.googleAccountIds.length > 0 && resolvedAccountIds.metaAccountIds.length === 0
      ? resolvedGoogleAccountName ?? resolvedMetaAccountName
      : resolvedMetaAccountName ?? resolvedGoogleAccountName;
  const companyName = mappedCompanyName ?? preferredLiveCompanyName ?? fallbackCompanyName;

  const warnings: string[] = [];

  const [metaCurrentResult, metaPreviousResult] = await Promise.all([
    tryFetchMetaForAccounts(
      resolvedAccountIds.metaAccountIds,
      credentials.metaAccessToken,
      dateRange.startDate,
      dateRange.endDate
    ),
    tryFetchMetaForAccounts(
      resolvedAccountIds.metaAccountIds,
      credentials.metaAccessToken,
      dateRange.previousStartDate,
      dateRange.previousEndDate
    ),
  ]);

  // Google Ads is called sequentially to avoid burst-rate-limit (429) in shared environments.
  const googleCurrentResult = await tryFetchGoogleForAccounts(
    resolvedAccountIds.googleAccountIds,
    credentials.googleAdsApiVersion,
    credentials.googleDeveloperToken,
    credentials.googleAccessToken,
    credentials.googleRefreshToken,
    credentials.googleClientId,
    credentials.googleClientSecret,
    credentials.googleLoginCustomerId,
    dateRange.startDate,
    dateRange.endDate
  );
  const googlePreviousResult = await tryFetchGoogleForAccounts(
    resolvedAccountIds.googleAccountIds,
    credentials.googleAdsApiVersion,
    credentials.googleDeveloperToken,
    credentials.googleAccessToken,
    credentials.googleRefreshToken,
    credentials.googleClientId,
    credentials.googleClientSecret,
    credentials.googleLoginCustomerId,
    dateRange.previousStartDate,
    dateRange.previousEndDate
  );

  warnings.push(
    ...metaCurrentResult.warnings,
    ...metaPreviousResult.warnings,
    ...googleCurrentResult.warnings,
    ...googlePreviousResult.warnings
  );

  const metaCurrent = metaCurrentResult.rows;
  const metaPrevious = metaPreviousResult.rows;
  const googleCurrent = googleCurrentResult.rows.filter((row) => row.platform === "google");
  const googlePrevious = googlePreviousResult.rows.filter((row) => row.platform === "google");
  const youtubeCurrent = googleCurrentResult.rows.filter((row) => row.platform === "googleYoutube");
  const youtubePrevious = googlePreviousResult.rows.filter((row) => row.platform === "googleYoutube");

  const sections: SummarySection[] = [
    {
      platform: "meta",
      title: "Meta",
      logoPath: "/MetaLogo.png",
      metrics: buildMetaSummary(metaCurrent, metaPrevious),
    },
    {
      platform: "google",
      title: "Google Ads",
      logoPath: "/GoogleLogo.png",
      metrics: buildGoogleSummary(googleCurrent, googlePrevious),
    },
    {
      platform: "googleYoutube",
      title: "Google Ads YouTube Overview",
      logoPath: "/GoogleLogo.png",
      metrics: buildYoutubeSummary(youtubeCurrent, youtubePrevious),
    },
  ];

  const campaignGroups = buildGroups([...metaCurrent, ...googleCurrent, ...youtubeCurrent]);

  if (campaignGroups.length === 0 && warnings.length === 0) {
    warnings.push(
      "No campaign rows were returned for the selected accounts and date range. Verify account IDs and API access permissions."
    );
  }

  return {
    companyName,
    dateRange,
    accountIds: {
      metaAccountId: firstOrNull(resolvedAccountIds.metaAccountIds),
      googleAccountId: firstOrNull(resolvedAccountIds.googleAccountIds),
      metaAccountIds: resolvedAccountIds.metaAccountIds,
      googleAccountIds: resolvedAccountIds.googleAccountIds,
    },
    summaries: sections,
    campaignGroups,
    warnings: dedupeWarnings(warnings),
  };
}

export async function getCampaignComparison(input: CampaignInput): Promise<CampaignComparisonPayload> {
  const credentials = getCredentials();
  const dateRange = buildDateRange(input.startDate, input.endDate);
  const warnings: string[] = [];

  const resolvedAccountIds = resolveAccountIds(
    input.accountId,
    input.metaAccountId,
    input.googleAccountId
  );
  const mappedCompanyName = resolveCompanyNameFromAccountId(
    {
      companyName: credentials.companyName,
      companyNameMap: credentials.companyNameMap,
      accountId: input.accountId,
      metaAccountId: resolvedAccountIds.metaAccountIds,
      googleAccountId: resolvedAccountIds.googleAccountIds,
    },
    { fallback: false }
  );
  const [resolvedMetaAccountName, resolvedGoogleAccountName] = await Promise.all([
    tryFetchMetaAccountNames(resolvedAccountIds.metaAccountIds, credentials.metaAccessToken),
    tryFetchGoogleAccountNames(resolvedAccountIds.googleAccountIds, credentials),
  ]);
  const fallbackCompanyName =
    resolveCompanyNameFromAccountId({
      companyName: credentials.companyName,
      companyNameMap: credentials.companyNameMap,
      accountId: input.accountId,
      metaAccountId: resolvedAccountIds.metaAccountIds,
      googleAccountId: resolvedAccountIds.googleAccountIds,
    }) ?? credentials.companyName;
  const preferredLiveCompanyName =
    input.platform === "meta"
      ? resolvedMetaAccountName ?? resolvedGoogleAccountName
      : resolvedGoogleAccountName ?? resolvedMetaAccountName;
  const companyName = mappedCompanyName ?? preferredLiveCompanyName ?? fallbackCompanyName;

  const selectedRows = await fetchByPlatform({
    platform: input.platform,
    metaAccountIds: resolvedAccountIds.metaAccountIds,
    googleAccountIds: resolvedAccountIds.googleAccountIds,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    credentials,
    warnings,
  });

  const previousRows = await fetchByPlatform({
    platform: input.platform,
    metaAccountIds: resolvedAccountIds.metaAccountIds,
    googleAccountIds: resolvedAccountIds.googleAccountIds,
    startDate: dateRange.previousStartDate,
    endDate: dateRange.previousEndDate,
    credentials,
    warnings,
  });

  const selectedMonthRows = selectedRows.filter(
    (row) => row.campaignType.toLowerCase() === input.campaignType.toLowerCase()
  );
  const previousMonthRows = previousRows.filter(
    (row) => row.campaignType.toLowerCase() === input.campaignType.toLowerCase()
  );

  const selectedTotals = selectedMonthRows.reduce(
    (acc, row) => mergeCampaignRows(acc, row),
    emptyCampaignRow("selected-total", input.platform, input.campaignType, "Grand Total")
  );
  const previousTotals = previousMonthRows.reduce(
    (acc, row) => mergeCampaignRows(acc, row),
    emptyCampaignRow("previous-total", input.platform, input.campaignType, "Grand Total")
  );

  return {
    companyName,
    platform: input.platform,
    campaignType: input.campaignType,
    dateRange,
    selectedMonthRows: selectedMonthRows.sort((a, b) => b.spend - a.spend),
    previousMonthRows: previousMonthRows.sort((a, b) => b.spend - a.spend),
    selectedTotals,
    previousTotals,
    warnings: dedupeWarnings(warnings),
  };
}

async function fetchByPlatform(args: {
  platform: Platform;
  metaAccountIds: string[];
  googleAccountIds: string[];
  startDate: string;
  endDate: string;
  credentials: ReturnType<typeof getCredentials>;
  warnings: string[];
}): Promise<CampaignRow[]> {
  const { platform, metaAccountIds, googleAccountIds, startDate, endDate, credentials, warnings } = args;

  if (platform === "meta") {
    const result = await tryFetchMetaForAccounts(
      metaAccountIds,
      credentials.metaAccessToken,
      startDate,
      endDate
    );
    warnings.push(...result.warnings);
    return result.rows;
  }

  const result = await tryFetchGoogleForAccounts(
    googleAccountIds,
    credentials.googleAdsApiVersion,
    credentials.googleDeveloperToken,
    credentials.googleAccessToken,
    credentials.googleRefreshToken,
    credentials.googleClientId,
    credentials.googleClientSecret,
    credentials.googleLoginCustomerId,
    startDate,
    endDate
  );

  warnings.push(...result.warnings);
  return result.rows.filter((row) => (platform === "googleYoutube" ? row.platform === "googleYoutube" : row.platform === "google"));
}

function buildMetaSummary(currentRows: CampaignRow[], previousRows: CampaignRow[]): SummaryMetric[] {
  const current = aggregateRows(currentRows, "meta");
  const previous = aggregateRows(previousRows, "meta");

  return [
    metric("results", "Results", current.results, previous.results, "number"),
    metric("costPerResult", "Cost/Results", current.costPerResult, previous.costPerResult, "currency"),
    metric("clicks", "Clicks", current.clicks, previous.clicks, "number"),
    metric("ctr", "CTR (%)", current.ctr, previous.ctr, "percent"),
    metric("cpm", "CPM (RM)", current.cpm, previous.cpm, "currency"),
    metric("impressions", "Impression", current.impressions, previous.impressions, "number"),
    metric("spend", "Ads Spent", current.spend, previous.spend, "currency"),
  ];
}

function buildGoogleSummary(currentRows: CampaignRow[], previousRows: CampaignRow[]): SummaryMetric[] {
  const current = aggregateRows(currentRows, "google");
  const previous = aggregateRows(previousRows, "google");

  return [
    metric("conversions", "Conversions", current.conversions, previous.conversions, "number"),
    metric("costPerConv", "Cost/Conv. (RM)", current.costPerResult, previous.costPerResult, "currency"),
    metric("clicks", "Clicks", current.clicks, previous.clicks, "number"),
    metric("avgCpc", "Avg. CPC (RM)", current.avgCpc, previous.avgCpc, "currency"),
    metric("ctr", "CTR", current.ctr, previous.ctr, "percent"),
    metric("impressions", "Impression", current.impressions, previous.impressions, "number"),
    metric("spend", "Ads Spent (RM)", current.spend, previous.spend, "currency"),
  ];
}

function buildYoutubeSummary(currentRows: CampaignRow[], previousRows: CampaignRow[]): SummaryMetric[] {
  const current = aggregateRows(currentRows, "googleYoutube");
  const previous = aggregateRows(previousRows, "googleYoutube");

  return [
    metric(
      "youtubeEarnedShares",
      "Youtube Earned Shares",
      current.youtubeEarnedShares,
      previous.youtubeEarnedShares,
      "number"
    ),
    metric("costPerConv", "Cost/Conv. (RM)", current.costPerResult, previous.costPerResult, "currency"),
    metric("clicks", "Clicks", current.clicks, previous.clicks, "number"),
    metric("avgCpc", "Av. CPC (RM)", current.avgCpc, previous.avgCpc, "currency"),
    metric(
      "youtubeEarnedLikes",
      "Youtube Earned Likes",
      current.youtubeEarnedLikes,
      previous.youtubeEarnedLikes,
      "number"
    ),
    metric("impressions", "Impression", current.impressions, previous.impressions, "number"),
    metric("spend", "Ad Spent (RM)", current.spend, previous.spend, "currency"),
  ];
}

function metric(
  key: string,
  label: string,
  currentValue: number,
  previousValue: number,
  format: SummaryMetric["format"]
): SummaryMetric {
  return {
    key,
    label,
    value: currentValue,
    delta: computeDelta(currentValue, previousValue),
    format,
  };
}

function aggregateRows(rows: CampaignRow[], platform: Platform): CampaignRow {
  return rows.reduce(
    (acc, row) => mergeCampaignRows(acc, row),
    emptyCampaignRow(`${platform}-summary`, platform, "Summary", "Summary")
  );
}

async function tryFetchMeta(
  accountId: string | null,
  accessToken: string | null,
  startDate: string,
  endDate: string
): Promise<{ rows: CampaignRow[]; warnings: string[] }> {
  if (!accountId) {
    return { rows: [], warnings: [] };
  }
  if (!accessToken) {
    return {
      rows: [],
      warnings: [
        "Meta API: Missing META_ACCESS_TOKEN. Add this secret in Vercel Environment Variables or run locally with `doppler run -- npm run dev`.",
      ],
    };
  }

  try {
    const rows = await fetchMetaCampaignRows({
      accountId,
      accessToken,
      startDate,
      endDate,
    });
    return { rows, warnings: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Meta data.";
    const hint = message.includes("(#200)")
      ? " Meta token is valid but missing required ads scopes (`ads_read` or `ads_management`) for this ad account, or the token owner is not assigned to the ad account."
      : "";
    return { rows: [], warnings: [`Meta API: ${message}${hint}`] };
  }
}

async function tryFetchGoogle(
  customerId: string | null,
  apiVersion: string,
  developerToken: string | null,
  accessToken: string | null,
  refreshToken: string | null,
  clientId: string | null,
  clientSecret: string | null,
  loginCustomerId: string | null,
  startDate: string,
  endDate: string
): Promise<{ rows: CampaignRow[]; warnings: string[] }> {
  if (!customerId) {
    return { rows: [], warnings: [] };
  }
  if (!developerToken) {
    return {
      rows: [],
      warnings: [
        "Google Ads API: Missing GOOGLE_ADS_DEVELOPER_TOKEN. Add this secret in Vercel Environment Variables or run locally with `doppler run -- npm run dev`.",
      ],
    };
  }
  if (!hasGoogleOAuthCredentials(accessToken, refreshToken, clientId, clientSecret)) {
    return {
      rows: [],
      warnings: [
        "Google Ads API: Missing OAuth credentials. Provide GOOGLE_ADS_ACCESS_TOKEN (or GOOGLE_OAUTH_ACCESS_TOKEN), or GOOGLE_ADS_REFRESH_TOKEN + GOOGLE_ADS_CLIENT_ID + GOOGLE_ADS_CLIENT_SECRET.",
      ],
    };
  }

  try {
    const rows = await fetchGoogleCampaignRows({
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
    });
    return { rows, warnings: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Google Ads data.";
    const hint = message.includes("non-JSON response")
      ? " This usually means the token/proxy returned an HTML page instead of Google Ads API JSON (wrong OAuth scope, expired/invalid token, or network proxy page)."
      : /status 400/i.test(message)
        ? " Verify Google Ads customer ID access and, for manager accounts, set GOOGLE_ADS_LOGIN_CUSTOMER_ID."
      : /429|resource_exhausted|rate.?limit/i.test(message)
        ? " Google Ads rate limit was hit. Automatic retries were attempted. Please wait a moment and retry."
        : "";
    return { rows: [], warnings: [`Google Ads API: ${message}${hint}`] };
  }
}

async function tryFetchMetaForAccounts(
  accountIds: string[],
  accessToken: string | null,
  startDate: string,
  endDate: string
): Promise<{ rows: CampaignRow[]; warnings: string[] }> {
  if (accountIds.length === 0) {
    return { rows: [], warnings: [] };
  }

  const rows: CampaignRow[] = [];
  const warnings: string[] = [];

  for (const accountId of accountIds) {
    const result = await tryFetchMeta(accountId, accessToken, startDate, endDate);
    rows.push(...result.rows);
    warnings.push(
      ...result.warnings.map((warning) => annotateWarningWithAccount(warning, "meta", accountId))
    );
  }

  return { rows, warnings };
}

async function tryFetchGoogleForAccounts(
  accountIds: string[],
  apiVersion: string,
  developerToken: string | null,
  accessToken: string | null,
  refreshToken: string | null,
  clientId: string | null,
  clientSecret: string | null,
  loginCustomerId: string | null,
  startDate: string,
  endDate: string
): Promise<{ rows: CampaignRow[]; warnings: string[] }> {
  if (accountIds.length === 0) {
    return { rows: [], warnings: [] };
  }

  const rows: CampaignRow[] = [];
  const warnings: string[] = [];

  for (const accountId of accountIds) {
    const result = await tryFetchGoogle(
      accountId,
      apiVersion,
      developerToken,
      accessToken,
      refreshToken,
      clientId,
      clientSecret,
      loginCustomerId,
      startDate,
      endDate
    );
    rows.push(...result.rows);
    warnings.push(
      ...result.warnings.map((warning) => annotateWarningWithAccount(warning, "google", accountId))
    );
  }

  return { rows, warnings };
}

function resolveAccountIds(
  accountId: string | null,
  metaAccountId: string | null,
  googleAccountId: string | null
): ResolvedAccountIds {
  const metaOverrides = normalizeAccountIdList(metaAccountId, normalizeMetaAccountId);
  const googleOverrides = normalizeAccountIdList(googleAccountId, normalizeGoogleAccountId);
  const hasMetaOverride = metaOverrides.length > 0;
  const hasGoogleOverride = googleOverrides.length > 0;

  const metaAccountIds = [...metaOverrides];
  const googleAccountIds = [...googleOverrides];

  for (const token of splitAccountIdList(accountId)) {
    const classified = classifyAccountToken(token);

    if (!hasMetaOverride && classified.kind !== "google") {
      pushNormalizedUnique(metaAccountIds, classified.value, normalizeMetaAccountId);
    }

    if (!hasGoogleOverride && classified.kind !== "meta") {
      pushNormalizedUnique(googleAccountIds, classified.value, normalizeGoogleAccountId);
    }
  }

  return { metaAccountIds, googleAccountIds };
}

function splitAccountIdList(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/[\s,;|]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function classifyAccountToken(
  value: string
): { kind: "meta" | "google" | "ambiguous"; value: string } {
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  const digitsOnly = trimmed.replace(/\D/g, "");

  if (normalized.startsWith("meta:") || normalized.startsWith("m:")) {
    return { kind: "meta", value: trimmed.split(":").slice(1).join(":") };
  }

  if (normalized.startsWith("google:") || normalized.startsWith("g:")) {
    return { kind: "google", value: trimmed.split(":").slice(1).join(":") };
  }

  if (normalized.startsWith("act_")) {
    return { kind: "meta", value: trimmed };
  }

  // `123-456-7890` is a Google Ads customer-id format.
  if (/^\d{3}-\d{3}-\d{4}$/.test(trimmed)) {
    return { kind: "google", value: trimmed };
  }

  if (/^\d+$/.test(trimmed)) {
    if (digitsOnly.length === 10) {
      return { kind: "google", value: trimmed };
    }
    if (digitsOnly.length >= 12) {
      return { kind: "meta", value: trimmed };
    }
  }

  return { kind: "ambiguous", value: trimmed };
}

function normalizeAccountIdList(
  value: string | null,
  normalizer: (value: string) => string
): string[] {
  const resolved: string[] = [];
  splitAccountIdList(value).forEach((item) => pushNormalizedUnique(resolved, item, normalizer));
  return resolved;
}

function pushNormalizedUnique(
  target: string[],
  value: string,
  normalizer: (value: string) => string
) {
  const normalized = normalizer(value);
  if (!normalized || target.includes(normalized)) {
    return;
  }
  target.push(normalized);
}

function firstOrNull(values: string[]): string | null {
  return values.length > 0 ? values[0] : null;
}

async function tryFetchMetaAccountNames(
  metaAccountIds: string[],
  accessToken: string | null
): Promise<string | null> {
  for (const metaAccountId of metaAccountIds) {
    const accountName = await tryFetchMetaAccountName(metaAccountId, accessToken);
    if (accountName) {
      return accountName;
    }
  }
  return null;
}

async function tryFetchGoogleAccountNames(
  googleAccountIds: string[],
  credentials: ReturnType<typeof getCredentials>
): Promise<string | null> {
  for (const googleAccountId of googleAccountIds) {
    const accountName = await tryFetchGoogleAccountName(googleAccountId, credentials);
    if (accountName) {
      return accountName;
    }
  }
  return null;
}

function annotateWarningWithAccount(
  warning: string,
  platform: "meta" | "google",
  accountId: string
): string {
  if (
    (platform === "meta" && warning.startsWith("Meta API: Missing META_ACCESS_TOKEN")) ||
    (platform === "google" &&
      (warning.startsWith("Google Ads API: Missing GOOGLE_ADS_DEVELOPER_TOKEN") ||
        warning.startsWith("Google Ads API: Missing OAuth credentials")))
  ) {
    return warning;
  }

  const prefix = platform === "meta" ? "Meta" : "Google";
  return `${prefix} account ${accountId}: ${warning}`;
}

async function tryFetchMetaAccountName(
  metaAccountId: string | null,
  accessToken: string | null
): Promise<string | null> {
  if (!metaAccountId || !accessToken) {
    return null;
  }

  try {
    return await fetchMetaAccountName({ accountId: metaAccountId, accessToken });
  } catch {
    return null;
  }
}

async function tryFetchGoogleAccountName(
  googleAccountId: string | null,
  credentials: ReturnType<typeof getCredentials>
): Promise<string | null> {
  if (!googleAccountId || !credentials.googleDeveloperToken) {
    return null;
  }

  if (
    !hasGoogleOAuthCredentials(
      credentials.googleAccessToken,
      credentials.googleRefreshToken,
      credentials.googleClientId,
      credentials.googleClientSecret
    )
  ) {
    return null;
  }

  try {
    return await fetchGoogleAccountName({
      customerId: googleAccountId,
      apiVersion: credentials.googleAdsApiVersion,
      developerToken: credentials.googleDeveloperToken,
      accessToken: credentials.googleAccessToken,
      refreshToken: credentials.googleRefreshToken,
      clientId: credentials.googleClientId,
      clientSecret: credentials.googleClientSecret,
      loginCustomerId: credentials.googleLoginCustomerId,
    });
  } catch {
    return null;
  }
}

function dedupeWarnings(warnings: string[]): string[] {
  return Array.from(
    new Set(warnings.map((warning) => warning.trim()).filter((warning) => warning.length > 0))
  );
}

function hasGoogleOAuthCredentials(
  accessToken: string | null,
  refreshToken: string | null,
  clientId: string | null,
  clientSecret: string | null
): boolean {
  if (accessToken) {
    return true;
  }

  return Boolean(refreshToken && clientId && clientSecret);
}
