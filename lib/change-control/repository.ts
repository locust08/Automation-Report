import type {
  M03Approval, M03AuditEvent, M03ChangeItem, M03ChangeRequestDetail, M03ChangeRequestSummary,
  M03MockChangeRequestEditInput, M03MockChangeRequestInput, M03Platform, M03RequestListPayload,
  M03Revision, M03Status, M03ValidationRecord, M03ProviderBaselineSnapshot, M03ProviderResourceMapping,
  M03ItemAttempt, M03SourceVerification, TrustedRequestContext, WorkflowSetting,
  M03ProviderOperationResource, M03ProviderOperationResourceRole, M03ProviderOperationResourceState,
  WorkflowSettingMutation, WorkflowSettingsPayload,
} from "@/lib/change-control/types";

type JsonObject = Record<string, unknown>;
type RequestInit = { method: "GET" | "POST" | "PATCH"; body?: JsonObject };

export class M03RepositoryError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); this.name = "M03RepositoryError"; }
}

export async function listMockChangeRequests(filters: { platform?: M03Platform; status?: M03Status; page: number }): Promise<M03RequestListPayload> {
  const rows = await request<JsonObject[]>("m03_ads_change_requests?select=*&order=updated_at.desc", { method: "GET" });
  const mapped = rows.map(mapSummary);
  const filtered = mapped.filter((row) => (!filters.platform || row.platform === filters.platform) && (!filters.status || row.status === filters.status));
  const totalPages = Math.max(1, Math.ceil(filtered.length / 10));
  const page = Math.min(filters.page, totalPages);
  const summary = Object.fromEntries(["all", ...M03_STATUS_VALUES].map((status) => [status, status === "all" ? mapped.length : mapped.filter((row) => row.status === status).length])) as M03RequestListPayload["summary"];
  return { requests: filtered.slice((page - 1) * 10, page * 10), summary, pagination: { page, page_size: 10, total: filtered.length, total_pages: totalPages }, provider_execution_locked: true };
}

export async function getMockChangeRequest(id: string): Promise<M03ChangeRequestDetail> {
  const encoded = encodeURIComponent(id);
  const [requests, items, revisions, validations, approvals, events, sourceVerifications, baselines, resourceMappings, attempts, operationResources] = await Promise.all([
    request<JsonObject[]>(`m03_ads_change_requests?select=*&id=eq.${encoded}&limit=1`, { method: "GET" }),
    request<JsonObject[]>(`m03_ads_change_items?select=*&request_id=eq.${encoded}&order=created_at.asc`, { method: "GET" }),
    request<JsonObject[]>(`m03_ads_change_request_revisions?select=*&request_id=eq.${encoded}&order=revision_number.desc`, { method: "GET" }),
    request<JsonObject[]>(`m03_ads_validation_records?select=*&request_id=eq.${encoded}&order=created_at.desc`, { method: "GET" }),
    request<JsonObject[]>(`m03_ads_change_approvals?select=*&request_id=eq.${encoded}&order=created_at.desc`, { method: "GET" }),
    request<JsonObject[]>(`m03_ads_change_events?select=*&request_id=eq.${encoded}&order=created_at.asc`, { method: "GET" }),
    optionalRows(`m03_ads_request_source_verifications?select=*&request_id=eq.${encoded}&limit=1`),
    optionalRows(`m03_ads_provider_baseline_snapshots?select=*&request_id=eq.${encoded}&order=captured_at.desc`),
    optionalRows(`m03_ads_provider_resource_mappings?select=*&request_id=eq.${encoded}&order=updated_at.desc`),
    optionalRows(`m03_ads_change_item_attempts?select=*&request_id=eq.${encoded}&order=created_at.desc`),
    optionalRows(`m03_ads_provider_operation_resources?select=*&request_id=eq.${encoded}&order=created_at.asc`),
  ]);
  if (!requests[0]) throw new M03RepositoryError("Change request was not found.", 404);
  return {
    request: mapSummary(requests[0]), items: items.map(mapItem), revisions: revisions.map(mapRevision),
    validations: validations.map(mapValidation), approvals: approvals.map(mapApproval), events: events.map(mapEvent),
    source_verification: sourceVerifications[0] ? mapSourceVerification(sourceVerifications[0]) : null,
    baselines: baselines.map(mapBaseline), resource_mappings: resourceMappings.map(mapResourceMapping),
    attempts: attempts.map(mapAttempt), operation_resources: operationResources.map(mapOperationResource),
    provider_execution_locked: true,
  };
}

