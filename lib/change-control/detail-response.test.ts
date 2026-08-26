import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeM03ChangeRequestDetailForBrowser } from "./detail-response";
import type { M03ChangeRequestDetail } from "./types";

test("browser request detail recursively removes credentials and raw transport while preserving safe review evidence", () => {
  const detail = fixture();
  const sanitized = sanitizeM03ChangeRequestDetailForBrowser(detail);
  const serialized = JSON.stringify(sanitized);

  for (const forbidden of ["secret-value", "Bearer abc", "session-cookie", "raw request body", "https://provider.example/private"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal(sanitized.items[0]?.evidence?.source, "meta_management");
  assert.equal(sanitized.items[0]?.provider_result_evidence?.status, "PAUSED");
  assert.deepEqual(sanitized.resource_mappings[0]?.operation_plan?.[0], {
    operation_key: "safe-key",
    action: "update",
    mode: "direct_update",
    provider_resource: "adset",
    field_path: "ad_set.status",
    resource_identity: "adset-1",
  });
  assert.deepEqual(sanitized.attempts[0]?.readback_evidence, { id: "adset-1", status: "PAUSED" });
});

function fixture(): M03ChangeRequestDetail {
  const request = {
    id: "request-1", platform: "meta" as const, status: "draft" as const, title: "Review", reason: "Reason",
    client_id: null, account_identity: "123", campaign_identity: "campaign-1", source_m04_plan_id: null,
    source_m04_revision_id: null, source_m05_recommendation_ref: null, rollback_of_request_id: null,
    supersedes_request_id: null, created_by_name: "Operator", created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z", lock_version: 1, provider_execution_locked: true as const,
  };
  const item = {
    id: "item-1", request_id: "request-1", entity_type: "ad_set", entity_identity: "adset-1",
    field_path: "ad_set.status", value_type: "string" as const, baseline_value: "ACTIVE", proposed_value: "PAUSED",
    evidence: { source: "meta_management", access_token: "secret-value", nested: { authorization: "Bearer abc" } },
    platform_resource_mapping: { account_id: "123", campaign_id: "campaign-1", cookie: "session-cookie" },
    validation_issues: [], provider_result_evidence: { id: "adset-1", status: "PAUSED", response_headers: { authorization: "Bearer abc" }, raw: "raw request body" },
    readback_evidence: { id: "adset-1", status: "PAUSED", api_key: "secret-value" }, capability_registry_version: 2,
    mutation_mode: "direct_update" as const, replacement_stage: null, created_at: "2026-08-01T00:00:00Z",
  };
  return {
    request, items: [item], revisions: [], validations: [], approvals: [], events: [],
    source_verification: null, baselines: [], provider_execution_locked: true,
    resource_mappings: [{
      id: 1, item_id: "item-1", provider_resource_type: "adset", previous_resource_identity: "adset-1",
      replacement_resource_identity: null, replacement_stage: "planned", capability_registry_version: 2,
      operation_plan: [{ operation_key: "safe-key", action: "update", mode: "direct_update", provider_resource: "adset", field_path: "ad_set.status", resource_identity: "adset-1", transport: { endpoint: "https://provider.example/private", headers: { authorization: "Bearer abc" }, body: "raw request body" } }],
      rollback_evidence: { password: "secret-value" }, updated_at: "2026-08-01T00:00:00Z",
    }],
    attempts: [{ id: 1, item_id: "item-1", revision_id: null, action: "readback", attempt_number: 1,
      operation_key: "safe-key", result: "verified", replacement_stage: null,
      provider_result_evidence: { status: "PAUSED", access_key: "secret-value" },
      readback_evidence: { id: "adset-1", status: "PAUSED", raw_response: "raw request body" },
      normalized_error: { message: "safe", headers: { cookie: "session-cookie" } }, created_at: "2026-08-01T00:00:00Z" }],
    operation_resources: [],
  };
}
