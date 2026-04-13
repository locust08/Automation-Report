import { buildDateRange } from "@/lib/reporting/date";
import {
  getCredentials,
  normalizeGoogleAccountId,
  normalizeMetaAccountId,
  resolveCompanyNameFromAccountId,
} from "@/lib/reporting/env";
import { buildPlatformInsights } from "@/lib/reporting/insights";
import {
  fetchGoogleAccountName,
  fetchGoogleAuctionInsightRows,
  fetchGoogleCampaignRows,
  fetchGoogleTopKeywordRows,
} from "@/lib/reporting/google";
import { buildGroups, computeDelta, emptyCampaignRow, mergeCampaignRows } from "@/lib/reporting/metrics";
import {
  fetchMetaAccountName,
  fetchMetaActiveCampaignIds,
  fetchMetaCampaignRows,
} from "@/lib/reporting/meta";
import {
  AuctionInsightRow,
  AuctionInsightsPayload,
  CampaignComparisonPayload,
  CampaignRow,
  InsightsPayload,
  OverallReportPayload,
  Platform,
  SummaryMetric,
  SummarySection,
  TopKeywordRow,
  TopKeywordsPayload,
} from "@/lib/reporting/types";
import { resolveGoogleAccountsFromNotion } from "@/lib/reporting/notion";

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

type GoogleLoginCustomerIdMap = Record<string, string | null>;

const MANUAL_AUCTION_INSIGHT_ROWS_BY_ACCOUNT: Record<string, AuctionInsightRow[]> = {
  "6261186490": [
    {
      id: "manual-6261186490-tenby.edu.my",
      displayDomain: "tenby.edu.my",
      impressionShare: 13.04,
      overlapRate: 20.03,
      positionAboveRate: 70.52,
      topOfPageRate: 81.59,
      absoluteTopOfPageRate: 43.43,
      outrankingShare: 8.8,
      observations: 1,
    },
    {
      id: "manual-6261186490-you",
      displayDomain: "You",
      impressionShare: 10.25,
      overlapRate: 0,
      overlapRateLabel: "-",
      positionAboveRate: 0,
      positionAboveRateLabel: "-",
      topOfPageRate: 74.92,
      absoluteTopOfPageRate: 26.31,
      outrankingShare: 0,
      outrankingShareLabel: "-",
      observations: 1,
    },
    {
      id: "manual-6261186490-aism.edu.my",
      displayDomain: "aism.edu.my",
      impressionShare: 9.99,
      impressionShareLabel: "< 10%",
      overlapRate: 10.86,
      positionAboveRate: 44.11,
      topOfPageRate: 71.36,
      absoluteTopOfPageRate: 26.66,
      outrankingShare: 9.76,
      observations: 1,
    },
    {
      id: "manual-6261186490-apschools.edu.my",
      displayDomain: "apschools.edu.my",
      impressionShare: 9.99,
      impressionShareLabel: "< 10%",
      overlapRate: 6.82,
      positionAboveRate: 80.16,
      topOfPageRate: 79.43,
      absoluteTopOfPageRate: 54.1,
      outrankingShare: 9.69,
      observations: 1,
    },
    {
      id: "manual-6261186490-nordangliaeducation.com",
      displayDomain: "nordangliaeducation.com",
      impressionShare: 9.99,
      impressionShareLabel: "< 10%",
      overlapRate: 13.02,
      positionAboveRate: 82.63,
      topOfPageRate: 84.97,
      absoluteTopOfPageRate: 55.53,
      outrankingShare: 9.14,
      observations: 1,
    },
  ],
};

