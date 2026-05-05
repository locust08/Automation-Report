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

export type AudienceClickBreakdownPlatform = "google" | "meta";

export type AudienceClickBreakdownDimension =
  | "age"
  | "gender"
  | "country"
  | "region"
  | "city";

export interface AudienceClickBreakdownItem {
  platform: AudienceClickBreakdownPlatform;
  dimension: AudienceClickBreakdownDimension;
  label: string;
  clicks: number;
}

export type GoogleAudienceClickBreakdownSource =
  | "audiences"
  | "locations"
  | "keywords"
  | "content";

export interface GoogleAudienceClickBreakdownMetricItem {
  platform: "google";
  source: GoogleAudienceClickBreakdownSource;
  dimension: AudienceClickBreakdownDimension;
  label: string;
  clicks: number;
}

export interface GoogleAudienceSourceClickItem {
  platform: "google";
  source: "keywords" | "content";
  label: string;
  clicks: number;
}

export interface AudienceBreakdownRow {
  label: string;
  clicks: number;
}

export interface AudienceClickBreakdownResponse {
  age: AudienceClickBreakdownItem[];
  gender: AudienceClickBreakdownItem[];
  location: {
    country: AudienceClickBreakdownItem[];
    region: AudienceClickBreakdownItem[];
    city: AudienceClickBreakdownItem[];
  };
}

