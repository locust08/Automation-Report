import assert from "node:assert/strict";
import test from "node:test";
import { paginateReport } from "./pdf-pagination";

test("landscape pages cover all content within capacity", () => {
  assert.deepEqual(paginateReport(1800, 760, []), [{start:0,end:760},{start:760,end:1520},{start:1520,end:1800}]);
});
test("page boundaries retreat across overlapping columns", () => {
  const pages = paginateReport(1200,760,[{top:700,bottom:800},{top:650,bottom:720}]);
  assert.deepEqual(pages,[{start:0,end:650},{start:650,end:1200}]);
});
test("oversized content continues without dropping pixels or blank pages", () => {
  assert.deepEqual(paginateReport(1600,760,[{top:0,bottom:1600}]),[{start:0,end:760},{start:760,end:1520},{start:1520,end:1600}]);
  assert.deepEqual(paginateReport(100,760,[]),[{start:0,end:100}]);
});
test("an inseparable chain across columns fits together on a page", () => {
  assert.deepEqual(paginateReport(1200,760,[{top:0,bottom:700},{top:650,bottom:1000}]),[{start:0,end:1000},{start:1000,end:1200}]);
});
test("touching fractional rows do not merge an entire table", () => {
  const bounds = Array.from({length:100},(_,i) => ({top:i*30.4,bottom:(i+1)*30.4}));
  const pages = paginateReport(3040,760,bounds);
  assert.ok(pages.length >= 4);
  assert.ok(pages.every(page => page.end-page.start <= 760));
});
