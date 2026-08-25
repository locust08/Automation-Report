import assert from "node:assert/strict";
import test from "node:test";
import {
  createMetaM03Adapter,
  M03_META_CAPABILITY_REGISTRY_VERSION,
  normalizeMetaM03Error,
  planMetaM03Mutation,
  validateMetaM03Capabilities,
  type MetaM03Transport,
} from "@/lib/change-control/meta-provider-adapter";
import { executeM03MutationPlan } from "@/lib/change-control/provider-workflow";
import type { M03ChangeItem } from "@/lib/change-control/types";

test("Meta capability validation covers supported direct changes and related-field constraints", () => {
  const valid = [
    item("campaign", "campaign-1", "campaign.name", "Old", "New"),
    item("ad_set", "adset-1", "ad_set.budget.lifetime", 10000, 12000),
    item("ad_set", "adset-1", "ad_set.schedule.end_time", "2026-09-01", "2026-10-01"),
    item("ad_set", "adset-1", "ad_set.bid.strategy", "LOWEST_COST_WITHOUT_CAP", "COST_CAP"),
    item("ad_set", "adset-1", "ad_set.bid.amount", 20, 30),
    item("ad_set", "adset-1", "ad_set.optimization_goal", "LINK_CLICKS", "OFFSITE_CONVERSIONS"),
    item("ad_set", "adset-1", "ad_set.billing_event", "LINK_CLICKS", "IMPRESSIONS"),
  ];
  assert.deepEqual(validateMetaM03Capabilities(valid), []);
  const plan = planMetaM03Mutation({ requestId: "request", revisionHash: "a".repeat(64), items: valid });
  assert.equal(plan.capability_registry_version, M03_META_CAPABILITY_REGISTRY_VERSION);
  assert.equal(plan.operations.length, valid.length);
  assert.ok(plan.operations.every((operation) => operation.transport?.method === "POST" && operation.transport.safe_to_retry));
});

test("Meta rejects immutable, incompatible, unsupported-version, and incomplete creative changes", () => {
  const immutable = item("campaign", "campaign-1", "campaign.objective", "TRAFFIC", "OUTCOME_SALES");
  const incompatible = item("ad_set", "adset-1", "ad_set.billing_event", "IMPRESSIONS", "LINK_CLICKS");
  const optimization = item("ad_set", "adset-1", "ad_set.optimization_goal", "LINK_CLICKS", "OFFSITE_CONVERSIONS");
  const advantage = item("ad_set", "adset-1", "ad_set.name", "Old", "New", { provider_configuration: "advantage_plus_shopping" });
  const creative = item("ad", "ad-1", "ad.creative.headline", "Old", "New", { account_id: "123" });
  const issues = validateMetaM03Capabilities([immutable, incompatible, optimization, advantage, creative]);
  assert.ok(issues.some((issue) => /objective/i.test(issue.message)));
  assert.ok(issues.some((issue) => /not compatible/i.test(issue.message)));
  assert.ok(issues.some((issue) => /Advantage\+/i.test(issue.message)));
  const plan = planMetaM03Mutation({ requestId: "request", revisionHash: "b".repeat(64), items: [creative] });
  assert.ok(plan.issues.some((issue) => /account_id and ad_set_id/i.test(issue.message)));
});

test("Meta creative replacement is deterministic, paused-first, and never auto-retries create POSTs", () => {
  const mapping = { account_id: "act_123456", ad_set_id: "adset-9", page_id: "page-7", intended_status: "ACTIVE" };
  const items = [
    item("ad", "old-ad", "ad.copy.primary_text", "Old", "New primary", mapping),
    item("ad", "old-ad", "ad.creative.headline", "Old", "New headline", mapping),
    item("ad", "old-ad", "ad.creative.destination_url", "https://old.example", "https://new.example", mapping),
  ];
  const first = planMetaM03Mutation({ requestId: "request", revisionHash: "c".repeat(64), items });
  const second = planMetaM03Mutation({ requestId: "request", revisionHash: "c".repeat(64), items });
  assert.deepEqual(first.operations.map((operation) => operation.operation_key), second.operations.map((operation) => operation.operation_key));
  assert.deepEqual(first.operations.map((operation) => operation.action), [
    "create_replacement_creative", "verify_replacement_creative", "create_paused_replacement_ad",
    "verify_replacement_ad", "activate_replacement", "disable_previous", "verify_final_state",
  ]);
  assert.equal(first.operations[0]?.transport?.safe_to_retry, false);
  assert.equal(first.operations[2]?.transport?.safe_to_retry, false);
  assert.equal(first.operations[2]?.transport?.body.status, "PAUSED");
  assert.equal(first.operations[4]?.transport?.body.status, "ACTIVE");
  assert.deepEqual(first.replacement_items.sort(), items.map((entry) => entry.id).sort());
});

test("Meta adapter normalizes errors and the execution lock makes zero transport calls", async () => {
  let calls = 0;
  const transport: MetaM03Transport = { request: async () => { calls += 1; return { payload: { id: "provider-id" }, id: "provider-id" }; } };
  const adapter = createMetaM03Adapter({ transport });
  const plan = planMetaM03Mutation({ requestId: "request", revisionHash: "d".repeat(64), items: [item("campaign", "campaign-1", "campaign.name", "Old", "New")] });
  await assert.rejects(() => executeM03MutationPlan(adapter, plan, {
    deployment_enabled: false, platform_allowlisted: true, account_allowlisted: true, exact_revision_selected: true,
  }), /provider execution is locked/i);
  assert.equal(calls, 0);
  const normalized = normalizeMetaM03Error(new Error("network unavailable"));
  assert.equal(normalized.code, "meta_provider_error");
  assert.equal(normalized.retryable, false);
});

function item(
  entityType: M03ChangeItem["entity_type"],
  identity: string,
  fieldPath: string,
  baseline: unknown,
  proposed: unknown,
  mapping: Record<string, unknown> = {},
): M03ChangeItem {
  const id = `${identity}-${fieldPath.replaceAll(".", "-")}`;
  return {
    id, request_id: "request", entity_type: entityType, entity_identity: identity, field_path: fieldPath,
    value_type: typeof proposed === "number" ? "number" : "string", baseline_value: baseline,
    proposed_value: proposed, evidence: {}, platform_resource_mapping: mapping, validation_issues: [],
    provider_result_evidence: {}, readback_evidence: {}, capability_registry_version: null,
    mutation_mode: null, replacement_stage: null, created_at: new Date().toISOString(),
  };
}
