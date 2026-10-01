import assert from "node:assert/strict";
import test from "node:test";
import { cachedReportPage } from "./report-page-cache";

test("report cache coalesces, isolates scopes, clones values, and refreshes", async () => {
  const scope = { test: "coalesce", account: "one" };
  let calls = 0;
  const load = async () => { calls++; await new Promise((resolve) => setTimeout(resolve, 5)); return { complete: true, rows: [calls] }; };
  const [first, second] = await Promise.all([cachedReportPage(scope, load), cachedReportPage(scope, load)]);
  assert.equal(calls, 1);
  first.rows[0] = 999;
  assert.deepEqual(second.rows, [1]);
  assert.deepEqual((await cachedReportPage(scope, load)).rows, [1]);
  await cachedReportPage({ ...scope, account: "two" }, load);
  assert.equal(calls, 2);
  await cachedReportPage(scope, load, true);
  assert.equal(calls, 3);
});

test("report cache never retains incomplete coverage or failures", async () => {
  let calls = 0;
  const load = async () => ({ complete: false, count: ++calls });
  assert.equal((await cachedReportPage({ test: "incomplete" }, load)).count, 1);
  assert.equal((await cachedReportPage({ test: "incomplete" }, load)).count, 2);
  const failing = async (): Promise<{ complete: boolean }> => { calls++; throw new Error("provider unavailable"); };
  await assert.rejects(cachedReportPage({ test: "failure" }, failing));
  await assert.rejects(cachedReportPage({ test: "failure" }, failing));
  assert.equal(calls, 4);
});
