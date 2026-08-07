export type PlacementWorkflowMode = "optimizer" | "approver" | "pm";
export type PlacementDecision = "exclude" | "keep" | "kiv";
export type PlacementApproverDecision = "approved" | "rejected" | "returned";

export interface PlacementReviewEvent {
  id: string;
  reviewerEmail: string;
  reviewerRole: string;
  action: string;
  resultingStatus: string;
  createdAt: string;
}

export interface PlacementOptimizationRow {
  id: string;
  resourceName: string;
  placement: string;
  displayName: string;
  placementType: string;
  targetUrl: string | null;
  campaignName: string;
  adGroupName: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  videoViews: number;
  classification: string;
  recommendedAction: PlacementDecision;
  confidence: number;
  reason: string;
  confirmationRequired: boolean;
  aiStatus: "generated" | "rules_fallback" | "not_required";
  reviewStatus: string;
  currentDecision: string | null;
  reviewHistory: PlacementReviewEvent[];
}

export interface PlacementChangeSet {
  id: string;
  status: string;
  itemCount: number;
  approvedByEmail: string;
  approvedAt: string;
}

export interface PlacementPmReport {
  id: string;
  changeSetId: string;
  accountName: string;
  itemCount: number;
  generatedAt: string;
  items: Array<Pick<PlacementOptimizationRow, "placement" | "displayName" | "placementType" | "campaignName" | "adGroupName" | "spend" | "clicks" | "conversions" | "reason">>;
}

export interface PlacementDashboardPayload {
  account: { customerId: string; customerName: string; startDate: string; endDate: string; refreshedAt: string };
  summary: { total: number; needsReview: number; awaitingApproval: number; kept: number; kiv: number; approved: number; rejected: number };
  performanceMax: {
    available: boolean;
    campaignCount: number;
    totalImpressions: number;
    uniqueSites: number;
    topSites: Array<Pick<PlacementOptimizationRow, "id" | "displayName" | "placement" | "targetUrl" | "campaignName" | "impressions">>;
  };
  rows: PlacementOptimizationRow[];
  changeSets: PlacementChangeSet[];
  reports: PlacementPmReport[];
  warnings: string[];
}

export interface ContentSuitabilityItem {
  id: string;
  value: string;
  label: string | null;
}

export interface ContentSuitabilitySection {
  key: string;
  title: string;
  available: boolean;
  unavailableReason: string | null;
  items: ContentSuitabilityItem[];
}

export interface ContentSuitabilityPayload {
  account: {
    customerId: string;
    customerName: string;
  };
  inventoryType: "Maximum" | "Moderate" | "Limited" | "Unknown";
  sections: ContentSuitabilitySection[];
  refreshedAt: string;
  source: "live" | "cache";
  stale: boolean;
  warnings: string[];
}
