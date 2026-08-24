export const M03_PLATFORMS = ["google", "meta", "tiktok"] as const;
export type M03Platform = (typeof M03_PLATFORMS)[number];

export const M03_STATUSES = [
  "draft", "validation_in_progress", "validation_failed", "awaiting_approval", "approved",
  "conflict_detected", "ready_to_publish", "publishing", "published", "verification_in_progress",
  "verified", "partially_completed", "failed", "reverted", "cancelled", "provider_execution_locked",
] as const;
export type M03Status = (typeof M03_STATUSES)[number];

export const M03_MOCK_REACHABLE_STATUSES = [
  "draft", "validation_in_progress", "validation_failed", "awaiting_approval", "approved",
  "cancelled", "provider_execution_locked",
] as const satisfies readonly M03Status[];

export type M03ValueType = "string" | "number" | "boolean" | "json" | "null";

export type M03ChangeItemInput = {
  entity_type: string;
  entity_identity: string;
  field_path: string;
  value_type: M03ValueType;
  baseline_value: unknown;
  proposed_value: unknown;
  evidence?: Record<string, unknown>;
  platform_resource_mapping?: Record<string, unknown>;
};

export type M03MockChangeRequestInput = {
  platform: M03Platform;
  workflow_mode: "mock";
  title: string;
  reason: string;
  client_id?: string | null;
  account_identity: string;
  campaign_identity: string;
  source_m04_plan_id?: number | null;
  source_m04_revision_id?: number | null;
  source_m05_recommendation_ref?: string | null;
  rollback_of_request_id?: string | null;
  supersedes_request_id?: string | null;
  items: M03ChangeItemInput[];
  idempotency_key: string;
};

export type M03MockChangeRequestEditInput = Omit<
  M03MockChangeRequestInput,
  "platform" | "workflow_mode" | "account_identity" | "campaign_identity" | "client_id" | "idempotency_key"
> & { expected_lock_version: number; idempotency_key: string };

export type M03ValidationIssue = { path: string; message: string; severity?: "error" | "warning" };

export type M03ChangeRequestSummary = {
  id: string; platform: M03Platform; status: M03Status; title: string; reason: string;
  client_id: string | null; account_identity: string; campaign_identity: string;
  source_m04_plan_id: number | null; source_m04_revision_id: number | null;
  source_m05_recommendation_ref: string | null; rollback_of_request_id: string | null;
  supersedes_request_id: string | null; created_by_name: string; created_at: string;
  updated_at: string; lock_version: number; provider_execution_locked: true;
};

export type M03ChangeItem = M03ChangeItemInput & {
  id: string; request_id: string; validation_issues: M03ValidationIssue[];
  provider_result_evidence: Record<string, unknown>; readback_evidence: Record<string, unknown>;
  created_at: string;
};

export type M03Revision = {
  id: string; request_id: string; revision_number: number; canonical_payload: Record<string, unknown>;
  payload_hash: string; evidence: Record<string, unknown>; validation_issues: M03ValidationIssue[];
  created_by_id: string; created_at: string;
};

export type M03ValidationRecord = {
  id: string; revision_id: string; result: "passed" | "failed"; issues: M03ValidationIssue[];
  snapshot: Record<string, unknown>; created_at: string;
};

export type M03Approval = {
  id: string; revision_id: string; revision_hash: string; decision: "approved";
  comment: string | null; created_at: string;
};

export type M03AuditEvent = {
  id: number; event_type: string; from_status: M03Status | null; to_status: M03Status | null;
  actor_name: string | null; trusted_ip: string | null; metadata: Record<string, unknown>; created_at: string;
};

export type M03ChangeRequestDetail = {
  request: M03ChangeRequestSummary; items: M03ChangeItem[]; revisions: M03Revision[];
  validations: M03ValidationRecord[]; approvals: M03Approval[]; events: M03AuditEvent[];
  provider_execution_locked: true;
};

export type M03RequestListPayload = {
  requests: M03ChangeRequestSummary[];
  summary: Record<M03Status | "all", number>;
  pagination: { page: number; page_size: 10; total: number; total_pages: number };
  provider_execution_locked: true;
};

export type WorkflowSettingModule = "m03" | "m04";
export type WorkflowSettingKind = "operator_domain" | "destination_domain" | "trusted_network";
export type WorkflowSetting = {
  id: number; module: WorkflowSettingModule; kind: WorkflowSettingKind; value: string;
  label: string | null; client_id: string | null; is_active: boolean; created_at: string;
  updated_at: string | null;
};
export type WorkflowSettingsPayload = {
  m03_operator_domains: WorkflowSetting[]; m03_trusted_networks: WorkflowSetting[];
  m04_destination_domains: WorkflowSetting[]; m04_trusted_networks: WorkflowSetting[];
};
export type WorkflowSettingMutation = {
  module: WorkflowSettingModule; kind: WorkflowSettingKind; value: string; label?: string | null;
  client_id?: string | null; is_active: boolean; idempotency_key: string;
};

export type TrustedRequestContext = {
  actor_id: string; actor_name: string; actor_email: string; trusted_ip: string; user_agent: string;
};

export interface FutureM03ProviderAdapter {
  readonly platform: M03Platform;
  readonly enabled: false;
  publish(): Promise<never>;
  verify(): Promise<never>;
}

export const PROVIDER_EXECUTION_LOCKED = {
  error: "provider_execution_locked",
  message: "Provider execution is outside this dashboard-only phase.",
} as const;
