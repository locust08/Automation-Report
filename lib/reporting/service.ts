import { buildDateRange } from "@/lib/reporting/date";
import {
  createEmptyAudienceClickBreakdownResponse,
  mergeAudienceClickBreakdownResponses,
} from "@/lib/reporting/audience-breakdown";
import {
  getCredentials,
  normalizeGoogleAccountId,
  normalizeMetaAccountId,
  resolveCompanyNameFromAccountId,
} from "@/lib/reporting/env";
import { buildPlatformInsights } from "@/lib/reporting/insights";
import {
  fetchGoogleAccountName,
  fetchGoogleAudienceBreakdown,
  fetchGoogleAuctionInsightRows,
  fetchGoogleCampaignRows,
  fetchGooglePreviewData,
  fetchGoogleTopKeywordRows,
  isGoogleAdsAccessPathError,
} from "@/lib/reporting/google";
import {
  MIN_REPORTING_CAMPAIGN_SPEND,
  buildGroups,
  computeDelta,
  emptyCampaignRow,
  mergeCampaignRows,
} from "@/lib/reporting/metrics";
import { MemoryCacheEntry, readThroughMemoryCache } from "@/lib/reporting/memory-cache";
import {
  fetchMetaAudienceBreakdown,
  fetchMetaAccountName,
  fetchMetaCampaignRows,
  fetchMetaPreviewData,
} from "@/lib/reporting/meta";
import {
  AudienceClickBreakdownResponse,
  AuctionInsightRow,
  AuctionInsightsPayload,
  CampaignComparisonPayload,
  CampaignRow,
  InsightsPayload,
  MetaPreviewBlockIssue,
  MetaPreviewDiagnostics,
  OverallReportPayload,
  Platform,
  PreviewCampaignNode,
  GooglePreviewDiagnostics,
  GooglePreviewFatalError,
  GooglePreviewWarning,
  PreviewPlatformSection,
  PreviewReportPayload,
  SummaryMetric,
  SummarySection,
  TopKeywordRow,
  TopKeywordsPayload,
} from "@/lib/reporting/types";
import { isNotionIntegrationError, resolveGoogleAccountsFromNotion } from "@/lib/reporting/notion";

interface OverallInput {
  accountId: string | null;
  metaAccountId: string | null;
  googleAccountId: string | null;
  startDate: string | null;
  endDate: string | null;
  diagnosticsMode?: boolean;
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

const GOOGLE_FETCH_CACHE_TTL_MS = parsePositiveIntegerEnv(
  process.env.REPORTING_GOOGLE_CACHE_TTL_MS,
  5 * 60 * 1000
);
const GOOGLE_FETCH_CACHE_MAX_ENTRIES = parsePositiveIntegerEnv(
  process.env.REPORTING_GOOGLE_CACHE_MAX_ENTRIES,
  200
);

const googleCampaignRowsCache = new Map<
  string,
  MemoryCacheEntry<{ rows: CampaignRow[]; warnings: string[] }>
>();
const googleAudienceBreakdownCache = new Map<
  string,
  MemoryCacheEntry<{ breakdown: AudienceClickBreakdownResponse; warnings: string[] }>
>();
const googlePreviewCache = new Map<
  string,
  MemoryCacheEntry<Awaited<ReturnType<typeof fetchGooglePreviewData>>>
>();
const googleTopKeywordRowsCache = new Map<string, MemoryCacheEntry<TopKeywordRow[]>>();
const googleAuctionInsightRowsCache = new Map<string, MemoryCacheEntry<AuctionInsightRow[]>>();
const googleAccountNameCache = new Map<string, MemoryCacheEntry<string | null>>();

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

