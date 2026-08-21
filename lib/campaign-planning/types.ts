import type { CampaignPlan, CampaignPlanDraftInput } from "./domain";

export type CampaignPlatform = "google" | "meta" | "tiktok";

export type CampaignPlanStatus =
  | "draft"
  | "awaiting_approval"
  | "approved"
  | "launch_in_progress"
  | "launched"
  | "cancelled";

export type CampaignDatabaseConnection = {
  status: "connected" | "disconnected";
  label: string;
};

export type LocalSupabaseStage2Meta = {
  mode: "crm08-mock-workflow";
  providerWrites: false;
  connection: CampaignDatabaseConnection;
};

export type CampaignAccountOption = {
  id: number;
  clientId: string;
  clientName: string;
  platform: CampaignPlatform;
  providerAccountId: string;
  accountName: string;
  currency: string;
  timezone: string;
};

export type CampaignPackageOption = {
  id: number;
  clientId: string;
  clientName: string;
  name: string;
  currency: string;
  startDate: string;
  endDate: string;
  envelopeAmount: number;
  committedAmount: number;
  remainingAmount: number;
};

export type CampaignPlanSummary = {
  id: number;
  campaignName: string;
  clientId: string;
  clientName: string;
  platform: CampaignPlatform;
  accountName: string;
  packageName: string;
  currency: string;
  allocatedBudget: number;
  startDate: string;
  endDate: string;
  objective: string;
  status: CampaignPlanStatus;
  lockVersion: number;
  updatedAt: string;
};

export type CampaignPlanningListPayload = LocalSupabaseStage2Meta & {
  summary: {
    total: number;
    draft: number;
    google: number;
    meta: number;
    tiktok: number;
  };
  accounts: CampaignAccountOption[];
  packages: CampaignPackageOption[];
  campaigns: CampaignPlanSummary[];
  generatedAt: string;
};

export type CampaignRevision = {
  id: number;
  revisionNo: number;
  campaignName: string;
  startDate: string;
  endDate: string;
  allocatedBudget: number;
  dailyBudget: number;
  projectedTotal: number;
  objective: string;
  destination: string;
  payload: CampaignPlan;
  canonicalJson: string;
  payloadHash: string;
  authorName: string;
  createdAt: string;
};

export type CampaignPlatformDetail = {
  platform: CampaignPlatform;
  values: Record<string, unknown>;
};

export type CampaignPlanDetail = LocalSupabaseStage2Meta & {
  plan: CampaignPlanSummary & {
    accountId: number;
    packageId: number;
    providerAccountId: string;
    timezone: string;
    destination: string;
    createdBy: string;
    createdAt: string;
  };
  currentRevision: CampaignRevision;
  revisions: CampaignRevision[];
  platformDetail: CampaignPlatformDetail;
};

export type CreateCampaignPlanInput = CampaignPlanDraftInput;
