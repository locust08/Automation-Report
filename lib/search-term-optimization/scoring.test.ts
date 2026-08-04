import assert from "node:assert/strict";
import test from "node:test";

import { calculateSearchTermSafety } from "@/lib/search-term-optimization/scoring";
import type { SearchTermSafetyInput } from "@/lib/search-term-optimization/types";

const safeInput: SearchTermSafetyInput = {
  proposedAction: "negative exact",
  mismatchIsClear: true,
  mismatchCategory: "competitor_brand",
  conversions: 0,
  hasPositiveKeywordOverlap: false,
  absentFromLandingPage: true,
  qualifiedLeads: null,
  clicks: 1,
  cost: 5,
  ambiguous: false,
  clientConfirmationRequired: false,
  automationEnabled: true,
  landingPageContextLoaded: true,
  dataFresh: true,
  alreadyNegative: false,
  hasUnresolvedDecision: false,
  searchTerm: "unrelated competitor water jet",
  matchType: "EXACT",
};

test("score 90+ with no hard failures is auto eligible", () => {
  const result = calculateSearchTermSafety(safeInput);
  assert.equal(result.safetyScore, 100);
  assert.equal(result.safetyBand, "auto_safe");
  assert.equal(result.executionEligibility, true);
});

test("account opt-in remains a hard blocker", () => {
  const result = calculateSearchTermSafety({ ...safeInput, automationEnabled: false });
  assert.equal(result.safetyScore, 100);
  assert.equal(result.executionEligibility, false);
  assert.match(result.hardGateFailures.join(" "), /disabled/i);
});

test("converting terms cannot execute", () => {
  const result = calculateSearchTermSafety({ ...safeInput, conversions: 1 });
  assert.equal(result.executionEligibility, false);
  assert.match(result.hardGateFailures.join(" "), /conversions/i);
});

test("unknown required evidence blocks execution", () => {
  const result = calculateSearchTermSafety({ ...safeInput, absentFromLandingPage: null });
  assert.equal(result.executionEligibility, false);
  assert.match(result.hardGateFailures.join(" "), /unknown/i);
});

test("ambiguous intent is penalized", () => {
  const result = calculateSearchTermSafety({ ...safeInput, ambiguous: true });
  assert.equal(result.safetyScore, 70);
  assert.equal(result.safetyBand, "review_recommended");
  assert.equal(result.executionEligibility, false);
});
