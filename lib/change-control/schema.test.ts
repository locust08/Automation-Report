import assert from "node:assert/strict";
import test from "node:test";

import { m03ListQuerySchema, m03MockChangeRequestEditSchema, m03MockChangeRequestSchema, workflowSettingMutationSchema } from "./schema";
import { M03_MOCK_REACHABLE_STATUSES, M03_STATUSES, PROVIDER_EXECUTION_LOCKED } from "./types";

test("M03 accepts only mock cross-platform request contracts", () => {
  const base = {
    workflow_mode: "mock",
    title: "Budget adjustment",
    reason: "Dashboard review",
    account_identity: "mock-account",
    campaign_identity: "mock-campaign",
    items: [{ entity_type: "campaign", entity_identity: "mock-campaign", field_path: "budget", value_type: "number", baseline_value: 100, proposed_value: 120 }],
    idempotency_key: "request-12345",
  };
  for (const platform of ["google", "meta", "tiktok"] as const) {
    assert.equal(m03MockChangeRequestSchema.safeParse({ ...base, platform }).success, true);
  }
  assert.equal(m03MockChangeRequestSchema.safeParse({ ...base, platform: "google", workflow_mode: "live" }).success, false);
});

test("M03 exposes the complete documented status contract while mock transitions stay constrained", () => {
  assert.equal(M03_STATUSES.length, 16);
  assert.equal(M03_STATUSES.includes("published"), true);
  assert.equal(M03_MOCK_REACHABLE_STATUSES.includes("published" as never), false);
});

test("M03 draft edits require optimistic locking and keep identity out of the editable payload", () => {
  const result = m03MockChangeRequestEditSchema.safeParse({
    title: "Adjusted budget", reason: "Approved internal review", items: [{ entity_type: "campaign", entity_identity: "mock-campaign", field_path: "budget", value_type: "number", baseline_value: 100, proposed_value: 120 }],
    expected_lock_version: 2, idempotency_key: "edit-request-123",
  });
  assert.equal(result.success, true);
  assert.equal(m03MockChangeRequestEditSchema.safeParse({ ...(result.success ? result.data : {}), expected_lock_version: -1 }).success, false);
});

test("workflow settings distinguish operator domains, destination domains, and CIDR networks", () => {
  assert.equal(workflowSettingMutationSchema.safeParse({ module: "m03", kind: "operator_domain", value: "locus-t.com.my", is_active: true, idempotency_key: "setting-12345" }).success, true);
  assert.equal(workflowSettingMutationSchema.safeParse({ module: "m04", kind: "destination_domain", value: "example.com", is_active: true, idempotency_key: "setting-12345" }).success, false);
  assert.equal(workflowSettingMutationSchema.safeParse({ module: "m03", kind: "trusted_network", value: "127.0.0.1/32", is_active: true, idempotency_key: "setting-12345" }).success, false);
  assert.equal(workflowSettingMutationSchema.safeParse({ module: "m04", kind: "trusted_network", value: "127.0.0.1/32", is_active: true, idempotency_key: "setting-12345" }).success, true);
});

test("M03 provider contract remains hard locked", () => {
  assert.equal(PROVIDER_EXECUTION_LOCKED.error, "provider_execution_locked");
});

test("M03 list filters accept scoped account and campaign identities with a positive page", () => {
  const result = m03ListQuerySchema.safeParse({
    platform: "meta",
    status: "awaiting_approval",
    account_identity: "act_123",
    campaign_identity: "campaign_456",
    page: "2",
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.data, {
    platform: "meta",
    status: "awaiting_approval",
    account_identity: "act_123",
    campaign_identity: "campaign_456",
    page: 2,
    page_size: 10,
  });
  assert.equal(m03ListQuerySchema.safeParse({ account_identity: "", page: 1 }).success, false);
  assert.equal(m03ListQuerySchema.safeParse({ campaign_identity: "campaign", page: 0 }).success, false);
  assert.equal(m03ListQuerySchema.safeParse({ platform: "meta" }).success, false);
  assert.equal(m03ListQuerySchema.safeParse({ page: 1, page_size: 100 }).success, false);
});
