import assert from "node:assert/strict";
import test from "node:test";

import type { CampaignPlanSummary } from "./types";
import { buildCampaignRows, filterCampaigns, paginateCampaigns } from "./campaign-list-view";

function campaign(id: number, platform: CampaignPlanSummary["platform"], status: CampaignPlanSummary["status"]): CampaignPlanSummary {
  return {
    id,
    platform,
    status,
    campaignName: `Campaign ${id}`,
    clientId: "client",
    clientName: "Client",
    accountName: "Account",
    packageName: "Package",
    currency: "MYR",
    allocatedBudget: 1000,
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    objective: "leads",
    lockVersion: 1,
    updatedAt: "2026-08-01T00:00:00Z",
  };
}

test("filters campaigns by platform and workflow status together", () => {
  const campaigns = [campaign(1, "google", "draft"), campaign(2, "google", "launched"), campaign(3, "meta", "launched")];

  assert.deepEqual(filterCampaigns(campaigns, "google", "launched").map((item) => item.id), [2]);
});

test("paginates campaigns at ten items and clamps an out-of-range page", () => {
  const campaigns = Array.from({ length: 23 }, (_, index) => campaign(index + 1, "google", "draft"));

  assert.deepEqual(paginateCampaigns(campaigns, 2), { items: campaigns.slice(10, 20), page: 2, pageCount: 3, total: 23 });
  assert.deepEqual(paginateCampaigns(campaigns, 99), { items: campaigns.slice(20), page: 3, pageCount: 3, total: 23 });
});

test("groups two-column campaign cards so details can render after the selected row", () => {
  const campaigns = [1, 2, 3, 4, 5].map((id) => campaign(id, "google", "draft"));

  assert.deepEqual(buildCampaignRows(campaigns).map((row) => row.map((item) => item.id)), [[1, 2], [3, 4], [5]]);
});
