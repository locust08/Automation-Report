import assert from "node:assert/strict";
import test from "node:test";

import { isMetaCircuitBlocked, metaStageForTab } from "./meta-management-client-state";

test("maps only resource tabs to Meta management stages", () => {
  assert.equal(metaStageForTab("campaigns"), "campaigns");
  assert.equal(metaStageForTab("ad_sets"), "ad-groups");
  assert.equal(metaStageForTab("ads"), "ads");
  assert.equal(metaStageForTab("opportunities"), null);
});

test("keeps refresh blocked only until the circuit cooldown expires", () => {
  const protection = { source: "live" as const, circuitOpen: true, blockedUntil: "2026-01-01T00:01:00.000Z", reason: "limited" };
  assert.equal(isMetaCircuitBlocked(protection, Date.parse("2026-01-01T00:00:00.000Z")), true);
  assert.equal(isMetaCircuitBlocked(protection, Date.parse("2026-01-01T00:02:00.000Z")), false);
});
