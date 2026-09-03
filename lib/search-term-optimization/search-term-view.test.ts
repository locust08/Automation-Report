import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DEFAULT_SEARCH_TERM_CATEGORY_FILTER } from "./search-term-view";

test("shows all reviewed search terms by default", () => {
  assert.equal(DEFAULT_SEARCH_TERM_CATEGORY_FILTER, "all");
});

test("does not render the unfinished automatic action history panel", async () => {
  const source = await readFile("components/search-term-optimization/search-term-optimization-page-client.tsx", "utf8");
  assert.doesNotMatch(source, /Automatic action history/);
});
