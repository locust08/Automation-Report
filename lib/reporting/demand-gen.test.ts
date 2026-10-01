import { strict as assert } from "node:assert";
import { test } from "node:test";
import { aggregateDemandMetrics, buildDemandMatrix, buildDemandAudiences, readDemandPages, sumDemandValues, demandShare } from "./demand-gen";
import { fetchGoogleDemandGen } from "./google";

test("aggregate additive observations before ratios; preserve zero and missing", () => {
  const value = aggregateDemandMetrics([{ metrics: { impressions: "100", clicks: "5", costMicros: "1000000", conversions: 0 } }, { metrics: { impressions: 300, clicks: 15, costMicros: 3000000, conversions: 0 } }]);
  assert.equal(value.ctr, 5);
  assert.equal(value.cpm, 10);
  assert.equal(value.conversions, 0);
  assert.equal(aggregateDemandMetrics([{ metrics: { impressions: 0, clicks: 0 } }]).ctr, null);
  assert.equal(aggregateDemandMetrics([{ metrics: { impressions: 10 } }]).clicks, null);
});

test("unknown formats stay outside twelve nullable cells", () => {
  const matrix = buildDemandMatrix([{ segments: { adFormatType: "UNKNOWN", device: "MOBILE" }, metrics: { impressions: 10 } }]);
  assert.equal(matrix.cells.length, 12);
  assert.equal(matrix.cells[0].metrics.impressions, null);
  assert.equal(matrix.unmapped.length, 1);
});

test("pagination retains duplicates and earlier pages on failure", async () => {
  const row = { metrics: { impressions: 1 } };
  const complete = await readDemandPages(async (token) => token ? { results: [row] } : { results: [row], nextPageToken: "next" });
  assert.equal(complete.rows.length, 2);
  assert.equal(complete.complete, true);
  const partial = await readDemandPages(async (token) => { if (token) throw new Error("timeout"); return { results: [row], nextPageToken: "next" }; });
  assert.equal(partial.rows.length, 1);
  assert.equal(partial.complete, false);
});

test("only direct measured interests are classified, with nullable native zeros", () => {
  const ref = "customers/1234567890/userInterests/5";
  const result = buildDemandAudiences([
    { adGroupCriterion: { type: "USER_INTEREST", userInterest: { userInterestCategory: ref } }, metrics: { impressions: 0, videoTrueviewViews: 0, clicks: 0, costMicros: 0, conversions: 0 } },
    { adGroupCriterion: { type: "AUDIENCE", userInterest: { userInterestCategory: ref } }, metrics: { impressions: 500 } },
    { adGroupCriterion: { type: "USER_INTEREST", userInterest: { userInterestCategory: "unknown" } }, metrics: { impressions: 5 } },
  ], new Map([[ref, { name: "Furniture", type: "IN_MARKET" }]]));
  assert.equal(result.inMarket[0].metrics.impressions, 0);
  assert.equal(result.inMarket[0].metrics.ctr, null);
  assert.equal(result.affinity.length, 0);
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.excluded, 1);
});

test("collector validates campaign ownership and shares period across native queries", async () => {
  const original = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("oauth2")) return Response.json({ access_token: "fixture", expires_in: 3600 });
    if (String(url).endsWith("listAccessibleCustomers")) return Response.json({ resourceNames: ["customers/1234567890"] });
    const query = JSON.parse(String(options?.body)).query as string;
    seen.push(query);
    if (String(url).endsWith("searchStream")) return Response.json([{ results: [{ customer: { id: "1234567890" } }] }]);
    const data = query.includes("campaign.advertising_channel_type") ? [{ campaign: { id: "1", name: "Demand" } }, { campaign: { id: "2", name: "Demand two" } }]
      : query.includes("customer.descriptive_name") ? [{ customer: { descriptiveName: "Fixture", currencyCode: "MYR", timeZone: "Asia/Kuala_Lumpur" } }]
      : query.includes("ad_group_audience_view") ? [{ adGroupCriterion: { type: "USER_INTEREST", userInterest: { userInterestCategory: "customers/1234567890/userInterests/5" } }, metrics: { impressions: 0, videoTrueviewViews: 0, clicks: 0, costMicros: 0, conversions: 0 } }]
      : query.includes("FROM user_interest") ? [{ userInterest: { resourceName: "customers/1234567890/userInterests/5", name: "Furniture", taxonomyType: "IN_MARKET" } }]
      : [{ segments: { adFormatType: "INFEED", device: "MOBILE" }, metrics: { impressions: 100, videoTrueviewViews: 40, clicks: 5, costMicros: 1000000, conversions: 1 } }];
    return Response.json({ results: data });
  };
  const input = { customerId: "1234567890", apiVersion: "v25", accessToken: null, clientId: crypto.randomUUID(), clientSecret: "fixture", refreshToken: "fixture", loginCustomerId: null, accessPath: "Personal", startDate: "2026-09-01", endDate: "2026-09-30" };
  try {
    const report = await fetchGoogleDemandGen(input, "1");
    assert.equal(report.inMarket[0].metrics.impressions, 0);
    assert.equal(report.inMarket[0].metrics.views, 0);
    assert.equal(report.totals?.views, 40);
    assert.equal(report.cells.find((cell) => cell.format === "In-feed" && cell.device === "Mobile")?.metrics.ctr, 5);
    assert.ok(seen.filter((query) => query.includes("metrics.impressions")).every((query) => query.includes("2026-09-01") && query.includes("campaign.id IN (1)")));
    const multi = await fetchGoogleDemandGen(input, ["2", "1", "2"]);
    assert.deepEqual(multi.campaignIds, ["1", "2"]);
    assert.ok(seen.some((query) => query.includes("campaign.id IN (1,2)")));
    assert.equal(multi.totals?.impressions, 100);
    await assert.rejects(fetchGoogleDemandGen(input, ["1", "999"]), /belonging to this Google account/);
    await assert.rejects(fetchGoogleDemandGen(input, "999"), /belonging to this Google account/);
  } finally { globalThis.fetch = original; }
});

test("selected campaign totals recompute ratios and percentage denominators preserve zeros", () => {
  const total = sumDemandValues([
    { impressions: 100, views: 20, clicks: 1, spend: 2, conversions: 0, ctr: 1, cpc: 2, cpm: 20 },
    { impressions: 900, views: 180, clicks: 99, spend: 8, conversions: 2, ctr: 11, cpc: 8 / 99, cpm: 8 / .9 },
  ]);
  assert.equal(total.ctr, 10); assert.equal(total.cpc, .1); assert.equal(total.cpm, 10);
  assert.equal(demandShare(193, 1000), 19.3);
  assert.equal(demandShare(0, 1000), 0);
  assert.equal(demandShare(0, 0), null); assert.equal(demandShare(null, 100), null);
});
