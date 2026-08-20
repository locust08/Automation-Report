import assert from "node:assert/strict";
import test from "node:test";

import { calculateTrafficQualityPriority, priorityCadence } from "./priority";

test("computes the approved deterministic 0 to 100 weighted score", () => {
  const result = calculateTrafficQualityPriority({
    spendRatio: 1,
    clicksRatio: 1,
    spamLeadRate: 1,
    invalidLeadsRatio: 1,
    hasNoQualifiedLeads: true,
    complaintRatio: 1,
    recencyRatio: 1,
    aiConfidence: 100,
    crossCampaignRecurrenceRatio: 1,
    crossClientRecurrenceRatio: 1,
  });

  assert.equal(result.score, 100);
  assert.equal(result.priority, "critical");
  assert.deepEqual(result.breakdown.map((item) => item.points), [20, 10, 20, 10, 10, 15, 5, 5, 5, 5]);
});

test("clamps normalized inputs and maps exact band boundaries", () => {
  const scoreAt = (spendRatio: number, clicksRatio: number, spamLeadRate: number, complaintRatio: number) =>
    calculateTrafficQualityPriority({
      spendRatio,
      clicksRatio,
      spamLeadRate,
      invalidLeadsRatio: 0,
      hasNoQualifiedLeads: false,
      complaintRatio,
      recencyRatio: 0,
      aiConfidence: 0,
      crossCampaignRecurrenceRatio: 0,
      crossClientRecurrenceRatio: 0,
    });

  assert.equal(scoreAt(1, 1, 1, 1).score, 65);
  assert.equal(scoreAt(1, 1, 1, 1).priority, "high");
  assert.equal(scoreAt(1, 1, 0.5, 0).priority, "medium");
  assert.equal(scoreAt(1, 0, 0.5, 0).priority, "normal");
  assert.equal(scoreAt(2, -1, 0, 0).score, 20);
});

test("supports explicit KIV and approved cadence mapping", () => {
  assert.equal(calculateTrafficQualityPriority({ manualKiv: true }).priority, "kiv");
  assert.equal(priorityCadence("critical"), "immediate");
  assert.equal(priorityCadence("high"), "weekly");
  assert.equal(priorityCadence("medium"), "biweekly");
  assert.equal(priorityCadence("normal"), "monthly");
  assert.equal(priorityCadence("kiv"), "manual");
});

test("account thresholds normalize raw metrics before applying fixed weights", () => {
  const result = calculateTrafficQualityPriority({
    spend: 250,
    clicks: 40,
    spamLeads: 3,
    totalLeads: 4,
    invalidLeads: 2,
    qualifiedLeads: 0,
    complaints: 1,
    daysSinceDetected: 1,
    aiConfidence: 100,
    crossCampaignRecurrence: 3,
    crossClientRecurrence: 2,
  }, {
    spendThreshold: 250,
    clicksThreshold: 40,
    invalidLeadsThreshold: 2,
    complaintsThreshold: 1,
    recencyDays: 7,
    crossCampaignThreshold: 3,
    crossClientThreshold: 2,
  });

  assert.equal(result.score, 100);
  assert.equal(result.priority, "critical");
});
