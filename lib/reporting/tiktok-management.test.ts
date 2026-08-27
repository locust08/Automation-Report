import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchTikTokReportLevel,
  normalizeTikTokDailyPerformance,
  normalizeTikTokReportRows,
  reconcileTikTokManagementMetrics,
  rollupTikTokDailyPerformance,
} from "./tiktok";

const rows = [
  { dimensions: { campaign_id: "c1", stat_time_day: "2026-08-01 00:00:00" }, metrics: { spend: "12", clicks: "3", engagements: "13", result: "2", reach: "100", impressions: "120" } },
  { dimensions: { campaign_id: "c1", stat_time_day: "2026-08-02 00:00:00" }, metrics: { spend: "8", clicks: "1", engagements: "7", result: "1", reach: "80", impressions: "90" } },
];

test("TikTok daily rows normalize by resource and retain objective-aware result labels", () => {
  const byResource = normalizeTikTokDailyPerformance(rows, "campaign_id", new Map([["c1", "CONVERSIONS"]]));
  assert.deepEqual(byResource.get("c1"), [
    { date: "2026-08-01", spend: 12, results: 2, clicks: 3, engagements: 13, resultLabel: "Results" },
    { date: "2026-08-02", spend: 8, results: 1, clicks: 1, engagements: 7, resultLabel: "Results" },
  ]);

  const reach = normalizeTikTokDailyPerformance(rows.slice(0, 1), "campaign_id", new Map([["c1", "REACH"]]));
  assert.equal(reach.get("c1")?.[0]?.results, 100);
  assert.equal(reach.get("c1")?.[0]?.resultLabel, "Reach");
});

test("TikTok child daily points roll up engagements without losing dates", () => {
  const children = new Map([
    ["g1", [{ date: "2026-08-01", spend: 4, results: 1, clicks: 2, engagements: 8, resultLabel: "Leads" }]],
    ["g2", [{ date: "2026-08-01", spend: 6, results: 2, clicks: 1, engagements: 5, resultLabel: "Leads" }]],
  ]);
  const rolled = rollupTikTokDailyPerformance(children, new Map([["g1", "c1"], ["g2", "c1"]]));
  assert.deepEqual(rolled.get("c1"), [{ date: "2026-08-01", spend: 10, results: 3, clicks: 3, engagements: 13, resultLabel: "Leads" }]);
});

test("TikTok report rows preserve all-click engagements separately from destination clicks", () => {
  const normalized = normalizeTikTokReportRows(rows, "campaign_id");

  assert.equal(normalized[0]?.clicks, 4);
  assert.equal(normalized[0]?.engagements, 20);
});

test("TikTok management reports request all-click engagements in the existing provider call", async () => {
  const requests: Record<string, unknown>[] = [];
  await fetchTikTokReportLevel({
    async request(_action, input) {
      requests.push(input);
      return { data: { list: [], page_info: { total_page: 1 } } };
    },
  }, {
    advertiserId: "7512267932496560146",
    startDate: "2026-08-01",
    endDate: "2026-08-01",
    level: "campaign",
  });

  assert.deepEqual(requests[0]?.metrics, ["spend", "impressions", "clicks", "engagements", "result", "reach"]);
});

test("TikTok staged summaries use objective-aware daily results instead of a zero generic result", () => {
  const reconciled = reconcileTikTokManagementMetrics(
    new Map([["c1", {
      id: "c1",
      name: "Reach campaign",
      impressions: 2_000_000,
      clicks: 0,
      engagements: 50,
      spend: 4_133.19,
      reach: 1_552_822,
      conversions: 0,
      ctr: 0,
      cpc: 0,
      cpm: 2.066595,
      costPerResult: 0,
    }]]),
    new Map([["c1", [{
      date: "2026-08-27",
      spend: 4_133.19,
      results: 1_552_822,
      clicks: 0,
      engagements: 50,
      resultLabel: "Reach",
    }]]]),
  );

  assert.deepEqual(reconciled.get("c1"), {
    id: "c1",
    name: "Reach campaign",
    impressions: 2_000_000,
    clicks: 0,
    engagements: 50,
    spend: 4_133.19,
    reach: 1_552_822,
    conversions: 1_552_822,
    ctr: 0,
    cpc: 0,
    cpm: 2.066595,
    costPerResult: 4_133.19 / 1_552_822,
    resultLabel: "Reach",
  });
});
