import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMetaManagementRecommendations,
  getMetaManagementActivityState,
} from "./meta-recommendations";
import type { CampaignRow } from "../reporting/types";

function campaign(overrides: Partial<CampaignRow>): CampaignRow {
  return {
    id: "campaign-1",
    platform: "meta",
    campaignType: "Sales",
    campaignName: "Default campaign",
    impressions: 1_000,
    clicks: 20,
    ctr: 2,
    cpm: 10,
    results: 4,
    resultLabel: "Purchases",
    costPerResult: 5,
    spend: 20,
    conversions: 4,
    avgCpc: 1,
    youtubeEarnedLikes: 0,
    youtubeEarnedShares: 0,
    ...overrides,
  };
}

test("explains that synchronized campaigns can have no qualifying performance rows", () => {
  const state = getMetaManagementActivityState({
    surface: "recommendations",
    campaignCount: 16,
    performanceRowCount: 0,
    warnings: [
      "Meta Ads returned no campaign rows with spend greater than RM1 for the selected account and date range.",
    ],
  });

  assert.equal(state.kind, "no_qualifying_activity");
  assert.equal(state.title, "No qualifying Meta activity for this date range");
  assert.match(state.description, /16 campaign records were synchronized/);
  assert.match(state.description, /greater than RM1/);
});

test("keeps the normal overview cards visible when a date range has no qualifying rows", () => {
  const state = getMetaManagementActivityState({
    surface: "overview",
    campaignCount: 16,
    performanceRowCount: 0,
    warnings: [
      "Meta Ads returned no campaign rows with spend greater than RM1 for the selected account and date range.",
    ],
  });

  assert.equal(state.kind, "available");
});

test("builds campaign-scoped recommendations that open supported M03 budget requests", () => {
  const recommendations = buildMetaManagementRecommendations([
    campaign({
      id: "efficient",
      campaignName: "Efficient Sales",
      spend: 120,
      results: 24,
      costPerResult: 5,
      clicks: 80,
      impressions: 4_000,
      ctr: 2,
    }),
    campaign({
      id: "wasteful",
      campaignName: "No-result Prospecting",
      spend: 75,
      results: 0,
      costPerResult: 0,
      clicks: 15,
      impressions: 3_000,
      ctr: 0.5,
    }),
  ]);

  assert.deepEqual(
    recommendations.map(({ campaignId, kind, fieldPath }) => ({ campaignId, kind, fieldPath })),
    [
      { campaignId: "wasteful", kind: "reduce_waste", fieldPath: "campaign.budget.daily" },
      { campaignId: "efficient", kind: "scale_winner", fieldPath: "campaign.budget.daily" },
    ],
  );
});
