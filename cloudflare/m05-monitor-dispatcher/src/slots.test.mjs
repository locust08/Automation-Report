import assert from "node:assert/strict";
import { test } from "node:test";
import { malaysiaSlot } from "./slots.js";

test("Malaysia health slots select the correct platform despite UTC cron", () => {
  assert.deepEqual(malaysiaSlot(Date.parse("2026-09-25T00:00:00Z"))?.platforms, ["google", "meta"]);
  assert.deepEqual(malaysiaSlot(Date.parse("2026-09-25T00:15:00Z"))?.platforms, ["tiktok"]);
  assert.deepEqual(malaysiaSlot(Date.parse("2026-09-25T08:00:00Z"))?.platforms, ["google", "meta"]);
  assert.deepEqual(malaysiaSlot(Date.parse("2026-09-25T08:15:00Z"))?.platforms, ["tiktok"]);
  assert.equal(malaysiaSlot(Date.parse("2026-09-25T00:30:00Z")), null);
});

test("Monday recommendation slot is separate from health", () => {
  assert.equal(malaysiaSlot(Date.parse("2026-09-21T01:00:00Z"))?.kind, "recommendations");
  assert.equal(malaysiaSlot(Date.parse("2026-09-22T01:00:00Z")), null);
});
