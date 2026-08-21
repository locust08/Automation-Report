export type CampaignPlatform = "google" | "meta" | "tiktok";

export type CampaignPlanStatus =
  | "draft"
  | "awaiting_approval"
  | "approved"
  | "launch_in_progress"
  | "launched";

export type CampaignBuildStatus =
  | "pending_gate_1"
  | "ready_to_deliver"
  | "verified"
  | "handoff_complete";

export type CampaignPlanAction =
  | "save_revision"
  | "submit"
  | "approve"
  | "simulate_gate_1"
  | "simulate_gate_2"
  | "create_handoff";

export type LocalModelMeta = {
  mode: "local-model";
  providerWrites: false;
};

export type CampaignActor = {
  id: string;
  email: string;
};

export type CampaignAccountOption = {
  id: number;
  clientName: string;
  platform: CampaignPlatform;
  providerAccountId: string;
  accountName: string;
  currency: string;
  timezone: string;
};

export type CampaignPackageOption = {
  id: number;
  clientName: string;
  name: string;
  currency: string;
  startDate: string;
  endDate: string;
  envelopeMicros: number;
  committedMicros: number;
  remainingMicros: number;
};

export type CampaignPlanSummary = {
  id: number;
  campaignName: string;
  clientName: string;
  platform: CampaignPlatform;
  accountName: string;
  packageName: string;
  currency: string;
  allocationMicros: number;
  startDate: string;
  endDate: string;
  objective: string;
  status: CampaignPlanStatus;
  buildStatus: CampaignBuildStatus | null;
  lockVersion: number;
  updatedAt: string;
};

export type CampaignPlanningListPayload = LocalModelMeta & {
  summary: {
    total: number;
    draft: number;
    awaitingApproval: number;
    approvedOrLaunching: number;
    launched: number;
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
  allocationMicros: number;
  dailyBudgetMicros: number;
  projectedTotalMicros: number;
  objective: string;
  destination: string;
  payload: Record<string, unknown>;
  hash: string;
  authorEmail: string;
  createdAt: string;
};

export type CampaignApproval = {
  id: number;
  revisionId: number;
  revisionHash: string;
  decision: string;
  comment: string;
  approvedByEmail: string;
  approvedAt: string;
  expiresAt: string;
} | null;

export type CampaignBuild = {
  id: number;
  status: CampaignBuildStatus;
  gate1CompletedAt: string | null;
  gate2CompletedAt: string | null;
  verifiedAt: string | null;
  lockVersion: number;
} | null;

export type CampaignResource = {
  id: number;
  logicalResourceKey: string;
  resourceType: string;
  providerResourceId: string | null;
  providerParentResourceId: string | null;
  verifiedAt: string | null;
};

export type CampaignGateAttempt = {
  id: number;
  gate: number;
  action: string;
  status: string;
  intent: Record<string, unknown>;
  outcome: Record<string, unknown>;
  startedAt: string;
  completedAt: string | null;
};

export type CampaignQaResult = {
  id: number;
  gate: number;
  resourceKey: string;
  fieldPath: string;
  expected: unknown;
  observed: unknown;
  result: string;
  evidence: Record<string, unknown>;
  createdAt: string;
};

export type CampaignAuditEvent = {
  id: number;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorEmail: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type CampaignHandoff = {
  id: number;
  providerCampaignId: string;
  providerChildIds: string[];
  evidence: Record<string, unknown>;
  createdAt: string;
} | null;

export type CampaignPlanDetail = LocalModelMeta & {
  plan: CampaignPlanSummary & {
    accountId: number;
    packageId: number;
    destination: string;
    createdBy: string;
    createdAt: string;
  };
  currentRevision: CampaignRevision;
  revisions: CampaignRevision[];
  approval: CampaignApproval;
  build: CampaignBuild;
  resources: CampaignResource[];
  attempts: CampaignGateAttempt[];
  qaResults: CampaignQaResult[];
  auditEvents: CampaignAuditEvent[];
  handoff: CampaignHandoff;
};

export type CreateCampaignPlanInput = {
  clientName: string;
  platform: CampaignPlatform;
  accountId: number;
  packageId: number;
  campaignName: string;
  objective: string;
  destination: string;
  startDate: string;
  endDate: string;
  allocationMicros: number;
  platformConfig: Record<string, string>;
};

export type CampaignPlanActionInput = {
  action: CampaignPlanAction;
  lockVersion: number;
};
