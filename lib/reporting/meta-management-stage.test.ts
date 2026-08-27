import assert from "node:assert/strict";
import test from "node:test";

import {
  getMetaManagementEntityId,
  getMetaManagementInsightLevel,
  parseMetaManagementStage,
} from "./meta-management-stage";

test("accepts only lightweight Meta management stages", () => {
  assert.equal(parseMetaManagementStage("campaigns"), "campaigns");
  assert.equal(parseMetaManagementStage("ad-groups"), "ad-groups");
  assert.equal(parseMetaManagementStage("ads"), "ads");
  assert.equal(parseMetaManagementStage("full"), null);
  assert.equal(parseMetaManagementStage(null), null);
});

test("selects the correct insight identity for each stage", () => {
  const row = { campaign_id: "c1", adset_id: "s1", ad_id: "a1" };
  assert.equal(getMetaManagementEntityId("campaigns", row), "c1");
  assert.equal(getMetaManagementEntityId("ad-groups", row), "s1");
  assert.equal(getMetaManagementEntityId("ads", row), "a1");
});

test("maps each management stage to the matching Meta insights level", () => {
  assert.equal(getMetaManagementInsightLevel("campaigns"), "campaign");
  assert.equal(getMetaManagementInsightLevel("ad-groups"), "adset");
  assert.equal(getMetaManagementInsightLevel("ads"), "ad");
});
