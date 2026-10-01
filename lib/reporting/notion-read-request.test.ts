import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchNotionRead } from "./notion-read-request";

test("Notion reads recover from server errors and bound retries without retrying access failures", async () => {
  const original = globalThis.fetch;
  try {
    for (const [statuses, expectedCalls] of [[ [500, 200], 2 ], [ [503, 503, 503], 3 ], [ [401], 1 ], [ [403], 1 ]] as const) {
      let calls = 0;
      globalThis.fetch = async () => new Response("provider response", { status: statuses[calls++] });
      const result = await fetchNotionRead("https://api.notion.com/v1/databases/test", { cache: "no-store" });
      assert.equal(calls, expectedCalls);
      assert.equal(result.status, statuses[statuses.length - 1]);
      assert.equal(await result.text(), "provider response");
    }
  } finally { globalThis.fetch = original; }
});
