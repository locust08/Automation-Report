export type Platform = "meta" | "google" | "googleYoutube";

export type MetricFormat = "number" | "currency" | "percent";

export interface DateRangeConfig {
  startDate: string;
  endDate: string;
  previousStartDate: string;
  previousEndDate: string;
  currentLabel: string;
  previousLabel: string;
}

export interface SummaryMetric {
  key: string;
  label: string;
  value: number | null;
  delta: number | null;
  format: MetricFormat;
}

export interface SummarySection {
  platform: Platform;
  title: string;
  logoPath: string;
  metrics: SummaryMetric[];
}

export interface CampaignRow {
  id: string;
  platform: Platform;
  campaignType: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  results: number;
  costPerResult: number;
  spend: number;
  conversions: number;
  avgCpc: number;
  youtubeEarnedLikes: number;
  youtubeEarnedShares: number;
}

export interface CampaignGroup {
  id: string;
  platform: Platform;
  campaignType: string;
  rows: CampaignRow[];
  totals: CampaignRow;
}

export interface OverallReportPayload {
  companyName: string;
  dateRange: DateRangeConfig;
  accountIds: {
    metaAccountId: string | null;
    googleAccountId: string | null;
    metaAccountIds: string[];
    googleAccountIds: string[];
  };
  summaries: SummarySection[];
  campaignGroups: CampaignGroup[];
  warnings: string[];
}

export interface CampaignComparisonPayload {
  companyName: string;
  platform: Platform;
  campaignType: string;
  dateRange: DateRangeConfig;
  selectedMonthRows: CampaignRow[];
  previousMonthRows: CampaignRow[];
  selectedTotals: CampaignRow;
  previousTotals: CampaignRow;
  warnings: string[];
}

export interface TopKeywordRow {
  id: string;
  keyword: string;
  impressions: number;
  clicks: number;
  avgCpc: number;
  ctr: number;
  conversions: number;
  conversionRate: number;
  costPerConversion: number;
  cost: number;
}

export interface TopKeywordsPayload {
  companyName: string;
  dateRange: DateRangeConfig;
  accountIds: {
    metaAccountId: string | null;
    googleAccountId: string | null;
    metaAccountIds: string[];
    googleAccountIds: string[];
  };
  rows: TopKeywordRow[];
  totals: TopKeywordRow;
  warnings: string[];
}

export interface AuctionInsightRow {
  id: string;
  displayDomain: string;
  impressionShare: number;
  impressionShareLabel?: string;
  overlapRate: number;
  overlapRateLabel?: string;
  positionAboveRate: number;
  positionAboveRateLabel?: string;
  topOfPageRate: number;
  topOfPageRateLabel?: string;
  absoluteTopOfPageRate: number;
  absoluteTopOfPageRateLabel?: string;
  outrankingShare: number;
  outrankingShareLabel?: string;
  observations: number;
}

export interface AuctionInsightsPayload {
  companyName: string;
  dateRange: DateRangeConfig;
  accountIds: {
    metaAccountId: string | null;
    googleAccountId: string | null;
    metaAccountIds: string[];
    googleAccountIds: string[];
  };
  rows: AuctionInsightRow[];
  averages: Omit<AuctionInsightRow, "id" | "displayDomain" | "observations">;
  warnings: string[];
}

export interface InsightRow {
  id: string;
  priority: number;
  whatToChange: string;
  whyThisMatters: string;
  successMetric: string;
  decisionRule: string;
}

export interface PlatformInsightsSection {
  platform: "meta" | "google";
  title: string;
  rows: InsightRow[];
}

export interface InsightsPayload {
  companyName: string;
  dateRange: DateRangeConfig;
  accountIds: {
    metaAccountId: string | null;
    googleAccountId: string | null;
    metaAccountIds: string[];
    googleAccountIds: string[];
  };
  sections: PlatformInsightsSection[];
  warnings: string[];
}

export interface RequestContext {
  accountId: string | null;
  metaAccountId: string | null;
  googleAccountId: string | null;
  startDate: string | null;
  endDate: string | null;
  campaignType: string | null;
  platform: Platform | null;
}
