import assert from "node:assert/strict";
import test from "node:test";
import { createM03ProviderAdapter, ProviderExecutionLockedError } from "@/lib/change-control/provider-adapters";
import { createMetaM03Adapter } from "@/lib/change-control/meta-provider-adapter";
import { canonicalM03Hash } from "@/lib/change-control/provider-contract";
import { buildM03ProviderWorkflowPreview, buildM03RollbackDraft, executeM03MutationPlan } from "@/lib/change-control/provider-workflow";
import { m03MockChangeRequestSchema } from "@/lib/change-control/schema";
import { compileTikTokM03Operation } from "@/lib/change-control/tiktok-provider-plan";
import type { M03ChangeItem, M03ChangeRequestDetail, M03Platform } from "@/lib/change-control/types";

for (const platform of ["google", "meta", "tiktok"] as const) {
  test(`${platform} adapter plans direct updates and provider-native creative replacement`, async () => {
    const detail = fixture(platform);
    const adapter = platform === "meta" ? createMetaM03Adapter() : createM03ProviderAdapter(platform);
    const preview = await buildM03ProviderWorkflowPreview(detail, adapter);
    assert.equal(preview.conflict_issues.length, 0);
    assert.equal(preview.capability_issues.length, 0);
    assert.equal(preview.mutation_plan.operations.filter((operation) => operation.mode === "direct_update").length, 1);
    const replacement = preview.mutation_plan.operations.filter((operation) => operation.mode === "creative_replacement");
    assert.deepEqual(replacement.map((operation) => operation.action), platform === "meta"
      ? ["create_replacement_creative", "verify_replacement_creative", "create_paused_replacement_ad", "verify_replacement_ad", "activate_replacement", "disable_previous", "verify_final_state"]
      : ["create_inactive_replacement", "verify_replacement", "activate_replacement", "disable_previous"]);
    if (platform !== "meta") assert.equal(replacement[0]?.payload.intended_initial_state, "inactive");
  });
}

test("M03 requires a complete M04 source pair or audited legacy adoption", () => {
  const base = { platform: "google", workflow_mode: "mock", title: "Change", reason: "Reason", account_identity: "123", campaign_identity: "456", items: [inputItem()], idempotency_key: "request-key-123" } as const;
  assert.equal(m03MockChangeRequestSchema.safeParse({ ...base, source_m04_plan_id: 1 }).success, false);
  assert.equal(m03MockChangeRequestSchema.safeParse({ ...base, source_m04_plan_id: 1, source_m04_revision_id: 2 }).success, true);
  assert.equal(m03MockChangeRequestSchema.safeParse(base).success, true);
  assert.equal(m03MockChangeRequestSchema.safeParse({ ...base, source_m05_recommendation_ref: "not-accepted" }).success, false, "M05 input is outside the M03 contract");
});

test("fresh baseline mismatch becomes an explicit conflict", async () => {
  const detail = fixture("google");
  const changed = { "campaign:1-resource:campaign.name": "provider changed", "ad:2-resource:ad.creative.headline": "Old creative" };
  const adapter = createM03ProviderAdapter("google", { retrieveBaseline: async () => ({ platform: "google", account_identity: "account", campaign_identity: "campaign", captured_at: new Date().toISOString(), canonical_payload: changed, payload_hash: canonicalM03Hash(changed), source: "provider" }) });
  const preview = await buildM03ProviderWorkflowPreview(detail, adapter);
  assert.equal(preview.baseline_matches_reviewed_values, false);
  assert.match(preview.conflict_issues[0]?.message ?? "", /no longer matches/i);
});

test("execution lock prevents every provider mutation call", async () => {
  const detail = fixture("meta"); let calls = 0;
  const adapter = createMetaM03Adapter({ transport: { request: async () => { calls += 1; return { payload: {} }; } } });
  const preview = await buildM03ProviderWorkflowPreview(detail, adapter);
  await assert.rejects(() => executeM03MutationPlan(adapter, preview.mutation_plan, { deployment_enabled: false, platform_allowlisted: true, account_allowlisted: true, exact_revision_selected: true }), ProviderExecutionLockedError);
  assert.equal(calls, 0);
});

test("TikTok operations compile to guarded primitives with disabled creative replacement and no automatic POST retry", async () => {
  const preview = await buildM03ProviderWorkflowPreview(fixture("tiktok"), createM03ProviderAdapter("tiktok"));
  const compiled = preview.mutation_plan.operations.map((operation) => compileTikTokM03Operation(operation, "123456789"));
  assert.equal(compiled[0]?.action, "campaign.update");
  assert.equal(compiled[1]?.action, "ad.create");
  assert.equal(compiled[1]?.payload.operation_status, "DISABLE");
  assert.equal(compiled[2]?.action, "ad.get");
  assert.deepEqual(compiled.slice(3).map((entry) => entry.action), ["ad.status", "ad.status"]);
  assert.ok(compiled.every((entry) => entry.auto_retry_post === false));
});

