export type SearchTermAction =
  | "negative exact"
  | "add exact"
  | "special review needed"
  | "no action";

export type SearchTermSafetyBand = "auto_safe" | "review_recommended" | "no_automatic_action";
export type SearchTermExecutionStatus =
  | "not_eligible"
  | "pending"
  | "published"
  | "verified"
  | "failed"
  | "undone";

export type SearchTermVerificationStatus = "not_started" | "verified" | "missing" | "failed";

export type SearchTermMismatchCategory =
  | "none"
  | "competitor_brand"
  | "wrong_product"
  | "wrong_service"
  | "portal_navigation"
  | "stable_irrelevant_intent"
  | "unsupported_location"
  | "informational_research"
  | "other";

export interface SafetyScoreSignal {
  key: string;
  label: string;
  points: number;
  applied: boolean;
}

export interface SearchTermSafetyInput {
  proposedAction: SearchTermAction;
  mismatchIsClear: boolean;
  mismatchCategory: SearchTermMismatchCategory;
  conversions: number;
  hasPositiveKeywordOverlap: boolean | null;
  absentFromLandingPage: boolean | null;
  qualifiedLeads: number | null;
  clicks: number;
  cost: number;
  ambiguous: boolean;
  clientConfirmationRequired: boolean;
  automationEnabled: boolean;
  landingPageContextLoaded: boolean;
  dataFresh: boolean;
  alreadyNegative: boolean;
  hasUnresolvedDecision: boolean;
  searchTerm: string;
  matchType: "EXACT";
}

export interface SearchTermSafetyResult {
  safetyScore: number;
  safetyBand: SearchTermSafetyBand;
  scoreBreakdown: SafetyScoreSignal[];
  hardGateFailures: string[];
  executionEligibility: boolean;
}

export interface SearchTermOptimizationRecord extends SearchTermSafetyResult {
  id: string;
  runId: string;
  accountId: string;
  companyName: string;
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  destinationUrl: string | null;
  searchTerm: string;
  triggeringKeyword: string | null;
  triggeringMatchType: string | null;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  qualifiedLeads: number | null;
  classification: string;
  proposedAction: SearchTermAction;
  mismatchIsClear: boolean;
  mismatchCategory: SearchTermMismatchCategory;
  reason: string;
  clientConfirmationRequired: boolean;
  executionStatus: SearchTermExecutionStatus;
  verificationStatus: SearchTermVerificationStatus;
  googleResourceName: string | null;
  reviewedAt: string;
  executedAt: string | null;
  verifiedAt: string | null;
  undoneAt: string | null;
}

export interface SearchTermAccountSettings {
  accountId: string;
  automationEnabled: boolean;
  cadence: "off" | "weekly" | "biweekly" | "monthly";
  nextRunAt: string | null;
  updatedAt: string;
}

export interface SearchTermAnalysisRun {
  id: string;
  accountId: string;
  companyName: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  startDate: string;
  endDate: string;
  totalReviewed: number;
  error: string | null;
}

export interface SearchTermDashboardPayload {
  companyName: string;
  accountId: string;
  startDate: string;
  endDate: string;
  settings: SearchTermAccountSettings;
  latestRun: SearchTermAnalysisRun | null;
  rows: SearchTermOptimizationRecord[];
  warnings: string[];
}
