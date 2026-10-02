import assert from "node:assert/strict";
import test from "node:test";
import { sortAdsByMetric } from "./ad-metric-sort";
test("metric sorting is numeric, stable, nonmutating and keeps unavailable values last", () => {
  const rows=[{id:"null",metrics:{clicks:null}},{id:"ten",metrics:{clicks:10}},{id:"zero",metrics:{clicks:0}},{id:"tie",metrics:{clicks:10}},{id:"nan",metrics:{clicks:NaN}}];
  assert.deepEqual(sortAdsByMetric(rows,"clicks",true).map(row=>row.id),["zero","ten","tie","null","nan"]);
  assert.deepEqual(sortAdsByMetric(rows,"clicks",false).map(row=>row.id),["ten","tie","zero","null","nan"]);
  assert.equal(rows[0].id,"null");
});
