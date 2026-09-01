import assert from "node:assert/strict";
import test from "node:test";

import { getTikTokManagementStagePlan, parseTikTokManagementStage } from "./tiktok-management-stage";

test("parses only supported TikTok progressive stages", () => {
  assert.equal(parseTikTokManagementStage("campaigns"), "campaigns");
  assert.equal(parseTikTokManagementStage("ad-groups"), "ad-groups");
  assert.equal(parseTikTokManagementStage("ads"), "ads");
  assert.equal(parseTikTokManagementStage("assets"), "assets");
  assert.equal(parseTikTokManagementStage("full"), null);
  assert.equal(parseTikTokManagementStage(null), null);
});

test("maps each TikTok stage to only the required object and report calls", () => {
  assert.deepEqual(getTikTokManagementStagePlan("campaigns"), { objectActions: ["campaign.list"], reportLevel: "campaign", loadAssets: false });
  assert.deepEqual(getTikTokManagementStagePlan("ad-groups"), { objectActions: ["campaign.list", "adgroup.list"], reportLevel: "adgroup", loadAssets: false });
  assert.deepEqual(getTikTokManagementStagePlan("ads"), { objectActions: ["campaign.list", "adgroup.list", "ad.list"], reportLevel: "ad", loadAssets: false });
  assert.equal(getTikTokManagementStagePlan("assets").loadAssets, true);
});
