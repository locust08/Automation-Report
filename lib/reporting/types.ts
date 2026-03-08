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

export interface RequestContext {
  accountId: string | null;
  metaAccountId: string | null;
  googleAccountId: string | null;
  startDate: string | null;
  endDate: string | null;
  campaignType: string | null;
  platform: Platform | null;
}
