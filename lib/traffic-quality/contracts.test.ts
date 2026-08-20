import assert from "node:assert/strict";
import test from "node:test";

import {
  TRAFFIC_QUALITY_CLASSIFICATIONS,
  normalizeTrafficQualityRecommendation,
} from "./contracts";

test("accepts every canonical classification and preserves the six-field AI contract", () => {
  for (const classification of TRAFFIC_QUALITY_CLASSIFICATIONS) {
    const result = normalizeTrafficQualityRecommendation({
      classification,
      recommendedAction: "exclude",
      recommendedNegativeMatchType: "exact",
      confidence: 87,
      reason: "The query is outside the advertised service.",
      clientConfirmationRequired: false,
    });

    assert.deepEqual(result, {
      classification,
      recommendedAction: "exclude",
      recommendedNegativeMatchType: "exact",
      confidence: 87,
      reason: "The query is outside the advertised service.",
      clientConfirmationRequired: false,
    });
  }
});

test("invalid or unavailable AI output fails safe to human review with no exclusion", () => {
  for (const input of [null, {}, { classification: "invented", recommendedAction: "exclude", confidence: 99 }]) {
    assert.deepEqual(normalizeTrafficQualityRecommendation(input), {
      classification: "Unclear or human review required",
      recommendedAction: "review",
      recommendedNegativeMatchType: null,
      confidence: 0,
      reason: "AI output was unavailable or invalid; human review is required.",
      clientConfirmationRequired: true,
    });
  }
});

test("rejects confidence outside 0 to 100 and exclusion without a match type", () => {
  const base = {
    classification: "Wrong service",
    recommendedAction: "exclude",
    recommendedNegativeMatchType: "exact",
    reason: "Wrong service.",
    clientConfirmationRequired: false,
  };

  assert.equal(normalizeTrafficQualityRecommendation({ ...base, confidence: 101 }).recommendedAction, "review");
  assert.equal(normalizeTrafficQualityRecommendation({ ...base, confidence: -1 }).recommendedAction, "review");
  assert.equal(normalizeTrafficQualityRecommendation({ ...base, confidence: 80, recommendedNegativeMatchType: null }).recommendedAction, "review");
});

test("normalizes the snake-case contract returned by AI workers", () => {
  assert.deepEqual(normalizeTrafficQualityRecommendation({
    classification: "Spam or suspicious",
    recommended_action: "exclude",
    recommended_negative_match_type: "phrase",
    confidence: 93,
    explanation: "Repeated automated-looking placement traffic.",
    client_confirmation_required: true,
  }), {
    classification: "Spam or suspicious",
    recommendedAction: "exclude",
    recommendedNegativeMatchType: "phrase",
    confidence: 93,
    reason: "Repeated automated-looking placement traffic.",
    clientConfirmationRequired: true,
  });
});
