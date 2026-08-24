import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import {
  formatCampaignValidationError,
  mapCampaignIssueToWizardField,
  validateCampaignSubmission,
} from "./campaign-submission-validation";
import { createCampaignWizardForm } from "./campaign-wizard";

test("maps completed payload creative paths back to the ad step", () => {
  assert.deepEqual(mapCampaignIssueToWizardField(["campaign", "creative", "headlines", 0]), {
    field: "headline",
    step: 3,
  });
  assert.deepEqual(mapCampaignIssueToWizardField(["campaign", "destination"]), {
    field: "destination",
    step: 2,
  });
});

test("formats structured validation issues instead of returning Invalid input", () => {
  const schema = z.object({ campaign: z.object({ creative: z.object({ headlines: z.array(z.string().max(40)) }) }) });
  const parsed = schema.safeParse({ campaign: { creative: { headlines: ["A".repeat(41)] } } });
  assert.equal(parsed.success, false);
  if (parsed.success) assert.fail("Expected validation failure");
  assert.deepEqual(formatCampaignValidationError(parsed.error), {
    error: "Some campaign fields need attention.",
    issues: [{ path: ["campaign", "creative", "headlines", 0], step: 3, severity: "error", message: "Headline must be 40 characters or fewer." }],
  });
});

test("server-facing validation rejects a V2 plan without its compliance declaration", () => {
  const form = { ...createCampaignWizardForm("google"), accountId: "10", packageId: "20", campaignName: "Search", euPoliticalAds: "" };
  const result = validateCampaignSubmission(form, { id: 10, clientId: "11111111-1111-4111-8111-111111111111", clientName: "Client", platform: "google", providerAccountId: "mock-google", accountName: "Google", currency: "MYR", timezone: "Asia/Kuala_Lumpur" });
  assert.equal(result.success, false);
  if (result.success) assert.fail("Expected compliance validation failure");
  assert.equal(result.issues.some((issue) => issue.field === "euPoliticalAds"), true);
});
