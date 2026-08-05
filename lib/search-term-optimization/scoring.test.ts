import assert from "node:assert/strict";
import test from "node:test";

import { calculateSafetyScore, evaluateHardGates } from "./scoring";

const safeSignals = {
  mismatchIsClear: true,
  mismatchCategory: "wrong_product",
  conversions: 0,
  noPositiveKeywordOverlap: true,
  landingIntentAbsent: true,
  noQualifiedLeadSignal: true,
  hasPaidClicksOrSpend: true,
  meaningIsAmbiguous: false,
  requiresConfirmation: false,
};

test("deterministic signals total 100 and produce auto-safe", () => {
  const score = calculateSafetyScore(safeSignals);
  assert.equal(score.total, 100);
  assert.equal(score.band, "auto-safe");
});

test("ambiguity and confirmation penalties cannot fall below zero", () => {
  const score = calculateSafetyScore({
    ...safeSignals,
    mismatchIsClear: false,
    mismatchCategory: "none",
    conversions: 1,
    noPositiveKeywordOverlap: false,
    landingIntentAbsent: false,
    noQualifiedLeadSignal: false,
    hasPaidClicksOrSpend: false,
    meaningIsAmbiguous: true,
    requiresConfirmation: true,
  });
  assert.equal(score.total, 0);
});

test("score 90 cannot execute when any hard gate fails", () => {
  const failures = evaluateHardGates({
    automationEnabled: false,
    proposedAction: "negative exact",
    conversions: 0,
    landingContextLoaded: true,
    googleAdsDataFresh: true,
    alreadyNegative: false,
    unresolvedPreviousDecision: false,
    validLength: true,
    exactMatchOnly: true,
    unknownRequiredSignals: [],
  });
  assert.deepEqual(failures, ["Account automation is disabled"]);
});

test("add exact and phrase suggestions fail the action gate", () => {
  for (const proposedAction of ["add exact", "negative phrase"]) {
    assert.ok(
      evaluateHardGates({
        automationEnabled: true,
        proposedAction,
        conversions: 0,
        landingContextLoaded: true,
        googleAdsDataFresh: true,
        alreadyNegative: false,
        unresolvedPreviousDecision: false,
        validLength: true,
        exactMatchOnly: proposedAction === "negative exact",
        unknownRequiredSignals: [],
      }).length > 0,
    );
  }
});