  const [metaCurrentResult, metaPreviousResult, metaAudienceBreakdownResult] = await Promise.all([
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
    tryFetchMetaAudienceBreakdownForAccounts(
      resolvedAccountIds.metaAccountIds,
      credentials.metaAccessToken,
      dateRange.startDate,
      dateRange.endDate
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
    googleManagerContext.accessPathByAccount,
    credentials.googleLoginCustomerId,
    dateRange.startDate,
    dateRange.endDate,
    true
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
    googleManagerContext.accessPathByAccount,
    credentials.googleLoginCustomerId,
    dateRange.previousStartDate,
    dateRange.previousEndDate,
    true
  );
  const googleAudienceBreakdownResult = await tryFetchGoogleAudienceBreakdownForAccounts(
    resolvedAccountIds.googleAccountIds,
    credentials.googleAdsApiVersion,
    credentials.googleDeveloperToken,
    credentials.googleAccessToken,
    credentials.googleRefreshToken,
    credentials.googleClientId,
    credentials.googleClientSecret,
    googleManagerContext.loginCustomerIdByAccount,
    googleManagerContext.accessPathByAccount,
    credentials.googleLoginCustomerId,
    dateRange.startDate,
    dateRange.endDate
  );

  warnings.push(
    ...metaCurrentResult.warnings,
    ...metaPreviousResult.warnings,
    ...metaAudienceBreakdownResult.warnings,
    ...googleCurrentResult.warnings,
    ...googlePreviousResult.warnings,
    ...googleAudienceBreakdownResult.warnings
  );

  if (resolvedAccountIds.metaAccountIds.length > 0 && metaCurrentResult.rows.length === 0) {
    warnings.push(
      `Meta Ads returned no campaign rows with spend greater than RM${MIN_REPORTING_CAMPAIGN_SPEND} for the selected account and date range. If this account spent during the period, verify the account ID and token permissions.`
    );
  }

  if (resolvedAccountIds.googleAccountIds.length > 0 && googleCurrentResult.rows.length === 0) {
    warnings.push(
      `Google Ads returned no campaign rows with spend greater than RM${MIN_REPORTING_CAMPAIGN_SPEND} for the selected account and date range. If this account spent during the period, verify that the selected Access Path can read it.`
    );
  }

  const metaCurrent = metaCurrentResult.rows;
  const metaPrevious = metaPreviousResult.rows;
  const googleCurrent = googleCurrentResult.rows.filter((row) => row.platform === "google");
  const googlePrevious = googlePreviousResult.rows.filter((row) => row.platform === "google");
  const youtubeCurrent = googleCurrentResult.rows.filter((row) => row.platform === "googleYoutube");
  const youtubePrevious = googlePreviousResult.rows.filter((row) => row.platform === "googleYoutube");
  const googleAccountCurrent = [...googleCurrent, ...youtubeCurrent];
  const googleAccountPrevious = [...googlePrevious, ...youtubePrevious];

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
      metrics: buildGoogleSummary(googleAccountCurrent, googleAccountPrevious),
    },
  ];

  const campaignGroups = buildGroups([...metaCurrent, ...googleCurrent, ...youtubeCurrent]);
  const audienceClickBreakdown = mergeAudienceClickBreakdownResponses(
    metaAudienceBreakdownResult.breakdown,
    googleAudienceBreakdownResult.breakdown
  );

