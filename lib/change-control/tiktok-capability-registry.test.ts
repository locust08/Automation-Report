import assert from "node:assert/strict";
import test from "node:test";

import {
  M03_TIKTOK_CHANGE_FIELDS,
  getM03TikTokChangeField,
  m03TikTokChangeFieldsForEntity,
} from "./tiktok-capability-registry";
import { resolveTikTokM03Capability } from "./tiktok-provider-adapter";

test("every displayed TikTok field resolves to the provider planner with the same mode and resource", () => {
  assert.ok(M03_TIKTOK_CHANGE_FIELDS.length > 0);

  for (const field of M03_TIKTOK_CHANGE_FIELDS) {
    assert.equal(getM03TikTokChangeField(field.field_path), field);
    assert.ok(m03TikTokChangeFieldsForEntity(field.entity_type).includes(field));

    const provider = resolveTikTokM03Capability(field.field_path);
    assert.ok(provider, field.field_path);
    assert.equal(provider?.mode, field.mutation_mode, field.field_path);
    assert.equal(provider?.providerResource, field.provider_resource, field.field_path);
    assert.equal(provider?.providerField, field.provider_field, field.field_path);
  }
});

test("unsupported immutable TikTok fields are not displayed", () => {
  assert.equal(getM03TikTokChangeField("campaign.objective"), undefined);
  assert.equal(getM03TikTokChangeField("campaign.budget.mode"), undefined);
  assert.equal(getM03TikTokChangeField("ad_group.budget.mode"), undefined);
});
