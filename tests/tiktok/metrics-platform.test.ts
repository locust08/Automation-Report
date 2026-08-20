import assert from "node:assert/strict";
import test from "node:test";

import { buildGroups, emptyCampaignRow } from "../../lib/reporting/metrics";

test("keeps TikTok campaign groups on the TikTok platform", () => {
  const row = {
    ...emptyCampaignRow("campaign-1", "tiktok", "TikTok Auction", "Reach campaign"),
    impressions: 1000,
    spend: 25,
  };

  const [group] = buildGroups([row]);

  assert.equal(group.platform, "tiktok");
  assert.equal(group.totals.platform, "tiktok");
});

test("marks totals as mixed when TikTok campaigns use incompatible result outcomes", () => {
  const reach = {
    ...emptyCampaignRow("reach", "tiktok", "TikTok Auction", "Reach campaign"),
    spend: 100,
    results: 800,
    conversions: 800,
    costPerResult: 0.125,
    resultLabel: "Reach",
  };
  const followers = {
    ...emptyCampaignRow("followers", "tiktok", "TikTok Auction", "Follower campaign"),
    spend: 100,
    results: 50,
    conversions: 50,
    costPerResult: 2,
    resultLabel: "Followers",
  };

  const [group] = buildGroups([reach, followers]);

  assert.equal(group.totals.resultLabel, "Mixed");
});
