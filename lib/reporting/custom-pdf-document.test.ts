import assert from "node:assert/strict";
import test from "node:test";
import { performanceColumnIndexes, isAdPerformanceRow } from "./custom-pdf-document";

test("ad performance tables exclude creatives and actions", () => {
  assert.deepEqual(performanceColumnIndexes(["Ad","Campaign","Creative","Clicks","CTR (%)","CPC","Views"]),[0,1,3,4,5,6]);
  assert.deepEqual(performanceColumnIndexes(["Name","Creative","Results","Spend","Actions"]),[0,2,3]);
});

test("explicit summary markers distinguish totals independently of ad names", () => {
  assert.equal(isAdPerformanceRow(), true);
  assert.equal(isAdPerformanceRow("true"), false);
  assert.equal(isAdPerformanceRow("false"), true);
});
