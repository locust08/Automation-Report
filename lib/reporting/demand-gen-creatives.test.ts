import assert from "node:assert/strict";
import test from "node:test";
import { selectDemandCreative, collectDemandCreatives, type DemandCreative } from "./demand-gen-creatives";
import { aggregateDemandMetrics, resolveDemandMetric } from "./demand-gen";

const candidate = (id: string, conversions = 1, clicks = 2, impressions = 10): DemandCreative => ({ assetId: id, assetResource: `customers/123/assets/${id}`, kind: "image", previewUrl: `https://example.com/${id}.png`, metrics: aggregateDemandMetrics([{ metrics: { conversions, clicks, impressions, costMicros: 2000000 } }]), performanceComplete: true });
test("Demand Gen uses actual impressions, preserving legacy video views separately", () => {
  const metrics = aggregateDemandMetrics([{ metrics: { impressions: 100, videoTrueviewViews: 3, costMicros: 2000000 } }]);
  assert.equal(resolveDemandMetric("views"), "impressions");
  assert.equal(resolveDemandMetric(null), "impressions");
  assert.equal(metrics.impressions, 100); assert.equal(metrics.views, 3); assert.equal(metrics.spend, 2);
});
test("creative ranking uses conversions then clicks then impressions and asset identity", () => {
  assert.equal(selectDemandCreative([candidate("2", 2, 1), candidate("1", 1, 100)])?.assetId, "2");
  assert.equal(selectDemandCreative([candidate("2", 1, 4), candidate("1", 1, 3)])?.assetId, "2");
  assert.equal(selectDemandCreative([candidate("2", 1, 3, 20), candidate("1", 1, 3, 10)])?.assetId, "2");
  assert.equal(selectDemandCreative([candidate("2"), candidate("1")])?.assetId, "1");
});
test("partial, missing and undelivered performance produces a representative preview", () => {
  for (const values of [[candidate("1", 0, 0, 0)], [{ ...candidate("1"), performanceComplete: false }], [{ ...candidate("1"), metrics: { ...candidate("1").metrics, conversions: null } }]]) {
    assert.equal(selectDemandCreative(values)?.selection, "representative");
  }
  assert.equal(selectDemandCreative([candidate("1"), { ...candidate("2"), performanceComplete: false }])?.selection, "representative");
  assert.equal(selectDemandCreative([]), null);
  assert.equal(selectDemandCreative([candidate("1"), { ...candidate("2", 20), previewUrl: "" }])?.selection, "representative");
});
test("creative lookup rejects cross-account resources before any provider request", async () => {
  let calls = 0;
  const query = async <T>() => { calls++; return { rows: [] as T[], complete: true }; };
  await assert.rejects(collectDemandCreatives([{ resourceName: "customers/999/adGroupAds/1~2", ad: {} }], query, "fixture", "123"), /account-owned/);
  await assert.rejects(collectDemandCreatives([{ resourceName: "customers/123/adGroupAds/1~2", ad: { demandGenMultiAssetAd: { marketingImages: [{ asset: "customers/999/assets/1" }] } } }], query, "fixture", "123"), /this account/);
  assert.equal(calls, 0);
});
test("partial performance preserves previews and cannot certify ranking", async () => {
  const result = await collectDemandCreatives([{ resourceName: "customers/123/adGroupAds/1~2", ad: { demandGenMultiAssetAd: { marketingImages: [{ asset: "customers/123/assets/7" }] } } }], async <T>(sql: string) => sql.includes("FROM asset") ? { rows: [{ asset: { resourceName: "customers/123/assets/7", imageAsset: { fullSize: { url: "https://example.com/image.png" } } } }] as T[], complete: true } : { rows: [{ adGroupAdAssetView: { adGroupAd: "customers/123/adGroupAds/1~2", asset: "customers/123/assets/7" }, metrics: { impressions: 10, clicks: 2, conversions: 1, costMicros: 2000000 } }] as T[], complete: false }, "fixture", "123");
  assert.equal(result.complete, false);
  assert.equal(result.byAd.get("customers/123/adGroupAds/1~2")?.[0].metrics.spend, null);
  assert.equal(selectDemandCreative(result.byAd.get("customers/123/adGroupAds/1~2")!)?.selection, "representative");
});
test("creative collector isolates shared assets by exact ad and resolves carousel/video previews", async () => {
  const seen: string[] = [];
  const query = async <T>(sql: string) => {
    seen.push(sql);
    const rows = sql.includes("FROM ad_group_ad_asset_view") ? [
      { adGroupAdAssetView: { adGroupAd: "customers/123/adGroupAds/1~10", asset: "customers/123/assets/7", fieldType: "MARKETING_IMAGE" }, metrics: { conversions: 3, clicks: 4, impressions: 100, costMicros: 2000000 } },
      { adGroupAdAssetView: { adGroupAd: "customers/123/adGroupAds/1~10", asset: "customers/123/assets/7", fieldType: "LOGO" }, metrics: { conversions: 99, clicks: 999, impressions: 10000, costMicros: 99000000 } },
      { adGroupAdAssetView: { adGroupAd: "customers/123/adGroupAds/1~11", asset: "customers/123/assets/7", fieldType: "MARKETING_IMAGE" }, metrics: { conversions: 1, clicks: 2, impressions: 20, costMicros: 1000000 } },
    ] : sql.includes("assets/8") ? [{ asset: { resourceName: "customers/123/assets/8", demandGenCarouselCardAsset: { marketingImageAsset: "customers/123/assets/7" } } }, { asset: { resourceName: "customers/123/assets/9", youtubeVideoAsset: { youtubeVideoId: "abcdefghijk" } } }]
      : [{ asset: { resourceName: "customers/123/assets/7", imageAsset: { fullSize: { url: "https://example.com/image.png" } } } }, { asset: { resourceName: "customers/123/assets/9", youtubeVideoAsset: { youtubeVideoId: "abcdefghijk" } } }];
    return { rows: rows as T[], complete: true, reason: null };
  };
  const ads = [10, 11].map(id => ({ resourceName: `customers/123/adGroupAds/1~${id}`, ad: { demandGenMultiAssetAd: { marketingImages: [{ asset: "customers/123/assets/7" }] } } }));
  const result = await collectDemandCreatives(ads, query, "campaign.id IN (1) AND segments.date BETWEEN '2026-09-01' AND '2026-09-30'", "123");
  assert.equal(result.byAd.get(ads[0].resourceName)?.[0].metrics.spend, 2);
  assert.equal(result.byAd.get(ads[0].resourceName)?.[0].metrics.conversions, 3, "reused logo observations are excluded");
  assert.equal(result.byAd.get(ads[1].resourceName)?.[0].metrics.spend, 1);
  assert.ok(seen[0].includes("2026-09-01") && seen[0].includes("ad_group_ad_asset_view.ad_group_ad IN"));
  const other = await collectDemandCreatives([{ resourceName: "customers/123/adGroupAds/1~12", ad: { demandGenCarouselAd: { carouselCards: [{ asset: "customers/123/assets/8" }] }, demandGenVideoResponsiveAd: { videos: [{ asset: "customers/123/assets/9" }] } } }], query, "campaign.id IN (1)", "123");
  assert.equal(other.byAd.get("customers/123/adGroupAds/1~12")?.find(x => x.kind === "image")?.previewUrl, "https://example.com/image.png");
  assert.ok(other.byAd.get("customers/123/adGroupAds/1~12")?.find(x => x.kind === "video")?.previewUrl.includes("abcdefghijk"));
});
test("delivered classic display images retain their asset metrics and ranking", async () => {
  const result = await collectDemandCreatives([{ resourceName: "customers/123/adGroupAds/1~2", ad: { demandGenMultiAssetAd: { classicDisplayImages: [{ asset: "customers/123/assets/7" }] } } }], async <T>(sql: string) => sql.includes("FROM asset") ? { rows: [{ asset: { resourceName: "customers/123/assets/7", imageAsset: { fullSize: { url: "https://example.com/classic.png" } } } }] as T[], complete: true } : { rows: [{ adGroupAdAssetView: { adGroupAd: "customers/123/adGroupAds/1~2", asset: "customers/123/assets/7", fieldType: "CLASSIC_DISPLAY_IMAGE" }, metrics: { impressions: 100, clicks: 2, conversions: 1, costMicros: 2000000 } }] as T[], complete: true }, "fixture", "123");
  const selected = selectDemandCreative(result.byAd.get("customers/123/adGroupAds/1~2")!);
  assert.equal(selected?.selection,"top_performing");
  assert.equal(selected?.metrics.spend,2);
});
