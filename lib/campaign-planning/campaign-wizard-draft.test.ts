import assert from "node:assert/strict";
import test from "node:test";

import { campaignEditDraftInputSchema, campaignWizardDraftInputSchema } from "./validation";

test("accepts partial form data for autosave", () => {
  const parsed = campaignWizardDraftInputSchema.parse({
    platform: "meta",
    current_step: 1,
    highest_reached_step: 1,
    form_data: { platform: "meta", campaignName: "Partially entered" },
  });
  assert.equal(parsed.form_data.campaignName, "Partially entered");
});

test("rejects progress outside the five-step wizard", () => {
  assert.equal(campaignWizardDraftInputSchema.safeParse({
    platform: "google",
    current_step: 5,
    highest_reached_step: 5,
    form_data: {},
  }).success, false);
});

test("rejects current step beyond highest reached step", () => {
  assert.equal(campaignWizardDraftInputSchema.safeParse({
    platform: "tiktok",
    current_step: 3,
    highest_reached_step: 1,
    form_data: {},
  }).success, false);
});

test("accepts partial per-campaign edit state with an immutable base", () => {
  const parsed = campaignEditDraftInputSchema.parse({
    base_revision_id: 7,
    base_lock_version: 3,
    platform: "google",
    current_step: 2,
    highest_reached_step: 3,
    form_data: { campaignName: "Recovered edit" },
  });
  assert.equal(parsed.base_revision_id, 7);
  assert.equal(parsed.form_data.campaignName, "Recovered edit");
});
