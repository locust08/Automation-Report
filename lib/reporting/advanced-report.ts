import { createHash } from "node:crypto";

import {
  AdvancedCustomerTerm,
  AdvancedDecisionRow,
  AdvancedForecastPoint,
  AdvancedKeywordMetric,
  AdvancedLanguageTrend,
  AdvancedMonthlyPoint,
  AdvancedAuctionVisibilitySection,
  AdvancedFinalUrlPerformanceRow,
  AdvancedFinalUrlPerformanceSection,
  AdvancedGoogleVideoCreativeRow,
  AdvancedGoogleVideoCreativeSection,
  AdvancedGoogleVisualCreativeRow,
  AdvancedGoogleVisualCreativeSection,
  AdvancedMetaCreativeAnalysisRow,
  AdvancedMetaCreativeAnalysisSection,
  AdvancedOpportunitySection,
  AdvancedReportCountry,
  AdvancedReportCountryCode,
  AdvancedReportDiagnostics,
  AdvancedReportPayload,
  AdvancedReportSectionKey,
  AdvancedReportSectionStatus,
  AdvancedSocialCalendarItem,
} from "@/lib/reporting/advanced-types";
import {
  buildAdvancedCreativeAiCacheKey,
  readAdvancedCreativeAiCache,
  writeAdvancedCreativeAiCache,
  type AdvancedCreativeAiStatus,
} from "@/lib/reporting/advanced-ai-cache";
import { buildDateRange } from "@/lib/reporting/date";
import { getCredentials, resolveCompanyNameFromAccountId } from "@/lib/reporting/env";
import {
  extractNotionDatabaseId,
  getNotionPropertyText,
  queryNotionDatabasePages,
  type NotionPageProperty,
} from "@/lib/reporting/notion";
import {
  getGoogleAdvancedAdUsageReport,
  getGoogleAdvancedAuctionInsightRows,
  getGoogleAdvancedImageCreativeRows,
  getGoogleAdvancedVideoCreativeRows,
  getMetaAdvancedCreativeRows,
  getOverallReport,
  getTopKeywordsReport,
} from "@/lib/reporting/service";
import type {
  AuctionInsightRow,
  DateRangeConfig,
  GoogleFinalUrlSpendRow,
  GoogleImageCreativePerformanceRow,
  GoogleVideoCreativePerformanceRow,
  MetaCreativePerformanceRow,
  OverallReportPayload,
  TopKeywordRow,
} from "@/lib/reporting/types";

const ADVANCED_REPORT_SCHEMA_VERSION = 8;
const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const OPENROUTER_CHAT_COMPLETIONS_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const ADVANCED_REPORT_AI_TIMEOUT_MS = 1000 * 8;
const DATAFORSEO_BASE_URL = "https://api.dataforseo.com";
const DEFAULT_CONTENT_DATABASE_ID = "d82e7aec250645e2bbe7f37fa92feb03";
const CREATIVE_THEME_STOP_WORDS = new Set([
  "and",
  "are",
  "but",
  "for",
  "from",
  "get",
  "has",
  "have",
  "how",
  "into",
  "now",
  "our",
  "the",
  "this",
  "that",
  "to",
  "with",
  "you",
  "your",
  "kami",
  "dan",
  "yang",
  "untuk",
  "dengan",
]);

const ADVANCED_REPORT_COUNTRIES: Record<AdvancedReportCountryCode, AdvancedReportCountry> = {
  MY: { code: "MY", emoji: "🇲🇾", label: "MY", locationName: "Malaysia", timezone: "Asia/Kuala_Lumpur" },
  SG: { code: "SG", emoji: "🇸🇬", label: "SG", locationName: "Singapore", timezone: "Asia/Singapore" },
  AU: { code: "AU", emoji: "🇦🇺", label: "AU", locationName: "Australia", timezone: "Australia/Sydney" },
  US: { code: "US", emoji: "🇺🇸", label: "US", locationName: "United States", timezone: "America/New_York" },
};

type LanguageName = AdvancedLanguageTrend["language"];

interface AdvancedGenerationInput {
  accountId: string | null;
  country: string | null;
  startDate: string | null;
  endDate: string | null;
}

interface SectionState {
  status: AdvancedReportSectionStatus;
  message: string | null;
}

interface MarketDiscovery {
  clientBrandTerms: string[];
  competitorBrands: string[];
  productCategories: string[];
  seedKeywords: string[];
  customerQuestions: string[];
  keywordGroups: MarketKeywordGroups;
  sourceUrls: Array<{ title: string; url: string }>;
  responseId?: string | null;
  model?: string | null;
  promptSummary?: string | null;
  attempts?: number;
}

interface MarketKeywordGroups {
  generalProductService: string[];
  english: string[];
  malay: string[];
  chinese: string[];
  competitor: string[];
  problemNeed: string[];
  offerPromotion: string[];
  locationAware: string[];
}

interface MarketDiscoveryFeedback {
  attempt: number;
  previousKeywordCount: number;
  returnedRows: number;
  zeroVolumeSamples: string[];
  volumeSamples: string[];
}

interface DataForSeoKeywordResult {
  keyword: string;
  language: LanguageName;
  searchVolume: number;
  monthlySearches: AdvancedMonthlyPoint[];
  cpc: number | null;
  sourceGroup: string;
}

interface DataForSeoTaskResult {
  keyword?: string;
  search_volume?: number | null;
  cpc?: number | null;
  competition?: string | null;
  monthly_searches?: Array<{ year?: number; month?: number; search_volume?: number | null }>;
}

interface KeywordCandidateBatch {
  language: LanguageName;
  dataForSeoLanguage: string;
  sourceGroup: string;
  keywords: string[];
}

interface DataForSeoResponse {
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    result?: DataForSeoTaskResult[];
  }>;
}

interface DataForSeoSerpResponse {
  tasks?: Array<{
    result?: Array<{
      items?: Array<Record<string, unknown>>;
    }>;
  }>;
}

export function getAdvancedReportCountry(value: string | null | undefined): AdvancedReportCountry {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "SG" || normalized === "AU" || normalized === "US" || normalized === "MY") {
    return ADVANCED_REPORT_COUNTRIES[normalized];
  }
  return ADVANCED_REPORT_COUNTRIES.MY;
}

export function getAdvancedReportCountries(): AdvancedReportCountry[] {
  return Object.values(ADVANCED_REPORT_COUNTRIES);
}

export function buildAdvancedReportCacheKey(input: {
  accountId: string;
  country: AdvancedReportCountryCode;
  dateRange: DateRangeConfig;
}): string {
  const digest = createHash("sha256")
    .update(
      [
        `v${ADVANCED_REPORT_SCHEMA_VERSION}`,
        input.accountId.trim().toLowerCase(),
        input.country,
        input.dateRange.startDate,
        input.dateRange.endDate,
      ].join(":")
    )
    .digest("hex")
    .slice(0, 24);

  return `advanced/v${ADVANCED_REPORT_SCHEMA_VERSION}/${input.country}/${input.dateRange.startDate}_${input.dateRange.endDate}/${digest}.json`;
}

export async function generateAdvancedReport(input: AdvancedGenerationInput): Promise<AdvancedReportPayload> {
  const accountId = input.accountId?.trim() ?? "";
  const dateRange = buildDateRange(input.startDate, input.endDate);
  const country = getAdvancedReportCountry(input.country);
  const cacheKey = buildAdvancedReportCacheKey({ accountId, country: country.code, dateRange });
  const accountPlatform = inferAccountPlatform(accountId);
  const warnings: string[] = [];
  const sectionStatuses = createDefaultSectionStatuses();
  const aiKeyStatus = resolveAdvancedAiKeyStatus();

  console.info(
    `[advanced-report] generation started report_type=advanced account_id=${accountId || "missing"} period=${dateRange.startDate}_${dateRange.endDate} platform=${accountPlatform} ai_status=${aiKeyStatus}`
  );

  const googleUsage =
    accountPlatform === "google"
      ? await fetchGoogleAdvancedUsage(accountId, dateRange).catch((error: unknown) => {
          warnings.push(toWarning("Google Ads usage", error));
          return {
            keywordRows: [] as TopKeywordRow[],
            finalUrlRows: [] as GoogleFinalUrlSpendRow[],
            warnings: [] as string[],
          };
        })
      : {
          keywordRows: [] as TopKeywordRow[],
          finalUrlRows: [] as GoogleFinalUrlSpendRow[],
          warnings: [] as string[],
        };
  warnings.push(...googleUsage.warnings);

  const basicOverallReport = await fetchBasicOverallReport({
    accountId,
    accountPlatform,
    dateRange,
  }).catch((error: unknown) => {
    warnings.push(toWarning("Basic Overall Report", error));
    return undefined;
  });
  const companyName = await resolveAdvancedCompanyName(accountId, accountPlatform, dateRange, basicOverallReport);
  const finalUrlPerformance = buildFinalUrlPerformanceSection(googleUsage.finalUrlRows);
  const auctionInsightRows =
    accountPlatform === "google"
      ? await fetchGoogleAdvancedAuctionRows(accountId, dateRange).catch((error: unknown) => {
          logAdvancedAuctionHiddenReason(accountId, toWarning("Google Ads auction insights", error));
          return [] as AuctionInsightRow[];
        })
      : [];
  const auctionVisibility = buildAuctionVisibilitySection({
    accountId,
    accountPlatform,
    auctionRows: auctionInsightRows,
    finalUrlRows: googleUsage.finalUrlRows,
  });
  const metaCreativeRows =
    accountPlatform === "meta"
      ? await fetchMetaAdvancedCreatives(accountId, dateRange).catch((error: unknown) => {
          warnings.push(toWarning("Meta creative analysis", error));
          return [] as MetaCreativePerformanceRow[];
        })
      : [];
  const metaCreativeAnalysis = await buildMetaCreativeAnalysisSection({
    accountId,
    dateRange,
    rows: metaCreativeRows,
  });
  const googleImageCreativeRows =
    accountPlatform === "google"
      ? await fetchGoogleAdvancedImageCreatives(accountId, dateRange).catch((error: unknown) => {
          warnings.push(toWarning("Google visual creative analysis", error));
          return [] as GoogleImageCreativePerformanceRow[];
        })
      : [];
  const googleVisualCreativeAnalysis = await buildGoogleVisualCreativeSection({
    accountId,
    dateRange,
    rows: googleImageCreativeRows,
  });
  const googleVideoCreativeRows =
    accountPlatform === "google"
      ? await fetchGoogleAdvancedVideoCreatives(accountId, dateRange).catch((error: unknown) => {
          warnings.push(toWarning("Google video creative analysis", error));
          return [] as GoogleVideoCreativePerformanceRow[];
        })
      : [];
  const googleVideoCreativeAnalysis = await buildGoogleVideoCreativeSection({
    accountId,
    dateRange,
    rows: googleVideoCreativeRows,
  });

  let discovery = await discoverMarket({
    companyName,
    country,
    googleUsage,
    warnings,
  }).catch((error: unknown) => {
    warnings.push(toWarning("OpenAI market discovery", error));
    return buildFallbackDiscovery(companyName);
  });

  const socialCalendarPromise = fetchSocialCalendar(companyName, warnings).catch((error: unknown) => {
      warnings.push(toWarning("Notion social content", error));
      return { posters: [], stories: [] };
  });

  let keywordCandidates = buildKeywordCandidates(discovery, googleUsage, country);
  let keywordBatches = buildKeywordCandidateBatches(discovery, googleUsage, country);
  let keywordData = await fetchKeywordVolumes(keywordBatches, country, dateRange, warnings).catch((error: unknown) => {
    warnings.push(toWarning("DataForSEO search volume", error));
    return [] as DataForSeoKeywordResult[];
  });

  for (let attempt = 2; attempt <= 3 && shouldRetryKeywordDiscovery(keywordCandidates, keywordData); attempt += 1) {
    const feedback = buildMarketDiscoveryFeedback(attempt, keywordCandidates, keywordData);
    const retryDiscovery = await discoverMarket({
      companyName,
      country,
      googleUsage,
      warnings,
      feedback,
    }).catch((error: unknown) => {
      warnings.push(toWarning(`OpenAI market discovery retry ${attempt}`, error));
      return null;
    });

    if (!retryDiscovery) {
      break;
    }

    discovery = mergeMarketDiscoveries(discovery, retryDiscovery);
    keywordCandidates = buildKeywordCandidates(discovery, googleUsage, country);
    keywordBatches = buildKeywordCandidateBatches(discovery, googleUsage, country);
    keywordData = await fetchKeywordVolumes(keywordBatches, country, dateRange, warnings).catch((error: unknown) => {
      warnings.push(toWarning(`DataForSEO search volume retry ${attempt}`, error));
      return keywordData;
    });
  }

  const [peopleAlsoAskTerms, socialCalendar] = await Promise.all([
    fetchPeopleAlsoAskTerms(keywordCandidates.slice(0, 6), country, warnings).catch((error: unknown) => {
      warnings.push(toWarning("DataForSEO People Also Ask", error));
      return [] as string[];
    }),
    socialCalendarPromise,
  ]);

  const googleSpendByKeyword = new Map(
    googleUsage.keywordRows.map((row) => [normalizeKeyword(row.keyword), row.cost])
  );
  if (keywordCandidates.length > 0 && keywordData.length === 0) {
    warnings.push(
      "DataForSEO returned no keyword volume rows for the discovered keyword set. Regenerate after broadening the discovered market keywords or checking DataForSEO task output."
    );
  }
  const market = buildMarketSection(keywordData, googleSpendByKeyword, accountPlatform);
  const competitors = buildCompetitorSection(keywordData, discovery, companyName);
  const customers = buildCustomerSection(keywordData, peopleAlsoAskTerms, googleSpendByKeyword, accountPlatform);
  const opportunities = buildOpportunitySection(keywordData, peopleAlsoAskTerms, discovery);
  const decisions = buildDecisionRows(discovery, market, competitors, customers, opportunities);

  setSectionStatus(sectionStatuses, "market", market.topKeywords.length > 0, "No keyword search volume data found.");
  setSectionStatus(
    sectionStatuses,
    "competitors",
    competitors.demandShare.length > 0,
    "No competitor demand data found."
  );
  setSectionStatus(
    sectionStatuses,
    "customers",
    customers.topSearchTerms.length > 0 || customers.expandedQuestions.length > 0,
    "No customer search terms found."
  );
  setSectionStatus(
    sectionStatuses,
    "opportunities",
    opportunities.keywordGaps.length > 0 || opportunities.risingKeywords.length > 0,
    "No opportunity keywords found."
  );
  setSectionStatus(
    sectionStatuses,
    "socialCalendar",
    socialCalendar.posters.length > 0 || socialCalendar.stories.length > 0,
    "No Notion content found."
  );
  setSectionStatus(sectionStatuses, "decisions", decisions.length > 0, null);
  const diagnostics = buildAdvancedDiagnostics({
    accountId,
    country,
    dateRange,
    cacheKey,
    discovery,
    keywordCandidates,
    keywordData,
    peopleAlsoAskTerms,
    googleUsage,
    metaCreativeRows,
    googleImageCreativeRows,
    googleVideoCreativeRows,
    sectionStatuses,
  });

  const payload: AdvancedReportPayload = {
    metadata: {
      schemaVersion: ADVANCED_REPORT_SCHEMA_VERSION,
      cacheKey,
      accountId,
      accountPlatform,
      companyName,
      country,
      dateRange,
      generatedAt: new Date().toISOString(),
      cached: false,
    },
    diagnostics,
    basicOverallReport,
    finalUrlPerformance,
    auctionVisibility: auctionVisibility ?? undefined,
    metaCreativeAnalysis: metaCreativeAnalysis ?? undefined,
    googleVisualCreativeAnalysis: googleVisualCreativeAnalysis ?? undefined,
    googleVideoCreativeAnalysis: googleVideoCreativeAnalysis ?? undefined,
    googleAdsUsage: {
      keywordRowsWithSpend: googleUsage.keywordRows,
      finalUrlRowsWithSpend: googleUsage.finalUrlRows,
    },
    market,
    competitors,
    customers,
    opportunities,
    socialCalendar,
    decisions,
    warnings: dedupeStrings(warnings),
    sectionStatuses,
  };

  console.info(
    `[advanced-report] generation finished report_type=advanced account_id=${accountId || "missing"} period=${dateRange.startDate}_${dateRange.endDate} google_keyword_rows=${googleUsage.keywordRows.length} google_final_url_rows=${googleUsage.finalUrlRows.length} meta_creative_rows=${metaCreativeRows.length} google_image_creative_rows=${googleImageCreativeRows.length} google_video_creative_rows=${googleVideoCreativeRows.length} ai_status=${summarizeAdvancedAiStatus(payload)} warning_count=${payload.warnings.length}`
  );

  return payload;
}

