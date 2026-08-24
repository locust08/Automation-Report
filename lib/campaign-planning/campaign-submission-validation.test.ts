import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import {
  formatCampaignValidationError,
  mapCampaignIssueToWizardField,
} from "./campaign-submission-validation";

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
    issues: [{ path: ["campaign", "creative", "headlines", 0], message: "Headline must be 40 characters or fewer." }],
  });
});
