import assert from "node:assert/strict";
import test from "node:test";
import { exclusionCapMutationSchema } from "./exclusion-cap";

test("shared cap accepts unlimited and limits above the old cap", () => {
  for (const cap of [0, 1, 25, 100, 2147483647]) {
    assert.equal(exclusionCapMutationSchema.safeParse({ cap, expectedVersion: 0 }).success, true);
  }
});

test("shared cap rejects invalid values and missing concurrency version", () => {
  for (const cap of [-1, 1.5, null, "25", Infinity, 2147483648]) {
    assert.equal(exclusionCapMutationSchema.safeParse({ cap, expectedVersion: 0 }).success, false);
  }
  assert.equal(exclusionCapMutationSchema.safeParse({ cap: 25 }).success, false);
});