test("idempotent operation keys are stable and partial failure stops dependent replacement stages", async () => {
  const detail = fixture("tiktok"); let calls = 0;
  const adapter = createM03ProviderAdapter("tiktok", {
    executeOperation: async (operation) => { calls += 1; return { operation_key: operation.operation_key, outcome: calls === 3 ? "failed" : "succeeded", provider_response: {}, error: calls === 3 ? { code: "transient", message: "temporary", retryable: true } : undefined }; },
    readback: async (operation) => ({ resource_identity: operation.resource_identity, canonical_payload: operation.payload, payload_hash: canonicalM03Hash(operation.payload), verified_at: new Date().toISOString() }),
  });
  const first = await buildM03ProviderWorkflowPreview(detail, adapter); const second = await buildM03ProviderWorkflowPreview(detail, adapter);
  assert.deepEqual(first.mutation_plan.operations.map((operation) => operation.idempotency_key), second.mutation_plan.operations.map((operation) => operation.idempotency_key));
  await assert.rejects(() => executeM03MutationPlan(adapter, first.mutation_plan, { deployment_enabled: true, platform_allowlisted: true, account_allowlisted: true, exact_revision_selected: true }), /temporary/);
  assert.equal(calls, 3);
});

test("rollback creates a new immutable M03 draft and does not reference M05", () => {
  const detail = fixture("google"); detail.request.status = "verified";
  const rollback = buildM03RollbackDraft(detail);
  assert.equal(rollback.rollback_of_request_id, detail.request.id);
  assert.equal(rollback.items[0]?.proposed_value, detail.items[0]?.baseline_value);
  assert.equal(Object.hasOwn(rollback, "source_m05_recommendation_ref"), false);
});

function fixture(platform: M03Platform): M03ChangeRequestDetail {
  const items: M03ChangeItem[] = [item("1", "campaign.name", "Old", "New"), item("2", "ad.creative.headline", "Old creative", "New creative")];
  if (platform === "meta") items[1]!.platform_resource_mapping = { account_id: "123456", ad_set_id: "654321", page_id: "111", intended_status: "PAUSED" };
  const payload = { request: "request", items: items.map((entry) => ({ field_path: entry.field_path, proposed_value: entry.proposed_value })) };
  const hash = canonicalM03Hash(payload);
  return {
    request: { id: "00000000-0000-4000-8000-000000000001", platform, status: "approved", title: "Change", reason: "Test", client_id: null, account_identity: "account", campaign_identity: "campaign", source_m04_plan_id: null, source_m04_revision_id: null, source_m05_recommendation_ref: null, rollback_of_request_id: null, supersedes_request_id: null, created_by_id: "actor", created_by_name: "Admin", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), lock_version: 1, provider_execution_locked: true },
    items,
    revisions: [{ id: "00000000-0000-4000-8000-000000000002", request_id: "00000000-0000-4000-8000-000000000001", revision_number: 1, canonical_payload: payload, payload_hash: hash, evidence: {}, validation_issues: [], created_by_id: "actor", created_at: new Date().toISOString() }],
    validations: [], approvals: [{ id: "approval", revision_id: "00000000-0000-4000-8000-000000000002", revision_hash: hash, decision: "approved", comment: null, created_at: new Date().toISOString() }], events: [],
    source_verification: { id: "source", request_id: "00000000-0000-4000-8000-000000000001", source_kind: "legacy_provider_adoption", source_m04_plan_id: null, source_m04_revision_id: null, platform, provider_account_identity: "account", provider_campaign_identity: "campaign", source_revision_hash: null, evidence: {}, verified_at: new Date().toISOString() },
    baselines: [], resource_mappings: [], attempts: [], operation_resources: [], provider_execution_locked: true,
  };
}

function item(id: string, fieldPath: string, baseline: string, proposed: string): M03ChangeItem {
  return { id, request_id: "request", entity_type: fieldPath.startsWith("ad.") ? "ad" : "campaign", entity_identity: `${id}-resource`, field_path: fieldPath, value_type: "string", baseline_value: baseline, proposed_value: proposed, evidence: {}, platform_resource_mapping: {}, validation_issues: [], provider_result_evidence: {}, readback_evidence: {}, capability_registry_version: 1, mutation_mode: null, replacement_stage: null, created_at: new Date().toISOString() };
}

function inputItem() { return { entity_type: "campaign", entity_identity: "456", field_path: "campaign.name", value_type: "string", baseline_value: "Old", proposed_value: "New" }; }