  if (campaignGroups.length === 0 && warnings.length === 0) {
    warnings.push(
      `No campaign rows with spend greater than RM${MIN_REPORTING_CAMPAIGN_SPEND} were returned for the selected accounts and date range. Verify account IDs and API access permissions.`
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
    audienceClickBreakdown,
    warnings: dedupeWarnings(warnings),
  };
}

export async function getPreviewReport(input: OverallInput): Promise<PreviewReportPayload> {
  const credentials = getCredentials();
  const dateRange = buildDateRange(input.startDate, input.endDate);
  const warnings: string[] = [];

  const { resolvedAccountIds, googleManagerContext } = await resolveReportAccountContext(
    input,
    credentials
  );
  warnings.push(...googleManagerContext.messages);

  const companyName = await resolveCompanyNameForReport({
    credentials,
    accountId: input.accountId,
    resolvedAccountIds,
    googleLoginCustomerIdByAccount: googleManagerContext.loginCustomerIdByAccount,
  });

  const [metaSections, googleSections] = await Promise.all([
    tryFetchMetaPreviewSections(
      resolvedAccountIds.metaAccountIds,
      credentials.metaAccessToken,
      dateRange.startDate,
      dateRange.endDate
    ),
    tryFetchGooglePreviewSections(
      resolvedAccountIds.googleAccountIds,
      credentials.googleAdsApiVersion,
      credentials.googleDeveloperToken,
      credentials.googleAccessToken,
      credentials.googleRefreshToken,
      credentials.googleClientId,
      credentials.googleClientSecret,
      googleManagerContext.loginCustomerIdByAccount,
      googleManagerContext.accessPathByAccount,
      credentials.googleLoginCustomerId,
      dateRange.startDate,
      dateRange.endDate,
      Boolean(input.diagnosticsMode && isGooglePreviewDiagnosticsEnabled())
    ),
  ]);

  warnings.push(...metaSections.warnings, ...googleSections.warnings);
  if (resolvedAccountIds.googleAccountIds.length > 0 && googleSections.campaigns.length === 0) {
    warnings.push(
      "Google Ads preview returned no enabled campaigns/ad groups/ads for the selected account and date range. If the account should have data, verify that the selected Access Path can read it and that the campaigns are enabled."
    );
  }

  const sections = [
    {
      platform: "meta",
      title: "Meta Ads Manager Preview",
      logoPath: "/MetaLogo.png",
      childLabel: "Ad Set",
      campaigns: metaSections.campaigns,
    },
    {
      platform: "google",
      title: "Google Ads Preview",
      logoPath: "/GoogleLogo.png",
      childLabel: "Ad Group",
      campaigns: googleSections.campaigns,
    },
  ] satisfies PreviewPlatformSection[];

  const activeSections = sections.filter((section) => section.campaigns.length > 0);

  if (activeSections.length === 0 && warnings.length === 0) {
    warnings.push(
      "No preview hierarchy was returned for the selected accounts and date range. Verify account IDs and API access permissions."
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
    metaWarnings: metaSections.structuredWarnings,
    metaFatalErrors: metaSections.fatalErrors,
    googleWarnings: googleSections.structuredWarnings,
    googleFatalErrors: googleSections.fatalErrors,
    diagnostics:
      metaSections.diagnostics.length || googleSections.diagnostics.length
        ? {
            meta: metaSections.diagnostics,
            google: googleSections.diagnostics,
          }
        : undefined,
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
    accessPathByAccount: googleManagerContext.accessPathByAccount,
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
    accessPathByAccount: googleManagerContext.accessPathByAccount,
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
    googleManagerContext.accessPathByAccount,
    credentials.googleLoginCustomerId,
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
    googleManagerContext.accessPathByAccount,
    credentials.googleLoginCustomerId,
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
    googleManagerContext.accessPathByAccount,
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
    googleManagerContext.loginCustomerIdByAccount,
    googleManagerContext.accessPathByAccount,
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
  accessPathByAccount: Record<string, string | null>;
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
    accessPathByAccount,
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
    accessPathByAccount,
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

async function tryFetchMetaAudience(
  accountId: string | null,
  accessToken: string | null,
  startDate: string,
  endDate: string
): Promise<{ breakdown: AudienceClickBreakdownResponse; warnings: string[] }> {
  if (!accountId) {
    return { breakdown: createEmptyAudienceClickBreakdownResponse(), warnings: [] };
  }
  if (!accessToken) {
    return {
      breakdown: createEmptyAudienceClickBreakdownResponse(),
      warnings: [
        "Meta API: Missing META_ACCESS_TOKEN. Add this secret in Vercel Environment Variables or run locally with `doppler run -- npm run dev`.",
      ],
    };
  }

  try {
    const breakdown = await fetchMetaAudienceBreakdown({
      accountId,
      accessToken,
      startDate,
      endDate,
    });
    return { breakdown, warnings: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Meta audience breakdown data.";
    const hint = message.includes("(#200)")
      ? " Meta token is valid but missing required ads scopes (`ads_read` or `ads_management`) for this ad account, or the token owner is not assigned to the ad account."
      : "";
    return {
      breakdown: createEmptyAudienceClickBreakdownResponse(),
      warnings: [`Meta API: ${message}${hint}`],
    };
  }
}

async function tryFetchMetaPreview(
  accountId: string | null,
  accessToken: string | null,
  startDate: string,
  endDate: string
): Promise<{
  campaigns: PreviewCampaignNode[];
  warnings: string[];
  structuredWarnings: MetaPreviewBlockIssue[];
  fatalErrors: MetaPreviewBlockIssue[];
  diagnostics: MetaPreviewDiagnostics[];
}> {
  if (!accountId) {
    return { campaigns: [], warnings: [], structuredWarnings: [], fatalErrors: [], diagnostics: [] };
  }
  if (!accessToken) {
    return {
      campaigns: [],
      warnings: [
        "Meta API: Missing META_ACCESS_TOKEN. Add this secret in Vercel Environment Variables or run locally with `doppler run -- npm run dev`.",
      ],
      structuredWarnings: [],
      fatalErrors: [],
      diagnostics: [],
    };
  }

  try {
    const result = await fetchMetaPreviewData({
      accountId,
      accessToken,
      startDate,
      endDate,
    });
    return {
      campaigns: result.data,
      warnings: [
        ...result.warnings.map(formatStructuredMetaPreviewIssue),
        ...result.fatalErrors.map(formatStructuredMetaPreviewIssue),
      ],
      structuredWarnings: result.warnings,
      fatalErrors: result.fatalErrors,
      diagnostics: result.diagnostics.length ? [{ accountId, blocks: result.diagnostics }] : [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Meta preview data.";
    const hint = message.includes("(#200)")
      ? " Meta token is valid but missing required ads scopes (`ads_read` or `ads_management`) for this ad account, or the token owner is not assigned to the ad account."
      : "";
    return {
      campaigns: [],
      warnings: [`Meta API: ${message}${hint}`],
      structuredWarnings: [],
      fatalErrors: [],
      diagnostics: [],
    };
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
  accessPath: string | null,
  fallbackLoginCustomerId: string | null,
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

  const cacheKey = createGoogleFetchCacheKey("campaign-rows", {
    customerId,
    apiVersion,
    loginCustomerId,
    accessPath,
    fallbackLoginCustomerId,
    startDate,
    endDate,
    credentials: fingerprintGoogleCredentials(
      developerToken,
      accessToken,
      refreshToken,
      clientId,
      clientSecret
    ),
  });

  try {
    return await readThroughMemoryCache(
      googleCampaignRowsCache,
      cacheKey,
      async () => {
        const rows = await fetchGoogleCampaignRows({
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
        });
        return { rows, warnings: [] };
      },
      {
        ttlMs: GOOGLE_FETCH_CACHE_TTL_MS,
        maxEntries: GOOGLE_FETCH_CACHE_MAX_ENTRIES,
      }
    );
  } catch (error) {
    if (isGoogleAdsAccessPathError(error)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Failed to load Google Ads data.";
    return { rows: [], warnings: [`Google Ads API: ${message}${googleErrorHint(message)}`] };
  }
}

async function tryFetchGoogleAudience(
  customerId: string | null,
  apiVersion: string,
  developerToken: string | null,
  accessToken: string | null,
  refreshToken: string | null,
  clientId: string | null,
  clientSecret: string | null,
  loginCustomerId: string | null,
  accessPath: string | null,
  fallbackLoginCustomerId: string | null,
  startDate: string,
  endDate: string
): Promise<{ breakdown: AudienceClickBreakdownResponse; warnings: string[] }> {
  if (!customerId) {
    return { breakdown: createEmptyAudienceClickBreakdownResponse(), warnings: [] };
  }

  const credentialWarnings = getGoogleCredentialWarnings(
    developerToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret
  );
  if (credentialWarnings.length > 0) {
    return {
      breakdown: createEmptyAudienceClickBreakdownResponse(),
      warnings: credentialWarnings,
    };
  }

  const cacheKey = createGoogleFetchCacheKey("audience-breakdown", {
    customerId,
    apiVersion,
    loginCustomerId,
    accessPath,
    fallbackLoginCustomerId,
    startDate,
    endDate,
    credentials: fingerprintGoogleCredentials(
      developerToken,
      accessToken,
      refreshToken,
      clientId,
      clientSecret
    ),
  });

  try {
    return await readThroughMemoryCache(
      googleAudienceBreakdownCache,
      cacheKey,
      async () => {
        const breakdown = await fetchGoogleAudienceBreakdown({
          customerId,
          apiVersion,
          developerToken: developerToken!,
          accessToken,
          refreshToken,
          clientId,
          clientSecret,
          loginCustomerId,
          accessPath,
          fallbackLoginCustomerId,
          startDate,
          endDate,
        });
        return { breakdown, warnings: [] };
      },
      {
        ttlMs: GOOGLE_FETCH_CACHE_TTL_MS,
        maxEntries: GOOGLE_FETCH_CACHE_MAX_ENTRIES,
      }
    );
  } catch (error) {
    if (isGoogleAdsAccessPathError(error)) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Failed to load Google Ads audience breakdown data.";
    return {
      breakdown: createEmptyAudienceClickBreakdownResponse(),
      warnings: [`Google Ads API: ${message}${googleErrorHint(message)}`],
    };
  }
}

async function tryFetchGooglePreview(
  customerId: string | null,
  apiVersion: string,
  developerToken: string | null,
  accessToken: string | null,
  refreshToken: string | null,
  clientId: string | null,
  clientSecret: string | null,
  loginCustomerId: string | null,
  accessPath: string | null,
  fallbackLoginCustomerId: string | null,
  startDate: string,
  endDate: string,
  includeDiagnostics: boolean
): Promise<{
  campaigns: PreviewCampaignNode[];
  warnings: string[];
  structuredWarnings: GooglePreviewWarning[];
  fatalError: GooglePreviewFatalError | null;
  diagnostics: GooglePreviewDiagnostics | null;
}> {
  if (!customerId) {
    return {
      campaigns: [],
      warnings: [],
      structuredWarnings: [],
      fatalError: null,
      diagnostics: null,
    };
  }

  const credentialWarnings = getGoogleCredentialWarnings(
    developerToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret
  );
  if (credentialWarnings.length > 0) {
    return {
      campaigns: [],
      warnings: credentialWarnings,
      structuredWarnings: [],
      fatalError: null,
      diagnostics: null,
    };
  }

  const cacheKey = createGoogleFetchCacheKey("preview", {
    customerId,
    apiVersion,
    loginCustomerId,
    accessPath,
    fallbackLoginCustomerId,
    startDate,
    endDate,
    credentials: fingerprintGoogleCredentials(
      developerToken,
      accessToken,
      refreshToken,
      clientId,
      clientSecret
    ),
  });

  try {
    const result = await readThroughMemoryCache(
      googlePreviewCache,
      cacheKey,
      () =>
        fetchGooglePreviewData({
          customerId,
          apiVersion,
          developerToken: developerToken!,
          accessToken,
          refreshToken,
          clientId,
          clientSecret,
          loginCustomerId,
          fallbackLoginCustomerId,
          startDate,
          endDate,
          accessPath,
        }),
      {
        ttlMs: GOOGLE_FETCH_CACHE_TTL_MS,
        maxEntries: GOOGLE_FETCH_CACHE_MAX_ENTRIES,
      }
    );

    return {
      campaigns: result.data,
      warnings: [
        ...result.warnings.map(formatStructuredGooglePreviewWarning),
        ...(result.fatalError ? [formatStructuredGooglePreviewFatalError(result.fatalError)] : []),
      ],
      structuredWarnings: result.warnings,
      fatalError: result.fatalError,
      diagnostics: includeDiagnostics ? result.diagnostics : null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Google Ads preview data.";
    return {
      campaigns: [],
      warnings: [`Google Ads API: ${message}${googleErrorHint(message)}`],
      structuredWarnings: [],
      fatalError: null,
      diagnostics: null,
    };
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
  accessPath: string | null,
  fallbackLoginCustomerId: string | null,
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

  const cacheKey = createGoogleFetchCacheKey("top-keywords", {
    customerId,
    apiVersion,
    loginCustomerId,
    accessPath,
    fallbackLoginCustomerId,
    startDate,
    endDate,
    credentials: fingerprintGoogleCredentials(
      developerToken,
      accessToken,
      refreshToken,
      clientId,
      clientSecret
    ),
  });

  try {
    const rows = await readThroughMemoryCache(
      googleTopKeywordRowsCache,
      cacheKey,
      () =>
        fetchGoogleTopKeywordRows({
          customerId,
          apiVersion,
          developerToken: developerToken!,
          accessToken,
          refreshToken,
          clientId,
          clientSecret,
          loginCustomerId,
          accessPath,
          fallbackLoginCustomerId,
          startDate,
          endDate,
        }),
      {
        ttlMs: GOOGLE_FETCH_CACHE_TTL_MS,
        maxEntries: GOOGLE_FETCH_CACHE_MAX_ENTRIES,
      }
    );

    return { rows, warnings: [] };
  } catch (error) {
    if (isGoogleAdsAccessPathError(error)) {
      throw error;
    }
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
  accessPath: string | null,
  fallbackLoginCustomerId: string | null,
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

  const cacheKey = createGoogleFetchCacheKey("auction-insights", {
    customerId,
    apiVersion,
    loginCustomerId,
    accessPath,
    fallbackLoginCustomerId,
    startDate,
    endDate,
    credentials: fingerprintGoogleCredentials(
      developerToken,
      accessToken,
      refreshToken,
      clientId,
      clientSecret
    ),
  });

  try {
    const rows = await readThroughMemoryCache(
      googleAuctionInsightRowsCache,
      cacheKey,
      () =>
        fetchGoogleAuctionInsightRows({
          customerId,
          apiVersion,
          developerToken: developerToken!,
          accessToken,
          refreshToken,
          clientId,
          clientSecret,
          loginCustomerId,
          accessPath,
          fallbackLoginCustomerId,
          startDate,
          endDate,
        }),
      {
        ttlMs: GOOGLE_FETCH_CACHE_TTL_MS,
        maxEntries: GOOGLE_FETCH_CACHE_MAX_ENTRIES,
      }
    );

    return { rows, warnings: [] };
  } catch (error) {
    if (isGoogleAdsAccessPathError(error)) {
      throw error;
    }
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

async function tryFetchMetaAudienceBreakdownForAccounts(
  accountIds: string[],
  accessToken: string | null,
  startDate: string,
  endDate: string
): Promise<{ breakdown: AudienceClickBreakdownResponse; warnings: string[] }> {
  if (accountIds.length === 0) {
    return { breakdown: createEmptyAudienceClickBreakdownResponse(), warnings: [] };
  }

  let breakdown = createEmptyAudienceClickBreakdownResponse();
  const warnings: string[] = [];

  for (const accountId of accountIds) {
    const result = await tryFetchMetaAudience(accountId, accessToken, startDate, endDate);
    breakdown = mergeAudienceClickBreakdownResponses(breakdown, result.breakdown);
    warnings.push(
      ...result.warnings.map((warning) => annotateWarningWithAccount(warning, "meta", accountId))
    );
  }

  return { breakdown, warnings };
}

async function tryFetchGoogleAudienceBreakdownForAccounts(
  accountIds: string[],
  apiVersion: string,
  developerToken: string | null,
  accessToken: string | null,
  refreshToken: string | null,
  clientId: string | null,
  clientSecret: string | null,
  loginCustomerIdByAccount: GoogleLoginCustomerIdMap,
  accessPathByAccount: Record<string, string | null>,
  fallbackLoginCustomerId: string | null,
  startDate: string,
  endDate: string
): Promise<{ breakdown: AudienceClickBreakdownResponse; warnings: string[] }> {
  if (accountIds.length === 0) {
    return { breakdown: createEmptyAudienceClickBreakdownResponse(), warnings: [] };
  }

  let breakdown = createEmptyAudienceClickBreakdownResponse();
  const warnings: string[] = [];

  for (const accountId of accountIds) {
    try {
      const result = await tryFetchGoogleAudience(
        accountId,
        apiVersion,
        developerToken,
        accessToken,
        refreshToken,
        clientId,
        clientSecret,
        loginCustomerIdByAccount[accountId] ?? null,
        accessPathByAccount[accountId] ?? null,
        fallbackLoginCustomerId,
        startDate,
        endDate
      );
      breakdown = mergeAudienceClickBreakdownResponses(breakdown, result.breakdown);
      const accountWarnings = result.warnings.map((warning) =>
        annotateWarningWithAccount(warning, "google", accountId)
      );
      logGoogleWarningsForTerminal(accountWarnings);
      warnings.push(...accountWarnings);
    } catch (error) {
      if (!isGoogleAdsAccessPathError(error)) {
        throw error;
      }

      const accountWarnings = [
        annotateWarningWithAccount(error.payload.message, "google", accountId),
      ];
      logGoogleWarningsForTerminal(accountWarnings);
      warnings.push(...accountWarnings);
    }
  }

  return { breakdown, warnings };
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
  accessPathByAccount: Record<string, string | null>,
  fallbackLoginCustomerId: string | null,
  startDate: string,
  endDate: string,
  suppressAccessPathErrors = false
): Promise<{ rows: CampaignRow[]; warnings: string[] }> {
  if (accountIds.length === 0) {
    return { rows: [], warnings: [] };
  }

  const rows: CampaignRow[] = [];
  const warnings: string[] = [];

  for (const accountId of accountIds) {
    try {
      const result = await tryFetchGoogle(
        accountId,
        apiVersion,
        developerToken,
        accessToken,
        refreshToken,
        clientId,
        clientSecret,
        loginCustomerIdByAccount[accountId] ?? null,
        accessPathByAccount[accountId] ?? null,
        fallbackLoginCustomerId,
        startDate,
        endDate
      );
      rows.push(...result.rows);
      const accountWarnings = result.warnings.map((warning) =>
        annotateWarningWithAccount(warning, "google", accountId)
      );
      logGoogleWarningsForTerminal(accountWarnings);
      warnings.push(...accountWarnings);
    } catch (error) {
      if (!suppressAccessPathErrors || !isGoogleAdsAccessPathError(error)) {
        throw error;
      }

      const accountWarnings = [
        annotateWarningWithAccount(error.payload.message, "google", accountId),
      ];
      logGoogleWarningsForTerminal(accountWarnings);
      warnings.push(...accountWarnings);
    }
  }

  return { rows, warnings };
}

async function tryFetchMetaPreviewSections(
  accountIds: string[],
  accessToken: string | null,
  startDate: string,
  endDate: string
): Promise<{
  campaigns: PreviewCampaignNode[];
  warnings: string[];
  structuredWarnings: MetaPreviewBlockIssue[];
  fatalErrors: MetaPreviewBlockIssue[];
  diagnostics: MetaPreviewDiagnostics[];
}> {
  if (accountIds.length === 0) {
    return { campaigns: [], warnings: [], structuredWarnings: [], fatalErrors: [], diagnostics: [] };
  }

  const campaigns: PreviewCampaignNode[] = [];
  const warnings: string[] = [];
  const structuredWarnings: MetaPreviewBlockIssue[] = [];
  const fatalErrors: MetaPreviewBlockIssue[] = [];
  const diagnostics: MetaPreviewDiagnostics[] = [];

  for (const accountId of accountIds) {
    const result = await tryFetchMetaPreview(accountId, accessToken, startDate, endDate);
    campaigns.push(...result.campaigns);
    warnings.push(
      ...result.warnings.map((warning) => annotateWarningWithAccount(warning, "meta", accountId))
    );
    structuredWarnings.push(...result.structuredWarnings);
    fatalErrors.push(...result.fatalErrors);
    diagnostics.push(...result.diagnostics);
  }

  return {
    campaigns: sortPreviewCampaigns(campaigns),
    warnings,
    structuredWarnings,
    fatalErrors,
    diagnostics,
  };
}

async function tryFetchGooglePreviewSections(
  accountIds: string[],
  apiVersion: string,
  developerToken: string | null,
  accessToken: string | null,
  refreshToken: string | null,
  clientId: string | null,
  clientSecret: string | null,
  loginCustomerIdByAccount: GoogleLoginCustomerIdMap,
  accessPathByAccount: Record<string, string | null>,
  fallbackLoginCustomerId: string | null,
  startDate: string,
  endDate: string,
  includeDiagnostics: boolean
): Promise<{
  campaigns: PreviewCampaignNode[];
  warnings: string[];
  structuredWarnings: GooglePreviewWarning[];
  fatalErrors: GooglePreviewFatalError[];
  diagnostics: GooglePreviewDiagnostics[];
}> {
  if (accountIds.length === 0) {
    return { campaigns: [], warnings: [], structuredWarnings: [], fatalErrors: [], diagnostics: [] };
  }

  const campaigns: PreviewCampaignNode[] = [];
  const warnings: string[] = [];
  const structuredWarnings: GooglePreviewWarning[] = [];
  const fatalErrors: GooglePreviewFatalError[] = [];
  const diagnostics: GooglePreviewDiagnostics[] = [];

  for (const accountId of accountIds) {
    const result = await tryFetchGooglePreview(
      accountId,
      apiVersion,
      developerToken,
      accessToken,
      refreshToken,
      clientId,
      clientSecret,
      loginCustomerIdByAccount[accountId] ?? null,
      accessPathByAccount[accountId] ?? null,
      fallbackLoginCustomerId,
      startDate,
      endDate,
      includeDiagnostics
    );

    campaigns.push(...result.campaigns);
    const accountWarnings = result.warnings.map((warning) =>
      annotateWarningWithAccount(warning, "google", accountId)
    );
    logGoogleWarningsForTerminal(accountWarnings);
    warnings.push(...accountWarnings);
    structuredWarnings.push(...result.structuredWarnings);
    if (result.fatalError) {
      fatalErrors.push(result.fatalError);
    }
    if (result.diagnostics) {
      diagnostics.push(result.diagnostics);
    }
  }

  return {
    campaigns: sortPreviewCampaigns(campaigns),
    warnings,
    structuredWarnings,
    fatalErrors,
    diagnostics,
  };
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
  accessPathByAccount: Record<string, string | null>,
  fallbackLoginCustomerId: string | null,
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
      accessPathByAccount[accountId] ?? null,
      fallbackLoginCustomerId,
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
  accessPathByAccount: Record<string, string | null>,
  fallbackLoginCustomerId: string | null,
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
      accessPathByAccount[accountId] ?? null,
      fallbackLoginCustomerId,
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
    accessPathByAccount: Record<string, string | null>;
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
  const developerToken = credentials.googleDeveloperToken;

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

  const cacheKey = createGoogleFetchCacheKey("account-name", {
    customerId: googleAccountId,
    apiVersion: credentials.googleAdsApiVersion,
    loginCustomerId,
    credentials: fingerprintGoogleCredentials(
      developerToken,
      credentials.googleAccessToken,
      credentials.googleRefreshToken,
      credentials.googleClientId,
      credentials.googleClientSecret
    ),
  });

  try {
    return await readThroughMemoryCache(
      googleAccountNameCache,
      cacheKey,
      () =>
        fetchGoogleAccountName({
          customerId: googleAccountId,
          apiVersion: credentials.googleAdsApiVersion,
          developerToken,
          accessToken: credentials.googleAccessToken,
          refreshToken: credentials.googleRefreshToken,
          clientId: credentials.googleClientId,
          clientSecret: credentials.googleClientSecret,
          loginCustomerId,
        }),
      {
        ttlMs: GOOGLE_FETCH_CACHE_TTL_MS,
        maxEntries: GOOGLE_FETCH_CACHE_MAX_ENTRIES,
      }
    );
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
  accessPathByAccount: Record<string, string | null>;
  messages: string[];
}> {
  try {
    return resolveGoogleAccountsFromNotion({
      googleAccountIds: resolvedAccountIds.googleAccountIds,
      googleLookupTerms: collectGoogleLookupTerms(input.accountId, input.googleAccountId),
      notionAccessToken: credentials.notionAccessToken,
      notionDatabaseId: credentials.notionDatabaseId,
      fallbackLoginCustomerId: credentials.googleLoginCustomerId,
    });
  } catch (error) {
    if (!isNotionIntegrationError(error)) {
      throw error;
    }

    const fallbackGoogleAccountIds = resolvedAccountIds.googleAccountIds;
    if (fallbackGoogleAccountIds.length === 0) {
      throw error;
    }

    const loginCustomerIdByAccount = fallbackGoogleAccountIds.reduce<GoogleLoginCustomerIdMap>(
      (acc, accountId) => {
        acc[accountId] = credentials.googleLoginCustomerId;
        return acc;
      },
      {}
    );
    const accessPathByAccount = fallbackGoogleAccountIds.reduce<Record<string, string | null>>(
      (acc, accountId) => {
        acc[accountId] = null;
        return acc;
      },
      {}
    );
    const fallbackManagerId = credentials.googleLoginCustomerId;
    const fallbackMessage = fallbackManagerId
      ? `Notion lookup failed (${error.payload.message}). Falling back to the requested Google account ID(s) with manager ID ${formatGoogleCustomerId(fallbackManagerId)}.`
      : `Notion lookup failed (${error.payload.message}). Falling back to the requested Google account ID(s) with direct customer access.`;

    return {
      googleAccountIds: fallbackGoogleAccountIds,
      loginCustomerIdByAccount,
      accessPathByAccount,
      messages: [fallbackMessage],
    };
  }
}

function formatGoogleCustomerId(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) {
    return value;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
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

function formatStructuredGooglePreviewWarning(warning: GooglePreviewWarning): string {
  return `[${warning.label}] ${warning.reason}`;
}

function formatStructuredGooglePreviewFatalError(error: GooglePreviewFatalError): string {
  return `[${error.label}] ${error.reason}`;
}

function formatStructuredMetaPreviewIssue(issue: MetaPreviewBlockIssue): string {
  return `[${issue.label}] fields=${issue.fields.join(",")} code=${issue.errorCode ?? "n/a"} subcode=${
    issue.errorSubcode ?? "n/a"
  } message=${issue.message}`;
}

function isGooglePreviewDiagnosticsEnabled(): boolean {
  const value = process.env.GOOGLE_ADS_PREVIEW_DIAGNOSTICS;
  return value === "1" || value === "true";
}

function logGoogleWarningsForTerminal(warnings: string[]) {
  warnings.forEach((warning) => {
    console.warn(`[Google Ads Warning] ${warning}`);
  });
}

function createGoogleFetchCacheKey(
  scope: string,
  values: Record<string, string | number | boolean | null | undefined>
): string {
  const serializedValues = Object.entries(values)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value ?? ""))}`)
    .join("&");

  return `google:${scope}:${serializedValues}`;
}

function fingerprintGoogleCredentials(
  developerToken: string | null,
  accessToken: string | null,
  refreshToken: string | null,
  clientId: string | null,
  clientSecret: string | null
): string {
  return [
    fingerprintSecret(developerToken),
    fingerprintSecret(accessToken),
    fingerprintSecret(refreshToken),
    fingerprintSecret(clientId),
    fingerprintSecret(clientSecret),
  ].join(".");
}

function fingerprintSecret(value: string | null): string {
  if (!value) {
    return "none";
  }

  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `${value.length}:${(hash >>> 0).toString(36)}`;
}

function parsePositiveIntegerEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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

function sortPreviewCampaigns(campaigns: PreviewCampaignNode[]): PreviewCampaignNode[] {
  return [...campaigns].sort((a, b) => a.name.localeCompare(b.name));
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
