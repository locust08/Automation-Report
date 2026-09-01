import type { M03ProviderWorkflowPreview } from "./provider-workflow";
import type { M03ChangeRequestDetail } from "./types";

export function sanitizeM03ChangeRequestDetailForBrowser(detail: M03ChangeRequestDetail): M03ChangeRequestDetail {
  return {
    ...detail,
    items: detail.items.map((item) => ({
      ...item,
      evidence: sanitizeStoredEvidence(item.evidence),
      platform_resource_mapping: sanitizeStoredEvidence(item.platform_resource_mapping),
      provider_result_evidence: sanitizeProviderEvidence(item.provider_result_evidence),
      readback_evidence: sanitizeProviderEvidence(item.readback_evidence),
    })),
    revisions: detail.revisions.map((revision) => ({
      ...revision,
      canonical_payload: sanitizeStoredEvidence(revision.canonical_payload),
      evidence: sanitizeStoredEvidence(revision.evidence),
    })),
    validations: detail.validations.map((validation) => ({ ...validation, snapshot: sanitizeStoredEvidence(validation.snapshot) })),
    events: detail.events.map((event) => ({ ...event, metadata: sanitizeStoredEvidence(event.metadata) })),
    source_verification: detail.source_verification ? {
      ...detail.source_verification,
      evidence: sanitizeStoredEvidence(detail.source_verification.evidence),
    } : null,
    baselines: detail.baselines.map((baseline) => ({ ...baseline, canonical_payload: sanitizeStoredEvidence(baseline.canonical_payload) })),
    resource_mappings: detail.resource_mappings.map((mapping) => ({
      ...mapping,
      operation_plan: mapping.operation_plan.map(sanitizeOperationPlan),
      rollback_evidence: sanitizeStoredEvidence(mapping.rollback_evidence),
    })),
    attempts: detail.attempts.map((attempt) => ({
      ...attempt,
      provider_result_evidence: sanitizeProviderEvidence(attempt.provider_result_evidence),
      readback_evidence: sanitizeProviderEvidence(attempt.readback_evidence),
      normalized_error: sanitizeProviderEvidence(attempt.normalized_error),
    })),
    operation_resources: detail.operation_resources.map((resource) => ({
      ...resource,
      creation_evidence: sanitizeProviderEvidence(resource.creation_evidence),
      readback_evidence: sanitizeProviderEvidence(resource.readback_evidence),
      normalized_error: sanitizeProviderEvidence(resource.normalized_error),
    })),
  };
}

export function sanitizeM03ProviderPreviewForBrowser(preview: M03ProviderWorkflowPreview): M03ProviderWorkflowPreview {
  return {
    ...preview,
    baseline: { ...preview.baseline, canonical_payload: sanitizeStoredEvidence(preview.baseline.canonical_payload) },
    mutation_plan: {
      ...preview.mutation_plan,
      operations: preview.mutation_plan.operations.map((operation) => sanitizeOperationPlan(operation) as unknown as typeof operation),
    },
  };
}

function sanitizeOperationPlan(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    OPERATION_PLAN_KEYS
      .filter((key) => Object.prototype.hasOwnProperty.call(value, key))
      .map((key) => [key, sanitizeProviderValue(value[key])]),
  );
}

function sanitizeStoredEvidence(value: unknown): Record<string, unknown> {
  const sanitized = sanitizeGeneralValue(value);
  return isRecord(sanitized) ? sanitized : {};
}

function sanitizeProviderEvidence(value: unknown): Record<string, unknown> {
  const sanitized = sanitizeProviderValue(value);
  return isRecord(sanitized) ? sanitized : {};
}

function sanitizeGeneralValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeGeneralValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isBlockedKey(key) && !isRawTransportKey(key))
      .map(([key, entry]) => [key, sanitizeGeneralValue(entry)]),
  );
}

function sanitizeProviderValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeProviderValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => SAFE_PROVIDER_KEYS.has(key.toLowerCase()) && !isBlockedKey(key) && !isRawTransportKey(key))
      .map(([key, entry]) => [key, sanitizeProviderValue(entry)]),
  );
}

function isBlockedKey(key: string) {
  return /(secret|token|authorization|auth|access[_-]?key|api[_-]?key|password|passwd|cookie|credential|private[_-]?key|appsecret|session)/i.test(key);
}

function isRawTransportKey(key: string) {
  return /^(transport|provider_request|request_headers|response_headers|headers|body|endpoint|method|url|raw|raw_.*|request|response)$/i.test(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const OPERATION_PLAN_KEYS = [
  "operation_key", "item_id", "affected_item_ids", "provider_resource", "field_path", "mode", "action",
  "resource_identity", "expected_result", "depends_on", "compensation_guidance",
] as const;

const SAFE_PROVIDER_KEYS = new Set([
  "id", "name", "status", "effective_status", "result", "results", "outcome", "verified", "message", "code",
  "error_code", "provider_trace_id", "trace_id", "resource_id", "resource_identity", "creative_id", "creative",
  "account_id", "campaign_id", "adset_id", "ad_set_id", "ad_id", "previous_ad_id", "replacement_ad_id",
  "replacement_creative_id", "lifecycle_state", "field", "field_path", "value", "values", "daily_budget",
  "lifetime_budget", "bid_strategy", "bid_amount", "start_time", "end_time", "billing_event", "optimization_goal",
  "targeting", "geo_locations", "countries", "publisher_platforms", "object_story_spec", "page_id",
  "instagram_actor_id", "image_hash", "video_id", "call_to_action", "link_data", "link", "type", "created_at",
  "updated_at", "expected_result", "proposed_value", "baseline_value", "revision_hash", "safe_to_retry",
  "operation_key", "item_id", "affected_item_ids", "provider_resource", "mode", "action", "depends_on",
  "compensation_guidance",
]);
