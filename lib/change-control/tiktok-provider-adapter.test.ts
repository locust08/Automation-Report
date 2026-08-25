import assert from "node:assert/strict";
import test from "node:test";
import {
  createTikTokM03Adapter,
  M03_TIKTOK_CAPABILITY_REGISTRY_VERSION,
  planTikTokM03Mutation,
  validateTikTokM03Capabilities,
  type TikTokM03Transport,
} from "@/lib/change-control/tiktok-provider-adapter";
import { executeM03MutationPlan } from "@/lib/change-control/provider-workflow";
import type { M03ChangeItem } from "@/lib/change-control/types";

test("TikTok M03 plans direct changes and a resumable regular-video replacement while execution stays locked", async () => {
  const directItems = [
    item("campaign", "campaign-1", "campaign.name", "Old", "New", { advertiser_id: "123456" }),
    item("ad_group", "adgroup-1", "ad_group.budget.amount", 100, 150, { advertiser_id: "123456" }),
    item("ad", "ad-1", "ad.status", "DISABLE", "ENABLE", { advertiser_id: "123456" }),
  ];
  assert.deepEqual(validateTikTokM03Capabilities(directItems), []);
  const directPlan = planTikTokM03Mutation({ requestId: "request", revisionHash: "a".repeat(64), items: directItems });
  assert.equal(directPlan.capability_registry_version, M03_TIKTOK_CAPABILITY_REGISTRY_VERSION);
  assert.equal(directPlan.operations.length, 3);
  assert.ok(directPlan.operations.every((operation) => operation.transport?.method === "POST" && operation.transport.safe_to_retry));

  const invalid = [
    item("campaign", "campaign-1", "campaign.budget.mode", "BUDGET_MODE_DAY", "BUDGET_MODE_TOTAL"),
    item("ad_group", "adgroup-1", "ad_group.schedule.start_time", "2026-08-26", "2026-09-10"),
    item("ad_group", "adgroup-1", "ad_group.schedule.end_time", "2026-09-20", "2026-09-01"),
  ];
  const issues = validateTikTokM03Capabilities(invalid);
  assert.ok(issues.some((issue) => /budget type/i.test(issue.message)));
  assert.ok(issues.some((issue) => /end time/i.test(issue.message)));

  const mapping = {
    advertiser_id: "123456", adgroup_id: "adgroup-1", identity_id: "identity-1", video_id: "video-1",
    creative_mode: "REGULAR", intended_status: "ENABLE", ad_text: "Approved copy", call_to_action: "LEARN_MORE",
    landing_page_url: "https://example.com",
  };
  const replacementItems = [
    item("ad", "old-ad", "ad.creative.video_reference", "old-video", "video-2", mapping),
    item("ad", "old-ad", "ad.creative.identity_reference", "old-identity", "identity-1", mapping),
  ];
  const first = planTikTokM03Mutation({ requestId: "request", revisionHash: "b".repeat(64), items: replacementItems });
  const second = planTikTokM03Mutation({ requestId: "request", revisionHash: "b".repeat(64), items: replacementItems });
  assert.deepEqual(first.operations.map((operation) => operation.operation_key), second.operations.map((operation) => operation.operation_key));
  assert.deepEqual(first.operations.map((operation) => operation.action), [
    "create_inactive_replacement", "verify_replacement", "activate_replacement", "disable_previous", "verify_final_state",
  ]);
  assert.equal(first.operations[0]?.transport?.safe_to_retry, false);
  assert.equal(first.operations[0]?.transport?.body.operation_status, "DISABLE");
  assert.equal(first.operations[2]?.transport?.body.operation_status, "ENABLE");
  assert.deepEqual(first.replacement_items.sort(), replacementItems.map((entry) => entry.id).sort());

  let transportCalls = 0;
  const transport: TikTokM03Transport = { request: async () => { transportCalls += 1; return { data: { ad_id: "replacement-ad" } }; } };
  const adapter = createTikTokM03Adapter({ transport });
  await assert.rejects(() => executeM03MutationPlan(adapter, first, {
    deployment_enabled: false, platform_allowlisted: true, account_allowlisted: true, exact_revision_selected: true,
  }), /provider execution is locked/i);
  assert.equal(transportCalls, 0);
});

function item(
  entityType: M03ChangeItem["entity_type"], identity: string, fieldPath: string,
  baseline: unknown, proposed: unknown, mapping: Record<string, unknown> = {},
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
