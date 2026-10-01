import { test } from "node:test";
import { strict as assert } from "node:assert";
import { matchesValueFilter, levelTotals } from "./value-filter";
import { emptyCampaignRow } from "./metrics";

test("numeric filters preserve zero, unavailable metrics, range bounds, and own row values", () => {
  const row = { ...emptyCampaignRow("c", "meta", "Lead", "C"), impressions: 100, clicks: 20, spend: 10, results: 2, videoViews: null };
  const filter = { metric: "impressions" as const, operator: "between" as const, value: 100, upper: 200 };
  assert.equal(matchesValueFilter(row, filter), true);
  assert.equal(matchesValueFilter(row, { ...filter, value: 101 }), false);
  assert.equal(matchesValueFilter(row, { ...filter, metric: "videoViews", operator: "unavailable" }), true);
  assert.equal(matchesValueFilter(row, { ...filter, metric: "videoViews", operator: "eq", value: 0 }), false);
  const totals = levelTotals([row, { ...row, impressions: 900, clicks: 80, spend: 40, results: 8, videoViews: 5 }]);
  assert.equal(totals?.ctr, 10); assert.equal(totals?.costPerResult, 5); assert.equal(totals?.videoViews, null);
});