export function buildFinalUrlPerformanceSection(rows: GoogleFinalUrlSpendRow[]): AdvancedFinalUrlPerformanceSection {
  const sortedRows = rows
    .map(createFinalUrlPerformanceRow)
    .sort(compareFinalUrlPerformanceRows);
  const hasOtherRows = sortedRows.length > 10;
  const topRows = hasOtherRows ? sortedRows.slice(0, 9) : sortedRows.slice(0, 10);
  const otherRows = hasOtherRows ? sortedRows.slice(9) : [];

  return {
    rows: topRows,
    otherRow: otherRows.length > 0 ? buildOtherFinalUrlPerformanceRow(otherRows) : null,
    totalUrlCount: sortedRows.length,
    generatedAt: new Date().toISOString(),
  };
}

function createFinalUrlPerformanceRow(row: GoogleFinalUrlSpendRow, index: number): AdvancedFinalUrlPerformanceRow {
  const spend = safeNumber(row.cost);
  const impressions = safeNumber(row.impressions);
  const clicks = safeNumber(row.clicks);
  const conversions = safeNumber(row.conversions);
  const finalUrl = safeText(row.finalUrl);

  return {
    id: safeText(row.id) || finalUrl || `final-url-${index + 1}`,
    finalUrl: finalUrl || "Not available",
    campaign: formatFinalUrlCampaignNames(row.campaignNames),
    spend,
    impressions,
    clicks,
    ctr: impressions > 0 ? (clicks * 100) / impressions : null,
    cpc: clicks > 0 ? spend / clicks : null,
    conversions,
    cpa: conversions > 0 ? spend / conversions : null,
    conversionRate: clicks > 0 ? (conversions * 100) / clicks : null,
    impressionShare: normalizeNullableNumber(row.impressionShare),
    lostImpressionShareBudget: normalizeNullableNumber(row.lostImpressionShareBudget),
    lostImpressionShareRank: normalizeNullableNumber(row.lostImpressionShareRank),
    impressionShareSource: row.impressionShareSource,
  };
}

function compareFinalUrlPerformanceRows(
  left: AdvancedFinalUrlPerformanceRow,
  right: AdvancedFinalUrlPerformanceRow
): number {
  if (right.conversions !== left.conversions) {
    return right.conversions - left.conversions;
  }
  return right.spend - left.spend;
}

function buildOtherFinalUrlPerformanceRow(rows: AdvancedFinalUrlPerformanceRow[]): AdvancedFinalUrlPerformanceRow {
  const totals = rows.reduce(
    (acc, row) => ({
      spend: acc.spend + safeNumber(row.spend),
      impressions: acc.impressions + safeNumber(row.impressions),
      clicks: acc.clicks + safeNumber(row.clicks),
      conversions: acc.conversions + safeNumber(row.conversions),
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
  );

  return {
    id: "other-final-urls",
    finalUrl: "Other URLs",
    campaign: `${rows.length} URLs`,
    spend: totals.spend,
    impressions: totals.impressions,
    clicks: totals.clicks,
    ctr: totals.impressions > 0 ? (totals.clicks * 100) / totals.impressions : null,
    cpc: totals.clicks > 0 ? totals.spend / totals.clicks : null,
    conversions: totals.conversions,
    cpa: totals.conversions > 0 ? totals.spend / totals.conversions : null,
    conversionRate: totals.clicks > 0 ? (totals.conversions * 100) / totals.clicks : null,
    impressionShare: aggregateFinalUrlPercent(rows, (row) => row.impressionShare),
    lostImpressionShareBudget: aggregateFinalUrlPercent(rows, (row) => row.lostImpressionShareBudget),
    lostImpressionShareRank: aggregateFinalUrlPercent(rows, (row) => row.lostImpressionShareRank),
    impressionShareSource: rows.some((row) => row.impressionShareSource === "ad_group")
      ? "ad_group"
      : rows.find((row) => row.impressionShareSource)?.impressionShareSource ?? null,
    sourceUrlCount: rows.length,
  };
}

function aggregateFinalUrlPercent(
  rows: AdvancedFinalUrlPerformanceRow[],
  selector: (row: AdvancedFinalUrlPerformanceRow) => number | null
): number | null {
  const weighted = rows.reduce(
    (acc, row) => {
      const value = selector(row);
      if (!Number.isFinite(value)) {
        return acc;
      }
      const weight = row.impressions > 0 ? row.impressions : 1;
      return {
        sum: acc.sum + Number(value) * weight,
        weight: acc.weight + weight,
      };
    },
    { sum: 0, weight: 0 }
  );

  return weighted.weight > 0 ? weighted.sum / weighted.weight : null;
}

function formatFinalUrlCampaignNames(campaignNames: string[]): string {
  const names = (Array.isArray(campaignNames) ? campaignNames : [])
    .map((name) => safeText(name))
    .filter(Boolean);
  if (names.length === 0) {
    return "Not available";
  }
  if (names.length <= 2) {
    return names.join(", ");
  }
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

export function buildAuctionVisibilitySection(input: {
  accountId: string;
  accountPlatform: "google" | "meta" | "unknown";
  auctionRows: AuctionInsightRow[];
  finalUrlRows: GoogleFinalUrlSpendRow[];
}): AdvancedAuctionVisibilitySection | null {
  if (input.accountPlatform !== "google") {
    logAdvancedAuctionHiddenReason(input.accountId, "Advanced auction visibility is Google Ads only.");
    return null;
  }

  const ownDomains = getFinalUrlDomains(input.finalUrlRows);
  const normalizedAuctionRows = input.auctionRows
    .map(normalizeAdvancedAuctionRow)
    .filter((row): row is AuctionInsightRow => Boolean(row))
    .filter(hasMeaningfulAuctionMetrics);
  const ownAuctionRows = normalizedAuctionRows.filter((row) => ownDomains.has(normalizeDomain(row.displayDomain)));
  const competitorRows = normalizedAuctionRows
    .filter((row) => !ownDomains.has(normalizeDomain(row.displayDomain)))
    .slice(0, 20);
  const auctionShareOfVoice = aggregateAuctionShareOfVoice(ownAuctionRows);
  const fallbackShareOfVoice = aggregateFinalUrlImpressionShare(input.finalUrlRows);
  const shareOfVoice = auctionShareOfVoice ?? fallbackShareOfVoice;

  if (!Number.isFinite(shareOfVoice)) {
    logAdvancedAuctionHiddenReason(
      input.accountId,
      normalizedAuctionRows.length > 0
        ? "Auction rows were returned, but the client domain could not be matched and no campaign impression share fallback was available."
        : "No auction rows or campaign impression share fallback were available."
    );
    return null;
  }

  if (competitorRows.length === 0) {
    logAdvancedAuctionHiddenReason(
      input.accountId,
      normalizedAuctionRows.length > 0
        ? "Only client auction visibility was available, so the competitor table is hidden."
        : "Competitor auction rows were unavailable, so the section will use impression share fallback only."
    );
  }

  return {
    shareOfVoice: shareOfVoice!,
    shareOfVoiceSource: auctionShareOfVoice !== null ? "auction_insights" : "impression_share_fallback",
    rows: competitorRows.map((row) => ({
      ...row,
      competitor: row.displayDomain,
    })),
    generatedAt: new Date().toISOString(),
  };
}

async function buildMetaCreativeAnalysisSection(input: {
  accountId: string;
  dateRange: DateRangeConfig;
  rows: MetaCreativePerformanceRow[];
}): Promise<AdvancedMetaCreativeAnalysisSection | null> {
  const selectedRows = selectTopMetaCreatives(input.rows);
  if (selectedRows.length === 0) {
    return null;
  }

  const analyzedRows = await Promise.all(selectedRows.map(async (row): Promise<AdvancedMetaCreativeAnalysisRow> => {
    let analysisSource: AdvancedMetaCreativeAnalysisRow["analysisSource"] = "metric_fallback";
    let aiStatus: AdvancedCreativeAiStatus = "skipped";
    let analysis = buildMetricMetaCreativeAnalysis(row);

    if (row.mediaType === "image" && canUseOpenAiMetaImageAnalysis(row) && process.env.OPENAI_API_KEY?.trim()) {
      const result = await resolveCachedMetaCreativeAnalysis({
        accountId: input.accountId,
        dateRange: input.dateRange,
        row,
        fallback: analysis,
        generator: () => generateMetaImageCreativeAnalysis(row, analysis),
        logLabel: "OpenAI Meta image creative analysis",
      });
      analysis = result.analysis;
      aiStatus = result.aiStatus;
      if (result.aiStatus !== "fallback") {
          analysisSource = "openai_image";
      }
    } else if (
      row.mediaType === "video" &&
      canUseOpenRouterMetaVideoAnalysis(row) &&
      process.env.OPENROUTER_API_KEY?.trim()
    ) {
      const result = await resolveCachedMetaCreativeAnalysis({
        accountId: input.accountId,
        dateRange: input.dateRange,
        row,
        fallback: analysis,
        generator: () => generateMetaVideoCreativeAnalysis(row, analysis),
        logLabel: "OpenRouter Gemini Meta video creative analysis",
      });
      analysis = result.analysis;
      aiStatus = result.aiStatus;
      if (result.aiStatus !== "fallback") {
          analysisSource = "openrouter_gemini_video";
      }
    }

    analysis = normalizeMetaCreativeAnalysis(analysis, analysis);
    return {
      id: row.id,
      finalUrl: row.finalUrl,
      mediaType: row.mediaType,
      imageUrl: row.imageUrl,
      videoUrl: row.videoUrl,
      thumbnailUrl: row.thumbnailUrl,
      campaignName: row.campaignName,
      adName: row.adName,
      primaryText: row.primaryText,
      headline: row.headline,
      description: row.description,
      spend: safeNumber(row.cost),
      impressions: safeNumber(row.impressions),
      reach: safeNumber(row.reach),
      clicks: safeNumber(row.clicks),
      ctr: normalizeNullableNumber(row.ctr),
      conversions: safeNumber(row.conversions),
      cpa: normalizeNullableNumber(row.cpa),
      themes: analysis.themes,
      reasons: analysis.reasons,
      analysisSource,
      aiStatus,
    };
  }));

  return {
    rows: analyzedRows,
    generatedAt: new Date().toISOString(),
  };
}

function selectTopMetaCreatives(rows: MetaCreativePerformanceRow[]): MetaCreativePerformanceRow[] {
  const byFinalUrl = new Map<string, MetaCreativePerformanceRow[]>();
  rows.forEach((row) => {
    const finalUrl = row.finalUrl.trim();
    if (!finalUrl) {
      return;
    }

    const items = byFinalUrl.get(finalUrl) ?? [];
    items.push(row);
    byFinalUrl.set(finalUrl, items);
  });

  return Array.from(byFinalUrl.values())
    .map((group) => [...group].sort(compareMetaCreatives)[0])
    .filter((row): row is MetaCreativePerformanceRow => Boolean(row))
    .sort(compareMetaCreatives)
    .slice(0, 3);
}

function compareMetaCreatives(
  left: MetaCreativePerformanceRow,
  right: MetaCreativePerformanceRow
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

async function buildGoogleVisualCreativeSection(input: {
  accountId: string;
  dateRange: DateRangeConfig;
  rows: GoogleImageCreativePerformanceRow[];
}): Promise<AdvancedGoogleVisualCreativeSection | null> {
  const selectedRows = selectTopGoogleVisualCreatives(input.rows);
  if (selectedRows.length === 0) {
    return null;
  }

  const analyzedRows = await Promise.all(selectedRows.map(async (row): Promise<AdvancedGoogleVisualCreativeRow> => {
    let analysisSource: AdvancedGoogleVisualCreativeRow["analysisSource"] = "metric_fallback";
    let aiStatus: AdvancedCreativeAiStatus = "skipped";
    let reasons = buildMetricCreativeReasons(row);
    if (canUseOpenAiImageAnalysis(row) && process.env.OPENAI_API_KEY?.trim()) {
      const result = await resolveCachedGoogleCreativeReasons({
        accountId: input.accountId,
        dateRange: input.dateRange,
        platform: "google",
        adId: row.adId,
        creativeId: row.assetId,
        finalUrl: row.finalUrl,
        mediaUrl: row.imageUrl,
        fallback: reasons,
        generator: () => generateGoogleVisualCreativeReasons(row),
        logLabel: "OpenAI Google image creative analysis",
      });
      reasons = result.reasons;
      aiStatus = result.aiStatus;
      if (result.aiStatus !== "fallback") {
        analysisSource = "openai_image";
      }
    }

    reasons = normalizeCreativeReasons({ reasons }, reasons);
    return {
      id: row.id,
      finalUrl: row.finalUrl,
      imageUrl: row.imageUrl,
      campaignName: row.campaignName,
      adName: row.adName,
      headline: row.headline,
      description: row.description,
      spend: safeNumber(row.cost),
      impressions: safeNumber(row.impressions),
      clicks: safeNumber(row.clicks),
      ctr: normalizeNullableNumber(row.ctr),
      conversions: safeNumber(row.conversions),
      cpa: normalizeNullableNumber(row.cpa),
      reasons,
      analysisSource,
      aiStatus,
    };
  }));

  return {
    rows: analyzedRows,
    generatedAt: new Date().toISOString(),
  };
}

function selectTopGoogleVisualCreatives(
  rows: GoogleImageCreativePerformanceRow[]
): GoogleImageCreativePerformanceRow[] {
  const byFinalUrl = new Map<string, GoogleImageCreativePerformanceRow[]>();
  rows.forEach((row) => {
    const finalUrl = row.finalUrl.trim();
    const imageUrl = row.imageUrl.trim();
    if (!finalUrl || !imageUrl) {
      return;
    }

    const items = byFinalUrl.get(finalUrl) ?? [];
    items.push(row);
    byFinalUrl.set(finalUrl, items);
  });

  return Array.from(byFinalUrl.values())
    .map((group) => [...group].sort(compareGoogleVisualCreatives)[0])
    .filter((row): row is GoogleImageCreativePerformanceRow => Boolean(row))
    .sort(compareGoogleVisualCreatives)
    .slice(0, 3);
}

function compareGoogleVisualCreatives(
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

async function buildGoogleVideoCreativeSection(input: {
  accountId: string;
  dateRange: DateRangeConfig;
  rows: GoogleVideoCreativePerformanceRow[];
}): Promise<AdvancedGoogleVideoCreativeSection | null> {
  const selectedRows = selectTopGoogleVideoCreatives(input.rows);
  if (selectedRows.length === 0) {
    return null;
  }

  const analyzedRows = await Promise.all(selectedRows.map(async (row): Promise<AdvancedGoogleVideoCreativeRow> => {
    let analysisSource: AdvancedGoogleVideoCreativeRow["analysisSource"] = "metric_fallback";
    let aiStatus: AdvancedCreativeAiStatus = "skipped";
    let reasons = buildMetricVideoCreativeReasons(row);
    if (canUseOpenRouterVideoAnalysis(row) && process.env.OPENROUTER_API_KEY?.trim()) {
      const result = await resolveCachedGoogleCreativeReasons({
        accountId: input.accountId,
        dateRange: input.dateRange,
        platform: "google",
        adId: row.adId,
        creativeId: row.assetId ?? row.youtubeVideoId,
        finalUrl: row.finalUrl,
        mediaUrl: row.videoUrl,
        fallback: reasons,
        generator: () => generateGoogleVideoCreativeReasons(row),
        logLabel: "OpenRouter Gemini Google video creative analysis",
      });
      reasons = result.reasons;
      aiStatus = result.aiStatus;
      if (result.aiStatus !== "fallback") {
        analysisSource = "openrouter_gemini_video";
      }
    }

    reasons = normalizeCreativeReasons({ reasons }, reasons);
    return {
      id: row.id,
      finalUrl: row.finalUrl,
      videoUrl: row.videoUrl,
      thumbnailUrl: row.thumbnailUrl,
      youtubeVideoId: row.youtubeVideoId,
      campaignName: row.campaignName,
      adName: row.adName,
      headline: row.headline,
      description: row.description,
      spend: safeNumber(row.cost),
      impressions: safeNumber(row.impressions),
      views: safeNumber(row.views),
      clicks: safeNumber(row.clicks),
      ctr: normalizeNullableNumber(row.ctr),
      conversions: safeNumber(row.conversions),
      cpa: normalizeNullableNumber(row.cpa),
      reasons,
      analysisSource,
      aiStatus,
    };
  }));

  return {
    rows: analyzedRows,
    generatedAt: new Date().toISOString(),
  };
}

function selectTopGoogleVideoCreatives(
  rows: GoogleVideoCreativePerformanceRow[]
): GoogleVideoCreativePerformanceRow[] {
  const byFinalUrl = new Map<string, GoogleVideoCreativePerformanceRow[]>();
  rows.forEach((row) => {
    const finalUrl = row.finalUrl.trim();
    if (!finalUrl || (!row.videoUrl?.trim() && !row.youtubeVideoId?.trim())) {
      return;
    }

    const items = byFinalUrl.get(finalUrl) ?? [];
    items.push(row);
    byFinalUrl.set(finalUrl, items);
  });

  return Array.from(byFinalUrl.values())
    .map((group) => [...group].sort(compareGoogleVideoCreatives)[0])
    .filter((row): row is GoogleVideoCreativePerformanceRow => Boolean(row))
    .sort(compareGoogleVideoCreatives)
    .slice(0, 3);
}

function compareGoogleVideoCreatives(
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

type MetaCreativeAnalysis = { themes: string[]; reasons: string[] };

async function resolveCachedMetaCreativeAnalysis(input: {
  accountId: string;
  dateRange: DateRangeConfig;
  row: MetaCreativePerformanceRow;
  fallback: MetaCreativeAnalysis;
  generator: () => Promise<MetaCreativeAnalysis>;
  logLabel: string;
}): Promise<{ analysis: MetaCreativeAnalysis; aiStatus: AdvancedCreativeAiStatus }> {
  const mediaUrl = input.row.mediaType === "image" ? input.row.imageUrl : input.row.videoUrl;
  const cacheKey = buildAdvancedCreativeAiCacheKey({
    accountId: input.accountId,
    platform: "meta",
    adId: input.row.adId,
    creativeId: input.row.creativeId,
    finalUrl: input.row.finalUrl,
    dateRange: input.dateRange,
    mediaUrl,
  });
  const normalizedFallback = normalizeMetaCreativeAnalysis(input.fallback, input.fallback);
  const cached = await readAdvancedCreativeAiCache(cacheKey);
  if (cached) {
    return {
      analysis: normalizeMetaCreativeAnalysis(cached, normalizedFallback),
      aiStatus: "cached",
    };
  }

  try {
    const generated = normalizeMetaCreativeAnalysis(await input.generator(), normalizedFallback);
    await writeAdvancedCreativeAiCache(cacheKey, {
      accountId: input.accountId,
      platform: "meta",
      adId: input.row.adId,
      creativeId: input.row.creativeId,
      finalUrl: input.row.finalUrl,
      dateRange: input.dateRange,
      mediaUrl,
    }, generated);
    return { analysis: generated, aiStatus: "generated" };
  } catch (error) {
    logAdvancedAiError(input.logLabel, input.accountId, input.row.id, error);
    return { analysis: normalizedFallback, aiStatus: "fallback" };
  }
}

async function resolveCachedGoogleCreativeReasons(input: {
  accountId: string;
  dateRange: DateRangeConfig;
  platform: "google";
  adId?: string | null;
  creativeId?: string | null;
  finalUrl: string;
  mediaUrl: string | null;
  fallback: string[];
  generator: () => Promise<string[]>;
  logLabel: string;
}): Promise<{ reasons: string[]; aiStatus: AdvancedCreativeAiStatus }> {
  const cacheKey = buildAdvancedCreativeAiCacheKey(input);
  const normalizedFallback = normalizeCreativeReasons({ reasons: input.fallback }, input.fallback);
  const cached = await readAdvancedCreativeAiCache(cacheKey);
  if (cached) {
    return {
      reasons: normalizeCreativeReasons({ reasons: cached.reasons }, normalizedFallback),
      aiStatus: "cached",
    };
  }

  try {
    const generated = normalizeCreativeReasons({ reasons: await input.generator() }, normalizedFallback);
    await writeAdvancedCreativeAiCache(cacheKey, input, { reasons: generated });
    return { reasons: generated, aiStatus: "generated" };
  } catch (error) {
    logAdvancedAiError(input.logLabel, input.accountId, input.creativeId || input.adId || "creative", error);
    return { reasons: normalizedFallback, aiStatus: "fallback" };
  }
}

async function generateMetaImageCreativeAnalysis(
  row: MetaCreativePerformanceRow,
  fallback: MetaCreativeAnalysis
): Promise<MetaCreativeAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || !canUseOpenAiMetaImageAnalysis(row)) {
    return fallback;
  }

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["themes", "reasons"],
    properties: {
      themes: {
        type: "array",
        minItems: 0,
        maxItems: 3,
        items: { type: "string" },
      },
      reasons: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: { type: "string" },
      },
    },
  };

  const response = await fetchWithTimeout(OPENAI_RESPONSES_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ADVANCED_REPORT_META_CREATIVE_OPENAI_MODEL?.trim() || process.env.ADVANCED_REPORT_CREATIVE_OPENAI_MODEL?.trim() || "gpt-4.1-mini",
      store: true,
      input: [
        {
          role: "system",
          content:
            "You are a senior Meta Ads creative analyst. Return strict JSON only. Never claim visual details unless they are visible in the image.",
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildMetaCreativeAnalysisPrompt(
                row,
                fallback,
                "Explain exactly 3 reasons why this Meta image creative performed best for its final URL."
              ),
            },
            {
              type: "input_image",
              image_url: row.imageUrl,
              detail: "low",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "meta_creative_analysis",
          strict: true,
          schema,
        },
      },
    }),
    cache: "no-store",
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI Meta creative analysis failed with status ${response.status}: ${bodyText.slice(0, 220)}`);
  }

  const parsed = JSON.parse(bodyText) as {
    output?: Array<Record<string, unknown>>;
    output_text?: string;
  };
  const text = extractOpenAIOutputText(parsed);
  if (!text) {
    throw new Error("OpenAI Meta creative response did not include structured text output.");
  }

  return normalizeMetaCreativeAnalysis(JSON.parse(text) as { themes?: unknown; reasons?: unknown }, fallback);
}

async function generateMetaVideoCreativeAnalysis(
  row: MetaCreativePerformanceRow,
  fallback: MetaCreativeAnalysis
): Promise<MetaCreativeAnalysis> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey || !canUseOpenRouterMetaVideoAnalysis(row)) {
    return fallback;
  }

  const response = await fetchWithTimeout(OPENROUTER_CHAT_COMPLETIONS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:
        process.env.ADVANCED_REPORT_META_VIDEO_OPENROUTER_MODEL?.trim() ||
        process.env.ADVANCED_REPORT_VIDEO_OPENROUTER_MODEL?.trim() ||
        process.env.OPENROUTER_GEMINI_VIDEO_MODEL?.trim() ||
        "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You are a senior Meta Ads video creative analyst. Return strict JSON only using this shape: {\"themes\":[\"...\",\"...\",\"...\"],\"reasons\":[\"...\",\"...\",\"...\"]}. Never invent visual details you cannot verify from the video.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildMetaCreativeAnalysisPrompt(
                row,
                fallback,
                "Explain exactly 3 reasons why this Meta video creative performed best for its final URL."
              ),
            },
            {
              type: "video_url",
              videoUrl: {
                url: row.videoUrl,
              },
            },
          ],
        },
      ],
      response_format: {
        type: "json_object",
      },
      temperature: 0.2,
      max_tokens: 550,
      stream: false,
    }),
    cache: "no-store",
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenRouter Meta video analysis failed with status ${response.status}: ${bodyText.slice(0, 220)}`);
  }

  const parsed = JSON.parse(bodyText) as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
    }>;
  };
  const text = extractOpenRouterOutputText(parsed);
  if (!text) {
    throw new Error("OpenRouter Meta video response did not include text output.");
  }

  return normalizeMetaCreativeAnalysis(JSON.parse(text) as { themes?: unknown; reasons?: unknown }, fallback);
}

