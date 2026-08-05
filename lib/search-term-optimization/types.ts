export type SafetyBand = "auto-safe" | "review-recommended" | "no-automatic-action";
export type ExecutionStatus = "not-eligible" | "review-required" | "eligible" | "published" | "failed";
export type VerificationStatus = "not-applicable" | "pending" | "verified" | "failed";

export type ScoreBreakdownItem = {
  signal: string;
  points: number;
  applied: boolean;
  status: "yes" | "no" | "unknown";
};

export type OptimizationReviewEvent = {
  id: string;
  reviewerEmail: string;
  reviewerRole: string;
  action: string;
  previousStatus: string | null;
  resultingStatus: string;
  createdAt: string;
};

export type OptimizationResult = {
  id: string;
  searchTerm: string;
  campaign: string;
  adGroup: string;
  destinationUrl: string;
  triggeringKeyword: string | null;
  matchType: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
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
  reviewDecision?: "approved" | "rejected" | "to_be_determined";
  reviewStatus?: string;
  recommendationId?: string;
  approverDecision?: "approved" | "rejected" | "returned";
  reviewHistory?: OptimizationReviewEvent[];
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
};

export type GoogleKeywordRecommendation = {
  resourceName: string;
  searchTerm: string;
  matchType: string | null;
  addedExcluded: string;
  campaign: string;
  adGroup: string;
};
