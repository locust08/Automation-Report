import type { DateRangeConfig, GoogleFinalUrlSpendRow, TopKeywordRow } from "@/lib/reporting/types";

export type AdvancedReportCountryCode = "MY" | "SG" | "AU" | "US";

export type AdvancedReportSectionKey =
  | "market"
  | "competitors"
  | "customers"
  | "opportunities"
  | "socialCalendar"
  | "decisions";

export type AdvancedReportSectionStatus = "success" | "empty" | "error";

export interface AdvancedReportCountry {
  code: AdvancedReportCountryCode;
  emoji: string;
  label: string;
  locationName: string;
  timezone: string;
}

export interface AdvancedReportMetadata {
  schemaVersion: number;
  cacheKey: string;
  accountId: string;
  accountPlatform: "google" | "meta" | "unknown";
  companyName: string;
  country: AdvancedReportCountry;
  dateRange: DateRangeConfig;
  generatedAt: string;
  cached: boolean;
}

export interface AdvancedReportDiagnostics {
  request: {
    accountId: string;
    country: AdvancedReportCountryCode;
    startDate: string;
    endDate: string;
    cacheKey: string;
  };
  processFlow: Array<{
    step: string;
    status: "success" | "empty" | "error" | "skipped";
    detail: string;
  }>;
  openAi: {
    model: string;
    responseId: string | null;
    promptSummary: string;
    attempts: number;
    outputCounts: {
      clientBrandTerms: number;
      competitorBrands: number;
      productCategories: number;
      seedKeywords: number;
      customerQuestions: number;
      keywordGroups: number;
    };
  };
  dataForSeo: {
    keywordCandidateCount: number;
    sampleKeywordCandidates: string[];
    returnedRows: number;
    peopleAlsoAskTerms: number;
  };
  googleAds: {
    keywordRowsWithSpend: number;
    finalUrlRowsWithSpend: number;
  };
}

export interface AdvancedMonthlyPoint {
  month: string;
  value: number;
}

export interface AdvancedForecastPoint extends AdvancedMonthlyPoint {
  forecast: true;
}

export interface AdvancedLanguageTrend {
  language: "English" | "Malay" | "Chinese";
  points: AdvancedMonthlyPoint[];
  latestVolume: number;
}

export interface AdvancedKeywordMetric {
  keyword: string;
  searchVolume: number;
  language?: "English" | "Malay" | "Chinese";
  cpc?: number | null;
  sourceGroup?: string | null;
  monthlySearches?: AdvancedMonthlyPoint[];
  isUnusedInGoogleAds?: boolean;
  googleAdsSpend?: number | null;
}

export interface AdvancedMarketSection {
  searchVolumeTrend: {
    points: AdvancedMonthlyPoint[];
    forecast: AdvancedForecastPoint[];
  };
  languageBreakdown: {
    trends: AdvancedLanguageTrend[];
    share: Array<{ language: AdvancedLanguageTrend["language"]; value: number }>;
    keywordDetails: Record<AdvancedLanguageTrend["language"], AdvancedKeywordMetric[]>;
  };
  topKeywords: AdvancedKeywordMetric[];
  unusedHighVolumeKeywords: AdvancedKeywordMetric[];
  allKeywords: AdvancedKeywordMetric[];
  trendKeywords: AdvancedKeywordMetric[];
}

export interface AdvancedCompetitorSection {
  competitorDemandTrend: AdvancedMonthlyPoint[];
  demandShare: Array<{ label: string; type: "client" | "competitor"; value: number }>;
  marketPlayerShares: Array<{ label: string; type: "client" | "competitor"; value: number }>;
  competitorKeywordDetails: AdvancedKeywordMetric[];
  clientSharePercent: number | null;
}

export interface AdvancedCustomerTerm extends AdvancedKeywordMetric {
  source: "people_also_ask" | "web_search" | "keyword_data";
}

export interface AdvancedCustomerSection {
  expandedQuestions: string[];
  topSearchTerms: AdvancedCustomerTerm[];
}

export interface AdvancedOpportunitySection {
  keywordGaps: Array<{
    keyword: string;
    category: "Product" | "Offer" | "Requirement" | "Promotion";
    reason: string;
    currentVolume: number;
    previousVolume: number;
    growthPercent: number | null;
    history: AdvancedMonthlyPoint[];
    hasRisingVolume: boolean;
  }>;
  risingKeywords: Array<{
    keyword: string;
    currentVolume: number;
    previousVolume: number;
    growthPercent: number | null;
    history: AdvancedMonthlyPoint[];
    reason: string;
  }>;
  seasonalOpportunities: Array<{
    keyword: string;
    upcomingMonth: string;
    previousYearVolume: number;
    reason: string;
    history: AdvancedMonthlyPoint[];
  }>;
}

export interface AdvancedSocialCalendarItem {
  id: string;
  title: string;
  type: "poster" | "story";
  referenceImageUrl: string | null;
  referenceImageUrls: string[];
  captionTemplate: string | null;
  referenceVideoStoryboard: string | null;
  referenceVideoStoryboardUrls: string[];
  videoStoryboardNotes: string | null;
  date: string | null;
}

export interface AdvancedSocialCalendarSection {
  posters: AdvancedSocialCalendarItem[];
  stories: AdvancedSocialCalendarItem[];
}

export interface AdvancedDecisionRow {
  id: string;
  decisionItem: string;
  clientInput: string;
  recommendation: string;
}

export interface AdvancedReportPayload {
  metadata: AdvancedReportMetadata;
  diagnostics: AdvancedReportDiagnostics;
  googleAdsUsage: {
    keywordRowsWithSpend: TopKeywordRow[];
    finalUrlRowsWithSpend: GoogleFinalUrlSpendRow[];
  };
  market: AdvancedMarketSection;
  competitors: AdvancedCompetitorSection;
  customers: AdvancedCustomerSection;
  opportunities: AdvancedOpportunitySection;
  socialCalendar: AdvancedSocialCalendarSection;
  decisions: AdvancedDecisionRow[];
  warnings: string[];
  sectionStatuses: Record<
    AdvancedReportSectionKey,
    {
      status: AdvancedReportSectionStatus;
      message: string | null;
    }
  >;
}

export interface AdvancedReportJobResponse {
  status: "ready" | "generating" | "missing" | "error";
  cacheKey: string;
  payload?: AdvancedReportPayload;
  message?: string;
}
