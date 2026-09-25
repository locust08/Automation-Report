import assert from "node:assert/strict";
import { test } from "node:test";
import { dailyCoverage } from "./evidence";

test("missing provider days remain missing rather than zero actual spend", () => {
  const dates = ["2026-09-20", "2026-09-21", "2026-09-22"];
  const amounts = new Map([["2026-09-20", 12], ["2026-09-22", 0]]);
  const page = dailyCoverage(dates, amounts, 0, 100);
  assert.deepEqual(page.daily, [{ date: "2026-09-20", amount: 12 }, { date: "2026-09-22", amount: 0 }]);
  assert.deepEqual(page.missing, ["2026-09-21"]);
  assert.equal(page.complete, false);
  assert.equal(dailyCoverage(dates, new Map([...amounts, ["2026-09-21", 4]]), 0, 100).complete, true);
});
