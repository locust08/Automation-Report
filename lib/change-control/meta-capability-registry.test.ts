import assert from "node:assert/strict";
import test from "node:test";

import { planMetaM03Mutation, validateMetaM03Capabilities } from "./meta-provider-adapter";
import type { M03ChangeItem } from "./types";

test("every Meta management field is declared once and resolves through the provider with its declared mutation mode", async () => {
  const registryModule = await import("./meta-capability-registry").catch(() => null);
  assert.ok(registryModule, "Meta management fields must have a client-safe capability registry.");
  if (!registryModule) return;

  const fields = registryModule.M03_META_CHANGE_FIELDS;
  assert.ok(fields.length > 0);
  const items = fields.map((field, index) => itemFor(field, index));
  assert.deepEqual(validateMetaM03Capabilities(items), []);

  const plan = planMetaM03Mutation({ requestId: "request", revisionHash: "e".repeat(64), items });
  assert.deepEqual(plan.issues, []);
  for (const field of fields) {
    const sourceItem = items.find((item) => item.field_path === field.field_path);
    assert.ok(sourceItem);
    const operations = plan.operations.filter((operation) =>
      operation.item_id === sourceItem.id || operation.affected_item_ids?.includes(sourceItem.id) === true,
    );
    assert.ok(operations.length > 0, `${field.field_path} must produce a Meta provider operation.`);
    assert.ok(operations.every((operation) => operation.mode === field.mutation_mode));
  }
});

function itemFor(
  field: {
    entity_type: "campaign" | "ad_set" | "ad";
    field_path: string;
    value_type: M03ChangeItem["value_type"];
  },
  index: number,
): M03ChangeItem {
  const proposed = proposedValue(field.field_path);
  return {
    id: `item-${index}`,
    request_id: "request",
    entity_type: field.entity_type,
    entity_identity: field.entity_type === "campaign" ? "campaign-1" : field.entity_type === "ad_set" ? "adset-1" : "ad-1",
    field_path: field.field_path,
    value_type: field.value_type,
    baseline_value: null,
    proposed_value: proposed,
    evidence: {},
    platform_resource_mapping: field.entity_type === "ad" ? {
      account_id: "act_123",
      ad_set_id: "adset-1",
      page_id: "page-1",
      intended_status: "ACTIVE",
    } : {},
    validation_issues: [],
    provider_result_evidence: {},
    readback_evidence: {},
    capability_registry_version: null,
    mutation_mode: null,
    replacement_stage: null,
    created_at: "2026-08-01T00:00:00.000Z",
  };
}

function proposedValue(fieldPath: string): unknown {
  const values: Record<string, unknown> = {
    "campaign.name": "Updated campaign",
    "campaign.status": "ACTIVE",
    "campaign.budget.daily": 100,
    "campaign.budget.lifetime": 1000,
    "campaign.bid.strategy": "LOWEST_COST_WITHOUT_CAP",
    "ad_set.name": "Updated ad set",
    "ad_set.status": "ACTIVE",
    "ad_set.budget.daily": 100,
    "ad_set.budget.lifetime": 1000,
    "ad_set.schedule.start_time": "2026-09-01T00:00:00+0000",
    "ad_set.schedule.end_time": "2026-10-01T00:00:00+0000",
    "ad_set.bid.strategy": "COST_CAP",
    "ad_set.bid.amount": 25,
    "ad_set.billing_event": "IMPRESSIONS",
    "ad_set.optimization_goal": "OFFSITE_CONVERSIONS",
    "ad_set.attribution.spec": { attribution_spec: [{ event_type: "CLICK_THROUGH", window_days: 7 }] },
    "ad_set.targeting.geo_locations": { countries: ["MY"] },
    "ad_set.placements.publisher_platforms": ["facebook", "instagram"],
    "ad.name": "Updated ad",
    "ad.status": "ACTIVE",
    "ad.copy.primary_text": "New primary text",
    "ad.copy.headline": "New headline",
    "ad.copy.description": "New description",
    "ad.creative.call_to_action": "LEARN_MORE",
    "ad.creative.destination_url": "https://example.com/new",
  };
  return values[fieldPath];
}
