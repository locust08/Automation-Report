import assert from "node:assert/strict";
import test from "node:test";

import { normalizeTikTokSelectedAdReport } from "../../lib/reporting/tiktok-selected-ad";

test("normalizes nullable TikTok ad metrics and daily points", () => {
  const detail = normalizeTikTokSelectedAdReport([
    {
      dimensions: { stat_time_day: "2026-08-12 00:00:00", ad_id: "ad-1" },
      metrics: {
        spend: "10",
        impressions: "1000",
        reach: "800",
        clicks: "10",
        engagements: "20",
        video_play_actions: "700",
      },
    },
  ], {
    adId: "ad-1",
    adName: "03 | A little of nature",
    currency: "MYR",
    timezone: "Asia/Kuala_Lumpur",
  });

  assert.equal(detail.metrics.frequency, 1.25);
  assert.equal(detail.metrics.destinationCtr, 1);
  assert.equal(detail.metrics.allClickCtr, 2);
  assert.equal(detail.metrics.destinationCpc, 1);
  assert.equal(detail.metrics.cpm, 10);
  assert.equal(detail.daily[0]?.videoViews, 700);
});

test("keeps unavailable TikTok metrics nullable instead of fabricating zeroes", () => {
  const detail = normalizeTikTokSelectedAdReport([
    {
      dimensions: { stat_time_day: "2026-08-12 00:00:00", ad_id: "ad-1" },
      metrics: { impressions: "1000" },
    },
  ], {
    adId: "ad-1",
    adName: "Ad",
    currency: "MYR",
    timezone: "Asia/Kuala_Lumpur",
  });

  assert.equal(detail.metrics.spend, null);
  assert.equal(detail.metrics.reach, null);
  assert.equal(detail.metrics.frequency, null);
  assert.equal(detail.metrics.destinationCtr, null);
  assert.equal(detail.metrics.videoViews, null);
});

test("uses aggregate reach for totals instead of summing daily unique reach", () => {
  const detail = normalizeTikTokSelectedAdReport([
    { dimensions: { stat_time_day: "2026-08-12 00:00:00", ad_id: "ad-1" }, metrics: { impressions: "100", reach: "80" } },
    { dimensions: { stat_time_day: "2026-08-13 00:00:00", ad_id: "ad-1" }, metrics: { impressions: "100", reach: "70" } },
  ], {
    adId: "ad-1",
    adName: "Ad",
    currency: "MYR",
    timezone: "Asia/Kuala_Lumpur",
    aggregateMetrics: { impressions: "200", reach: "120" },
  });

  assert.equal(detail.metrics.reach, 120);
  assert.equal(detail.metrics.frequency, 200 / 120);
});
