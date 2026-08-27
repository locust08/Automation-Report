import assert from "node:assert/strict";
import test from "node:test";

import { TIKTOK_MANAGEMENT_PRIMARY_TABS, tiktokStageForTab } from "./tiktok-management-navigation";

test("TikTok navigation exposes focused management sections and maps resource tabs to stages", () => {
  assert.deepEqual(TIKTOK_MANAGEMENT_PRIMARY_TABS, ["campaigns", "ad_groups", "ads", "recommendations"]);
  assert.equal(tiktokStageForTab("campaigns"), "campaigns");
  assert.equal(tiktokStageForTab("ad_groups"), "ad-groups");
  assert.equal(tiktokStageForTab("ads"), "ads");
  assert.equal(tiktokStageForTab("recommendations"), null);
  assert.equal(tiktokStageForTab("change_requests"), null);
});
