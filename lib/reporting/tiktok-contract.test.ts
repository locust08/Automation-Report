import assert from "node:assert/strict";
import test from "node:test";

import { parseRequestContext, resolveRouteAccountFallback } from "./request";

test("report request context accepts a TikTok advertiser", () => {
  const params = new URLSearchParams({
    tiktokAccountId: "7512267932496560146",
    platform: "tiktok",
    startDate: "2026-08-01",
    endDate: "2026-08-07",
  });

  assert.deepEqual(parseRequestContext(params), {
    accountId: null,
    metaAccountId: null,
    googleAccountId: null,
    tiktokAccountId: "7512267932496560146",
    startDate: "2026-08-01",
    endDate: "2026-08-07",
    campaignType: null,
    platform: "tiktok",
    source: "api",
  });
});

test("does not reclassify an explicit TikTok advertiser from a staged route path", () => {
  const context = parseRequestContext(new URLSearchParams("tiktokAccountId=7512267932496560146&platform=tiktok"));
  assert.equal(resolveRouteAccountFallback("7512267932496560146", context), null);
});
