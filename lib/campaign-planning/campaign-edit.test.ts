import assert from "node:assert/strict";
import test from "node:test";

import type { CampaignPlan } from "./domain";
import { applyCampaignPlanEdit } from "./campaign-edit";

const plan = {
  platform: "google",
  campaign_name: "Original",
  objective: "leads",
  start_date: "2026-08-01",
  end_date: "2026-08-31",
  allocated_budget: 3100,
  daily_budget: 100,
  projected_total: 3100,
  increment_amount: 0,
  destination: "https://example.test/original",
} as CampaignPlan;

test("applies editable planning fields without replacing platform-specific settings", () => {
  const edited = applyCampaignPlanEdit(plan, {
    campaign_name: "Updated",
    objective: "sales",
    start_date: "2026-08-02",
    end_date: "2026-08-21",
    allocated_budget: 4000,
    destination: "https://example.test/updated",
  });

  assert.equal(edited.campaign_name, "Updated");
  assert.equal(edited.objective, "sales");
  assert.equal(edited.allocated_budget, 4000);
  assert.equal(edited.destination, "https://example.test/updated");
  assert.equal(edited.platform, "google");
  assert.equal(edited.daily_budget, 200);
  assert.equal(edited.projected_total, 4000);
});