async function generateGoogleVisualCreativeReasons(
  row: GoogleImageCreativePerformanceRow
): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || !canUseOpenAiImageAnalysis(row)) {
    return buildMetricCreativeReasons(row);
  }

  const metricFallback = buildMetricCreativeReasons(row);
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["reasons"],
    properties: {
      reasons: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: { type: "string" },
      },
    },
  };

  const response = await fetchWithTimeout(OPENAI_RESPONSES_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ADVANCED_REPORT_CREATIVE_OPENAI_MODEL?.trim() || process.env.ADVANCED_REPORT_OPENAI_MODEL?.trim() || "gpt-4.1-mini",
      store: true,
      input: [
        {
          role: "system",
          content:
            "You are a senior performance marketing creative analyst. Return strict JSON only. Never claim visual details unless they are visible in the image.",
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Explain exactly 3 reasons why this Google image creative performed best for its final URL.",
                "Each reason must be one sentence, client-friendly, and based on both the visible creative and the supplied metrics where possible.",
                "Do not invent image details; if a visual element is unclear, rely on metrics and copy instead.",
                `Final URL: ${row.finalUrl}`,
                `Campaign: ${row.campaignName}`,
                `Ad name: ${row.adName}`,
                `Headline: ${row.headline ?? "Not available"}`,
                `Description: ${row.description ?? "Not available"}`,
                `Spend: RM${safeNumber(row.cost).toFixed(2)}`,
                `Impressions: ${Math.round(safeNumber(row.impressions))}`,
                `Clicks: ${Math.round(safeNumber(row.clicks))}`,
                `CTR: ${formatReasonPercent(row.ctr)}`,
                `Conversions: ${formatReasonNumber(row.conversions)}`,
                `CPA: ${formatReasonCurrency(row.cpa)}`,
                `Metric fallback options if visual reading is limited: ${metricFallback.join(" ")}`,
              ].join("\n"),
            },
            {
              type: "input_image",
              image_url: row.imageUrl,
              detail: "low",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "google_visual_creative_reasons",
          strict: true,
          schema,
        },
      },
    }),
    cache: "no-store",
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI Responses API failed with status ${response.status}: ${bodyText.slice(0, 220)}`);
  }

  const parsed = JSON.parse(bodyText) as {
    output?: Array<Record<string, unknown>>;
    output_text?: string;
  };
  const text = extractOpenAIOutputText(parsed);
  if (!text) {
    throw new Error("OpenAI creative response did not include structured text output.");
  }

  return normalizeCreativeReasons(JSON.parse(text) as { reasons?: unknown }, metricFallback);
}

async function generateGoogleVideoCreativeReasons(
  row: GoogleVideoCreativePerformanceRow
): Promise<string[]> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey || !canUseOpenRouterVideoAnalysis(row)) {
    return buildMetricVideoCreativeReasons(row);
  }

  const metricFallback = buildMetricVideoCreativeReasons(row);
  const response = await fetchWithTimeout(OPENROUTER_CHAT_COMPLETIONS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:
        process.env.ADVANCED_REPORT_VIDEO_OPENROUTER_MODEL?.trim() ||
        process.env.OPENROUTER_GEMINI_VIDEO_MODEL?.trim() ||
        "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You are a senior performance marketing video creative analyst. Return strict JSON only using this shape: {\"reasons\":[\"...\",\"...\",\"...\"]}. Never invent visual details you cannot verify from the video.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "Explain exactly 3 reasons why this Google YouTube video creative performed best for its final URL.",
                "Each reason must be one sentence, client-friendly, and based on both the video and the supplied metrics where possible.",
                "Do not invent video details; if video analysis is limited, rely on metrics and ad copy instead.",
                `Final URL: ${row.finalUrl}`,
                `Video URL: ${row.videoUrl ?? "Not available"}`,
                `Campaign: ${row.campaignName}`,
                `Ad name: ${row.adName}`,
                `Headline: ${row.headline ?? "Not available"}`,
                `Description: ${row.description ?? "Not available"}`,
                `Spend: RM${safeNumber(row.cost).toFixed(2)}`,
                `Impressions: ${Math.round(safeNumber(row.impressions))}`,
                `Views: ${Math.round(safeNumber(row.views))}`,
                `Clicks: ${Math.round(safeNumber(row.clicks))}`,
                `CTR: ${formatReasonPercent(row.ctr)}`,
                `Conversions: ${formatReasonNumber(row.conversions)}`,
                `CPA: ${formatReasonCurrency(row.cpa)}`,
                `Metric fallback options if video reading is limited: ${metricFallback.join(" ")}`,
                "Return JSON only with exactly 3 reasons.",
              ].join("\n"),
            },
            {
              type: "video_url",
              videoUrl: {
                url: row.videoUrl,
              },
            },
          ],
        },
      ],
      response_format: {
        type: "json_object",
      },
      temperature: 0.2,
      max_tokens: 450,
      stream: false,
    }),
    cache: "no-store",
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenRouter video analysis failed with status ${response.status}: ${bodyText.slice(0, 220)}`);
  }

  const parsed = JSON.parse(bodyText) as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
    }>;
  };
  const text = extractOpenRouterOutputText(parsed);
  if (!text) {
    throw new Error("OpenRouter video response did not include text output.");
  }

  return normalizeCreativeReasons(JSON.parse(text) as { reasons?: unknown }, metricFallback);
}

