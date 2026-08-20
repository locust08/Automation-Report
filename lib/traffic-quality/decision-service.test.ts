import assert from "node:assert/strict";
import test from "node:test";

import { createTrafficQualityDecisionService } from "./decision-service";

test("reviewer decisions append an immutable event and never invoke Google or M03 publishing", async () => {
  const calls: string[] = [];
  const service = createTrafficQualityDecisionService({
    saveDecision: async (input) => {
      calls.push(`save:${input.action}`);
      return { id: "decision-1", ...input };
    },
    createM03Draft: async () => {
      calls.push("m03");
      return { changeSetId: "cs-1", duplicate: false };
    },
  });

  const result = await service.review({
    recommendationId: "rec-1",
    accountId: "1234567890",
    action: "request_pm_feedback",
    comment: "Please confirm the service boundary.",
    actor: { id: "user-1", email: "reviewer@example.com", role: "specialist" },
  });

  assert.equal(result.id, "decision-1");
  assert.deepEqual(calls, ["save:request_pm_feedback"]);
});

test("agency risk decisions require authorization and placement recommendations", async () => {
  const service = createTrafficQualityDecisionService({
    saveDecision: async (input) => ({ id: "decision-1", ...input }),
    createM03Draft: async () => ({ changeSetId: "cs-1", duplicate: false }),
  });

  await assert.rejects(() => service.review({
    recommendationId: "rec-1",
    accountId: "1234567890",
    itemType: "search_term",
    action: "add_agency_risk",
    actor: { id: "user-1", email: "reviewer@example.com", role: "specialist" },
  }), /authorised team lead or administrator/i);
});

test("M01 handoff creates an idempotent M03 draft from selected exclusion snapshots", async () => {
  let captured: unknown;
  const service = createTrafficQualityDecisionService({
    saveDecision: async (input) => ({ id: "decision-1", ...input }),
    createM03Draft: async (input) => {
      captured = input;
      return { changeSetId: "cs-1", duplicate: false };
    },
  });

  const result = await service.createChangeSet({
    accountId: "1234567890",
    accountName: "Example account",
    recommendationIds: ["rec-2", "rec-1", "rec-2"],
    actor: { id: "approver-1", email: "approver@example.com", role: "approver" },
  });

  assert.equal(result.changeSetId, "cs-1");
  assert.deepEqual(captured, {
    accountId: "1234567890",
    accountName: "Example account",
    recommendationIds: ["rec-1", "rec-2"],
    idempotencyKey: "m01:1234567890:rec-1,rec-2",
    actor: { id: "approver-1", email: "approver@example.com", role: "approver" },
  });
});
