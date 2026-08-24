import assert from "node:assert/strict";
import test from "node:test";

import {
  createCampaignWizardForm,
  getCampaignWizardPrimaryAction,
  getCampaignWizardSteps,
  normalizeCampaignWizardProgress,
  restoreCampaignWizardForm,
  shouldAutosaveCampaignWizardStep,
  switchCampaignWizardPlatform,
  validateCampaignWizardStep,
} from "./campaign-wizard";

test("uses platform-native five-step labels", () => {
  assert.deepEqual(getCampaignWizardSteps("google").map((step) => step.label), ["Platform & Account", "Goal & Campaign Type", "Campaign Settings", "Ad Group & Ad", "Review"]);
  assert.deepEqual(getCampaignWizardSteps("meta").map((step) => step.label), ["Platform & Account", "Campaign", "Ad Set", "Ad", "Review"]);
  assert.deepEqual(getCampaignWizardSteps("tiktok").map((step) => step.label), ["Platform & Account", "Campaign", "Ad Group", "Ad", "Review"]);
});

test("switching platform resets incompatible fields and progress", () => {
  const google = { ...createCampaignWizardForm("google"), accountId: "2", packageId: "9", campaignName: "Old", campaignType: "demand_gen" };
  const result = switchCampaignWizardPlatform(google, "meta");
  assert.equal(result.form.platform, "meta");
  assert.equal(result.form.accountId, "");
  assert.equal(result.form.packageId, "");
  assert.equal(result.form.campaignName, "");
  assert.equal(result.form.creativeFormat, "image");
  assert.equal(result.currentStep, 0);
  assert.equal(result.highestReachedStep, 0);
});

test("step validation blocks missing account selection", () => {
  const errors = validateCampaignWizardStep(createCampaignWizardForm("google"), 0);
  assert.deepEqual(errors.map((error) => error.field), ["accountId", "packageId"]);
});

test("google ad step requires search keywords and creative content", () => {
  const form = {
    ...createCampaignWizardForm("google"),
    groupName: "",
    keywords: "",
    headline: "",
    descriptions: "",
  };
  const fields = validateCampaignWizardStep(form, 3).map((error) => error.field);
  assert.deepEqual(fields, ["groupName", "keywords", "headline", "descriptions"]);
});

test("restored progress is clamped to the five available steps", () => {
  assert.deepEqual(normalizeCampaignWizardProgress(9, 12), { currentStep: 4, highestReachedStep: 4 });
  assert.deepEqual(normalizeCampaignWizardProgress(-1, 2), { currentStep: 0, highestReachedStep: 2 });
});

test("restoration ignores malformed persisted field values", () => {
  const form = restoreCampaignWizardForm("google", { campaignName: "Recovered", allocatedBudget: 5000, platform: "meta" });
  assert.equal(form.platform, "google");
  assert.equal(form.campaignName, "Recovered");
  assert.equal(form.allocatedBudget, "5000");
});

test("Demand Gen creative validation reports per-item limits before submission", () => {
  const form = {
    ...createCampaignWizardForm("google"),
    campaignType: "demand_gen",
    headline: `${"A".repeat(41)}, Valid headline`,
    descriptions: "Valid description",
    businessName: "Business",
    assetIds: "image-1",
  };
  const errors = validateCampaignWizardStep(form, 3);
  assert.deepEqual(errors, [{ field: "headline", message: "Each Demand Gen headline must be 40 characters or fewer." }]);
});

test("campaign settings validation rejects invalid destinations with a useful message", () => {
  const form = { ...createCampaignWizardForm("google"), destination: "not-a-url" };
  assert.equal(
    validateCampaignWizardStep(form, 2).find((error) => error.field === "destination")?.message,
    "Destination must be a valid HTTP or HTTPS URL.",
  );
});

test("review requires explicit submission instead of autosaving", () => {
  assert.equal(shouldAutosaveCampaignWizardStep(0), true);
  assert.equal(shouldAutosaveCampaignWizardStep(3), true);
  assert.equal(shouldAutosaveCampaignWizardStep(4), false);
});

test("review uses an explicit button action instead of implicit form submission", () => {
  assert.deepEqual(getCampaignWizardPrimaryAction(3), { kind: "next", buttonType: "button" });
  assert.deepEqual(getCampaignWizardPrimaryAction(4), { kind: "submit", buttonType: "button" });
});

test("Google setup requires an explicit EU political advertising declaration", () => {
  const form = { ...createCampaignWizardForm("google"), euPoliticalAds: "" } as ReturnType<typeof createCampaignWizardForm>;
  assert.equal(validateCampaignWizardStep(form, 2).some((error) => error.field === "euPoliticalAds"), true);
});

test("Meta setup requires an explicit special-ad-category declaration", () => {
  const form = { ...createCampaignWizardForm("meta"), specialAdCategories: "" } as ReturnType<typeof createCampaignWizardForm>;
  assert.equal(validateCampaignWizardStep(form, 1).some((error) => error.field === "specialAdCategories"), true);
});

test("TikTok setup validates optimization and billing-event compatibility", () => {
  const form = { ...createCampaignWizardForm("tiktok"), optimizationGoal: "click", billingEvent: "ocpm" } as ReturnType<typeof createCampaignWizardForm>;
  assert.equal(validateCampaignWizardStep(form, 2).some((error) => error.field === "billingEvent"), true);
});