export async function createPostLaunchChangeRequest(input: M03MockChangeRequestInput, source: {
  source_kind: "m04_verified_launch" | "legacy_provider_adoption";
  source_revision_hash?: string | null; evidence: Record<string, unknown>;
  baseline?: { canonical_payload: Record<string, unknown>; payload_hash: string; captured_at: string };
}, context: TrustedRequestContext): Promise<JsonObject> {
  return rpc("m03_ads_create_post_launch_change_request_v1", {
    p_platform: input.platform, p_title: input.title, p_reason: input.reason, p_client_id: input.client_id ?? null,
    p_account_identity: input.account_identity, p_campaign_identity: input.campaign_identity,
    p_source_m04_plan_id: input.source_m04_plan_id ?? null, p_source_m04_revision_id: input.source_m04_revision_id ?? null,
    p_rollback_of_request_id: input.rollback_of_request_id ?? null, p_supersedes_request_id: input.supersedes_request_id ?? null,
    p_items: input.items, p_source_kind: source.source_kind, p_source_revision_hash: source.source_revision_hash ?? null,
    p_source_evidence: source.evidence, p_baseline_payload: source.baseline?.canonical_payload ?? null,
    p_baseline_hash: source.baseline?.payload_hash ?? null, p_baseline_captured_at: source.baseline?.captured_at ?? null,
    ...contextBody(context), p_idempotency_key: input.idempotency_key,
  });
}

export async function assertM03Operator(context: TrustedRequestContext): Promise<void> {
  await rpc("m03_ads_assert_operator_v1", contextBody(context));
}

export async function editMockChangeRequest(id: string, input: M03MockChangeRequestEditInput, context: TrustedRequestContext): Promise<JsonObject> {
  return rpc("m03_ads_edit_mock_change_request_v2", {
    p_request_id: id, p_expected_lock_version: input.expected_lock_version, p_title: input.title, p_reason: input.reason,
    p_source_m04_plan_id: input.source_m04_plan_id ?? null, p_source_m04_revision_id: input.source_m04_revision_id ?? null,
    p_source_m05_recommendation_ref: null,
    p_rollback_of_request_id: input.rollback_of_request_id ?? null, p_supersedes_request_id: input.supersedes_request_id ?? null,
    p_items: input.items, ...contextBody(context), p_idempotency_key: input.idempotency_key,
  });
}

export async function validateMockChangeRequest(id: string, key: string, context: TrustedRequestContext): Promise<JsonObject> {
  return rpc("m03_ads_validate_mock_change_request_v2", { p_request_id: id, ...contextBody(context), p_idempotency_key: key });
}
export async function approveMockChangeRequest(id: string, key: string, comment: string | undefined, context: TrustedRequestContext): Promise<JsonObject> {
  return rpc("m03_ads_approve_mock_change_request_v2", { p_request_id: id, p_comment: comment ?? null, ...contextBody(context), p_idempotency_key: key });
}
export async function cancelMockChangeRequest(id: string, key: string, comment: string | undefined, context: TrustedRequestContext): Promise<JsonObject> {
  return rpc("m03_ads_cancel_mock_change_request_v2", { p_request_id: id, p_comment: comment ?? null, ...contextBody(context), p_idempotency_key: key });
}

export async function getWorkflowSettings(): Promise<WorkflowSettingsPayload> {
  const [m03Domains, m03Networks, m04Domains, m04Networks] = await Promise.all([
    request<JsonObject[]>("m03_ads_approved_domains?select=*&order=domain.asc", { method: "GET" }),
    request<JsonObject[]>("m03_ads_trusted_networks?select=*&order=network.asc", { method: "GET" }),
    request<JsonObject[]>("m04_ads_approved_domains?select=*&order=client_id.asc,domain.asc", { method: "GET" }),
    request<JsonObject[]>("m04_ads_trusted_networks?select=*&order=network.asc", { method: "GET" }),
  ]);
  return {
    m03_operator_domains: m03Domains.map((row) => mapSetting("m03", "operator_domain", row)),
    m03_trusted_networks: m03Networks.map((row) => mapSetting("m03", "trusted_network", row)),
    m04_destination_domains: m04Domains.map((row) => mapSetting("m04", "destination_domain", row)),
    m04_trusted_networks: m04Networks.map((row) => mapSetting("m04", "trusted_network", row)),
  };
}