function canUseOpenAiImageAnalysis(row: GoogleImageCreativePerformanceRow): boolean {
  try {
    const url = new URL(row.imageUrl);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function canUseOpenAiMetaImageAnalysis(row: MetaCreativePerformanceRow): boolean {
  const imageUrl = row.imageUrl?.trim();
  if (!imageUrl) {
    return false;
  }

  try {
    const url = new URL(imageUrl);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function canUseOpenRouterMetaVideoAnalysis(row: MetaCreativePerformanceRow): boolean {
  const videoUrl = row.videoUrl?.trim();
  if (!videoUrl) {
    return false;
  }

  try {
    const url = new URL(videoUrl);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function canUseOpenRouterVideoAnalysis(row: GoogleVideoCreativePerformanceRow): boolean {
  const videoUrl = row.videoUrl?.trim();
  if (!videoUrl) {
    return false;
  }

  try {
    const url = new URL(videoUrl);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return url.protocol === "https:" && (hostname === "youtube.com" || hostname === "youtu.be");
  } catch {
    return false;
  }
}

function buildMetaCreativeAnalysisPrompt(
  row: MetaCreativePerformanceRow,
  fallback: MetaCreativeAnalysis,
  instruction: string
): string {
  return [
    instruction,
    "Each reason must be 1 sentence, client-friendly, and based on the creative plus the supplied metrics.",
    "Extract creative keyword themes only from the primary text, headline, and description; do not call them search keywords.",
    "Do not invent visual details; if media analysis is limited, rely on metrics and ad copy instead.",
    "Return strict JSON only with exactly this shape: {\"themes\":[\"...\",\"...\",\"...\"],\"reasons\":[\"...\",\"...\",\"...\"]}.",
    `Final URL: ${row.finalUrl}`,
    `Media type: ${row.mediaType}`,
    `Campaign: ${row.campaignName}`,
    `Ad name: ${row.adName}`,
    `Primary text: ${row.primaryText ?? "Not available"}`,
    `Headline: ${row.headline ?? "Not available"}`,
    `Description: ${row.description ?? "Not available"}`,
    `Spend: RM${safeNumber(row.cost).toFixed(2)}`,
    `Impressions: ${Math.round(safeNumber(row.impressions))}`,
    `Reach: ${Math.round(safeNumber(row.reach))}`,
    `Clicks: ${Math.round(safeNumber(row.clicks))}`,
    `CTR: ${formatReasonPercent(row.ctr)}`,
    `Leads/conversions: ${formatReasonNumber(row.conversions)}`,
    `CPA: ${formatReasonCurrency(row.cpa)}`,
    `Metric fallback reasons if media reading is limited: ${fallback.reasons.join(" ")}`,
    `Text-derived creative keyword themes: ${fallback.themes.join(", ") || "None available"}`,
  ].join("\n");
}

function normalizeMetaCreativeAnalysis(
  value: { themes?: unknown; reasons?: unknown },
  fallback: MetaCreativeAnalysis
): MetaCreativeAnalysis {
  const themes = Array.isArray(value.themes)
    ? value.themes
        .map((theme) => sanitizeCreativeTheme(typeof theme === "string" ? theme : ""))
        .filter(Boolean)
    : [];

  return {
    themes: dedupeStrings([...themes, ...fallback.themes]).slice(0, 3),
    reasons: normalizeReasonList(value.reasons, fallback.reasons),
  };
}

function normalizeCreativeReasons(value: { reasons?: unknown }, fallback: string[]): string[] {
  return normalizeReasonList(value.reasons, fallback);
}

function normalizeReasonList(value: unknown, fallback: string[]): string[] {
  const generated = Array.isArray(value)
    ? value
        .map((reason) => sanitizeReasonSentence(typeof reason === "string" ? reason : ""))
        .filter(Boolean)
    : [];
  const fallbackReasons = fallback
    .map((reason) => sanitizeReasonSentence(reason))
    .filter(Boolean);
  const reasons = dedupeReasons([...generated, ...fallbackReasons]);
  const pads = [
    "It generated enough delivery to make this creative useful for performance learning.",
    "Its engagement signals made it a practical reference for the landing page.",
    "Its results give the team a clear benchmark for future creative testing.",
  ];

  return dedupeReasons([...reasons, ...pads]).slice(0, 3);
}

function dedupeReasons(values: string[]): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  values.forEach((value) => {
    const key = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!value || !key || seen.has(key)) {
      return;
    }
    seen.add(key);
    results.push(value);
  });
  return results;
}

function sanitizeReasonSentence(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  const firstSentence = normalized.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? normalized;
  const shortened = firstSentence.length > 180 ? `${firstSentence.slice(0, 177).trim()}...` : firstSentence;
  return /[.!?]$/.test(shortened) ? shortened : `${shortened}.`;
}

function buildMetricCreativeReasons(row: GoogleImageCreativePerformanceRow): string[] {
  const conversions = safeNumber(row.conversions);
  const clicks = safeNumber(row.clicks);
  const impressions = safeNumber(row.impressions);
  const spend = safeNumber(row.cost);
  const ctr = normalizeNullableNumber(row.ctr);
  const cpa = normalizeNullableNumber(row.cpa);

  return [
    conversions > 0
      ? `It led this final URL on outcomes with ${formatReasonNumber(conversions)} conversions from ${formatReasonNumber(clicks)} clicks.`
      : `It provided the strongest traffic signal for this final URL with ${formatReasonNumber(clicks)} clicks from ${formatReasonNumber(impressions)} impressions.`,
    cpa !== null
      ? `Its ${formatReasonCurrency(cpa)} CPA shows the spend converted efficiently for this landing page.`
      : `Its ${formatReasonCurrency(spend)} spend created enough delivery to judge the creative against the other image ads for this URL.`,
    ctr !== null
      ? `Its ${formatReasonPercent(ctr)} CTR shows the creative and copy attracted clicks from the served impressions.`
      : `Its click and impression volume made it the clearest image creative to learn from for this URL.`,
  ];
}

function buildMetricVideoCreativeReasons(row: GoogleVideoCreativePerformanceRow): string[] {
  const conversions = safeNumber(row.conversions);
  const clicks = safeNumber(row.clicks);
  const impressions = safeNumber(row.impressions);
  const views = safeNumber(row.views);
  const spend = safeNumber(row.cost);
  const ctr = normalizeNullableNumber(row.ctr);
  const cpa = normalizeNullableNumber(row.cpa);

  return [
    conversions > 0
      ? `It led this final URL on outcomes with ${formatReasonNumber(conversions)} conversions from ${formatReasonNumber(clicks)} clicks and ${formatReasonNumber(views)} views.`
      : `It created the strongest video engagement signal for this final URL with ${formatReasonNumber(views)} views from ${formatReasonNumber(impressions)} impressions.`,
    cpa !== null
      ? `Its ${formatReasonCurrency(cpa)} CPA shows the video converted efficiently for this landing page.`
      : `Its ${formatReasonCurrency(spend)} spend generated enough video delivery to compare it fairly against the other YouTube creatives for this URL.`,
    ctr !== null
      ? `Its ${formatReasonPercent(ctr)} CTR shows the video and ad copy were effective at turning impressions into site visits.`
      : `Its view, click, and impression volume made it the clearest video creative to learn from for this URL.`,
  ];
}

function buildMetricMetaCreativeAnalysis(row: MetaCreativePerformanceRow): MetaCreativeAnalysis {
  const conversions = safeNumber(row.conversions);
  const clicks = safeNumber(row.clicks);
  const impressions = safeNumber(row.impressions);
  const reach = safeNumber(row.reach);
  const spend = safeNumber(row.cost);
  const ctr = normalizeNullableNumber(row.ctr);
  const cpa = normalizeNullableNumber(row.cpa);
  const themes = extractCreativeKeywordThemes([row.primaryText, row.headline, row.description]);

  return {
    themes,
    reasons: [
      conversions > 0
        ? `It produced the strongest outcome for this final URL with ${formatReasonNumber(conversions)} leads or conversions from ${formatReasonNumber(clicks)} clicks.`
        : `It provided the strongest traffic signal for this final URL with ${formatReasonNumber(clicks)} clicks from ${formatReasonNumber(impressions)} impressions.`,
      cpa !== null
        ? `Its ${formatReasonCurrency(cpa)} CPA shows the creative converted efficiently for the landing page.`
        : `Its ${formatReasonCurrency(spend)} spend gave the creative enough delivery to compare against other Meta ads for this URL.`,
      ctr !== null
        ? `Its ${formatReasonPercent(ctr)} CTR shows the message encouraged people reached by the ad to click through.`
        : `Its reach of ${formatReasonNumber(reach)} and delivery volume made it the clearest Meta creative to learn from for this URL.`,
    ],
  };
}

function extractCreativeKeywordThemes(values: Array<string | null | undefined>): string[] {
  const text = values
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  if (!text) {
    return [];
  }

  const phrases = Array.from(
    text.matchAll(/\b[A-Za-z][A-Za-z0-9&'/-]*(?:\s+[A-Za-z][A-Za-z0-9&'/-]*){1,3}\b/g)
  )
    .map((match) => sanitizeCreativeTheme(match[0]))
    .filter((phrase) => phrase && !isLowValueCreativeTheme(phrase));
  const phraseThemes = dedupeStrings(phrases).slice(0, 3);
  if (phraseThemes.length >= 3) {
    return phraseThemes;
  }

  const words = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s&'/-]/g, " ")
    .split(/\s+/)
    .map((word) => sanitizeCreativeTheme(word))
    .filter((word) => word.length > 2 && !CREATIVE_THEME_STOP_WORDS.has(word.toLowerCase()));

  return dedupeStrings([...phraseThemes, ...words]).slice(0, 3);
}

function sanitizeCreativeTheme(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")
    .trim()
    .slice(0, 60);
}

function isLowValueCreativeTheme(value: string): boolean {
  const words = value.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return true;
  }
  return words.every((word) => CREATIVE_THEME_STOP_WORDS.has(word) || word.length <= 2);
}

function formatReasonNumber(value: number | null | undefined): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return new Intl.NumberFormat("en-MY", { maximumFractionDigits: 0 }).format(Number(value));
}

function formatReasonCurrency(value: number | null | undefined): string {
  if (!Number.isFinite(value)) {
    return "Not available";
  }
  return `RM${new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value))}`;
}

function formatReasonPercent(value: number | null | undefined): string {
  if (!Number.isFinite(value)) {
    return "Not available";
  }
  return `${new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value))}%`;
}

function normalizeAdvancedAuctionRow(row: AuctionInsightRow): AuctionInsightRow | null {
  const displayDomain = row.displayDomain?.trim();
  if (!displayDomain) {
    return null;
  }

  const impressionShare = normalizeNullableNumber(row.impressionShare);
  const overlapRate = normalizeNullableNumber(row.overlapRate);
  const positionAboveRate = normalizeNullableNumber(row.positionAboveRate);
  const topOfPageRate = normalizeNullableNumber(row.topOfPageRate);
  const absoluteTopOfPageRate = normalizeNullableNumber(row.absoluteTopOfPageRate);
  const outrankingShare = normalizeNullableNumber(row.outrankingShare);
  const observations = Math.max(0, Math.round(safeNumber(row.observations)));

  if (
    impressionShare === null ||
    overlapRate === null ||
    positionAboveRate === null ||
    topOfPageRate === null ||
    absoluteTopOfPageRate === null ||
    outrankingShare === null ||
    observations <= 0
  ) {
    return null;
  }

  return {
    ...row,
    displayDomain,
    impressionShare,
    overlapRate,
    positionAboveRate,
    topOfPageRate,
    absoluteTopOfPageRate,
    outrankingShare,
    observations,
  };
}

function hasMeaningfulAuctionMetrics(row: AuctionInsightRow): boolean {
  return [
    row.impressionShare,
    row.overlapRate,
    row.positionAboveRate,
    row.topOfPageRate,
    row.absoluteTopOfPageRate,
    row.outrankingShare,
  ].some((value) => Number.isFinite(value) && Number(value) > 0);
}

function aggregateAuctionShareOfVoice(rows: AuctionInsightRow[]): number | null {
  if (rows.length === 0) {
    return null;
  }

  const weighted = rows.reduce(
    (acc, row) => {
      if (!Number.isFinite(row.impressionShare)) {
        return acc;
      }
      const weight = row.observations > 0 ? row.observations : 1;
      return {
        sum: acc.sum + row.impressionShare * weight,
        weight: acc.weight + weight,
      };
    },
    { sum: 0, weight: 0 }
  );

  return weighted.weight > 0 ? weighted.sum / weighted.weight : null;
}

function aggregateFinalUrlImpressionShare(rows: GoogleFinalUrlSpendRow[]): number | null {
  const weighted = rows.reduce(
    (acc, row) => {
      const impressionShare = normalizeNullableNumber(row.impressionShare);
      if (impressionShare === null || impressionShare <= 0) {
        return acc;
      }
      const weight = safeNumber(row.impressions) > 0 ? safeNumber(row.impressions) : 1;
      return {
        sum: acc.sum + impressionShare * weight,
        weight: acc.weight + weight,
      };
    },
    { sum: 0, weight: 0 }
  );

  return weighted.weight > 0 ? weighted.sum / weighted.weight : null;
}

function getFinalUrlDomains(rows: GoogleFinalUrlSpendRow[]): Set<string> {
  const domains = new Set<string>();
  rows.forEach((row) => {
    const domain = getHostname(row.finalUrl);
    if (domain) {
      domains.add(domain);
    }
  });
  return domains;
}

function getHostname(value: string): string | null {
  try {
    return normalizeDomain(new URL(value).hostname);
  } catch {
    return null;
  }
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, "");
}

function logAdvancedAuctionHiddenReason(accountId: string, reason: string) {
  console.info(`[advanced-report] auction visibility hidden account_id=${accountId || "missing"} reason=${reason}`);
}

function logAdvancedAiError(scope: string, accountId: string, creativeId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(
    `[advanced-report] creative AI fallback scope=${scope} account_id=${accountId || "missing"} creative_id=${creativeId || "missing"} error=${message}`
  );
}

