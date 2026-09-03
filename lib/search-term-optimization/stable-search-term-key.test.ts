import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { stableSearchTermKey } from "./stable-search-term-key";

test("builds a stable key without importing the server repository", async () => {
  assert.equal(
    stableSearchTermKey({ campaignId: "12", adGroupId: "34", searchTerm: "  Brand   Shoes " }),
    "12|34|brand shoes",
  );

  const commitScript = await readFile("scripts/commit-search-term-analysis-batch.mts", "utf8");
  assert.match(commitScript, /stable-search-term-key/);
  assert.doesNotMatch(commitScript, /supabase-repository/);
});
