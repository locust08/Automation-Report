import assert from "node:assert/strict";
import test from "node:test";

import { CAMPAIGN_STATUS_PRESENTATIONS } from "./campaign-status-presentation";
import type { CampaignPlanStatus } from "./types";

test("defines a distinct presentation for every campaign status", () => {
  const statuses: CampaignPlanStatus[] = [
    "draft",
    "awaiting_approval",
    "approved",
    "launch_in_progress",
    "launched",
    "cancelled",
  ];

  assert.deepEqual(Object.keys(CAMPAIGN_STATUS_PRESENTATIONS), statuses);
  assert.equal(
    new Set(statuses.map((status) => CAMPAIGN_STATUS_PRESENTATIONS[status].dotClassName)).size,
    statuses.length,
  );
  for (const status of statuses) {
    assert.ok(CAMPAIGN_STATUS_PRESENTATIONS[status].label.length > 0);
    assert.match(CAMPAIGN_STATUS_PRESENTATIONS[status].badgeClassName, /border-/);
    assert.match(CAMPAIGN_STATUS_PRESENTATIONS[status].dotClassName, /size-2\.5/);
  }
});
