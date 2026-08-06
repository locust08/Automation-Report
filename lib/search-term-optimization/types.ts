export type SafetyBand = "auto-safe" | "review-recommended" | "no-automatic-action";
export type ExecutionStatus = "not-eligible" | "review-required" | "eligible" | "published" | "failed";
export type VerificationStatus = "not-applicable" | "pending" | "verified" | "failed";
export type AnalysisScheduleFrequency = "manual" | "weekly" | "biweekly" | "monthly";

export type SearchTermAccountSettings = {
  googleCustomerId: string;
  scheduleFrequency: AnalysisScheduleFrequency;
  autoSafeScoreThreshold: number;
  reviewScoreThreshold: number;
  highSpendThreshold: number;
  minimumClicksThreshold: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

export type ScoreBreakdownItem = {
  signal: string;
  points: number;
  applied: boolean;
  status: "yes" | "no" | "unknown";
};

export type OptimizationResult = {
  id: string;
  searchTermId?: string;
  searchTermResourceName: string | null;
  searchTerm: string;
  campaignId: string | null;
  campaign: string;
  adGroupId: string | null;
  adGroup: string;
  assetGroup: string | null;
  destinationUrl: string;
  triggeringKeyword: string | null;
  matchType: string | null;
  addedExcludedStatus: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  qualifiedLeads: number | null;
  spamLeads: number | null;
  invalidLeads: number | null;
  clientComplaints: number | null;
  firstDetectedAt: string | null;
  lastReviewedAt: string | null;
  dataRetrievedAt: string;
  previousDecision: string | null;
  classification: string;
  mismatchCategory: string;
  proposedAction: string;
  explanation: string;
  safetyScore: number;
  safetyBand: SafetyBand;
  scoreBreakdown: ScoreBreakdownItem[];
  hardGateFailures: string[];
  executionEligibility: boolean;
  executionStatus: ExecutionStatus;
  verificationStatus: VerificationStatus;
  reviewDecision?: "approved" | "rejected";
  reviewStatus?: string;
  recommendationId?: string;
  approverDecision?: "accepted" | "rejected";
  priority?: "critical" | "high" | "medium" | "normal";
};

export type OptimizationChangeSet = {
  id: string;
  status: string;
  itemCount: number;
  approvedByEmail: string;
  approvedAt: string;
};

export type OptimizationDashboardPayload = {
  account: {
    customerId: string;
    customerName: string;
    reportingPeriod: { startDate: string; endDate: string };
    lastAnalysisAt: string;
    nextRunAt: string | null;
    automationEnabled: boolean;
  };
  source: {
    label: string;
    fresh: boolean;
    termsReviewed: number;
    mutatingGoogleAdsChanges: boolean;
  };
  summary: {
    totalReviewed: number;
    automaticallyExcluded: number;
    addExactRecommendations: number;
    needsReview: number;
    noAction: number;
    failedOrUnverified: number;
  };
  results: OptimizationResult[];
  history: OptimizationResult[];
  googleRecommendations: GoogleKeywordRecommendation[];
  googleRecommendationsWarning: string | null;
  changeSets: OptimizationChangeSet[];
  settings: SearchTermAccountSettings;
};

export type GoogleKeywordRecommendation = {
  resourceName: string;
  searchTerm: string;
  matchType: string | null;
  addedExcluded: string;
  campaign: string;
  adGroup: string;
};
