import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTikTokSetupRevision,
  type TikTokSetupBuilderInput,
  verifyTikTokSetupRevision,
} from "../../lib/tiktok/setup-plan";
import { setupInput } from "./setup-test-fixtures";

function unsafeSetupInput() {
  return setupInput() as unknown as {
    brief: { objective: string };
    campaign: { automationMode: string };
    adGroups: Array<{
      budgetMode: string;
      dailyBudget?: number;
      totalBudget?: number;
      objectiveSettings: { objective: string };
      ads: Array<{ creativeMode: string; authorizationCode?: string }>;
    }>;
  };
}

test("builds the same immutable revision from semantically reordered input", () => {
  const first = setupInput() as unknown as TikTokSetupBuilderInput;
  first.campaign.specialIndustries = ["HOUSING", "EMPLOYMENT", "HOUSING"];
  first.adGroups[0].targeting.locationIds = ["999", "156", "999"];
  first.adGroups[0].targeting.ageGroups = ["AGE_35_44", "AGE_25_34"];

  const second = structuredClone(first);
  second.campaign.specialIndustries.reverse();
  second.adGroups[0].targeting.locationIds.reverse();
  second.adGroups[0].targeting.ageGroups.reverse();

  const firstRevision = buildTikTokSetupRevision(first);
  const secondRevision = buildTikTokSetupRevision(second);
  assert.deepEqual(firstRevision, secondRevision);
  assert.deepEqual(firstRevision.plan.campaign.specialIndustries, ["EMPLOYMENT", "HOUSING"]);
  assert.deepEqual(firstRevision.plan.adGroups[0].targeting.locationIds, ["156", "999"]);
  assert.equal(firstRevision.plan.adGroups[0].targeting.searchResultEnabled, false);
  assert.equal(firstRevision.calculations.nominalPlannedSpend, 300);
  assert.equal(firstRevision.calculations.providerBudgetEnvelope, 375);
  assert.equal(firstRevision.calculations.overdeliveryHeadroom, 75);
  assert.equal(firstRevision.calculations.remainingAllocationAfterEnvelope, 0);
  assert.deepEqual(firstRevision.calculations.budgetPolicy, {
    id: "TIKTOK_DYNAMIC_DAILY_PER_DAY_125_V1",
    dailyUpperBoundBps: 12_500,
    weeklyNettingApplied: false,
    assumption: "UNCHANGED_BUDGET_AND_SCHEDULE",
  });
});

test("accepts the three v1 objective adapters and blocks Video Views fail-closed", () => {
  for (const objective of [
    "TRAFFIC",
    "WEB_CONVERSIONS",
    "LEAD_GENERATION",
  ] as const) {
    const revision = buildTikTokSetupRevision(setupInput(objective));
    assert.equal(revision.plan.brief.objective, objective);
    assert.equal(revision.plan.adGroups[0].objectiveSettings.objective, objective);
    assert.equal(revision.plan.adGroups[0].budgetMode, "BUDGET_MODE_DYNAMIC_DAILY_BUDGET");
  }
  assert.throws(
    () => buildTikTokSetupRevision(setupInput("VIDEO_VIEWS")),
    /VIDEO_VIEWS is excluded from the v1 setup workflow/,
  );
});

test("accepts the website lead-generation branch", () => {
  const input = setupInput("LEAD_GENERATION") as unknown as TikTokSetupBuilderInput;
  input.adGroups[0].objectiveSettings = {
    objective: "LEAD_GENERATION",
    destination: "WEBSITE",
    destinationUrl: "https://example.com/lead",
    promotionTargetType: "EXTERNAL_WEBSITE",
    optimizationGoal: "LEAD_GENERATION",
    billingEvent: "OCPM",
    pixelId: "9001",
    optimizationEvent: "SUBMIT_FORM",
  };
  const revision = buildTikTokSetupRevision(input);
  assert.equal(revision.plan.adGroups[0].objectiveSettings.destination, "WEBSITE");
});

test("rejects an invalid or fixed-offset advertiser timezone", () => {
  const unknown = setupInput();
  unknown.advertiser.timezone = "Malaysia time";
  assert.throws(() => buildTikTokSetupRevision(unknown), /valid IANA timezone/);

  const fixedOffset = setupInput();
  fixedOffset.advertiser.timezone = "+08:00";
  assert.throws(() => buildTikTokSetupRevision(fixedOffset), /valid IANA timezone/);
});

test("requires HTTPS for every website destination branch", () => {
  const traffic = setupInput("TRAFFIC");
  traffic.adGroups[0].objectiveSettings.destinationUrl = "http://example.com/traffic";
  assert.throws(() => buildTikTokSetupRevision(traffic), /must use HTTPS/);

  const conversions = setupInput("WEB_CONVERSIONS");
  conversions.adGroups[0].objectiveSettings.destinationUrl = "http://example.com/convert";
  assert.throws(() => buildTikTokSetupRevision(conversions), /must use HTTPS/);

  const leads = setupInput("LEAD_GENERATION") as unknown as TikTokSetupBuilderInput;
  leads.adGroups[0].objectiveSettings = {
    objective: "LEAD_GENERATION",
    destination: "WEBSITE",
    destinationUrl: "http://example.com/lead",
    promotionTargetType: "EXTERNAL_WEBSITE",
    optimizationGoal: "LEAD_GENERATION",
    billingEvent: "OCPM",
    pixelId: "9001",
    optimizationEvent: "SUBMIT_FORM",
  };
  assert.throws(() => buildTikTokSetupRevision(leads), /must use HTTPS/);
});

