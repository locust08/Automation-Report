export type Platform = "meta" | "google" | "googleYoutube";

export type GoogleAdsHealthStage = "core" | "policy" | "delivery" | "destination";
export type GoogleAdsHealthSeverity = "critical" | "high" | "warning";
export type GoogleAdsHealthCategory =
  | "account"
  | "policy"
  | "budget"
  | "experiment"
  | "schedule"
  | "delivery"
  | "location"
  | "destination";

export interface GoogleAdsHealthResourceNode {
  resourceType: string;
  resourceId: string;
  resourceName: string;
}

export interface GoogleAdsHealthFinding {
  id: string;
  code: string;
  severity: GoogleAdsHealthSeverity;
  category: GoogleAdsHealthCategory;
  summary: string;
  details: string;
  resourceType: string;
  resourceId: string;
  resourceName: string;
  resourceHierarchy: GoogleAdsHealthResourceNode[];
  googleAdsUrl: string | null;
  notionUrl: string | null;
  destinationUrl: string | null;
}

export interface GoogleAdsHealthStagePayload {
  accountId: string;
  accountName: string;
  platform: "google";
  stage: GoogleAdsHealthStage;
  status: "completed";
  scannedAt: string;
  queriesCompleted: number;
  truncated: boolean;
  warnings: string[];
  findings: GoogleAdsHealthFinding[];
}

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
  previousValue?: number | null;
  displayValue?: string;
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
  diagnostics?: ReportPerformanceDiagnostic[];
  dataSource?: "meta_api" | "meta_csv";
}

export interface ReportPerformanceDiagnostic {
  stage: string;
  durationMs: number;
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

export interface GoogleFinalUrlSpendRow {
  id: string;
  finalUrl: string;
  campaignIds: string[];
  campaignNames: string[];
  adGroupIds: string[];
  adGroupNames: string[];
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number;
  impressionShare: number | null;
  lostImpressionShareBudget: number | null;
  lostImpressionShareRank: number | null;
  impressionShareSource: "ad_group" | "campaign" | null;
}

export interface GoogleImageCreativePerformanceRow {
  id: string;
  source: "image_ad" | "responsive_display_ad" | "performance_max_asset";
  finalUrl: string;
  campaignId: string | null;
  campaignName: string;
  adGroupId: string | null;
  adGroupName: string | null;
  adId: string | null;
  adName: string;
  adType: string;
  assetId: string | null;
  imageUrl: string;
  headline: string | null;
  description: string | null;
  impressions: number;
  clicks: number;
  ctr: number | null;
  conversions: number;
  cpa: number | null;
  cost: number;
}

export interface GoogleVideoCreativePerformanceRow {
  id: string;
  source: "video_responsive_ad" | "performance_max_youtube_asset";
  finalUrl: string;
  campaignId: string | null;
  campaignName: string;
  adGroupId: string | null;
  adGroupName: string | null;
  adId: string | null;
  adName: string;
  adType: string;
  assetId: string | null;
  videoAssetResourceName: string | null;
  youtubeVideoId: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  headline: string | null;
  description: string | null;
  impressions: number;
  views: number;
  clicks: number;
  ctr: number | null;
  conversions: number;
  cpa: number | null;
  cost: number;
}

export interface MetaCreativePerformanceRow {
  id: string;
  finalUrl: string;
  mediaType: "image" | "video";
  imageUrl: string | null;
  videoUrl: string | null;
  videoId?: string | null;
  videoSourceUrl?: string | null;
  videoPermalinkUrl?: string | null;
  thumbnailUrl: string | null;
  posterUrl?: string | null;
  mediaWarning?: string | null;
  campaignId: string | null;
  campaignName: string;
  adSetId: string | null;
  adSetName: string | null;
  adId: string | null;
  adName: string;
  creativeId: string | null;
  creativeName: string | null;
  primaryText: string | null;
  headline: string | null;
  description: string | null;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number | null;
  conversions: number;
  cpa: number | null;
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

export interface PreviewPlatformDistributionRow {
  platform: string;
  device: string;
  results: number;
  costPerResult: number | null;
}

export interface PreviewCreativeAsset {
  id: string;
  name?: string | null;
  title?: string | null;
  body?: string | null;
  description?: string | null;
  mediaType?: "image" | "video";
  imageUrl?: string | null;
  videoUrl?: string | null;
  videoId?: string | null;
  videoSourceUrl?: string | null;
  videoPermalinkUrl?: string | null;
  thumbnailUrl?: string | null;
  posterUrl?: string | null;
  mediaWarning?: string | null;
  linkUrl?: string | null;
  callToActionType?: string | null;
  objectType?: string | null;
  effectiveObjectStoryId?: string | null;
  instagramPermalinkUrl?: string | null;
  effectiveInstagramMediaId?: string | null;
  facebookPermalinkUrl?: string | null;
}

export interface PreviewLinkAsset {
  label: string;
  url: string;
  placementKey?: "facebookFeed" | "instagramFeed" | "story" | "reels" | "mobile" | null;
  placementLabel?: string | null;
  device?: "desktop" | "mobile" | null;
  adFormat?: string | null;
  previewUrl?: string | null;
  publicPostUrl?: string | null;
  linkKind?: "publicPost" | "metaPreview" | null;
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
  platformDistribution?: PreviewPlatformDistributionRow[];
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
  platformDistribution?: PreviewPlatformDistributionRow[];
  ads: PreviewAdNode[];
}

export interface PreviewCampaignNode {
  id: string;
  name: string;
  status: string;
  type?: string | null;
  objective?: string | null;
  details: PreviewDetailField[];
  performance?: PreviewPerformanceSummary | null;
  demographics?: PreviewDemographicRow[];
  platformDistribution?: PreviewPlatformDistributionRow[];
  children: PreviewAdGroupNode[];
}

export interface PreviewPlatformSection {
  platform: "meta" | "google";
  title: string;
  logoPath: string;
  accountId?: string | null;
  accountName?: string | null;
  fetchedAt?: string;
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
  | "meta-preview-demographics"
  | "meta-preview-platforms";

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
  dataSource?: "meta_api" | "meta_csv";
}

export interface RequestContext {
  accountId: string | null;
  metaAccountId: string | null;
  googleAccountId: string | null;
  startDate: string | null;
  endDate: string | null;
  campaignType: string | null;
  platform: Platform | null;
  source: "api" | "meta_csv";
}
