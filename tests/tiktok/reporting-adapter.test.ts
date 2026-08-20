import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchTikTokReportLevel,
  normalizeTikTokReportRows,
  resolveTikTokCampaignResultRows,
} from "../../lib/reporting/tiktok";

test("normalizes additive TikTok campaign totals and derives rate metrics", () => {
  const rows = normalizeTikTokReportRows([
    { dimensions: { campaign_id: "10" }, metrics: { impressions: "100", clicks: "10", spend: "20", result: "40", reach: "80", conversion: "2" } },
    { dimensions: { campaign_id: "10" }, metrics: { impressions: "300", clicks: "15", spend: "30", result: "60", reach: "200", conversion: "1" } },
  ], "campaign_id", new Map([["10", "Launch"]]));

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    id: "10",
    name: "Launch",
    impressions: 400,
    clicks: 25,
    spend: 50,
    reach: 280,
    conversions: 100,
    ctr: 6.25,
    cpc: 2,
    cpm: 125,
    costPerResult: 0.5,
  });
});

test("resolves reach and engagement results from the provider level that reports them", () => {
  const base = {
    name: "Campaign",
    impressions: 1000,
    clicks: 0,
    spend: 100,
    conversions: 0,
    reach: 800,
    ctr: 0,
    cpc: 0,
    cpm: 100,
    costPerResult: 0,
  };
  const rows = resolveTikTokCampaignResultRows({
    campaignRows: [
      { ...base, id: "reach-campaign" },
      { ...base, id: "engagement-campaign", reach: 700 },
    ],
    campaignObjects: [
      { campaign_id: "reach-campaign", objective_type: "REACH" },
      { campaign_id: "engagement-campaign", objective_type: "ENGAGEMENT" },
    ],
    adGroupRows: [
      { ...base, id: "followers-adgroup", conversions: 1295, reach: 600 },
    ],
    adGroupObjects: [
      { adgroup_id: "followers-adgroup", campaign_id: "engagement-campaign", optimization_goal: "FOLLOWERS" },
    ],
  });

  assert.deepEqual(rows.map((row) => ({ id: row.id, results: row.conversions, cost: row.costPerResult, label: row.resultLabel })), [
    { id: "reach-campaign", results: 800, cost: 0.125, label: "Reach" },
    { id: "engagement-campaign", results: 1295, cost: 100 / 1295, label: "Followers" },
  ]);
});

test("does not fabricate zeroes for missing TikTok metrics", () => {
  assert.throws(
    () => normalizeTikTokReportRows([
      { dimensions: { campaign_id: "10" }, metrics: { impressions: "100", spend: "20" } },
    ], "campaign_id"),
    /metric is unavailable: clicks/,
  );
});

test("splits report requests into inclusive 30-day windows and paginates sequentially", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const client = {
    async request(_action: "report.sync", input: Record<string, unknown>) {
      calls.push(input);
      const page = Number(input.page);
      return {
        data: {
          list: page === 1 ? [{ dimensions: { campaign_id: "10" }, metrics: { spend: "1" } }] : [],
          page_info: { total_page: 2 },
        },
        requestId: `request-${calls.length}`,
      };
    },
  };

  const result = await fetchTikTokReportLevel(client, {
    advertiserId: "7512267932496560146",
    startDate: "2026-01-01",
    endDate: "2026-02-15",
    level: "campaign",
  });

  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((call) => [call.start_date, call.end_date, call.page]), [
    ["2026-01-01", "2026-01-30", 1],
    ["2026-01-01", "2026-01-30", 2],
    ["2026-01-31", "2026-02-15", 1],
    ["2026-01-31", "2026-02-15", 2],
  ]);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.requestIds, ["request-1", "request-2", "request-3", "request-4"]);
  assert.equal(calls.every((call) => {
    const metrics = call.metrics as string[];
    return metrics.includes("result") && metrics.includes("reach");
  }), true);
});

test("builds a filtered selected-ad daily report request", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const client = {
    async request(_action: "report.sync", input: Record<string, unknown>) {
      calls.push(input);
      return { data: { list: [], page_info: { total_page: 1 } }, requestId: "selected-ad-daily" };
    },
  };

  await fetchTikTokReportLevel(client, {
    advertiserId: "7512268241088299015",
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    level: "ad",
    dimensions: ["ad_id", "stat_time_day"],
    metrics: ["spend", "impressions", "reach", "clicks", "engagements", "video_play_actions"],
    filtering: [{ field_name: "ad_ids", filter_type: "IN", filter_value: JSON.stringify(["ad-1"]) }],
  });

  assert.deepEqual(calls[0]?.dimensions, ["ad_id", "stat_time_day"]);
  assert.deepEqual(calls[0]?.metrics, ["spend", "impressions", "reach", "clicks", "engagements", "video_play_actions"]);
  assert.deepEqual(calls[0]?.filtering, [{ field_name: "ad_ids", filter_type: "IN", filter_value: JSON.stringify(["ad-1"]) }]);
});