export async function getOverallReport(input: OverallInput): Promise<OverallReportPayload> {
  const credentials = getCredentials();
  const dateRange = buildDateRange(input.startDate, input.endDate);

  const { resolvedAccountIds, googleManagerContext } = await resolveReportAccountContext(
    input,
    credentials
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
    tryFetchGoogleAccountNames(
      resolvedAccountIds.googleAccountIds,
      credentials,
      googleManagerContext.loginCustomerIdByAccount
    ),
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

  const warnings: string[] = [...googleManagerContext.messages];

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
    googleManagerContext.loginCustomerIdByAccount,
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
    googleManagerContext.loginCustomerIdByAccount,
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

  const { resolvedAccountIds, googleManagerContext } = await resolveReportAccountContext(
    input,
    credentials
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
  warnings.push(...googleManagerContext.messages);
  const [resolvedMetaAccountName, resolvedGoogleAccountName] = await Promise.all([
    tryFetchMetaAccountNames(resolvedAccountIds.metaAccountIds, credentials.metaAccessToken),
    tryFetchGoogleAccountNames(
      resolvedAccountIds.googleAccountIds,
      credentials,
      googleManagerContext.loginCustomerIdByAccount
    ),
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
    googleLoginCustomerIdByAccount: googleManagerContext.loginCustomerIdByAccount,
    warnings,
  });

  const previousRows = await fetchByPlatform({
    platform: input.platform,
    metaAccountIds: resolvedAccountIds.metaAccountIds,
    googleAccountIds: resolvedAccountIds.googleAccountIds,
    startDate: dateRange.previousStartDate,
    endDate: dateRange.previousEndDate,
    credentials,
    googleLoginCustomerIdByAccount: googleManagerContext.loginCustomerIdByAccount,
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

export async function getTopKeywordsReport(input: OverallInput): Promise<TopKeywordsPayload> {
  const credentials = getCredentials();
  const dateRange = buildDateRange(input.startDate, input.endDate);
  const { resolvedAccountIds, googleManagerContext } = await resolveReportAccountContext(
    input,
    credentials
  );
  const companyName = await resolveCompanyNameForReport({
    credentials,
    accountId: input.accountId,
    resolvedAccountIds,
    googleLoginCustomerIdByAccount: googleManagerContext.loginCustomerIdByAccount,
  });

  const keywordResult = await tryFetchGoogleKeywordsForAccounts(
    resolvedAccountIds.googleAccountIds,
    credentials.googleAdsApiVersion,
    credentials.googleDeveloperToken,
    credentials.googleAccessToken,
    credentials.googleRefreshToken,
    credentials.googleClientId,
    credentials.googleClientSecret,
    googleManagerContext.loginCustomerIdByAccount,
    dateRange.startDate,
    dateRange.endDate
  );

  const rows = keywordResult.rows.slice(0, 10);
  const totals = buildTopKeywordTotals(rows);
  const warnings = [...googleManagerContext.messages, ...keywordResult.warnings];

  if (rows.length === 0 && warnings.length === 0) {
    warnings.push(
      "No keyword rows were returned for the selected Google Ads account IDs and date range."
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
    rows,
    totals,
    warnings: dedupeWarnings(warnings),
  };
}

export async function getAuctionInsightsReport(input: OverallInput): Promise<AuctionInsightsPayload> {
  const credentials = getCredentials();
  const dateRange = buildDateRange(input.startDate, input.endDate);
  const { resolvedAccountIds, googleManagerContext } = await resolveReportAccountContext(
    input,
    credentials
  );
  const companyName = await resolveCompanyNameForReport({
    credentials,
    accountId: input.accountId,
    resolvedAccountIds,
    googleLoginCustomerIdByAccount: googleManagerContext.loginCustomerIdByAccount,
  });

  const auctionResult = await tryFetchGoogleAuctionInsightsForAccounts(
    resolvedAccountIds.googleAccountIds,
    credentials.googleAdsApiVersion,
    credentials.googleDeveloperToken,
    credentials.googleAccessToken,
    credentials.googleRefreshToken,
    credentials.googleClientId,
    credentials.googleClientSecret,
    googleManagerContext.loginCustomerIdByAccount,
    dateRange.startDate,
    dateRange.endDate
  );

  const manualRows = getManualAuctionInsightRowsForAccounts(resolvedAccountIds.googleAccountIds);
  const rows = (auctionResult.rows.length > 0 ? auctionResult.rows : manualRows).slice(0, 20);
  const averages = buildAuctionInsightAverages(rows);
  const warnings =
    rows.length > 0 && auctionResult.rows.length === 0 && manualRows.length > 0
      ? [
          ...googleManagerContext.messages,
          "Showing manually keyed auction insights snapshot for Google account 626-118-6490 based on the provided source image.",
        ]
      : [...googleManagerContext.messages, ...auctionResult.warnings];

  if (rows.length === 0 && warnings.length === 0) {
    warnings.push(
      "No auction insight rows were returned for the selected Google Ads account IDs and date range."
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
    rows,
    averages,
    warnings: dedupeWarnings(warnings),
  };
}

export async function getInsightsReport(input: OverallInput): Promise<InsightsPayload> {
  const credentials = getCredentials();
  const dateRange = buildDateRange(input.startDate, input.endDate);
  const { resolvedAccountIds, googleManagerContext } = await resolveReportAccountContext(
    input,
    credentials
  );
  const companyName = await resolveCompanyNameForReport({
    credentials,
    accountId: input.accountId,
    resolvedAccountIds,
    googleLoginCustomerIdByAccount: googleManagerContext.loginCustomerIdByAccount,
  });

  const warnings: string[] = [...googleManagerContext.messages];

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

  const googleCurrentResult = await tryFetchGoogleForAccounts(
    resolvedAccountIds.googleAccountIds,
    credentials.googleAdsApiVersion,
    credentials.googleDeveloperToken,
    credentials.googleAccessToken,
    credentials.googleRefreshToken,
    credentials.googleClientId,
    credentials.googleClientSecret,
    googleManagerContext.loginCustomerIdByAccount,
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
    googleManagerContext.loginCustomerIdByAccount,
    dateRange.previousStartDate,
    dateRange.previousEndDate
  );

  warnings.push(
    ...metaCurrentResult.warnings,
    ...metaPreviousResult.warnings,
    ...googleCurrentResult.warnings,
    ...googlePreviousResult.warnings
  );

  const metaCurrentRows = metaCurrentResult.rows.filter((row) => row.platform === "meta");
  const metaPreviousRows = metaPreviousResult.rows.filter((row) => row.platform === "meta");
  const googleCurrentRows = googleCurrentResult.rows.filter((row) => row.platform === "google");
  const googlePreviousRows = googlePreviousResult.rows.filter((row) => row.platform === "google");

  const sections = [
    buildPlatformInsights({
      platform: "meta",
      currentRows: metaCurrentRows,
      previousRows: metaPreviousRows,
      dateRange,
    }),
    buildPlatformInsights({
      platform: "google",
      currentRows: googleCurrentRows,
      previousRows: googlePreviousRows,
      dateRange,
    }),
  ];

  if (sections.every((section) => section.rows.length === 0) && warnings.length === 0) {
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
    sections,
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
  googleLoginCustomerIdByAccount: GoogleLoginCustomerIdMap;
  warnings: string[];
}): Promise<CampaignRow[]> {
  const {
    platform,
    metaAccountIds,
    googleAccountIds,
    startDate,
    endDate,
    credentials,
    googleLoginCustomerIdByAccount,
    warnings,
  } = args;

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
    googleLoginCustomerIdByAccount,
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
    const activeCampaignIds = await fetchMetaActiveCampaignIds({
      accountId,
      accessToken,
    });
    const rows = await fetchMetaCampaignRows({
      accountId,
      accessToken,
      startDate,
      endDate,
      activeCampaignIds,
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
    return { rows: [], warnings: [`Google Ads API: ${message}${googleErrorHint(message)}`] };
  }
}

async function tryFetchGoogleKeywords(
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
): Promise<{ rows: TopKeywordRow[]; warnings: string[] }> {
  if (!customerId) {
    return { rows: [], warnings: [] };
  }

  const credentialWarnings = getGoogleCredentialWarnings(
    developerToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret
  );
  if (credentialWarnings.length > 0) {
    return { rows: [], warnings: credentialWarnings };
  }

  try {
    const rows = await fetchGoogleTopKeywordRows({
      customerId,
      apiVersion,
      developerToken: developerToken!,
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
    const message = error instanceof Error ? error.message : "Failed to load Google Ads keyword data.";
    return { rows: [], warnings: [`Google Ads API: ${message}${googleErrorHint(message)}`] };
  }
}

async function tryFetchGoogleAuctionInsights(
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
): Promise<{ rows: AuctionInsightRow[]; warnings: string[] }> {
  if (!customerId) {
    return { rows: [], warnings: [] };
  }

  const credentialWarnings = getGoogleCredentialWarnings(
    developerToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret
  );
  if (credentialWarnings.length > 0) {
    return { rows: [], warnings: credentialWarnings };
  }

  try {
    const rows = await fetchGoogleAuctionInsightRows({
      customerId,
      apiVersion,
      developerToken: developerToken!,
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
    const message =
      error instanceof Error ? error.message : "Failed to load Google Ads auction insight data.";
    return { rows: [], warnings: [`Google Ads API: ${message}${googleErrorHint(message)}`] };
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
  loginCustomerIdByAccount: GoogleLoginCustomerIdMap,
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
      loginCustomerIdByAccount[accountId] ?? null,
      startDate,
      endDate
    );
    rows.push(...result.rows);
    const accountWarnings = result.warnings.map((warning) =>
      annotateWarningWithAccount(warning, "google", accountId)
    );
    logGoogleWarningsForTerminal(accountWarnings);
    warnings.push(...accountWarnings);
  }

  return { rows, warnings };
}

async function tryFetchGoogleKeywordsForAccounts(
  accountIds: string[],
  apiVersion: string,
  developerToken: string | null,
  accessToken: string | null,
  refreshToken: string | null,
  clientId: string | null,
  clientSecret: string | null,
  loginCustomerIdByAccount: GoogleLoginCustomerIdMap,
  startDate: string,
  endDate: string
): Promise<{ rows: TopKeywordRow[]; warnings: string[] }> {
  if (accountIds.length === 0) {
    return { rows: [], warnings: [] };
  }

  const rows: TopKeywordRow[] = [];
  const warnings: string[] = [];

  for (const accountId of accountIds) {
    const result = await tryFetchGoogleKeywords(
      accountId,
      apiVersion,
      developerToken,
      accessToken,
      refreshToken,
      clientId,
      clientSecret,
      loginCustomerIdByAccount[accountId] ?? null,
      startDate,
      endDate
    );

    rows.push(...result.rows);
    const accountWarnings = result.warnings.map((warning) =>
      annotateWarningWithAccount(warning, "google", accountId)
    );
    logGoogleWarningsForTerminal(accountWarnings);
    warnings.push(...accountWarnings);
  }

  const mergedRows = mergeTopKeywordRows(rows);
  return { rows: mergedRows, warnings };
}

async function tryFetchGoogleAuctionInsightsForAccounts(
  accountIds: string[],
  apiVersion: string,
  developerToken: string | null,
  accessToken: string | null,
  refreshToken: string | null,
  clientId: string | null,
  clientSecret: string | null,
  loginCustomerIdByAccount: GoogleLoginCustomerIdMap,
  startDate: string,
  endDate: string
): Promise<{ rows: AuctionInsightRow[]; warnings: string[] }> {
  if (accountIds.length === 0) {
    return { rows: [], warnings: [] };
  }

  const rows: AuctionInsightRow[] = [];
  const warnings: string[] = [];

  for (const accountId of accountIds) {
    const result = await tryFetchGoogleAuctionInsights(
      accountId,
      apiVersion,
      developerToken,
      accessToken,
      refreshToken,
      clientId,
      clientSecret,
      loginCustomerIdByAccount[accountId] ?? null,
      startDate,
      endDate
    );

    rows.push(...result.rows);
    const accountWarnings = result.warnings.map((warning) =>
      annotateWarningWithAccount(warning, "google", accountId)
    );
    logGoogleWarningsForTerminal(accountWarnings);
    warnings.push(...accountWarnings);
  }

  const mergedRows = mergeAuctionInsightRows(rows);
  return { rows: mergedRows, warnings };
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

async function resolveReportAccountContext(
  input: Pick<OverallInput, "accountId" | "metaAccountId" | "googleAccountId">,
  credentials: ReturnType<typeof getCredentials>
): Promise<{
  resolvedAccountIds: ResolvedAccountIds;
  googleManagerContext: {
    googleAccountIds: string[];
    loginCustomerIdByAccount: GoogleLoginCustomerIdMap;
    messages: string[];
  };
}> {
  const resolvedAccountIds = resolveAccountIds(
    input.accountId,
    input.metaAccountId,
    input.googleAccountId
  );
  const googleAccountContext = await resolveGoogleManagerContext(input, resolvedAccountIds, credentials);

  return {
    resolvedAccountIds: {
      ...resolvedAccountIds,
      googleAccountIds: googleAccountContext.googleAccountIds,
    },
    googleManagerContext: googleAccountContext,
  };
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
  credentials: ReturnType<typeof getCredentials>,
  googleLoginCustomerIdByAccount: GoogleLoginCustomerIdMap
): Promise<string | null> {
  for (const googleAccountId of googleAccountIds) {
    const accountName = await tryFetchGoogleAccountName(
      googleAccountId,
      credentials,
      resolveLoginCustomerIdForAccount(googleAccountId, googleLoginCustomerIdByAccount)
    );
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
  credentials: ReturnType<typeof getCredentials>,
  loginCustomerId: string | null
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
      loginCustomerId,
    });
  } catch {
    return null;
  }
}

async function resolveCompanyNameForReport(input: {
  credentials: ReturnType<typeof getCredentials>;
  accountId: string | null;
  resolvedAccountIds: ResolvedAccountIds;
  googleLoginCustomerIdByAccount: GoogleLoginCustomerIdMap;
}): Promise<string> {
  const { credentials, accountId, resolvedAccountIds, googleLoginCustomerIdByAccount } = input;

  const mappedCompanyName = resolveCompanyNameFromAccountId(
    {
      companyName: credentials.companyName,
      companyNameMap: credentials.companyNameMap,
      accountId,
      metaAccountId: resolvedAccountIds.metaAccountIds,
      googleAccountId: resolvedAccountIds.googleAccountIds,
    },
    { fallback: false }
  );

  const [resolvedMetaAccountName, resolvedGoogleAccountName] = await Promise.all([
    tryFetchMetaAccountNames(resolvedAccountIds.metaAccountIds, credentials.metaAccessToken),
    tryFetchGoogleAccountNames(
      resolvedAccountIds.googleAccountIds,
      credentials,
      googleLoginCustomerIdByAccount
    ),
  ]);

  const fallbackCompanyName =
    resolveCompanyNameFromAccountId({
      companyName: credentials.companyName,
      companyNameMap: credentials.companyNameMap,
      accountId,
      metaAccountId: resolvedAccountIds.metaAccountIds,
      googleAccountId: resolvedAccountIds.googleAccountIds,
    }) ?? credentials.companyName;

  const preferredLiveCompanyName =
    resolvedAccountIds.googleAccountIds.length > 0 && resolvedAccountIds.metaAccountIds.length === 0
      ? resolvedGoogleAccountName ?? resolvedMetaAccountName
      : resolvedMetaAccountName ?? resolvedGoogleAccountName;

  return mappedCompanyName ?? preferredLiveCompanyName ?? fallbackCompanyName;
}

async function resolveGoogleManagerContext(
  input: Pick<OverallInput, "accountId" | "googleAccountId">,
  resolvedAccountIds: ResolvedAccountIds,
  credentials: ReturnType<typeof getCredentials>
): Promise<{
  googleAccountIds: string[];
  loginCustomerIdByAccount: GoogleLoginCustomerIdMap;
  messages: string[];
}> {
    return resolveGoogleAccountsFromNotion({
      googleAccountIds: resolvedAccountIds.googleAccountIds,
      googleLookupTerms: collectGoogleLookupTerms(input.accountId, input.googleAccountId),
      notionAccessToken: credentials.notionAccessToken,
      notionDatabaseId: credentials.notionDatabaseId,
    });
  }

function collectGoogleLookupTerms(
  accountId: string | null,
  googleAccountId: string | null
): string[] {
  const lookupTerms: string[] = [];

  splitAccountIdList(googleAccountId).forEach((token) => pushUniqueValue(lookupTerms, token));

  splitAccountIdList(accountId).forEach((token) => {
    const classified = classifyAccountToken(token);
    if (classified.kind !== "meta") {
      pushUniqueValue(lookupTerms, classified.value);
    }
  });

  return lookupTerms;
}

function pushUniqueValue(target: string[], value: string) {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function resolveLoginCustomerIdForAccount(
  googleAccountId: string,
  googleLoginCustomerIdByAccount: GoogleLoginCustomerIdMap
): string | null {
  if (Object.prototype.hasOwnProperty.call(googleLoginCustomerIdByAccount, googleAccountId)) {
    return googleLoginCustomerIdByAccount[googleAccountId];
  }

  return null;
}

function getGoogleCredentialWarnings(
  developerToken: string | null,
  accessToken: string | null,
  refreshToken: string | null,
  clientId: string | null,
  clientSecret: string | null
): string[] {
  if (!developerToken) {
    return [
      "Google Ads API: Missing GOOGLE_ADS_DEVELOPER_TOKEN. Add this secret in Vercel Environment Variables or run locally with `doppler run -- npm run dev`.",
    ];
  }

  if (!hasGoogleOAuthCredentials(accessToken, refreshToken, clientId, clientSecret)) {
    return [
      "Google Ads API: Missing OAuth credentials. Provide GOOGLE_ADS_ACCESS_TOKEN (or GOOGLE_OAUTH_ACCESS_TOKEN), or GOOGLE_ADS_REFRESH_TOKEN + GOOGLE_ADS_CLIENT_ID + GOOGLE_ADS_CLIENT_SECRET.",
    ];
  }

  return [];
}

function googleErrorHint(message: string): string {
  if (message.includes("non-JSON response")) {
    return " This usually means the token/proxy returned an HTML page instead of Google Ads API JSON (wrong OAuth scope, expired/invalid token, or network proxy page).";
  }

  if (/status 400/i.test(message)) {
    return " Verify Google Ads customer ID access and the Access Path configured for this account.";
  }

  if (/caller does not have permission|permission denied|authorization_error|forbidden/i.test(message)) {
    return " The OAuth caller cannot access this Google Ads customer ID. Share the account with the OAuth user and confirm the configured Access Path manager has access.";
  }

  if (/429|resource_exhausted|rate.?limit/i.test(message)) {
    return " Google Ads rate limit was hit. Automatic retries were attempted. Please wait a moment and retry.";
  }

  return "";
}

function logGoogleWarningsForTerminal(warnings: string[]) {
  warnings.forEach((warning) => {
    console.warn(`[Google Ads Warning] ${warning}`);
  });
}

function getManualAuctionInsightRowsForAccounts(accountIds: string[]): AuctionInsightRow[] {
  for (const accountId of accountIds) {
    const manualRows = MANUAL_AUCTION_INSIGHT_ROWS_BY_ACCOUNT[accountId];
    if (manualRows && manualRows.length > 0) {
      return manualRows.map((row) => ({ ...row }));
    }
  }
  return [];
}

function mergeTopKeywordRows(rows: TopKeywordRow[]): TopKeywordRow[] {
  const byKeyword = new Map<string, TopKeywordRow>();

  rows.forEach((row) => {
    const key = row.keyword.trim().toLowerCase();
    const existing = byKeyword.get(key);
    if (!existing) {
      byKeyword.set(key, { ...row });
      return;
    }

    existing.impressions += row.impressions;
    existing.clicks += row.clicks;
    existing.conversions += row.conversions;
    existing.cost += row.cost;
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

function buildTopKeywordTotals(rows: TopKeywordRow[]): TopKeywordRow {
  const totals = rows.reduce<TopKeywordRow>(
    (acc, row) => ({
      ...acc,
      impressions: acc.impressions + row.impressions,
      clicks: acc.clicks + row.clicks,
      conversions: acc.conversions + row.conversions,
      cost: acc.cost + row.cost,
    }),
    {
      id: "keywords-grand-total",
      keyword: "Grand total",
      impressions: 0,
      clicks: 0,
      avgCpc: 0,
      ctr: 0,
      conversions: 0,
      conversionRate: 0,
      costPerConversion: 0,
      cost: 0,
    }
  );

  totals.ctr = totals.impressions > 0 ? (totals.clicks * 100) / totals.impressions : 0;
  totals.avgCpc = totals.clicks > 0 ? totals.cost / totals.clicks : 0;
  totals.conversionRate = totals.clicks > 0 ? (totals.conversions * 100) / totals.clicks : 0;
  totals.costPerConversion = totals.conversions > 0 ? totals.cost / totals.conversions : 0;

  return totals;
}

function mergeAuctionInsightRows(rows: AuctionInsightRow[]): AuctionInsightRow[] {
  const byDomain = new Map<string, AuctionInsightRow>();

  rows.forEach((row) => {
    const key = row.displayDomain.trim().toLowerCase();
    const existing = byDomain.get(key);
    if (!existing) {
      byDomain.set(key, {
        ...row,
        impressionShare: row.impressionShare * row.observations,
        overlapRate: row.overlapRate * row.observations,
        positionAboveRate: row.positionAboveRate * row.observations,
        topOfPageRate: row.topOfPageRate * row.observations,
        absoluteTopOfPageRate: row.absoluteTopOfPageRate * row.observations,
        outrankingShare: row.outrankingShare * row.observations,
      });
      return;
    }

    existing.observations += row.observations;
    existing.impressionShare += row.impressionShare * row.observations;
    existing.overlapRate += row.overlapRate * row.observations;
    existing.positionAboveRate += row.positionAboveRate * row.observations;
    existing.topOfPageRate += row.topOfPageRate * row.observations;
    existing.absoluteTopOfPageRate += row.absoluteTopOfPageRate * row.observations;
    existing.outrankingShare += row.outrankingShare * row.observations;
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

function buildAuctionInsightAverages(
  rows: AuctionInsightRow[]
): Omit<AuctionInsightRow, "id" | "displayDomain" | "observations"> {
  if (rows.length === 0) {
    return {
      impressionShare: 0,
      overlapRate: 0,
      positionAboveRate: 0,
      topOfPageRate: 0,
      absoluteTopOfPageRate: 0,
      outrankingShare: 0,
    };
  }

  const totals = rows.reduce(
    (acc, row) => ({
      impressionShare: acc.impressionShare + row.impressionShare,
      overlapRate: acc.overlapRate + row.overlapRate,
      positionAboveRate: acc.positionAboveRate + row.positionAboveRate,
      topOfPageRate: acc.topOfPageRate + row.topOfPageRate,
      absoluteTopOfPageRate: acc.absoluteTopOfPageRate + row.absoluteTopOfPageRate,
      outrankingShare: acc.outrankingShare + row.outrankingShare,
    }),
    {
      impressionShare: 0,
      overlapRate: 0,
      positionAboveRate: 0,
      topOfPageRate: 0,
      absoluteTopOfPageRate: 0,
      outrankingShare: 0,
    }
  );

  return {
    impressionShare: totals.impressionShare / rows.length,
    overlapRate: totals.overlapRate / rows.length,
    positionAboveRate: totals.positionAboveRate / rows.length,
    topOfPageRate: totals.topOfPageRate / rows.length,
    absoluteTopOfPageRate: totals.absoluteTopOfPageRate / rows.length,
    outrankingShare: totals.outrankingShare / rows.length,
  };
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
