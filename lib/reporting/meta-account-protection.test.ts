import assert from "node:assert/strict";
import test from "node:test";

import {
  MetaAccountCircuitOpenError,
  createMetaAccountProtection,
  parseMetaUsage,
} from "./meta-account-protection";

test("deduplicates an identical in-flight request", async () => {
  const protection = createMetaAccountProtection({ now: () => 1_000 });
  let calls = 0;
  let release!: (value: string) => void;
  const load = () => {
    calls += 1;
    return new Promise<string>((resolve) => { release = resolve; });
  };

  const first = protection.run({ accountId: "123", key: "campaigns", load });
  const second = protection.run({ accountId: "123", key: "campaigns", load });
  release("ok");

  assert.equal((await first).value, "ok");
  assert.equal((await second).value, "ok");
  assert.equal(calls, 1);
});

test("returns stale successful data and opens the circuit after a rate limit", async () => {
  let now = 1_000;
  const protection = createMetaAccountProtection({ now: () => now });
  await protection.run({ accountId: "123", key: "campaigns", load: async () => "saved" });
  now += 6 * 60 * 1_000;

  const result = await protection.run({
    accountId: "123",
    key: "campaigns",
    load: async () => { throw Object.assign(new Error("limited"), { code: 80004, subcode: 2446079 }); },
  });

  assert.equal(result.value, "saved");
  assert.equal(result.source, "stale-cache");
  assert.equal(result.protection.circuitOpen, true);
  await assert.rejects(
    protection.run({ accountId: "123", key: "ads", load: async () => "never" }),
    MetaAccountCircuitOpenError,
  );
});

test("returns a circuit-open error when a first request is rate-limited without stale data", async () => {
  const protection = createMetaAccountProtection({ now: () => 1_000 });
  await assert.rejects(
    protection.run({
      accountId: "123",
      key: "campaigns",
      load: async () => { throw Object.assign(new Error("limited"), { code: 80004, subcode: 2446079 }); },
    }),
    MetaAccountCircuitOpenError,
  );
});

test("does not automatically resume until cooldown has elapsed", async () => {
  let now = 1_000;
  const protection = createMetaAccountProtection({ now: () => now });
  protection.recordRateLimit("123", "Meta rate limit", 60);
  await assert.rejects(
    protection.run({ accountId: "123", key: "campaigns", load: async () => "blocked" }),
    MetaAccountCircuitOpenError,
  );
  now += 60_001;
  assert.equal((await protection.run({ accountId: "123", key: "campaigns", load: async () => "ok" })).value, "ok");
});

test("opens the circuit at seventy percent reported utilization", () => {
  const protection = createMetaAccountProtection({ now: () => 1_000 });
  protection.recordUsage("123", parseMetaUsage('{"call_count":71}', '{"acc_id_util_pct":12}'));
  assert.equal(protection.getStatus("123").circuitOpen, true);
});

test("parses the highest utilization and provider reset duration", () => {
  assert.deepEqual(
    parseMetaUsage('{"call_count":20,"total_cputime":35,"total_time":10}', '{"acc_id_util_pct":65,"reset_time_duration":90}'),
    { utilizationPercent: 65, recoverySeconds: 90 },
  );
});
