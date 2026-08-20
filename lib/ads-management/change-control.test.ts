import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APPROVAL_TTL_MS,
  assertReviewContext,
  buildItemIdempotencyKey,
  canonicalPayloadHash,
  canPerformAdsMutation,
  isApprovalExpired,
  resolveLaunchEligibility,
} from "@/lib/ads-management/change-control";

test("canonical payload hash is stable across object key order", () => {
  const first = canonicalPayloadHash({ version: 3, evidence: { url: "https://example.com", note: "QA" } });
  const second = canonicalPayloadHash({ evidence: { note: "QA", url: "https://example.com" }, version: 3 });
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("canonical payload hash changes when an approved value changes", () => {
  assert.notEqual(
    canonicalPayloadHash({ proposedValue: "ENABLED" }),
    canonicalPayloadHash({ proposedValue: "PAUSED" }),
  );
});

test("review context requires both a reason and evidence", () => {
  assert.throws(() => assertReviewContext("", { summary: "Screenshot reviewed" }), /reason/i);
  assert.throws(() => assertReviewContext("Performance correction", { summary: "" }), /evidence/i);
  assert.doesNotThrow(() => assertReviewContext("Performance correction", { summary: "Screenshot reviewed" }));
});

test("approval expiry uses the 24 hour contract", () => {
  const approvedAt = new Date("2026-08-20T00:00:00.000Z");
  const expiresAt = new Date(approvedAt.getTime() + APPROVAL_TTL_MS).toISOString();
  assert.equal(isApprovalExpired(expiresAt, new Date("2026-08-20T23:59:59.999Z")), false);
  assert.equal(isApprovalExpired(expiresAt, new Date("2026-08-21T00:00:00.000Z")), true);
  assert.equal(isApprovalExpired(null, approvedAt), true);
});

test("only administrators receive mutation capabilities", () => {
  for (const action of ["draft", "validate", "approve", "publish", "retry", "adopt", "rollback"] as const) {
    assert.equal(canPerformAdsMutation("admin", action), true);
    assert.equal(canPerformAdsMutation("pms", action), false);
    assert.equal(canPerformAdsMutation("approver", action), false);
  }
});

test("launch eligibility accepts verified builds or active legacy adoption", () => {
  assert.deepEqual(resolveLaunchEligibility({ verifiedBuildId: 42, adoptionId: null }), { eligible: true, source: "verified_build", sourceId: "42" });
  assert.deepEqual(resolveLaunchEligibility({ verifiedBuildId: null, adoptionId: "adopt-1" }), { eligible: true, source: "legacy_adoption", sourceId: "adopt-1" });
  assert.deepEqual(resolveLaunchEligibility({ verifiedBuildId: null, adoptionId: null }), { eligible: false, source: "unverified", sourceId: null });
});

test("item idempotency keys are stable per revision item", () => {
  const key = buildItemIdempotencyKey("set-1", 7, "field-9");
  assert.equal(key, buildItemIdempotencyKey("set-1", 7, "field-9"));
  assert.notEqual(key, buildItemIdempotencyKey("set-1", 8, "field-9"));
  assert.match(key, /^m03_[a-f0-9]{64}$/);
});
