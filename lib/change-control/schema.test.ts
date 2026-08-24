import assert from "node:assert/strict";
import test from "node:test";

import { m03MockChangeRequestSchema } from "./schema";
import { PROVIDER_EXECUTION_LOCKED } from "./types";

test("M03 accepts only mock cross-platform request contracts", () => {
  const base = {
    workflow_mode: "mock",
    title: "Budget adjustment",
    reason: "Dashboard review",
    account_identity: "mock-account",
    campaign_identity: "mock-campaign",
    items: [{ entity_type: "campaign", entity_identity: "mock-campaign", field_path: "budget", baseline_value: 100, proposed_value: 120 }],
    idempotency_key: "request-12345",
  };
  for (const platform of ["google", "meta", "tiktok"] as const) {
    assert.equal(m03MockChangeRequestSchema.safeParse({ ...base, platform }).success, true);
  }
  assert.equal(m03MockChangeRequestSchema.safeParse({ ...base, platform: "google", workflow_mode: "live" }).success, false);
});

test("M03 provider contract remains hard locked", () => {
  assert.equal(PROVIDER_EXECUTION_LOCKED.error, "provider_execution_locked");
});
