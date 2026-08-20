import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTikTokInsightsCacheKey,
  resolveTikTokInsightsCacheTtlMs,
  resolveTikTokInsightsWithCache,
} from "../../lib/reporting/tiktok-insights-cache";
import type { TikTokInsightsPayload } from "../../lib/reporting/tiktok-insights";

function payload(thumbnailUrl: string | null = null): TikTokInsightsPayload {
  return {
    account: {
      advertiserId: "123",
      advertiserName: "Bellamy MY",
      currency: "MYR",
      timezone: "Asia/Kuala_Lumpur",
      apiVersion: "v1.3",
      requestProvenance: "tiktok_api_v1.3",
    },
    totals: { spend: 10, impressions: 100, clicks: 2, reach: 80 },
    topAds: [{ adId: "ad-1", adName: "One", thumbnailUrl, impressions: 100, spend: 10, reach: 80 }],
    deviceOs: [],
    warnings: [],
    providerRequestIds: ["request-1"],
  };
}

test("coalesces repeated TikTok insight requests for the same advertiser and dates", async () => {
  let providerCalls = 0;
  const input = { advertiserId: "cache-coalesce", startDate: "2026-07-01", endDate: "2026-07-31" };
  const fetcher = async () => {
    providerCalls += 1;
    return payload();
  };

  const [first, second] = await Promise.all([
    resolveTikTokInsightsWithCache(input, fetcher, { now: Date.parse("2026-08-19T00:00:00Z") }),
    resolveTikTokInsightsWithCache(input, fetcher, { now: Date.parse("2026-08-19T00:00:00Z") }),
  ]);

  assert.equal(providerCalls, 1);
  assert.deepEqual(first, second);
});

test("does not cache TikTok authorization failures", async () => {
  let providerCalls = 0;
  const input = { advertiserId: "cache-auth-failure", startDate: "2026-07-01", endDate: "2026-07-31" };
  const fetcher = async (): Promise<TikTokInsightsPayload> => {
    providerCalls += 1;
    throw new Error("TikTok advertiser authorization is missing or revoked");
  };

  await assert.rejects(resolveTikTokInsightsWithCache(input, fetcher));
  await assert.rejects(resolveTikTokInsightsWithCache(input, fetcher));
  assert.equal(providerCalls, 2);
});

test("uses account and dates in the TikTok insights cache key", () => {
  assert.notEqual(
    buildTikTokInsightsCacheKey({ advertiserId: "123", startDate: "2026-07-01", endDate: "2026-07-31" }),
    buildTikTokInsightsCacheKey({ advertiserId: "123", startDate: "2026-08-01", endDate: "2026-08-31" }),
  );
});

test("expires cached insight payloads before temporary TikTok thumbnails expire", () => {
  const now = Date.parse("2026-08-19T00:00:00Z");
  const xExpires = Math.floor((now + 40 * 60 * 1000) / 1000);
  const ttl = resolveTikTokInsightsCacheTtlMs({
    endDate: "2026-07-31",
    payload: payload(`https://p16.tiktokcdn.com/cover.jpg?x-expires=${xExpires}`),
    now,
  });

  assert.equal(ttl, 10 * 60 * 1000);
});

test("ignores malformed thumbnail URLs instead of failing a successful report", () => {
  assert.doesNotThrow(() => resolveTikTokInsightsCacheTtlMs({
    endDate: "2026-07-31",
    payload: payload("not-a-url"),
    now: Date.parse("2026-08-19T00:00:00Z"),
  }));
});
