import assert from "node:assert/strict";
import test from "node:test";
import { performanceColumnIndexes, isAdPerformanceRow, groupAdsByCampaign, adColumnIndexes, metricColumnGroups } from "./custom-pdf-document";

test("ad performance tables exclude creatives and actions", () => {
  assert.deepEqual(performanceColumnIndexes(["Ad","Campaign","Creative","Clicks","CTR (%)","CPC","Views"]),[0,1,3,4,5,6]);
  assert.deepEqual(performanceColumnIndexes(["Name","Creative","Results","Spend","Actions"]),[0,2,3]);
});

test("explicit summary markers distinguish totals independently of ad names", () => {
  assert.equal(isAdPerformanceRow(), true);
  assert.equal(isAdPerformanceRow("true"), false);
  assert.equal(isAdPerformanceRow("false"), true);
});

test("ad tables omit campaign column and group campaigns in first-seen order", () => {
  assert.deepEqual(adColumnIndexes(["Ad","Campaign","Creative","Clicks"]),[0,3]);
  const rows=[{campaign:"A",id:1},{campaign:"B",id:2},{campaign:"A",id:3}];
  assert.deepEqual(groupAdsByCampaign(rows).map(row=>row.id),[1,3,2]);
});

test("wide metric groups preserve every metric with name context", () => {
  assert.deepEqual(metricColumnGroups(10),[[0,1,2,3,4,5],[0,6,7,8,9]]);
  assert.deepEqual(metricColumnGroups(5),[[0,1,2,3,4]]);
});
