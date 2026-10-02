import { strict as assert } from "node:assert";
import { test } from "node:test";
import { resolveDemandGenWithCache } from "./demand-gen-cache";
import type { DemandGenPayload } from "./demand-gen";

const payload: DemandGenPayload = { account: { id: "1", name: "Test", currency: "MYR", timezone: "Asia/Kuala_Lumpur" }, startDate: "2026-09-01", endDate: "2026-09-30", campaigns: [], campaignId: null, inMarket: [], affinity: [], unresolved: [], cells: [], unmapped: [], warnings: [], complete: true };

test("reuse complete snapshots, coalesce requests, and isolate returned mutations and scope", async () => {
  let calls = 0;
  const load = async () => { calls++; return structuredClone(payload); };
  const [first] = await Promise.all([resolveDemandGenWithCache("complete", load), resolveDemandGenWithCache("complete", load)]);
  first.warnings.push("caller mutation");
  assert.deepEqual((await resolveDemandGenWithCache("complete", load)).warnings, []);
  assert.equal(calls, 1);
  await resolveDemandGenWithCache("different-account-date-campaign", load);
  assert.equal(calls, 2);
});

test("partial snapshots and failed retrievals can be retried immediately", async () => {
  let calls = 0;
  const partial = async () => { calls++; return { ...payload, complete: false }; };
  await resolveDemandGenWithCache("partial", partial);
  await resolveDemandGenWithCache("partial", partial);
  assert.equal(calls, 2);
  await assert.rejects(resolveDemandGenWithCache("failed", async () => { throw new Error("provider failure"); }));
  assert.equal((await resolveDemandGenWithCache("failed", async () => payload)).complete, true);
});

test("optional creative failure permits the report but does not become a sticky snapshot", async () => {
  let calls = 0;
  const load = async () => { calls++; return { ...payload, creativeCoverageComplete: false }; };
  assert.equal((await resolveDemandGenWithCache("optional-creative",load)).complete,true);
  await resolveDemandGenWithCache("optional-creative",load);
  assert.equal(calls,2);
});
