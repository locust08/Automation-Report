import assert from "node:assert/strict";
import test from "node:test";

import { buildReportContextQuery } from "./report-navigation";

test("preserves TikTok report context and corrects a stale Meta platform", () => {
  const query = buildReportContextQuery(
    "reportMode=advanced&reportType=advanced&tiktokAccountId=7512267932496560146&platform=meta&country=MY&startDate=2026-07-01&endDate=2026-07-31&screenshot=1",
  );
  const params = new URLSearchParams(query);

  assert.equal(params.get("tiktokAccountId"), "7512267932496560146");
  assert.equal(params.get("platform"), "tiktok");
  assert.equal(params.get("country"), "MY");
  assert.equal(params.get("startDate"), "2026-07-01");
  assert.equal(params.get("endDate"), "2026-07-31");
  assert.equal(params.has("reportMode"), false);
  assert.equal(params.has("reportType"), false);
  assert.equal(params.has("screenshot"), false);
});

test("preserves repeated campaign filters while dropping hierarchy selections", () => {
  const query = buildReportContextQuery(
    "googleAccountId=960-973-9449&platform=google&campaignNameFilterMode=include&campaignNameFilterValue=Brand&campaignNameFilterValue=Search&campaignId=123&adGroupId=456",
  );
  const params = new URLSearchParams(query);

  assert.deepEqual(params.getAll("campaignNameFilterValue"), ["Brand", "Search"]);
  assert.equal(params.has("campaignId"), false);
  assert.equal(params.has("adGroupId"), false);
});