export async function updateWorkflowSetting(input: WorkflowSettingMutation, context: TrustedRequestContext): Promise<JsonObject> {
  return rpc(`${input.module}_ads_set_workflow_setting_v1`, {
    p_kind: input.kind, p_value: input.kind === "trusted_network" ? input.value : input.value.toLowerCase(),
    p_label: input.label ?? null, p_client_id: input.client_id ?? null, p_is_active: input.is_active,
    ...contextBody(context), p_idempotency_key: input.idempotency_key,
  });
}

function contextBody(context: TrustedRequestContext): JsonObject {
  return { p_actor_id: context.actor_id, p_trusted_ip: context.trusted_ip, p_trusted_user_agent: context.user_agent };
}
async function rpc(name: string, body: JsonObject): Promise<JsonObject> { return request<JsonObject>(`rpc/${name}`, { method: "POST", body }); }

function config() {
  const origin = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!origin || !key || new URL(origin).hostname !== "gsmxeosdjsbujhiwhbzk.supabase.co") throw new M03RepositoryError("M03 requires the approved CRM08 Supabase project.", 503);
  return { rest: `${new URL(origin).origin}/rest/v1`, key };
}
async function request<T>(path: string, init: RequestInit): Promise<T> {
  const { rest, key } = config();
  const response = await fetch(`${rest}/${path}`, { method: init.method, headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" }, body: init.body ? JSON.stringify(init.body) : undefined, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const text = await response.text(); let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) {
    const value = payload && typeof payload === "object" ? payload as JsonObject : {};
    const message = typeof value.message === "string" ? readableError(value.message) : "M03 Supabase request failed.";
    throw new M03RepositoryError(message, response.status === 404 ? 404 : response.status === 401 ? 401 : response.status === 403 ? 403 : response.status === 409 ? 409 : 400);
  }
  return payload as T;
}

export async function verifyM04LaunchHandoff(input: Pick<M03MockChangeRequestInput, "platform" | "account_identity" | "campaign_identity" | "source_m04_plan_id" | "source_m04_revision_id">): Promise<Record<string, unknown>> {
  if (!input.source_m04_plan_id || !input.source_m04_revision_id) throw new M03RepositoryError("Both the M04 plan ID and revision ID are required.", 400);
  const [plans, revisions, handoffs] = await Promise.all([
    request<JsonObject[]>(`m04_ads_campaign_plans?select=id,platform,status,active_revision_id&id=eq.${input.source_m04_plan_id}&limit=1`, { method: "GET" }),
    request<JsonObject[]>(`m04_ads_campaign_plan_revisions?select=id,plan_id,platform,provider_account_id,payload_hash&id=eq.${input.source_m04_revision_id}&limit=1`, { method: "GET" }),
    request<JsonObject[]>(`m04_ads_campaign_monitoring_handoffs?select=id,platform,provider_account_id,provider_campaign_id,revision_id,revision_hash,verified_at,final_readback_evidence&revision_id=eq.${input.source_m04_revision_id}&limit=1`, { method: "GET" }),
  ]);
  const plan = plans[0]; const revision = revisions[0]; const handoff = handoffs[0];
  const valid = plan && revision && handoff
    && numberValue(plan, "id") === input.source_m04_plan_id
    && numberValue(revision, "plan_id") === input.source_m04_plan_id
    && numberValue(plan, "active_revision_id") === input.source_m04_revision_id
    && numberValue(handoff, "revision_id") === input.source_m04_revision_id
    && stringValue(plan, "status") === "launched"
    && stringValue(plan, "platform") === input.platform
    && stringValue(revision, "platform") === input.platform
    && stringValue(handoff, "platform") === input.platform
    && stringValue(revision, "provider_account_id") === input.account_identity
    && stringValue(handoff, "provider_account_id") === input.account_identity
    && stringValue(handoff, "provider_campaign_id") === input.campaign_identity
    && stringValue(revision, "payload_hash") === stringValue(handoff, "revision_hash");
  if (!valid) throw new M03RepositoryError("This campaign does not have an exact verified M04 launch handoff. Use Campaign Planning & Launch for initial setup.", 409);
  return {
    handoff_id: numberValue(handoff, "id"),
    revision_hash: stringValue(handoff, "revision_hash"),
    verified_at: stringValue(handoff, "verified_at"),
    final_readback_evidence: objectValue(handoff, "final_readback_evidence"),
  };
}

export async function recordM03SourceVerification(input: {
  request_id: string;
  source_kind: "m04_verified_launch" | "legacy_provider_adoption";
  source_m04_plan_id?: number | null;
  source_m04_revision_id?: number | null;
  platform: M03Platform;
  provider_account_identity: string;
  provider_campaign_identity: string;
  source_revision_hash?: string | null;
  evidence: Record<string, unknown>;
  context: TrustedRequestContext;
  idempotency_key: string;
}): Promise<JsonObject> {
  return rpc("m03_ads_record_source_verification_v1", {
    p_request_id: input.request_id, p_source_kind: input.source_kind,
    p_source_m04_plan_id: input.source_m04_plan_id ?? null, p_source_m04_revision_id: input.source_m04_revision_id ?? null,
    p_platform: input.platform, p_provider_account_identity: input.provider_account_identity,
    p_provider_campaign_identity: input.provider_campaign_identity, p_source_revision_hash: input.source_revision_hash ?? null,
    p_evidence: input.evidence, ...contextBody(input.context), p_idempotency_key: input.idempotency_key,
  });
}

export async function recordM03ProviderBaseline(input: {
  request_id: string; revision_id?: string | null; baseline: {
    platform: M03Platform; account_identity: string; campaign_identity: string; source: string;
    canonical_payload: Record<string, unknown>; payload_hash: string; captured_at: string;
  }; context: TrustedRequestContext; idempotency_key: string;
}): Promise<JsonObject> {
  return rpc("m03_ads_record_provider_baseline_v1", {
    p_request_id: input.request_id, p_revision_id: input.revision_id ?? null,
    p_platform: input.baseline.platform, p_account_identity: input.baseline.account_identity,
    p_campaign_identity: input.baseline.campaign_identity, p_source: input.baseline.source,
    p_canonical_payload: input.baseline.canonical_payload, p_payload_hash: input.baseline.payload_hash,
    p_captured_at: input.baseline.captured_at, ...contextBody(input.context), p_idempotency_key: input.idempotency_key,
  });
}

export async function recordM03ResourceMapping(input: {
  request_id: string; item_id: string; platform: M03Platform; provider_resource_type: string;
  previous_resource_identity?: string | null; replacement_resource_identity?: string | null;
  replacement_stage: string; capability_registry_version: number;
  operation_plan: Array<Record<string, unknown>>; rollback_evidence?: Record<string, unknown>;
  context: TrustedRequestContext; idempotency_key: string;
}): Promise<JsonObject> {
  return rpc("m03_ads_record_resource_mapping_v1", {
    p_request_id: input.request_id, p_item_id: input.item_id, p_platform: input.platform,
    p_provider_resource_type: input.provider_resource_type,
    p_previous_resource_identity: input.previous_resource_identity ?? null,
    p_replacement_resource_identity: input.replacement_resource_identity ?? null,
    p_replacement_stage: input.replacement_stage,
    p_capability_registry_version: input.capability_registry_version,
    p_operation_plan: input.operation_plan, p_rollback_evidence: input.rollback_evidence ?? {},
    ...contextBody(input.context), p_idempotency_key: input.idempotency_key,
  });
}

export async function recordM03ItemAttempt(input: {
  request_id: string; item_id: string; revision_id?: string | null;
  action: "publish" | "readback" | "rollback"; attempt_number: number;
  idempotency_key: string; operation_key: string;
  result: "provider_execution_locked" | "pending" | "succeeded" | "failed" | "verified" | "mismatch" | "compensation_required";
  replacement_stage?: string | null; provider_request?: Record<string, unknown>;
  provider_result_evidence?: Record<string, unknown>; readback_evidence?: Record<string, unknown>;
  normalized_error?: Record<string, unknown>; context: TrustedRequestContext;
}): Promise<JsonObject> {
  return rpc("m03_ads_record_item_attempt_v1", {
    p_request_id: input.request_id, p_item_id: input.item_id, p_revision_id: input.revision_id ?? null,
    p_action: input.action, p_attempt_number: input.attempt_number, p_idempotency_key: input.idempotency_key,
    p_operation_key: input.operation_key, p_result: input.result, p_replacement_stage: input.replacement_stage ?? null,
    p_provider_request: input.provider_request ?? {}, p_provider_result_evidence: input.provider_result_evidence ?? {},
    p_readback_evidence: input.readback_evidence ?? {}, p_normalized_error: input.normalized_error ?? {},
    ...contextBody(input.context),
  });
}

export async function recordM03MetaOperationResource(input: {
  request_id: string; revision_id: string; item_id: string; resource_mapping_id?: number | null;
  resource_role: M03ProviderOperationResourceRole; provider_resource_identity?: string | null;
  lifecycle_state: M03ProviderOperationResourceState; creation_evidence?: Record<string, unknown>;
  readback_evidence?: Record<string, unknown>; normalized_error?: Record<string, unknown>;
  expected_current_state?: M03ProviderOperationResourceState | null; context: TrustedRequestContext; idempotency_key: string;
}): Promise<JsonObject> {
  return rpc("m03_ads_record_meta_operation_resource_v1", {
    p_request_id: input.request_id, p_revision_id: input.revision_id, p_item_id: input.item_id,
    p_resource_mapping_id: input.resource_mapping_id ?? null, p_resource_role: input.resource_role,
    p_provider_resource_identity: input.provider_resource_identity ?? null, p_lifecycle_state: input.lifecycle_state,
    p_creation_evidence: input.creation_evidence ?? {}, p_readback_evidence: input.readback_evidence ?? {},
    p_normalized_error: input.normalized_error ?? {}, p_expected_current_state: input.expected_current_state ?? null,
    ...contextBody(input.context), p_idempotency_key: input.idempotency_key,
  });
}

export async function finalizeM03MetaItem(input: {
  request_id: string; revision_id: string; item_id: string;
  result: "succeeded" | "failed" | "verified" | "mismatch" | "compensation_required";
  provider_result_evidence?: Record<string, unknown>; readback_evidence?: Record<string, unknown>;
  normalized_error?: Record<string, unknown>; context: TrustedRequestContext; idempotency_key: string;
}): Promise<JsonObject> {
  return rpc("m03_ads_finalize_meta_item_v1", {
    p_request_id: input.request_id, p_revision_id: input.revision_id, p_item_id: input.item_id,
    p_result: input.result, p_provider_result_evidence: input.provider_result_evidence ?? {},
    p_readback_evidence: input.readback_evidence ?? {}, p_normalized_error: input.normalized_error ?? {},
    ...contextBody(input.context), p_idempotency_key: input.idempotency_key,
  });
}
async function optionalRows(path: string): Promise<JsonObject[]> {
  try { return await request<JsonObject[]>(path, { method: "GET" }); }
  catch (error) { if (error instanceof M03RepositoryError && error.status === 404) return []; throw error; }
}
function readableError(message: string) { return message.replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase()); }
function stringValue(row: JsonObject, key: string, fallback = "") { return typeof row[key] === "string" ? row[key] as string : fallback; }
function nullableString(row: JsonObject, key: string) { return typeof row[key] === "string" ? row[key] as string : null; }
function numberValue(row: JsonObject, key: string) { return typeof row[key] === "number" ? row[key] as number : Number(row[key] ?? 0); }
function objectValue(row: JsonObject, key: string) { return row[key] && typeof row[key] === "object" && !Array.isArray(row[key]) ? row[key] as Record<string, unknown> : {}; }
function arrayValue<T>(row: JsonObject, key: string) { return Array.isArray(row[key]) ? row[key] as T[] : []; }
function mapSummary(row: JsonObject): M03ChangeRequestSummary { return {
  id: stringValue(row, "id"), platform: stringValue(row, "platform") as M03Platform, status: stringValue(row, "status") as M03Status,
  title: stringValue(row, "title"), reason: stringValue(row, "reason"), client_id: nullableString(row, "client_id"),
  account_identity: stringValue(row, "account_identity"), campaign_identity: stringValue(row, "campaign_identity"),
  source_m04_plan_id: row.source_m04_plan_id == null ? null : numberValue(row, "source_m04_plan_id"),
  source_m04_revision_id: row.source_m04_revision_id == null ? null : numberValue(row, "source_m04_revision_id"),
  source_m05_recommendation_ref: nullableString(row, "source_m05_recommendation_ref"), rollback_of_request_id: nullableString(row, "rollback_of_request_id"),
  supersedes_request_id: nullableString(row, "supersedes_request_id"), created_by_name: stringValue(row, "created_by_name"),
  created_at: stringValue(row, "created_at"), updated_at: stringValue(row, "updated_at"), lock_version: numberValue(row, "lock_version"), provider_execution_locked: true,
}; }
function mapItem(row: JsonObject): M03ChangeItem { return {
  id: stringValue(row, "id"), request_id: stringValue(row, "request_id"), entity_type: stringValue(row, "entity_type"),
  entity_identity: stringValue(row, "entity_identity"), field_path: stringValue(row, "field_path"), value_type: stringValue(row, "value_type", "json") as M03ChangeItem["value_type"],
  baseline_value: row.baseline_value, proposed_value: row.proposed_value, evidence: objectValue(row, "evidence"),
  platform_resource_mapping: objectValue(row, "platform_resource_mapping"), validation_issues: arrayValue(row, "validation_issues"),
  provider_result_evidence: objectValue(row, "provider_result_evidence"), readback_evidence: objectValue(row, "readback_evidence"),
  capability_registry_version: row.capability_registry_version == null ? null : numberValue(row, "capability_registry_version"),
  mutation_mode: nullableString(row, "mutation_mode") as M03ChangeItem["mutation_mode"], replacement_stage: nullableString(row, "replacement_stage"),
  created_at: stringValue(row, "created_at"),
}; }
function mapRevision(row: JsonObject): M03Revision { return { id: stringValue(row, "id"), request_id: stringValue(row, "request_id"), revision_number: numberValue(row, "revision_number"), canonical_payload: objectValue(row, "canonical_payload"), payload_hash: stringValue(row, "payload_hash"), evidence: objectValue(row, "evidence"), validation_issues: arrayValue(row, "validation_issues"), created_by_id: stringValue(row, "created_by_id"), created_at: stringValue(row, "created_at") }; }
function mapValidation(row: JsonObject): M03ValidationRecord { return { id: stringValue(row, "id"), revision_id: stringValue(row, "revision_id"), result: stringValue(row, "result") as "passed" | "failed", issues: arrayValue(row, "issues"), snapshot: objectValue(row, "snapshot"), created_at: stringValue(row, "created_at") }; }
function mapApproval(row: JsonObject): M03Approval { return { id: stringValue(row, "id"), revision_id: stringValue(row, "revision_id"), revision_hash: stringValue(row, "revision_hash"), decision: "approved", comment: nullableString(row, "comment"), created_at: stringValue(row, "created_at") }; }
function mapEvent(row: JsonObject): M03AuditEvent { return { id: numberValue(row, "id"), event_type: stringValue(row, "event_type"), from_status: nullableString(row, "from_status") as M03Status | null, to_status: nullableString(row, "to_status") as M03Status | null, actor_name: nullableString(row, "actor_name"), trusted_ip: nullableString(row, "trusted_ip"), metadata: objectValue(row, "metadata"), created_at: stringValue(row, "created_at") }; }
function mapBaseline(row: JsonObject): M03ProviderBaselineSnapshot { return { id: stringValue(row, "id"), request_id: stringValue(row, "request_id"), revision_id: nullableString(row, "revision_id"), platform: stringValue(row, "platform") as M03Platform, source: stringValue(row, "source") as M03ProviderBaselineSnapshot["source"], payload_hash: stringValue(row, "payload_hash"), captured_at: stringValue(row, "captured_at"), freshness_expires_at: stringValue(row, "freshness_expires_at"), canonical_payload: objectValue(row, "canonical_payload") }; }
function mapSourceVerification(row: JsonObject): M03SourceVerification { return { id: stringValue(row, "id"), request_id: stringValue(row, "request_id"), source_kind: stringValue(row, "source_kind") as M03SourceVerification["source_kind"], source_m04_plan_id: row.source_m04_plan_id == null ? null : numberValue(row, "source_m04_plan_id"), source_m04_revision_id: row.source_m04_revision_id == null ? null : numberValue(row, "source_m04_revision_id"), platform: stringValue(row, "platform") as M03Platform, provider_account_identity: stringValue(row, "provider_account_identity"), provider_campaign_identity: stringValue(row, "provider_campaign_identity"), source_revision_hash: nullableString(row, "source_revision_hash"), evidence: objectValue(row, "evidence"), verified_at: stringValue(row, "verified_at") }; }
function mapResourceMapping(row: JsonObject): M03ProviderResourceMapping { return { id: numberValue(row, "id"), item_id: stringValue(row, "item_id"), provider_resource_type: stringValue(row, "provider_resource_type"), previous_resource_identity: nullableString(row, "previous_resource_identity"), replacement_resource_identity: nullableString(row, "replacement_resource_identity"), replacement_stage: stringValue(row, "replacement_stage", "not_required"), capability_registry_version: numberValue(row, "capability_registry_version"), operation_plan: arrayValue(row, "operation_plan"), rollback_evidence: objectValue(row, "rollback_evidence"), updated_at: stringValue(row, "updated_at") }; }
function mapAttempt(row: JsonObject): M03ItemAttempt { return { id: numberValue(row, "id"), item_id: stringValue(row, "item_id"), revision_id: nullableString(row, "revision_id"), action: stringValue(row, "action") as M03ItemAttempt["action"], attempt_number: numberValue(row, "attempt_number"), operation_key: nullableString(row, "operation_key"), result: stringValue(row, "result") as M03ItemAttempt["result"], replacement_stage: nullableString(row, "replacement_stage"), provider_result_evidence: objectValue(row, "provider_result_evidence"), readback_evidence: objectValue(row, "readback_evidence"), normalized_error: objectValue(row, "normalized_error"), created_at: stringValue(row, "created_at") }; }
function mapOperationResource(row: JsonObject): M03ProviderOperationResource { return { id: numberValue(row, "id"), request_id: stringValue(row, "request_id"), revision_id: stringValue(row, "revision_id"), item_id: stringValue(row, "item_id"), resource_mapping_id: row.resource_mapping_id == null ? null : numberValue(row, "resource_mapping_id"), platform: "meta", resource_role: stringValue(row, "resource_role") as M03ProviderOperationResource["resource_role"], provider_resource_identity: nullableString(row, "provider_resource_identity"), lifecycle_state: stringValue(row, "lifecycle_state") as M03ProviderOperationResource["lifecycle_state"], creation_evidence: objectValue(row, "creation_evidence"), readback_evidence: objectValue(row, "readback_evidence"), normalized_error: objectValue(row, "normalized_error"), idempotency_key: stringValue(row, "idempotency_key"), created_at: stringValue(row, "created_at"), updated_at: stringValue(row, "updated_at") }; }
function mapSetting(module: "m03" | "m04", kind: WorkflowSetting["kind"], row: JsonObject): WorkflowSetting { return { id: numberValue(row, "id"), module, kind, value: stringValue(row, kind === "trusted_network" ? "network" : "domain"), label: nullableString(row, "label"), client_id: nullableString(row, "client_id"), is_active: row.is_active === true, created_at: stringValue(row, "created_at"), updated_at: nullableString(row, "updated_at") }; }
const M03_STATUS_VALUES = ["draft", "validation_in_progress", "validation_failed", "awaiting_approval", "approved", "conflict_detected", "ready_to_publish", "publishing", "published", "verification_in_progress", "verified", "partially_completed", "failed", "reverted", "cancelled", "provider_execution_locked"] as const;