function resolveAdvancedAiKeyStatus(): string {
  const statuses = [
    process.env.OPENAI_API_KEY?.trim() ? "openai_configured" : "openai_missing",
    process.env.OPENROUTER_API_KEY?.trim() ? "openrouter_configured" : "openrouter_missing",
    getDataForSeoCredentials() ? "dataforseo_configured" : "dataforseo_missing",
  ];
  return statuses.join(",");
}

function summarizeAdvancedAiStatus(payload: AdvancedReportPayload): string {
  const creativeStatuses = [
    ...(payload.metaCreativeAnalysis?.rows.map((row) => row.aiStatus) ?? []),
    ...(payload.googleVisualCreativeAnalysis?.rows.map((row) => row.aiStatus) ?? []),
    ...(payload.googleVideoCreativeAnalysis?.rows.map((row) => row.aiStatus) ?? []),
  ];
  const counts = creativeStatuses.reduce<Record<string, number>>((acc, status) => {
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
  const creativeSummary =
    Object.entries(counts)
      .map(([status, count]) => `${status}:${count}`)
      .join(",") || "creative_ai:none";
  const discoveryStatus = payload.diagnostics.openAi.responseId ? "market_discovery:generated" : "market_discovery:fallback";

  return `${discoveryStatus};${creativeSummary}`;
}

function normalizeNullableNumber(value: number | null | undefined): number | null {
  return Number.isFinite(value) ? Number(value) : null;
}

function safeNumber(value: number | null | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

function safeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function refreshAdvancedReportCompanyName(payload: AdvancedReportPayload): Promise<AdvancedReportPayload> {
  let basicOverallReport = payload.basicOverallReport;
  let resolvedCompanyName = getResolvedCompanyName(basicOverallReport?.companyName);

  if (!resolvedCompanyName && /^Account\s+/i.test(payload.metadata.companyName)) {
    basicOverallReport = await fetchBasicOverallReport({
      accountId: payload.metadata.accountId,
      accountPlatform: payload.metadata.accountPlatform,
      dateRange: payload.metadata.dateRange,
    }).catch(() => undefined);
    resolvedCompanyName = getResolvedCompanyName(basicOverallReport?.companyName);
  }

  if (!resolvedCompanyName || payload.metadata.companyName === resolvedCompanyName) {
    return payload;
  }

  const previousCompanyName = payload.metadata.companyName;
  const competitors = {
    ...payload.competitors,
    demandShare: relabelClientShareRows(payload.competitors.demandShare, previousCompanyName, resolvedCompanyName),
    marketPlayerShares: relabelClientShareRows(
      payload.competitors.marketPlayerShares,
      previousCompanyName,
      resolvedCompanyName
    ),
  };

  return {
    ...payload,
    metadata: {
      ...payload.metadata,
      companyName: resolvedCompanyName,
    },
    basicOverallReport,
    competitors,
  };
}

function getResolvedCompanyName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || /^Account\s+/i.test(trimmed) || trimmed === "Company Name") {
    return null;
  }

  return trimmed;
}

function relabelClientShareRows<T extends { label: string; type?: "client" | "competitor" }>(
  rows: T[],
  previousCompanyName: string,
  resolvedCompanyName: string
): T[] {
  return rows.map((row) =>
    row.type === "client" || row.label === previousCompanyName
      ? {
          ...row,
          label: resolvedCompanyName,
        }
      : row
  );
}

export async function refreshAdvancedReportVolatileMedia(
  payload: AdvancedReportPayload
): Promise<AdvancedReportPayload> {
  const renamedPayload = await refreshAdvancedReportCompanyName(payload);

  if (renamedPayload !== payload) {
    payload = renamedPayload;
  }

  if (!hasExpiredOrExpiringMediaUrls(payload)) {
    return payload;
  }

  const warnings: string[] = [];
  const refreshedSocialCalendar = await fetchSocialCalendar(payload.metadata.companyName, warnings).catch(
    (error: unknown) => {
      warnings.push(toWarning("Notion social content refresh", error));
      return null;
    }
  );

  if (
    !refreshedSocialCalendar ||
    (refreshedSocialCalendar.posters.length === 0 && refreshedSocialCalendar.stories.length === 0)
  ) {
    return payload;
  }

  return {
    ...payload,
    socialCalendar: refreshedSocialCalendar,
    sectionStatuses: {
      ...payload.sectionStatuses,
      socialCalendar: { status: "success", message: null },
    },
    warnings: dedupeStrings([...payload.warnings, ...warnings]),
  };
}

async function resolveAdvancedCompanyName(
  accountId: string,
  accountPlatform: "google" | "meta" | "unknown",
  dateRange: DateRangeConfig,
  basicOverallReport?: OverallReportPayload
): Promise<string> {
  const credentials = getCredentials();
  const mapped = resolveCompanyNameFromAccountId(
    {
      companyName: credentials.companyName,
      companyNameMap: credentials.companyNameMap,
      accountId,
      metaAccountId: accountPlatform === "meta" ? accountId : null,
      googleAccountId: accountPlatform === "google" ? accountId : null,
    },
    { fallback: false }
  );

  if (mapped) {
    return mapped;
  }

  const basicCompanyName = getResolvedCompanyName(basicOverallReport?.companyName);
  if (basicCompanyName) {
    return basicCompanyName;
  }

  if (accountPlatform === "google") {
    const keywordReport = await getTopKeywordsReport({
      accountId: null,
      metaAccountId: null,
      googleAccountId: accountId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    }).catch(() => null);

    if (keywordReport?.companyName && !keywordReport.companyName.startsWith("Account ")) {
      return keywordReport.companyName;
    }
  }

  return accountId ? `Account ${accountId}` : credentials.companyName;
}

async function fetchGoogleAdvancedUsage(
  accountId: string,
  dateRange: DateRangeConfig
): Promise<{ keywordRows: TopKeywordRow[]; finalUrlRows: GoogleFinalUrlSpendRow[]; warnings: string[] }> {
  return getGoogleAdvancedAdUsageReport({
    accountId: null,
    metaAccountId: null,
    googleAccountId: accountId,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });
}

async function fetchBasicOverallReport(input: {
  accountId: string;
  accountPlatform: "google" | "meta" | "unknown";
  dateRange: DateRangeConfig;
}) {
  return getOverallReport({
    accountId: input.accountPlatform === "unknown" ? input.accountId : null,
    metaAccountId: input.accountPlatform === "meta" ? input.accountId : null,
    googleAccountId: input.accountPlatform === "google" ? input.accountId : null,
    startDate: input.dateRange.startDate,
    endDate: input.dateRange.endDate,
  });
}

async function fetchGoogleAdvancedAuctionRows(
  accountId: string,
  dateRange: DateRangeConfig
): Promise<AuctionInsightRow[]> {
  const result = await getGoogleAdvancedAuctionInsightRows({
    accountId: null,
    metaAccountId: null,
    googleAccountId: accountId,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  if (result.warnings.length > 0) {
    logAdvancedAuctionHiddenReason(accountId, result.warnings.join(" "));
  }

  return result.rows;
}

async function fetchMetaAdvancedCreatives(
  accountId: string,
  dateRange: DateRangeConfig
): Promise<MetaCreativePerformanceRow[]> {
  const result = await getMetaAdvancedCreativeRows({
    accountId: null,
    metaAccountId: accountId,
    googleAccountId: null,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  return result.rows;
}

async function fetchGoogleAdvancedImageCreatives(
  accountId: string,
  dateRange: DateRangeConfig
): Promise<GoogleImageCreativePerformanceRow[]> {
  const result = await getGoogleAdvancedImageCreativeRows({
    accountId: null,
    metaAccountId: null,
    googleAccountId: accountId,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  return result.rows;
}

async function fetchGoogleAdvancedVideoCreatives(
  accountId: string,
  dateRange: DateRangeConfig
): Promise<GoogleVideoCreativePerformanceRow[]> {
  const result = await getGoogleAdvancedVideoCreativeRows({
    accountId: null,
    metaAccountId: null,
    googleAccountId: accountId,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  return result.rows;
}

async function discoverMarket(input: {
  companyName: string;
  country: AdvancedReportCountry;
  googleUsage: { keywordRows: TopKeywordRow[]; finalUrlRows: GoogleFinalUrlSpendRow[] };
  warnings: string[];
  feedback?: MarketDiscoveryFeedback;
}): Promise<MarketDiscovery> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    input.warnings.push("OpenAI API key is missing. Using account-name based keyword discovery fallback.");
    return buildFallbackDiscovery(input.companyName);
  }

  const schema = {
    type: "object",
    additionalProperties: false,
    required: [
      "clientBrandTerms",
      "competitorBrands",
      "productCategories",
      "seedKeywords",
      "customerQuestions",
      "keywordGroups",
      "sourceUrls",
    ],
    properties: {
      clientBrandTerms: {
        type: "array",
        description: "Own-brand search phrases and brand variants only.",
        items: { type: "string" },
        maxItems: 12,
      },
      competitorBrands: {
        type: "array",
        description: "Direct competing brand names only, plus brand + product/service phrases. Do not include vs, versus, compare, review, or generic category-only phrases.",
        items: { type: "string" },
        maxItems: 16,
      },
      productCategories: {
        type: "array",
        description: "Generic product or service category phrases likely to have search volume.",
        items: { type: "string" },
        maxItems: 24,
      },
      seedKeywords: {
        type: "array",
        description: "Mixed commercial, informational, local, offer, and problem-aware keyword phrases.",
        items: { type: "string" },
        maxItems: 40,
      },
      customerQuestions: {
        type: "array",
        description: "Question-style searches customers may ask before buying.",
        items: { type: "string" },
        maxItems: 24,
      },
      keywordGroups: {
        type: "object",
        description: "Grouped keyword candidates for downstream search-volume lookup.",
        additionalProperties: false,
        required: [
          "generalProductService",
          "english",
          "malay",
          "chinese",
          "competitor",
          "problemNeed",
          "offerPromotion",
          "locationAware",
        ],
        properties: {
          generalProductService: { type: "array", items: { type: "string" }, maxItems: 24 },
          english: { type: "array", items: { type: "string" }, maxItems: 18 },
          malay: { type: "array", items: { type: "string" }, maxItems: 18 },
          chinese: { type: "array", items: { type: "string" }, maxItems: 18 },
          competitor: {
            type: "array",
            description: "Brand-to-brand search comparison inputs only as direct brand and brand + product/service phrases, e.g. 'Brand A', 'Brand A massage chair', 'Brand A warranty'. Do not use 'Brand A vs Brand B' phrases.",
            items: { type: "string" },
            maxItems: 20,
          },
      problemNeed: { type: "array", items: { type: "string" }, maxItems: 18 },
      offerPromotion: { type: "array", items: { type: "string" }, maxItems: 18 },
      locationAware: { type: "array", items: { type: "string" }, maxItems: 18 },
        },
      },
      sourceUrls: {
        type: "array",
        description: "Useful source URLs used for business category or competitor discovery.",
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "url"],
          properties: {
            title: { type: "string" },
            url: { type: "string" },
          },
        },
      },
    },
  };

  const model = process.env.ADVANCED_REPORT_OPENAI_MODEL?.trim() || "gpt-5.5";
  const googleKeywordContext = input.googleUsage.keywordRows
    .slice(0, 25)
    .map((row) => `${row.keyword} (spend RM${row.cost.toFixed(2)}, clicks ${row.clicks})`)
    .join("; ");
  const finalUrlContext = input.googleUsage.finalUrlRows
    .slice(0, 8)
    .map((row) => `${row.finalUrl} (spend RM${row.cost.toFixed(2)})`)
    .join("; ");
  const promptSummary =
    input.feedback
      ? "Retry broad market keyword discovery after weak DataForSEO coverage. Expand into adjacent, intent-equivalent, multilingual, and competitor/category phrases."
      : "Discover grouped market, competitor, customer-question, multilingual, and commercial keyword candidates using account name, Google Ads spend keywords, and final URLs.";
  const feedbackContext = input.feedback
    ? [
        `Feedback loop attempt: ${input.feedback.attempt}`,
        `Previous keyword candidates sent to DataForSEO: ${input.feedback.previousKeywordCount}`,
        `Rows returned with search volume data: ${input.feedback.returnedRows}`,
        input.feedback.volumeSamples.length
          ? `Keywords that returned volume: ${input.feedback.volumeSamples.join("; ")}`
          : "No previous keywords returned useful volume.",
        input.feedback.zeroVolumeSamples.length
          ? `Weak or zero-volume keyword samples to avoid repeating exactly: ${input.feedback.zeroVolumeSamples.join("; ")}`
          : "",
        "Retry instruction: think beyond exact ad keywords. Add adjacent buyer-intent wording, synonyms, short generic category phrases, local-language phrases, competitor brand + product/service variants, problem-led phrases, and offer searches that a real user would type into Google. Do not add 'vs' competitor-comparison phrases.",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const response = await fetchWithTimeout(OPENAI_RESPONSES_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: true,
      reasoning: { effort: "medium" },
      tools: [
        {
          type: "web_search",
          search_context_size: "medium",
          user_location: {
            type: "approximate",
            country: input.country.code,
            timezone: input.country.timezone,
          },
        },
      ],
      input: [
        {
          role: "system",
          content:
            "You are a senior performance marketing strategist and SEO keyword researcher. Return concise JSON only using the provided schema. Prioritise short Google-searchable keyword phrases likely to have monthly search volume in the selected country.",
        },
        {
          role: "user",
          content: [
            `Client/account: ${input.companyName}`,
            `Country: ${input.country.locationName}`,
            googleKeywordContext ? `Google Ads keywords with spend > RM1 last period: ${googleKeywordContext}` : "",
            finalUrlContext ? `Running ad final URLs from last period: ${finalUrlContext}` : "",
            feedbackContext,
            "Task: infer the actual business category, likely competitors, own-brand terms, product/service categories, broad non-brand seed keywords, multilingual local terms, and recent customer questions.",
            "Best-practice keyword rules: prefer 2-5 word phrases, include exact category terms, commercial modifiers, price/promo terms, problem/need terms, local intent terms, and competitor alternatives. Avoid slogans, full sentences, one-off campaign names, URLs, emojis, symbols, and phrases longer than 10 words.",
            "Competitor rules: this report uses share-of-market by brand demand. Return competitor terms as direct brand demand only: competitor brand names, competitor brand + product/service, competitor brand + offer, and competitor brand + requirement. Do not return 'vs', 'versus', 'compare', 'comparison', or review-style competitor keywords because they distort brand share.",
            "For opportunity discovery, include recently discussed customer requirements, unresolved forum/review pains, seasonal next-month offers, promotion hooks, product features, and adjacent product/service needs that may not already be in ads.",
            "Group keywords clearly into general product/service, language buckets, competitor, problem/need, offer/promotion, and location-aware buckets. For Malay and Chinese, use natural local search wording, not direct word-for-word translations if locals would search differently.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "advanced_market_discovery",
          strict: true,
          schema,
        },
      },
    }),
    cache: "no-store",
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI Responses API failed with status ${response.status}: ${bodyText.slice(0, 220)}`);
  }

  const parsed = JSON.parse(bodyText) as {
    id?: string;
    model?: string;
    output?: Array<Record<string, unknown>>;
    output_text?: string;
  };
  const text = extractOpenAIOutputText(parsed);
  if (!text) {
    throw new Error("OpenAI response did not include structured text output.");
  }

  return {
    ...sanitizeDiscovery(JSON.parse(text) as Partial<MarketDiscovery>, input.companyName),
    responseId: parsed.id ?? null,
    model: parsed.model ?? model,
    promptSummary,
    attempts: input.feedback?.attempt ?? 1,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getAdvancedAiTimeoutMs());
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`AI request timed out after ${getAdvancedAiTimeoutMs()}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getAdvancedAiTimeoutMs(): number {
  const configured = Number(process.env.ADVANCED_REPORT_AI_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : ADVANCED_REPORT_AI_TIMEOUT_MS;
}

function extractOpenAIOutputText(response: { output?: Array<Record<string, unknown>>; output_text?: string }): string | null {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  for (const item of response.output ?? []) {
    if (item.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }
    for (const content of item.content as Array<Record<string, unknown>>) {
      if (typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return null;
}

function extractOpenRouterOutputText(response: {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}): string | null {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((item) => item.text?.trim() ?? "").find(Boolean) ?? null;
  }
  return null;
}

async function fetchKeywordVolumes(
  batches: KeywordCandidateBatch[],
  country: AdvancedReportCountry,
  dateRange: DateRangeConfig,
  warnings: string[]
): Promise<DataForSeoKeywordResult[]> {
  const credentials = getDataForSeoCredentials();
  if (!credentials) {
    warnings.push("DataForSEO credentials are missing. Keyword volume sections will show empty states.");
    return [];
  }

  const cleanBatches = batches
    .map((batch) => ({
      ...batch,
      keywords: dedupeStrings(batch.keywords)
        .map(cleanDataForSeoKeyword)
        .filter((keyword) => keyword.length > 1 && keyword.length <= 80 && keyword.split(/\s+/).length <= 10)
        .slice(0, 180),
    }))
    .filter((batch) => batch.keywords.length > 0);

  if (!cleanBatches.length) {
    return [];
  }

  const results: DataForSeoKeywordResult[] = [];
  const dateTo = getDataForSeoDateTo(dateRange.endDate);
  for (const batch of cleanBatches) {
    for (const keywordChunk of chunkArray(batch.keywords, 1000)) {
      const response = await fetch(`${DATAFORSEO_BASE_URL}/v3/keywords_data/google_ads/search_volume/live`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${credentials.login}:${credentials.password}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          {
            keywords: keywordChunk,
            location_name: country.locationName,
            language_name: batch.dataForSeoLanguage,
            date_from: getDataForSeoDateFrom(),
            date_to: dateTo,
            search_partners: false,
            sort_by: "search_volume",
          },
        ]),
        cache: "no-store",
      });

      const json = (await response.json()) as DataForSeoResponse;
      if (!response.ok) {
        throw new Error(`DataForSEO search volume failed with status ${response.status}.`);
      }

      json.tasks?.forEach((task) => {
        if (task.status_code && task.status_code !== 20000) {
          warnings.push(`DataForSEO ${batch.language} task returned ${task.status_code}: ${task.status_message ?? "Unknown task status"}.`);
        }
      });

      const taskResults = json.tasks?.flatMap((task) => task.result ?? []) ?? [];
      for (const item of taskResults) {
        const keyword = item.keyword?.trim();
        if (!keyword) {
          continue;
        }
        results.push({
          keyword,
          language: batch.language,
          searchVolume: Number(item.search_volume ?? 0),
          cpc: typeof item.cpc === "number" ? item.cpc : null,
          sourceGroup: batch.sourceGroup,
          monthlySearches: (item.monthly_searches ?? [])
            .map((point) => ({
              month: `${point.year}-${String(point.month).padStart(2, "0")}`,
              value: Number(point.search_volume ?? 0),
            }))
            .filter((point) => /^\d{4}-\d{2}$/.test(point.month)),
        });
      }
    }
  }

  return results;
}

async function fetchPeopleAlsoAskTerms(
  keywords: string[],
  country: AdvancedReportCountry,
  warnings: string[]
): Promise<string[]> {
  const credentials = getDataForSeoCredentials();
  if (!credentials || keywords.length === 0) {
    return [];
  }

  const terms: string[] = [];
  for (const keyword of keywords.slice(0, 4)) {
    const response = await fetch(`${DATAFORSEO_BASE_URL}/v3/serp/google/organic/live/advanced`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.login}:${credentials.password}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          keyword,
          location_name: country.locationName,
          language_name: "English",
          device: "desktop",
          os: "windows",
          depth: 20,
        },
      ]),
      cache: "no-store",
    });

    if (!response.ok) {
      warnings.push(`DataForSEO SERP request failed for "${keyword}" with status ${response.status}.`);
      continue;
    }

    const json = (await response.json()) as DataForSeoSerpResponse;
    const items = json.tasks?.flatMap((task) => task.result?.flatMap((result) => result.items ?? []) ?? []) ?? [];
    items.forEach((item) => collectSerpQuestions(item, terms));
  }

  return dedupeStrings(terms).slice(0, 20);
}

async function fetchSocialCalendar(
  companyName: string,
  warnings: string[]
): Promise<{ posters: AdvancedSocialCalendarItem[]; stories: AdvancedSocialCalendarItem[] }> {
  const credentials = getCredentials();
  const databaseId = extractNotionDatabaseId(
    process.env.ADVANCED_REPORT_CONTENT_DATABASE_ID?.trim() || DEFAULT_CONTENT_DATABASE_ID
  );
  if (!credentials.notionAccessToken || !databaseId) {
    warnings.push("Notion content database is not configured. Social calendar section will show an empty state.");
    return { posters: [], stories: [] };
  }

  const pages = await queryNotionDatabasePages({
    notionAccessToken: credentials.notionAccessToken,
    notionDatabaseId: databaseId,
    pageSize: 30,
  });

  const items = pages.map((page, index) =>
    mapSocialCalendarItem(page.id ?? `notion-${index}`, page.properties ?? {}, companyName)
  );
  const sortedItems = items.sort(compareSocialCalendarItemsByDate);
  return {
    posters: sortedItems
      .filter((item) => item.referenceImageUrls.length > 0 || item.captionTemplate)
      .map((item) => ({ ...item, type: "poster" as const }))
      .slice(0, 10),
    stories: sortedItems
      .filter((item) => item.referenceVideoStoryboardUrls.length > 0 || item.videoStoryboardNotes)
      .map((item) => ({ ...item, type: "story" as const }))
      .slice(0, 10),
  };
}

function mapSocialCalendarItem(
  id: string,
  properties: Record<string, NotionPageProperty | undefined>,
  fallbackTitle: string
): AdvancedSocialCalendarItem {
  const title =
    readNotionText(properties, ["Content Idea", "Name", "Title", "Content", "Post Name"]) ?? fallbackTitle;
  const typeText = readNotionText(properties, ["Type", "Format", "Content Type", "Section"])?.toLowerCase() ?? "";
  const referenceImageUrls = readNotionFileUrls(properties, ["Reference Image", "Image", "Poster"]);
  const referenceVideoStoryboardUrls = readNotionFileUrls(properties, [
    "Reference Video Storyboard",
    "Video Storyboard",
    "Storyboard",
  ]);
  const referenceVideoStoryboardText =
    readNotionText(properties, ["Reference Video Storyboard", "Video Storyboard", "Storyboard"]) ??
    referenceVideoStoryboardUrls[0] ??
    null;

  return {
    id,
    title,
    type: typeText.includes("story") || typeText.includes("video") ? "story" : "poster",
    referenceImageUrl: referenceImageUrls[0] ?? null,
    referenceImageUrls,
    captionTemplate: readNotionText(properties, ["Caption Template", "Caption", "Copy"]),
    referenceVideoStoryboard: referenceVideoStoryboardText,
    referenceVideoStoryboardUrls,
    videoStoryboardNotes: readNotionText(properties, ["Video Storyboard Notes", "Storyboard Notes", "Notes"]),
    date: readNotionDate(properties, ["Date", "Publish Date", "Publishing Date"]),
  };
}

function compareSocialCalendarItemsByDate(a: AdvancedSocialCalendarItem, b: AdvancedSocialCalendarItem): number {
  if (!a.date && !b.date) {
    return a.title.localeCompare(b.title);
  }
  if (!a.date) {
    return 1;
  }
  if (!b.date) {
    return -1;
  }
  return a.date.localeCompare(b.date);
}

function buildMarketSection(
  keywordData: DataForSeoKeywordResult[],
  googleSpendByKeyword: Map<string, number>,
  accountPlatform: "google" | "meta" | "unknown"
) {
  const monthlyTotals = aggregateMonthlyTotals(keywordData);
  const latestByKeyword = aggregateLatestKeywordVolumes(keywordData);
  const allKeywords = latestByKeyword.map((item) =>
    decorateGoogleUsage(item, googleSpendByKeyword, accountPlatform)
  );
  const topKeywords = allKeywords.slice(0, 15).map((item) =>
    decorateGoogleUsage(item, googleSpendByKeyword, accountPlatform)
  );

  const unusedHighVolumeKeywords =
    accountPlatform === "google"
      ? allKeywords
          .filter((item) => (googleSpendByKeyword.get(normalizeKeyword(item.keyword)) ?? 0) < 1)
          .slice(0, 10)
      : [];

  return {
    searchVolumeTrend: {
      points: monthlyTotals.slice(-12),
      forecast: forecastNextMonths(monthlyTotals, 3),
    },
    languageBreakdown: buildLanguageBreakdown(keywordData),
    topKeywords,
    unusedHighVolumeKeywords,
    allKeywords,
    trendKeywords: latestByKeyword,
  };
}

function buildCompetitorSection(keywordData: DataForSeoKeywordResult[], discovery: MarketDiscovery, companyName: string) {
  const latestByKeyword = aggregateLatestKeywordVolumes(keywordData);
  const clientTerms = new Set(discovery.clientBrandTerms.map(normalizeKeyword));
  const directCompetitorTerms = dedupeStrings([
    ...discovery.competitorBrands,
    ...discovery.keywordGroups.competitor,
  ]).filter((term) => !isComparisonKeyword(term));
  const competitorTerms = new Set(directCompetitorTerms.map(normalizeKeyword));
  const nonComparisonLatest = latestByKeyword.filter((item) => !isComparisonKeyword(item.keyword));
  const clientValue = latestByKeyword
    .filter((item) => includesAny(item.keyword, clientTerms))
    .reduce((sum, item) => sum + item.searchVolume, 0);
  const competitorValue = nonComparisonLatest
    .filter((item) => includesAny(item.keyword, competitorTerms))
    .reduce((sum, item) => sum + item.searchVolume, 0);
  const competitorKeywordDetails = nonComparisonLatest.filter((item) => includesAny(item.keyword, competitorTerms));
  const competitorGroups = buildMarketPlayerTermGroups(directCompetitorTerms, discovery.productCategories);
  const competitorShares = Array.from(competitorGroups.entries())
    .map(([label, terms]) => {
      const value = nonComparisonLatest
        .filter((item) => includesAny(item.keyword, terms))
        .reduce((sum, item) => sum + item.searchVolume, 0);
      return { label, type: "competitor" as const, value };
    })
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const marketPlayerShares = [
    { label: companyName, type: "client" as const, value: clientValue },
    ...competitorShares,
  ].filter((item) => item.value > 0);
  const marketPlayerTotal = marketPlayerShares.reduce((sum, item) => sum + item.value, 0);
  const total = clientValue + competitorValue;

  return {
    competitorDemandTrend: aggregateMonthlyTotals(
      keywordData.filter((item) => !isComparisonKeyword(item.keyword) && includesAny(item.keyword, competitorTerms))
    ).slice(-12),
    demandShare:
      total > 0
        ? [
            { label: companyName, type: "client" as const, value: clientValue },
            { label: "Competitors", type: "competitor" as const, value: competitorValue },
          ]
        : [],
    marketPlayerShares,
    competitorKeywordDetails,
    clientSharePercent: marketPlayerTotal > 0 ? (clientValue / marketPlayerTotal) * 100 : total > 0 ? (clientValue / total) * 100 : null,
  };
}

function buildCustomerSection(
  keywordData: DataForSeoKeywordResult[],
  peopleAlsoAskTerms: string[],
  googleSpendByKeyword: Map<string, number>,
  accountPlatform: "google" | "meta" | "unknown"
): { expandedQuestions: string[]; topSearchTerms: AdvancedCustomerTerm[] } {
  const latestByKeyword = aggregateLatestKeywordVolumes(keywordData);
  const questionSet = new Set(peopleAlsoAskTerms.map(normalizeKeyword));
  const topSearchTerms = latestByKeyword.slice(0, 15).map((item) => ({
    ...decorateGoogleUsage(item, googleSpendByKeyword, accountPlatform),
    source: questionSet.has(normalizeKeyword(item.keyword)) ? "people_also_ask" as const : "keyword_data" as const,
  }));

  return {
    expandedQuestions: peopleAlsoAskTerms,
    topSearchTerms,
  };
}

function buildOpportunitySection(
  keywordData: DataForSeoKeywordResult[],
  peopleAlsoAskTerms: string[],
  discovery: MarketDiscovery
): AdvancedOpportunitySection {
  const latestByKeyword = aggregateLatestKeywordVolumes(keywordData);
  const risingKeywords = latestByKeyword
    .map((item) => {
      const history = mergeKeywordHistory(keywordData, item.keyword);
      const current = history.at(-1)?.value ?? 0;
      const previous = history.at(-2)?.value ?? 0;
      return {
        keyword: item.keyword,
        currentVolume: current,
        previousVolume: previous,
        growthPercent: previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? null : 0,
        history,
        reason:
          previous > 0
            ? "Search volume increased compared with the previous month."
            : "New growth from a previously flat or missing month.",
      };
    })
    .filter((item) => item.currentVolume > item.previousVolume)
    .sort((a, b) => (b.growthPercent ?? 999) - (a.growthPercent ?? 999))
    .slice(0, 5);

  const seasonalOpportunities = latestByKeyword
    .map((item) => detectSeasonalOpportunity(item.keyword, mergeKeywordHistory(keywordData, item.keyword)))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 5);

  const gapCandidates = [
    ...discovery.keywordGroups.generalProductService.map((keyword) => ({ keyword, category: "Product" as const })),
    ...discovery.keywordGroups.offerPromotion.map((keyword) => ({ keyword, category: "Offer" as const })),
    ...discovery.keywordGroups.problemNeed.map((keyword) => ({ keyword, category: "Requirement" as const })),
    ...peopleAlsoAskTerms.map((keyword) => ({ keyword, category: "Requirement" as const })),
    ...latestByKeyword.slice(0, 12).map((item) => ({ keyword: item.keyword, category: "Promotion" as const })),
  ];
  const seenGapKeywords = new Set<string>();
  const keywordGaps = gapCandidates
    .filter((item) => {
      const key = normalizeKeyword(item.keyword);
      if (!key || seenGapKeywords.has(key)) {
        return false;
      }
      seenGapKeywords.add(key);
      return true;
    })
    .slice(0, 12)
    .map((item) => {
      const history = mergeKeywordHistory(keywordData, item.keyword);
      const currentVolume = history.at(-1)?.value ?? 0;
      const previousVolume = history.at(-2)?.value ?? 0;
      const growthPercent = previousVolume > 0 ? ((currentVolume - previousVolume) / previousVolume) * 100 : currentVolume > 0 ? null : 0;
      const hasRisingVolume = currentVolume > previousVolume;
      return {
        keyword: item.keyword,
        category: item.category,
        currentVolume,
        previousVolume,
        growthPercent,
        history,
        hasRisingVolume,
        reason: hasRisingVolume
          ? `Search volume is rising for "${item.keyword}", so it is worth testing as a landing page, ad, or social content angle.`
          : `No rising search-volume signal was found yet for "${item.keyword}", but it remains a possible content or offer test if it matches client priorities.`,
      };
    });

  return {
    keywordGaps,
    risingKeywords,
    seasonalOpportunities,
  };
}

function buildDecisionRows(
  discovery: MarketDiscovery,
  market: ReturnType<typeof buildMarketSection>,
  competitors: ReturnType<typeof buildCompetitorSection>,
  customers: ReturnType<typeof buildCustomerSection>,
  opportunities: AdvancedOpportunitySection
): AdvancedDecisionRow[] {
  const topOffer = opportunities.keywordGaps[0]?.keyword ?? market.topKeywords[0]?.keyword ?? "new market need";
  const topCompetitor = discovery.competitorBrands[0] ?? "top competitor";
  const topPost = topOffer;
  const keywordToAdd = customers.topSearchTerms[0]?.keyword ?? market.topKeywords[0]?.keyword ?? "";
  const keywordToRemove = market.unusedHighVolumeKeywords.at(-1)?.keyword ?? "";

  return [
    {
      id: "new-offer",
      decisionItem: "New offer to plan based on new market needs",
      clientInput: "",
      recommendation: `Prioritise an offer around "${topOffer}" because it appears in current demand and can become a clear campaign testing angle.`,
    },
    {
      id: "competitor-strategy",
      decisionItem: "Competitor keyword strategy to mirror or ignore",
      clientInput: "",
      recommendation:
        competitors.clientSharePercent !== null && competitors.clientSharePercent < 40
          ? `Competitor demand is stronger than own-brand demand, so test competitor-adjacent terms carefully against ${topCompetitor}.`
          : `Own-brand demand is defensible; mirror only competitor terms that connect directly to high-intent offers.`,
    },
    {
      id: "social-posts",
      decisionItem: "Selected social media posts to continue planning",
      clientInput: "",
      recommendation: `Continue posts that support "${topPost}" because it connects content planning back to search demand.`,
    },
    {
      id: "keywords-add",
      decisionItem: "Keywords to add",
      clientInput: "",
      recommendation: keywordToAdd
        ? `Add "${keywordToAdd}" because it has visible demand and can be tested in ads or content.`
        : "Add keywords only after search volume data is available.",
    },
    {
      id: "keywords-remove",
      decisionItem: "Keywords to remove",
      clientInput: "",
      recommendation: keywordToRemove
        ? `Review "${keywordToRemove}" because it is high-volume but appears underused or unfunded in Google Ads.`
        : "Remove or deprioritise low-intent terms after campaign spend data is available.",
    },
  ];
}

function buildLanguageBreakdown(keywordData: DataForSeoKeywordResult[]) {
  const trends: AdvancedLanguageTrend[] = (["English", "Malay", "Chinese"] as const).map((language) => {
    const languageRows = keywordData.filter((item) => item.language === language);
    const points = aggregateMonthlyTotals(languageRows).slice(-12);
    return {
      language,
      points,
      latestVolume: points.at(-1)?.value ?? 0,
    };
  });

  return {
    trends,
    share: trends.map((trend) => ({ language: trend.language, value: trend.latestVolume })),
    keywordDetails: {
      English: aggregateLatestKeywordVolumes(keywordData.filter((item) => item.language === "English")).slice(0, 40),
      Malay: aggregateLatestKeywordVolumes(keywordData.filter((item) => item.language === "Malay")).slice(0, 40),
      Chinese: aggregateLatestKeywordVolumes(keywordData.filter((item) => item.language === "Chinese")).slice(0, 40),
    },
  };
}

function aggregateMonthlyTotals(keywordData: DataForSeoKeywordResult[]): AdvancedMonthlyPoint[] {
  const byMonth = new Map<string, number>();
  keywordData.forEach((item) => {
    item.monthlySearches.forEach((point) => {
      byMonth.set(point.month, (byMonth.get(point.month) ?? 0) + point.value);
    });
  });
  return Array.from(byMonth.entries())
    .map(([month, value]) => ({ month, value }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function aggregateLatestKeywordVolumes(keywordData: DataForSeoKeywordResult[]): AdvancedKeywordMetric[] {
  const byKeyword = new Map<string, AdvancedKeywordMetric>();
  keywordData.forEach((item) => {
    const latest = item.monthlySearches.at(-1)?.value ?? item.searchVolume;
    const key = normalizeKeyword(item.keyword);
    const existing = byKeyword.get(key);
    if (!existing || latest > existing.searchVolume) {
      byKeyword.set(key, {
        keyword: item.keyword,
        searchVolume: latest,
        language: item.language,
        cpc: item.cpc,
        sourceGroup: item.sourceGroup,
        monthlySearches: mergeKeywordHistory(keywordData, item.keyword),
      });
    }
  });
  return Array.from(byKeyword.values()).sort((a, b) => b.searchVolume - a.searchVolume);
}

function forecastNextMonths(points: AdvancedMonthlyPoint[], count: number): AdvancedForecastPoint[] {
  const history = points.slice(-12);
  if (history.length < 2) {
    return [];
  }

  const n = history.length;
  const sumX = history.reduce((sum, _point, index) => sum + index, 0);
  const sumY = history.reduce((sum, point) => sum + point.value, 0);
  const sumXY = history.reduce((sum, point, index) => sum + index * point.value, 0);
  const sumXX = history.reduce((sum, _point, index) => sum + index * index, 0);
  const slope = (n * sumXY - sumX * sumY) / Math.max(1, n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const lastMonth = history.at(-1)?.month;
  if (!lastMonth) {
    return [];
  }

  return Array.from({ length: count }, (_, index) => {
    const month = addMonths(lastMonth, index + 1);
    return {
      month,
      value: Math.max(0, Math.round(intercept + slope * (n + index))),
      forecast: true as const,
    };
  });
}

function mergeKeywordHistory(keywordData: DataForSeoKeywordResult[], keyword: string): AdvancedMonthlyPoint[] {
  return aggregateMonthlyTotals(keywordData.filter((item) => normalizeKeyword(item.keyword) === normalizeKeyword(keyword)));
}

function detectSeasonalOpportunity(keyword: string, history: AdvancedMonthlyPoint[]) {
  if (history.length < 12) {
    return null;
  }
  const latest = history.at(-1);
  if (!latest) {
    return null;
  }
  const upcomingMonth = addMonths(latest.month, 1).slice(5, 7);
  const sameMonthLastYear = history.find((point) => point.month.endsWith(`-${upcomingMonth}`));
  if (!sameMonthLastYear) {
    return null;
  }
  const sorted = [...history.slice(-12)].sort((a, b) => b.value - a.value);
  const isTopTwo = sorted.slice(0, 2).some((point) => point.month === sameMonthLastYear.month);
  if (!isTopTwo) {
    return null;
  }
  return {
    keyword,
    upcomingMonth: addMonths(latest.month, 1),
    previousYearVolume: sameMonthLastYear.value,
    reason: `${sameMonthLastYear.month} was one of the strongest months in the previous 12-month pattern.`,
    history,
  };
}

function decorateGoogleUsage(
  item: AdvancedKeywordMetric,
  googleSpendByKeyword: Map<string, number>,
  accountPlatform: "google" | "meta" | "unknown"
): AdvancedKeywordMetric {
  if (accountPlatform !== "google") {
    return item;
  }
  const spend = googleSpendByKeyword.get(normalizeKeyword(item.keyword)) ?? 0;
  return {
    ...item,
    googleAdsSpend: spend,
    isUnusedInGoogleAds: spend < 1,
  };
}

function inferAccountPlatform(accountId: string): "google" | "meta" | "unknown" {
  const trimmed = accountId.trim();
  const digitsOnly = trimmed.replace(/\D/g, "");
  if (/^\d{3}-\d{3}-\d{4}$/.test(trimmed) || digitsOnly.length === 10) {
    return "google";
  }
  if (trimmed.startsWith("act_") || digitsOnly.length >= 12) {
    return "meta";
  }
  return "unknown";
}

function buildFallbackDiscovery(companyName: string): MarketDiscovery {
  const brand = companyName.replace(/^Account\s+/i, "").trim();
  const generic = brand ? [`${brand} services`, `${brand} promotion`] : ["marketing services"];
  const seeds = brand ? [`${brand}`, `${brand} price`, `${brand} review`, `${brand} promotion`] : [];
  return {
    clientBrandTerms: brand ? [brand] : [],
    competitorBrands: [],
    productCategories: generic,
    seedKeywords: seeds,
    customerQuestions: brand ? [`what is ${brand}`, `how much is ${brand}`] : [],
    keywordGroups: {
      generalProductService: generic,
      english: seeds,
      malay: [],
      chinese: [],
      competitor: [],
      problemNeed: brand ? [`best ${brand}`, `${brand} near me`] : [],
      offerPromotion: brand ? [`${brand} promotion`, `${brand} price`] : [],
      locationAware: brand ? [`${brand} Malaysia`] : [],
    },
    sourceUrls: [],
    attempts: 1,
  };
}

function sanitizeDiscovery(value: Partial<MarketDiscovery>, companyName: string): MarketDiscovery {
  const fallback = buildFallbackDiscovery(companyName);
  const groups = value.keywordGroups ?? fallback.keywordGroups;
  return {
    clientBrandTerms: dedupeStrings(value.clientBrandTerms ?? fallback.clientBrandTerms).slice(0, 12),
    competitorBrands: dedupeStrings(value.competitorBrands ?? []).slice(0, 16),
    productCategories: dedupeStrings(value.productCategories ?? fallback.productCategories).slice(0, 24),
    seedKeywords: dedupeStrings(value.seedKeywords ?? fallback.seedKeywords).slice(0, 40),
    customerQuestions: dedupeStrings(value.customerQuestions ?? fallback.customerQuestions).slice(0, 24),
    keywordGroups: {
      generalProductService: dedupeStrings(groups.generalProductService ?? []).slice(0, 24),
      english: dedupeStrings(groups.english ?? []).slice(0, 18),
      malay: dedupeStrings(groups.malay ?? []).slice(0, 18),
      chinese: dedupeStrings(groups.chinese ?? []).slice(0, 18),
      competitor: dedupeStrings(groups.competitor ?? []).slice(0, 20),
      problemNeed: dedupeStrings(groups.problemNeed ?? []).slice(0, 18),
      offerPromotion: dedupeStrings(groups.offerPromotion ?? []).slice(0, 18),
      locationAware: dedupeStrings(groups.locationAware ?? []).slice(0, 18),
    },
    sourceUrls: (value.sourceUrls ?? [])
      .filter((item) => item.title && item.url)
      .slice(0, 10),
    responseId: value.responseId ?? null,
    model: value.model ?? null,
    promptSummary: value.promptSummary ?? null,
    attempts: value.attempts ?? 1,
  };
}

function mergeMarketDiscoveries(primary: MarketDiscovery, secondary: MarketDiscovery): MarketDiscovery {
  return {
    clientBrandTerms: dedupeStrings([...primary.clientBrandTerms, ...secondary.clientBrandTerms]).slice(0, 12),
    competitorBrands: dedupeStrings([...primary.competitorBrands, ...secondary.competitorBrands]).slice(0, 16),
    productCategories: dedupeStrings([...primary.productCategories, ...secondary.productCategories]).slice(0, 24),
    seedKeywords: dedupeStrings([...primary.seedKeywords, ...secondary.seedKeywords]).slice(0, 40),
    customerQuestions: dedupeStrings([...primary.customerQuestions, ...secondary.customerQuestions]).slice(0, 24),
    keywordGroups: {
      generalProductService: dedupeStrings([
        ...primary.keywordGroups.generalProductService,
        ...secondary.keywordGroups.generalProductService,
      ]).slice(0, 24),
      english: dedupeStrings([...primary.keywordGroups.english, ...secondary.keywordGroups.english]).slice(0, 18),
      malay: dedupeStrings([...primary.keywordGroups.malay, ...secondary.keywordGroups.malay]).slice(0, 18),
      chinese: dedupeStrings([...primary.keywordGroups.chinese, ...secondary.keywordGroups.chinese]).slice(0, 18),
      competitor: dedupeStrings([...primary.keywordGroups.competitor, ...secondary.keywordGroups.competitor]).slice(0, 20),
      problemNeed: dedupeStrings([...primary.keywordGroups.problemNeed, ...secondary.keywordGroups.problemNeed]).slice(0, 18),
      offerPromotion: dedupeStrings([
        ...primary.keywordGroups.offerPromotion,
        ...secondary.keywordGroups.offerPromotion,
      ]).slice(0, 18),
      locationAware: dedupeStrings([
        ...primary.keywordGroups.locationAware,
        ...secondary.keywordGroups.locationAware,
      ]).slice(0, 18),
    },
    sourceUrls: [...primary.sourceUrls, ...secondary.sourceUrls].slice(0, 10),
    responseId: secondary.responseId ?? primary.responseId ?? null,
    model: secondary.model ?? primary.model ?? null,
    promptSummary: secondary.promptSummary ?? primary.promptSummary ?? null,
    attempts: Math.max(primary.attempts ?? 1, secondary.attempts ?? 1),
  };
}

function buildKeywordCandidates(
  discovery: MarketDiscovery,
  googleUsage: { keywordRows: TopKeywordRow[]; finalUrlRows: GoogleFinalUrlSpendRow[] },
  country: AdvancedReportCountry
): string[] {
  const groups = discovery.keywordGroups;
  return dedupeStrings([
    ...buildGoogleKeywordCandidates(googleUsage, country),
    ...groups.generalProductService,
    ...groups.english,
    ...groups.malay,
    ...groups.chinese,
    ...groups.competitor,
    ...groups.problemNeed,
    ...groups.offerPromotion,
    ...groups.locationAware,
    ...discovery.seedKeywords,
    ...discovery.productCategories,
    ...discovery.clientBrandTerms,
    ...discovery.competitorBrands,
    ...discovery.customerQuestions,
  ]).slice(0, 220);
}

function buildKeywordCandidateBatches(
  discovery: MarketDiscovery,
  googleUsage: { keywordRows: TopKeywordRow[]; finalUrlRows: GoogleFinalUrlSpendRow[] },
  country: AdvancedReportCountry
): KeywordCandidateBatch[] {
  const groups = discovery.keywordGroups;
  const commercialEnglish = dedupeStrings([
    ...buildGoogleKeywordCandidates(googleUsage, country),
    ...groups.generalProductService,
    ...groups.english,
    ...groups.competitor,
    ...groups.problemNeed,
    ...groups.offerPromotion,
    ...groups.locationAware,
    ...discovery.seedKeywords,
    ...discovery.productCategories,
    ...discovery.clientBrandTerms,
    ...discovery.competitorBrands,
    ...discovery.customerQuestions,
  ]);

  return [
    {
      language: "English" as const,
      dataForSeoLanguage: "English",
      sourceGroup: "English market keywords",
      keywords: commercialEnglish,
    },
    {
      language: "Malay" as const,
      dataForSeoLanguage: "Malay",
      sourceGroup: "Malay market keywords",
      keywords: groups.malay,
    },
    {
      language: "Chinese" as const,
      dataForSeoLanguage: "Chinese (Simplified)",
      sourceGroup: "Chinese market keywords",
      keywords: groups.chinese,
    },
  ];
}

function shouldRetryKeywordDiscovery(
  keywordCandidates: string[],
  keywordData: DataForSeoKeywordResult[]
): boolean {
  if (keywordCandidates.length < 20) {
    return false;
  }
  const nonZeroRows = keywordData.filter((item) => item.searchVolume > 0);
  const uniqueNonZeroKeywords = new Set(nonZeroRows.map((item) => normalizeKeyword(item.keyword)));
  const hitRate = uniqueNonZeroKeywords.size / Math.max(1, keywordCandidates.length);
  return nonZeroRows.length < 20 || hitRate < 0.18;
}

function buildMarketDiscoveryFeedback(
  attempt: number,
  keywordCandidates: string[],
  keywordData: DataForSeoKeywordResult[]
): MarketDiscoveryFeedback {
  const volumeKeywords = new Set(
    keywordData
      .filter((item) => item.searchVolume > 0)
      .sort((a, b) => b.searchVolume - a.searchVolume)
      .map((item) => normalizeKeyword(item.keyword))
  );
  const volumeSamples = keywordData
    .filter((item) => item.searchVolume > 0)
    .sort((a, b) => b.searchVolume - a.searchVolume)
    .map((item) => item.keyword)
    .slice(0, 15);
  const zeroVolumeSamples = keywordCandidates
    .filter((keyword) => !volumeKeywords.has(normalizeKeyword(keyword)))
    .slice(0, 20);

  return {
    attempt,
    previousKeywordCount: keywordCandidates.length,
    returnedRows: keywordData.length,
    zeroVolumeSamples,
    volumeSamples,
  };
}

function buildGoogleKeywordCandidates(
  googleUsage: { keywordRows: TopKeywordRow[]; finalUrlRows: GoogleFinalUrlSpendRow[] },
  country: AdvancedReportCountry
): string[] {
  const candidates: string[] = [];
  googleUsage.keywordRows.slice(0, 40).forEach((row) => {
    const keyword = cleanDataForSeoKeyword(row.keyword);
    if (!keyword) {
      return;
    }
    candidates.push(keyword);
    candidates.push(`${keyword} ${country.locationName}`);
    const words = keyword.split(/\s+/).filter(Boolean);
    if (words.length >= 3) {
      candidates.push(words.slice(1).join(" "));
    }
    if (words.length >= 4) {
      candidates.push(words.slice(-3).join(" "));
    }
  });

  googleUsage.finalUrlRows.slice(0, 8).forEach((row) => {
    try {
      const url = new URL(row.finalUrl);
      const pathWords = url.pathname
        .split(/[/-]+/)
        .map(cleanDataForSeoKeyword)
        .filter((value) => value.length > 2);
      candidates.push(...pathWords);
    } catch {
      // Ignore malformed ad URLs; Google Ads API can return tracking templates or uncommon URL forms.
    }
  });

  return dedupeStrings(candidates).slice(0, 50);
}

function cleanDataForSeoKeyword(keyword: string): string {
  return keyword
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[|()[\]{}_/\\:;,.!?+*&=%$#@"'<>~`^]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function buildAdvancedDiagnostics(input: {
  accountId: string;
  country: AdvancedReportCountry;
  dateRange: DateRangeConfig;
  cacheKey: string;
  discovery: MarketDiscovery;
  keywordCandidates: string[];
  keywordData: DataForSeoKeywordResult[];
  peopleAlsoAskTerms: string[];
  googleUsage: { keywordRows: TopKeywordRow[]; finalUrlRows: GoogleFinalUrlSpendRow[] };
  metaCreativeRows: MetaCreativePerformanceRow[];
  googleImageCreativeRows: GoogleImageCreativePerformanceRow[];
  googleVideoCreativeRows: GoogleVideoCreativePerformanceRow[];
  sectionStatuses: Record<AdvancedReportSectionKey, SectionState>;
}): AdvancedReportDiagnostics {
  const processFlow: AdvancedReportDiagnostics["processFlow"] = [
    {
      step: "Resolve account context",
      status: input.accountId ? "success" : "error",
      detail: input.accountId
        ? `Using account ID ${input.accountId} for ${input.country.locationName}.`
        : "No account ID was provided.",
    },
    {
      step: "Google Ads usage",
      status:
        input.googleUsage.keywordRows.length > 0 || input.googleUsage.finalUrlRows.length > 0
          ? "success"
          : "empty",
      detail: `${input.googleUsage.keywordRows.length} keyword rows and ${input.googleUsage.finalUrlRows.length} final URL rows.`,
    },
    {
      step: "OpenAI market discovery",
      status:
        input.discovery.seedKeywords.length > 0 ||
        input.discovery.productCategories.length > 0 ||
        input.discovery.customerQuestions.length > 0
          ? "success"
          : "empty",
      detail: `${input.discovery.seedKeywords.length} seed keywords, ${input.discovery.productCategories.length} categories, ${input.discovery.competitorBrands.length} competitor terms returned.`,
    },
    {
      step: "DataForSEO search volume",
      status: input.keywordData.length > 0 ? "success" : "empty",
      detail: `${input.keywordCandidates.length} keyword candidates sent, ${input.keywordData.length} volume rows returned.`,
    },
    {
      step: "DataForSEO People Also Ask",
      status: input.peopleAlsoAskTerms.length > 0 ? "success" : "empty",
      detail: `${input.peopleAlsoAskTerms.length} related questions returned.`,
    },
    {
      step: "Google visual creative analysis",
      status: input.googleImageCreativeRows.length > 0 ? "success" : "empty",
      detail: `${input.googleImageCreativeRows.length} Google image, display, or Performance Max creative rows returned.`,
    },
    {
      step: "Google video creative analysis",
      status: input.googleVideoCreativeRows.length > 0 ? "success" : "empty",
      detail: `${input.googleVideoCreativeRows.length} Google video or YouTube creative rows returned.`,
    },
    {
      step: "Meta creative analysis",
      status: input.metaCreativeRows.length > 0 ? "success" : "empty",
      detail: `${input.metaCreativeRows.length} Meta ad creative rows returned from ad-level insights and creative metadata.`,
    },
    ...Object.entries(input.sectionStatuses).map(([key, value]) => ({
      step: `Render section: ${key}`,
      status: value.status,
      detail: value.message ?? "Section has data and rendered successfully.",
    })),
  ];

  return {
    request: {
      accountId: input.accountId,
      country: input.country.code,
      startDate: input.dateRange.startDate,
      endDate: input.dateRange.endDate,
      cacheKey: input.cacheKey,
    },
    processFlow,
    openAi: {
      model: input.discovery.model ?? process.env.ADVANCED_REPORT_OPENAI_MODEL?.trim() ?? "gpt-5.5",
      responseId: input.discovery.responseId ?? null,
      promptSummary:
        input.discovery.promptSummary ??
        "Fallback discovery was used because OpenAI metadata was not available.",
      attempts: input.discovery.attempts ?? 1,
      outputCounts: {
        clientBrandTerms: input.discovery.clientBrandTerms.length,
        competitorBrands: input.discovery.competitorBrands.length,
        productCategories: input.discovery.productCategories.length,
        seedKeywords: input.discovery.seedKeywords.length,
        customerQuestions: input.discovery.customerQuestions.length,
        keywordGroups: Object.values(input.discovery.keywordGroups).reduce((sum, items) => sum + items.length, 0),
      },
    },
    dataForSeo: {
      keywordCandidateCount: input.keywordCandidates.length,
      sampleKeywordCandidates: input.keywordCandidates.slice(0, 20),
      returnedRows: input.keywordData.length,
      peopleAlsoAskTerms: input.peopleAlsoAskTerms.length,
    },
    googleAds: {
      keywordRowsWithSpend: input.googleUsage.keywordRows.length,
      finalUrlRowsWithSpend: input.googleUsage.finalUrlRows.length,
      imageCreativeRows: input.googleImageCreativeRows.length,
      videoCreativeRows: input.googleVideoCreativeRows.length,
    },
    metaAds: {
      creativeRows: input.metaCreativeRows.length,
    },
  };
}

function getDataForSeoCredentials(): { login: string; password: string } | null {
  const login =
    process.env.DATAFORSEO_LOGIN?.trim() ||
    process.env.DATAFORSEO_USER?.trim() ||
    process.env.DATAFORSEO_USERNAME?.trim();
  const password =
    process.env.DATAFORSEO_PASSWORD?.trim() || process.env.DATAFORSEO_API_PASSWORD?.trim();
  return login && password ? { login, password } : null;
}

function getDataForSeoDateFrom(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function getDataForSeoDateTo(requestedEndDate: string): string {
  const now = new Date();
  const lastCompletedMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
    .toISOString()
    .slice(0, 10);
  return requestedEndDate > lastCompletedMonthEnd ? lastCompletedMonthEnd : requestedEndDate;
}

function collectSerpQuestions(item: Record<string, unknown>, terms: string[]) {
  if (item.type === "people_also_ask" || item.type === "people_also_search" || item.type === "related_searches") {
    const text = typeof item.title === "string" ? item.title : typeof item.text === "string" ? item.text : null;
    if (text) {
      terms.push(text);
    }
  }

  const items = item.items;
  if (Array.isArray(items)) {
    items.forEach((nested) => {
      if (nested && typeof nested === "object") {
        collectSerpQuestions(nested as Record<string, unknown>, terms);
      }
    });
  }
}

function readNotionText(
  properties: Record<string, NotionPageProperty | undefined>,
  aliases: string[]
): string | null {
  for (const alias of aliases) {
    const entry = Object.entries(properties).find(([key]) => key.toLowerCase() === alias.toLowerCase());
    const text = entry ? getNotionPropertyText(entry[1]) : null;
    if (text) {
      return text;
    }
  }
  return null;
}

function readNotionDate(
  properties: Record<string, NotionPageProperty | undefined>,
  aliases: string[]
): string | null {
  for (const alias of aliases) {
    const entry = Object.entries(properties).find(([key]) => key.toLowerCase() === alias.toLowerCase());
    const date = entry?.[1]?.date?.start?.trim();
    if (date) {
      return date;
    }
  }
  return null;
}

function readNotionFileUrls(
  properties: Record<string, NotionPageProperty | undefined>,
  aliases: string[]
): string[] {
  for (const alias of aliases) {
    const entry = Object.entries(properties).find(([key]) => key.toLowerCase() === alias.toLowerCase());
    const property = entry?.[1];
    const fileUrls =
      property?.files
        ?.map((file) => file.file?.url ?? file.external?.url ?? null)
        .filter((url): url is string => Boolean(url)) ?? [];
    const url = property?.url?.trim();
    const urls = url ? [url, ...fileUrls] : fileUrls;
    if (urls.length > 0) {
      return urls;
    }
  }
  return [];
}

function hasExpiredOrExpiringMediaUrls(payload: AdvancedReportPayload): boolean {
  const mediaUrls = [
    ...payload.socialCalendar.posters.flatMap((item) => item.referenceImageUrls),
    ...payload.socialCalendar.stories.flatMap((item) => item.referenceVideoStoryboardUrls),
  ];
  return mediaUrls.some((url) => isExpiredOrExpiringSignedUrl(url));
}

function isExpiredOrExpiringSignedUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  const signedAt = url.searchParams.get("X-Amz-Date");
  const expiresSeconds = Number(url.searchParams.get("X-Amz-Expires"));
  if (!signedAt || !Number.isFinite(expiresSeconds)) {
    return false;
  }

  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(signedAt);
  if (!match) {
    return false;
  }

  const [, year, month, day, hour, minute, second] = match;
  const signedAtMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
  const expiresAtMs = signedAtMs + expiresSeconds * 1000;
  return expiresAtMs - Date.now() <= 10 * 60 * 1000;
}

function createDefaultSectionStatuses(): Record<AdvancedReportSectionKey, SectionState> {
  return {
    market: { status: "empty", message: null },
    competitors: { status: "empty", message: null },
    customers: { status: "empty", message: null },
    opportunities: { status: "empty", message: null },
    socialCalendar: { status: "empty", message: null },
    decisions: { status: "empty", message: null },
  };
}

function setSectionStatus(
  statuses: Record<AdvancedReportSectionKey, SectionState>,
  key: AdvancedReportSectionKey,
  hasData: boolean,
  emptyMessage: string | null
) {
  statuses[key] = hasData ? { status: "success", message: null } : { status: "empty", message: emptyMessage };
}

function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isComparisonKeyword(value: string): boolean {
  return /\b(vs|versus|compare|comparison)\b/i.test(value);
}

function buildMarketPlayerTermGroups(
  terms: string[],
  productCategories: string[]
): Map<string, Set<string>> {
  const groups = new Map<string, Set<string>>();
  terms.forEach((term) => {
    const label = normalizeMarketPlayerLabel(term, productCategories);
    if (!label) {
      return;
    }
    const existing = groups.get(label) ?? new Set<string>();
    existing.add(normalizeKeyword(label));
    existing.add(normalizeKeyword(term));
    groups.set(label, existing);
  });
  return groups;
}

function normalizeMarketPlayerLabel(term: string, productCategories: string[]): string {
  const directTerm = term.split(/\b(?:vs|versus|compare|comparison)\b/i)[0] ?? term;
  const cleaned = cleanDataForSeoKeyword(directTerm);
  if (!cleaned) {
    return "";
  }
  const genericWords = new Set(
    [
      "best",
      "buy",
      "price",
      "promo",
      "promotion",
      "review",
      "reviews",
      "near",
      "me",
      "malaysia",
      "singapore",
      "australia",
      "united",
      "states",
      ...productCategories.flatMap((category) => normalizeKeyword(category).split(/\s+/)),
    ].filter((word) => word.length > 2)
  );
  const candidate = cleaned
    .split(/\s+/)
    .filter((word) => !genericWords.has(word))
    .join(" ")
    .trim();
  return candidate || cleaned;
}

function includesAny(keyword: string, terms: Set<string>): boolean {
  const normalized = normalizeKeyword(keyword);
  return Array.from(terms).some((term) => normalized.includes(term) || term.includes(normalized));
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = normalizeKeyword(trimmed);
    if (!trimmed || seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push(trimmed);
  }
  return results;
}

function addMonths(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toWarning(scope: string, error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown error.";
  return `${scope}: ${message}`;
}
