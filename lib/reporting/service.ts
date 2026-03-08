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

export async function getOverallReport(input: OverallInput): Promise<OverallReportPayload> {
  const credentials = getCredentials();
  const dateRange = buildDateRange(input.startDate, input.endDate);

  const resolvedMetaId = resolveMetaAccountId(input.accountId, input.metaAccountId);
  const resolvedGoogleId = resolveGoogleAccountId(input.accountId, input.googleAccountId);
  const mappedCompanyName = resolveCompanyNameFromAccountId(
    {
      companyName: credentials.companyName,
      companyNameMap: credentials.companyNameMap,
      accountId: input.accountId,
      metaAccountId: resolvedMetaId,
      googleAccountId: resolvedGoogleId,
    },
    { fallback: false }
  );
  const [resolvedMetaAccountName, resolvedGoogleAccountName] = await Promise.all([
    tryFetchMetaAccountName(resolvedMetaId, credentials.metaAccessToken),
    tryFetchGoogleAccountName(resolvedGoogleId, credentials),
  ]);
  const fallbackCompanyName =
    resolveCompanyNameFromAccountId({
      companyName: credentials.companyName,
      companyNameMap: credentials.companyNameMap,
      accountId: input.accountId,
      metaAccountId: resolvedMetaId,
      googleAccountId: resolvedGoogleId,
    }) ?? credentials.companyName;
  const preferredLiveCompanyName =
    resolvedGoogleId && !resolvedMetaId
      ? resolvedGoogleAccountName ?? resolvedMetaAccountName
      : resolvedMetaAccountName ?? resolvedGoogleAccountName;
  const companyName = mappedCompanyName ?? preferredLiveCompanyName ?? fallbackCompanyName;

  const warnings: string[] = [];

  const [metaCurrentResult, metaPreviousResult] = await Promise.all([
    tryFetchMeta(resolvedMetaId, credentials.metaAccessToken, dateRange.startDate, dateRange.endDate),
    tryFetchMeta(
      resolvedMetaId,
      credentials.metaAccessToken,
      dateRange.previousStartDate,
      dateRange.previousEndDate
    ),
  ]);

  // Google Ads is called sequentially to avoid burst-rate-limit (429) in shared environments.
  const googleCurrentResult = await tryFetchGoogle(
    resolvedGoogleId,
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
  const googlePreviousResult = await tryFetchGoogle(
    resolvedGoogleId,
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
      metaAccountId: resolvedMetaId,
      googleAccountId: resolvedGoogleId,
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

  const resolvedMetaId = resolveMetaAccountId(input.accountId, input.metaAccountId);
  const resolvedGoogleId = resolveGoogleAccountId(input.accountId, input.googleAccountId);
  const mappedCompanyName = resolveCompanyNameFromAccountId(
    {
      companyName: credentials.companyName,
      companyNameMap: credentials.companyNameMap,
      accountId: input.accountId,
      metaAccountId: resolvedMetaId,
      googleAccountId: resolvedGoogleId,
    },
    { fallback: false }
  );
  const [resolvedMetaAccountName, resolvedGoogleAccountName] = await Promise.all([
    tryFetchMetaAccountName(resolvedMetaId, credentials.metaAccessToken),
    tryFetchGoogleAccountName(resolvedGoogleId, credentials),
  ]);
  const fallbackCompanyName =
    resolveCompanyNameFromAccountId({
      companyName: credentials.companyName,
      companyNameMap: credentials.companyNameMap,
      accountId: input.accountId,
      metaAccountId: resolvedMetaId,
      googleAccountId: resolvedGoogleId,
    }) ?? credentials.companyName;
  const preferredLiveCompanyName =
    input.platform === "meta"
      ? resolvedMetaAccountName ?? resolvedGoogleAccountName
      : resolvedGoogleAccountName ?? resolvedMetaAccountName;
  const companyName = mappedCompanyName ?? preferredLiveCompanyName ?? fallbackCompanyName;

  const selectedRows = await fetchByPlatform({
    platform: input.platform,
    metaAccountId: resolvedMetaId,
    googleAccountId: resolvedGoogleId,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    credentials,
    warnings,
  });

  const previousRows = await fetchByPlatform({
    platform: input.platform,
    metaAccountId: resolvedMetaId,
    googleAccountId: resolvedGoogleId,
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
  metaAccountId: string | null;
  googleAccountId: string | null;
  startDate: string;
  endDate: string;
  credentials: ReturnType<typeof getCredentials>;
  warnings: string[];
}): Promise<CampaignRow[]> {
  const { platform, metaAccountId, googleAccountId, startDate, endDate, credentials, warnings } = args;

  if (platform === "meta") {
    const result = await tryFetchMeta(metaAccountId, credentials.metaAccessToken, startDate, endDate);
    warnings.push(...result.warnings);
    return result.rows;
  }

  const result = await tryFetchGoogle(
    googleAccountId,
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
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<{ rows: CampaignRow[]; warnings: string[] }> {
  if (!accountId) {
    return { rows: [], warnings: [] };
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
  developerToken: string,
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

function resolveMetaAccountId(accountId: string | null, metaAccountId: string | null): string | null {
  if (metaAccountId) {
    return normalizeMetaAccountId(metaAccountId);
  }

  if (!accountId) {
    return null;
  }

  // `123-456-7890` is a Google Ads customer-id format; avoid sending it to Meta by default.
  if (/^\d{3}-\d{3}-\d{4}$/.test(accountId.trim())) {
    return null;
  }

  return normalizeMetaAccountId(accountId);
}

function resolveGoogleAccountId(
  accountId: string | null,
  googleAccountId: string | null
): string | null {
  const rawValue = googleAccountId || accountId;
  return rawValue ? normalizeGoogleAccountId(rawValue) : null;
}

async function tryFetchMetaAccountName(
  metaAccountId: string | null,
  accessToken: string
): Promise<string | null> {
  if (!metaAccountId) {
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
  if (!googleAccountId) {
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
