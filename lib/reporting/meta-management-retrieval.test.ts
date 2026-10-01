import assert from "node:assert/strict";
import test from "node:test";

import { fetchMetaPreviewData } from "./meta";
import { reportPageCacheContext } from "./report-page-cache";

test("report Meta collections survive fifteen minutes, coalesce, and refresh explicitly", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let clock = originalNow();
  let requests = 0;
  Date.now = () => clock;
  globalThis.fetch = async (input) => {
    requests++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return jsonResponse({ data: String(input).includes("/campaigns?") ? [{ id: "cached", name: "Cached campaign", status: "ACTIVE" }] : [] });
  };
  const load = () => fetchMetaPreviewData({ accountId: "daily-cache-test", accessToken: "test", startDate: "2026-09-01", endDate: "2026-09-30", managementStage: "campaigns" });
  try {
    await Promise.all([reportPageCacheContext.run({ refresh: false }, load), reportPageCacheContext.run({ refresh: false }, load)]);
    assert.equal(requests, 2);
    clock += 16 * 60 * 1000;
    await reportPageCacheContext.run({ refresh: false }, load);
    assert.equal(requests, 2);
    await reportPageCacheContext.run({ refresh: true }, load);
    assert.equal(requests, 4);
    clock += 25 * 60 * 60 * 1000;
    await reportPageCacheContext.run({ refresh: false }, load);
    assert.equal(requests, 6);
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});

test("campaign management retrieves only campaigns and campaign-level daily insights", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/campaigns?")) {
      return jsonResponse({ data: [{ id: "c1", name: "Campaign one", status: "ACTIVE", objective: "OUTCOME_AWARENESS" }] });
    }
    if (url.includes("/insights?")) {
      assert.equal(new URL(url).searchParams.get("level"), "campaign");
      return jsonResponse({ data: [{ date_start: "2026-01-15", campaign_id: "c1", impressions: "1000", clicks: "25", spend: "50", reach: "900", actions: [{ action_type: "video_view", value: "75" }], video_play_actions: [{ action_type: "video_view", value: "350" }] }] });
    }
    throw new Error(`Unexpected Meta request: ${url}`);
  };

  try {
    const result = await fetchMetaPreviewData({
      accountId: "101",
      accessToken: "token",
      startDate: "2026-01-01",
      endDate: "2026-06-30",
      includeInactive: true,
      managementStage: "campaigns",
    });
    assert.equal(urls.length, 2);
    assert.equal(result.data[0]?.performance?.spend, 50);
    assert.equal(result.data[0]?.performance?.videoViews, 350);
    assert.ok(new URL(urls.find((url) => url.includes("/insights?"))!).searchParams.get("fields")?.includes("video_play_actions"));
    assert.equal(result.data[0]?.dailyPerformance?.[0]?.date, "2026-01-15");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ad-group management skips the account ads and creative endpoints", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/campaigns?")) return jsonResponse({ data: [{ id: "c1", name: "Campaign", status: "ACTIVE" }] });
    if (url.includes("/adsets?")) return jsonResponse({ data: [{ id: "s1", campaign_id: "c1", name: "Ad set", status: "ACTIVE" }] });
    if (url.includes("/insights?")) {
      assert.equal(new URL(url).searchParams.get("level"), "adset");
      return jsonResponse({ data: [{ date_start: "2026-01-15", campaign_id: "c1", adset_id: "s1", impressions: "100", clicks: "5", spend: "10", video_play_actions: [{ action_type: "video_view", value: "40" }] }] });
    }
    throw new Error(`Unexpected Meta request: ${url}`);
  };

  try {
    const result = await fetchMetaPreviewData({
      accountId: "102",
      accessToken: "token",
      startDate: "2026-01-01",
      endDate: "2026-06-30",
      includeInactive: true,
      managementStage: "ad-groups",
    });
    assert.equal(urls.length, 3);
    assert.equal(urls.some((url) => url.includes("/ads?")), false);
    assert.equal(result.data[0]?.children[0]?.performance?.spend, 10);
    assert.equal(result.data[0]?.children[0]?.performance?.videoViews, 40);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
