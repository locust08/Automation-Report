import test from "node:test";
import assert from "node:assert/strict";

import { buildOverallReportCacheKey } from "./overall-cache";

test("overall report cache key changes when report query semantics change", () => {
  const cacheKey = buildOverallReportCacheKey({
    accountId: null,
    metaAccountId: null,
    googleAccountId: "697-252-8848",
    startDate: "2026-05-01",
    endDate: "2026-05-31",
  });

  assert.match(cacheKey, /^overall-v4-/);
});