test("rejects app, Smart+, and Spark-like input through the strict v1 contract", () => {
  const app = unsafeSetupInput();
  app.brief.objective = "APP_PROMOTION";
  app.adGroups[0].objectiveSettings.objective = "APP_PROMOTION";
  assert.throws(() => buildTikTokSetupRevision(app));

  const smart = unsafeSetupInput();
  smart.campaign.automationMode = "SMART_PLUS";
  assert.throws(() => buildTikTokSetupRevision(smart));

  const spark = unsafeSetupInput();
  spark.adGroups[0].ads[0].creativeMode = "SPARK";
  spark.adGroups[0].ads[0].authorizationCode = "must-not-be-stored";
  assert.throws(() => buildTikTokSetupRevision(spark));
});

test("rejects over-allocation, schedule drift, and advertiser-mismatched targeting", () => {
  const over = setupInput();
  over.adGroups[0].dailyBudget = 101;
  assert.throws(() => buildTikTokSetupRevision(over), /Provider budget envelope/);

  const missingHeadroom = setupInput();
  missingHeadroom.mediaPlan.allocatedBudget = 374.99;
  assert.throws(() => buildTikTokSetupRevision(missingHeadroom), /Provider budget envelope/);

  const schedule = setupInput();
  schedule.adGroups[0].endDate = "2026-09-04";
  assert.throws(() => buildTikTokSetupRevision(schedule), /inside the approved/);

  const targeting = setupInput();
  targeting.adGroups[0].targeting.validation.advertiserId = "999";
  assert.throws(() => buildTikTokSetupRevision(targeting), /selected advertiser/);

  const searchPlacement = setupInput() as unknown as {
    adGroups: Array<{ targeting: { searchResultEnabled: boolean } }>;
  };
  searchPlacement.adGroups[0].targeting.searchResultEnabled = true;
  assert.throws(() => buildTikTokSetupRevision(searchPlacement), /expected false/);
});

test("calculates conservative daily envelopes deterministically across schedules and groups", () => {
  const oneDay = setupInput();
  oneDay.mediaPlan.startDate = "2026-09-01";
  oneDay.mediaPlan.endDate = "2026-09-01";
  oneDay.mediaPlan.allocatedBudget = 26.25;
  oneDay.adGroups[0].startDate = "2026-09-01";
  oneDay.adGroups[0].endDate = "2026-09-01";
  oneDay.adGroups[0].dailyBudget = 21;
  const oneDayRevision = buildTikTokSetupRevision(oneDay);
  assert.equal(oneDayRevision.calculations.nominalPlannedSpend, 21);
  assert.equal(oneDayRevision.calculations.providerBudgetEnvelope, 26.25);

  const multiple = setupInput();
  multiple.adGroups[0].dailyBudget = 50;
  multiple.adGroups.push({
    ...structuredClone(multiple.adGroups[0]),
    key: "retargeting",
    name: "MY | Retargeting",
    ads: [{ ...structuredClone(multiple.adGroups[0].ads[0]), key: "video-02" }],
  });
  const multipleRevision = buildTikTokSetupRevision(multiple);
  assert.equal(multipleRevision.calculations.nominalPlannedSpend, 300);
  assert.equal(multipleRevision.calculations.providerBudgetEnvelope, 375);

  const sevenDays = setupInput();
  sevenDays.mediaPlan.endDate = "2026-09-07";
  sevenDays.mediaPlan.totalApprovedBudget = 875;
  sevenDays.mediaPlan.allocatedBudget = 875;
  sevenDays.adGroups[0].endDate = "2026-09-07";
  const sevenDayRevision = buildTikTokSetupRevision(sevenDays);
  assert.equal(sevenDayRevision.calculations.nominalPlannedSpend, 700);
  assert.equal(sevenDayRevision.calculations.providerBudgetEnvelope, 875);
  assert.equal(sevenDayRevision.calculations.budgetPolicy.weeklyNettingApplied, false);
});

test("keeps lifetime and mixed budget fields outside the v1 contract", () => {
  const lifetime = unsafeSetupInput();
  lifetime.adGroups[0].budgetMode = "BUDGET_MODE_TOTAL";
  lifetime.adGroups[0].totalBudget = 300;
  delete lifetime.adGroups[0].dailyBudget;
  assert.throws(() => buildTikTokSetupRevision(lifetime), /BUDGET_MODE_DYNAMIC_DAILY_BUDGET/);

  const mixed = unsafeSetupInput();
  mixed.adGroups[0].totalBudget = 300;
  assert.throws(() => buildTikTokSetupRevision(mixed), /Unrecognized key/);
});

test("detects any edit to an approved revision", () => {
  const revision = buildTikTokSetupRevision(setupInput());
  verifyTikTokSetupRevision(revision);
  const edited = structuredClone(revision);
  edited.plan.adGroups[0].ads[0].adText = "Unapproved edit";
  assert.throws(() => verifyTikTokSetupRevision(edited), /integrity check failed/);

  const derivedEdit = structuredClone(revision);
  derivedEdit.calculations.providerBudgetEnvelope = 300;
  assert.throws(() => verifyTikTokSetupRevision(derivedEdit), /derived calculations are inconsistent/);
});