export interface GoogleAudienceClickBreakdownResponse {
  age: GoogleAudienceClickBreakdownMetricItem[];
  gender: GoogleAudienceClickBreakdownMetricItem[];
  location: {
    country: GoogleAudienceClickBreakdownMetricItem[];
    region: GoogleAudienceClickBreakdownMetricItem[];
    city: GoogleAudienceClickBreakdownMetricItem[];
  };
  sources: {
    keywords: GoogleAudienceSourceClickItem[];
    content: GoogleAudienceSourceClickItem[];
  };
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
  audienceClickBreakdown: AudienceClickBreakdownResponse;
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

export interface PreviewDetailField {
  label: string;
  value: string;
}

export interface PreviewTextAsset {
  text: string;
  pinnedField?: string | null;
}

export interface PreviewPerformanceSummary {
  resultLabel: string;
  results: number;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number | null;
  cpm: number | null;
  costPerResult: number | null;
  landingPageViews: number;
  linkClicks: number;
}

export interface PreviewDemographicRow {
  ageRange: string;
  maleResults: number;
  femaleResults: number;
  unknownResults: number;
  maleCostPerResult: number | null;
  femaleCostPerResult: number | null;
  unknownCostPerResult: number | null;
}

export interface PreviewCreativeAsset {
  id: string;
  name?: string | null;
  title?: string | null;
  body?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  linkUrl?: string | null;
  callToActionType?: string | null;
  objectType?: string | null;
}

export interface PreviewLinkAsset {
  label: string;
  url: string;
}

export interface PreviewImageAsset {
  id: string;
  url: string;
  alt: string;
}

export interface PreviewSitelinkAsset {
  id: string;
  linkText: string;
  description1?: string | null;
  description2?: string | null;
  finalUrl?: string | null;
}

export interface PreviewAdNode {
  id: string;
  name: string;
  status: string;
  details: PreviewDetailField[];
  creative?: PreviewCreativeAsset | null;
  previewLinks?: PreviewLinkAsset[];
  performance?: PreviewPerformanceSummary | null;
  demographics?: PreviewDemographicRow[];
  finalUrl?: string | null;
  displayPathParts?: string[];
  headlines?: PreviewTextAsset[];
  descriptions?: PreviewTextAsset[];
  keywords?: string[];
  images?: PreviewImageAsset[];
  businessName?: string | null;
  businessLogoUrl?: string | null;
  sitelinks?: PreviewSitelinkAsset[];
}

export interface PreviewAdGroupNode {
  id: string;
  name: string;
  status: string;
  details: PreviewDetailField[];
  performance?: PreviewPerformanceSummary | null;
  demographics?: PreviewDemographicRow[];
  ads: PreviewAdNode[];
}

export interface PreviewCampaignNode {
  id: string;
  name: string;
  status: string;
  details: PreviewDetailField[];
  performance?: PreviewPerformanceSummary | null;
  demographics?: PreviewDemographicRow[];
  children: PreviewAdGroupNode[];
}

export interface PreviewPlatformSection {
  platform: "meta" | "google";
  title: string;
  logoPath: string;
  childLabel: "Ad Group" | "Ad Set";
  campaigns: PreviewCampaignNode[];
}

export type MetaPreviewBlockLabel =
  | "meta-preview-campaigns"
  | "meta-preview-adsets"
  | "meta-preview-ads"
  | "meta-preview-ad-creatives"
  | "meta-preview-preview-links"
  | "meta-preview-insights"
  | "meta-preview-demographics";

export interface MetaPreviewBlockDiagnostic {
  label: MetaPreviewBlockLabel;
  required: boolean;
  fields: string[];
  status: "passed" | "failed" | "empty" | "skipped";
  rowCount: number;
  errorCode: number | null;
  errorSubcode: number | null;
  message: string | null;
}

export interface MetaPreviewBlockIssue {
  label: MetaPreviewBlockLabel;
  required: boolean;
  fields: string[];
  accountId: string;
  errorCode: number | null;
  errorSubcode: number | null;
  message: string;
}

export interface MetaPreviewDiagnostics {
  accountId: string;
  blocks: MetaPreviewBlockDiagnostic[];
}

export type GooglePreviewErrorCategory =
  | "account-resolution"
  | "permission"
  | "invalid-gaql"
  | "unsupported-resource"
  | "empty-result"
  | "rate-limit"
  | "network"
  | "unknown";

export interface GooglePreviewWarning {
  code: "google-preview-warning";
  label: string;
  required: false;
  customerId: string;
  loginCustomerId: string | null;
  message: string;
  reason: string;
  category: GooglePreviewErrorCategory;
  requestId: string | null;
  errorCode: string | null;
}

export interface GooglePreviewFatalError {
  code: "google-account-resolution-failed" | "google-preview-required-block-failed";
  label: string;
  customerId: string;
  loginCustomerId: string | null;
  targetCustomerId: string;
  accessPath: string | null;
  originalAccessPath: string | null;
  resolvedAccessPath: string | null;
  fallbackUsed: boolean;
  reason: string;
  message: string;
  category: GooglePreviewErrorCategory;
  requestId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface GoogleAdsAccessPathErrorPayload {
  success: false;
  stage: "google_ads_access_path";
  errorCode: string;
  message: string;
  accountId: string;
  originalAccessPath: string | null;
  resolvedAccessPath: string | null;
  fallbackUsed: boolean;
  loginCustomerId: string | null;
  customerId: string;
  errorMessage: string;
}

export interface GooglePreviewBlockDiagnostic {
  label: string;
  required: boolean;
  status: "passed" | "failed" | "empty";
  customerId: string;
  loginCustomerId: string | null;
  rowCount: number;
  requestId: string | null;
  errorCode: string | null;
  message: string | null;
}

export interface GooglePreviewDiagnostics {
  customerId: string;
  loginCustomerId: string | null;
  resolutionMode: "direct" | "manager";
  blocks: GooglePreviewBlockDiagnostic[];
  warnings: GooglePreviewWarning[];
  fatalError: GooglePreviewFatalError | null;
}

export interface PreviewReportPayload {
  companyName: string;
  dateRange: DateRangeConfig;
  accountIds: {
    metaAccountId: string | null;
    googleAccountId: string | null;
    metaAccountIds: string[];
    googleAccountIds: string[];
  };
  sections: PreviewPlatformSection[];
  warnings: string[];
  metaWarnings?: MetaPreviewBlockIssue[];
  metaFatalErrors?: MetaPreviewBlockIssue[];
  googleWarnings?: GooglePreviewWarning[];
  googleFatalErrors?: GooglePreviewFatalError[];
  diagnostics?: {
    meta?: MetaPreviewDiagnostics[];
    google: GooglePreviewDiagnostics[];
  };
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
