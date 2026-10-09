import assert from "node:assert/strict";
import { test } from "node:test";
import { boundedJson } from "./index.js";

test("boundedJson accepts a small dispatcher response", async () => {
  const response = new Response(JSON.stringify({ failedAccounts: 0 }));
  assert.deepEqual(await boundedJson(response), { failedAccounts: 0 });
});

test("boundedJson rejects an oversized dispatcher response", async () => {
  const response = new Response("x".repeat(65 * 1024));
  await assert.rejects(() => boundedJson(response), /too large/);
});
