import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTikTokCoreSummary,
  fetchTikTokInsightsWithClient,
  normalizeTikTokDeviceOsRows,
  rankTikTokTopAds,
} from "../../lib/reporting/tiktok-insights";

test("builds the five stable TikTok summary cards with previous-period deltas", () => {
  const metrics = buildTikTokCoreSummary(
    { spend: 120, impressions: 60_000, reach: 40_000, clicks: 600 },
    { spend: 100, impressions: 50_000, reach: 20_000, clicks: 250 },
  );

  assert.deepEqual(metrics.map((metric) => metric.key), ["spend", "impressions", "reach", "cpm", "ctr"]);
  assert.deepEqual(metrics.map((metric) => metric.value), [120, 60_000, 40_000, 2, 1]);
  assert.equal(metrics[0]?.delta, 20);
  assert.equal(metrics[2]?.delta, 100);
});

test("normalizes device OS impression shares without fabricating missing categories", () => {
  const rows = normalizeTikTokDeviceOsRows([
    { dimensions: { platform: "ANDROID" }, metrics: { impressions: "660" } },
    { dimensions: { platform: "IOS" }, metrics: { impressions: "320" } },
    { dimensions: { platform: "UNKNOWN" }, metrics: { impressions: "20" } },
  ]);

  assert.deepEqual(rows, [
    { key: "android", label: "Android", impressions: 660, share: 66 },
    { key: "ios", label: "iOS", impressions: 320, share: 32 },
    { key: "unknown", label: "Unknown", impressions: 20, share: 2 },
  ]);
});

test("ranks only the top three ads and retains missing-media placeholders", () => {
  const ranked = rankTikTokTopAds([
    { adId: "1", adName: "One", thumbnailUrl: null, impressions: 10, spend: 1, reach: 8 },
    { adId: "2", adName: "Two", thumbnailUrl: "https://example.com/2.jpg", impressions: 40, spend: 2, reach: 30 },
    { adId: "3", adName: "Three", thumbnailUrl: null, impressions: 30, spend: 4, reach: 22 },
    { adId: "4", adName: "Four", thumbnailUrl: null, impressions: 20, spend: 3, reach: 15 },
  ], "impressions");

  assert.deepEqual(ranked.map((ad) => ad.adId), ["2", "3", "4"]);
  assert.equal(ranked[1]?.thumbnailUrl, null);
});

test("fetches TikTok insights with independent creative and audience blocks", async () => {
  const calls: Array<{ action: string; input: Record<string, unknown> }> = [];
  const client = {
    async request(action: string, input: Record<string, unknown>) {
      calls.push({ action, input });
      if (action === "ad.list") {
        return { data: { list: [
          { ad_id: "ad-1", ad_name: "Winning video", creatives: [{ video_id: "video-1" }] },
          { ad_id: "ad-2", ad_name: "Spark video", creatives: [{ tiktok_item_id: "item-2" }] },
        ], page_info: { total_page: 1 } }, requestId: "ads" };
      }
      if (action === "asset.video-search") {
        return { data: { list: [{ video_id: "video-1", video_info: { video_cover_url: "https://example.com/cover.jpg" } }] }, requestId: "videos" };
      }
      if (action === "spark.list") {
        return { data: { list: [{ item_info: { item_id: "item-2" }, video_info: { video_cover_url: "https://example.com/spark.jpg" } }], page_info: { total_page: 1 } }, requestId: "spark" };
      }
      const dimensions = input.dimensions as string[];
      if (dimensions.includes("platform")) {
        return { data: { list: [
          { dimensions: { platform: "ANDROID" }, metrics: { impressions: "75" } },
          { dimensions: { platform: "IOS" }, metrics: { impressions: "25" } },
        ], page_info: { total_page: 1 } }, requestId: "audience" };
      }
      if (dimensions.includes("ad_id")) {
        return { data: { list: [
          { dimensions: { ad_id: "ad-1" }, metrics: { spend: "10", impressions: "100", clicks: "2", result: "0", reach: "80" } },
          { dimensions: { ad_id: "ad-2" }, metrics: { spend: "5", impressions: "50", clicks: "1", result: "0", reach: "40" } },
        ], page_info: { total_page: 1 } }, requestId: "ad-report" };
      }
      return { data: { list: [{ dimensions: { advertiser_id: "123" }, metrics: { spend: "15", impressions: "150", clicks: "3", reach: "120" } }], page_info: { total_page: 1 } }, requestId: "totals" };
    },
  };

  const result = await fetchTikTokInsightsWithClient(client, {
    advertiserId: "123",
    advertiserName: "Bellamy MY",
    currency: "MYR",
    timezone: "Asia/Kuala_Lumpur",
    startDate: "2026-07-01",
    endDate: "2026-07-30",
    resolvePublicThumbnail: async () => null,
  });

  assert.equal(result.topAds[0]?.thumbnailUrl, "https://example.com/cover.jpg");
  assert.equal(result.topAds[1]?.thumbnailUrl, "https://example.com/spark.jpg");
  assert.deepEqual(result.deviceOs.map((row) => row.share), [75, 25]);
  assert.deepEqual(result.totals, { spend: 15, impressions: 150, clicks: 3, reach: 120 });
  assert.ok(calls.every((call) => !String(call.input).includes("access_token")));
});
