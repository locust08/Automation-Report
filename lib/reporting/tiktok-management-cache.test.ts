import assert from "node:assert/strict";
import test from "node:test";

import { createTikTokManagementCache } from "./tiktok-management-cache";

test("TikTok management cache deduplicates an identical in-flight request and caches success", async () => {
  let now = 1_000;
  const cache = createTikTokManagementCache({ now: () => now });
  let calls = 0;
  let release!: (value: string) => void;
  const load = () => { calls += 1; return new Promise<string>((resolve) => { release = resolve; }); };
  const first = cache.run({ advertiserId: "1", key: "campaigns", load });
  const second = cache.run({ advertiserId: "1", key: "campaigns", load });
  release("ok");
  assert.equal((await first).value, "ok");
  assert.equal((await second).value, "ok");
  assert.equal(calls, 1);
  now += 4 * 60_000;
  assert.equal((await cache.run({ advertiserId: "1", key: "campaigns", load })).source, "cache");
  assert.equal(calls, 1);
});

test("TikTok management cache allows one in-flight operation per advertiser", async () => {
  const cache = createTikTokManagementCache();
  let release!: () => void;
  const first = cache.run({ advertiserId: "1", key: "campaigns", load: () => new Promise<string>((resolve) => { release = () => resolve("ok"); }) });
  await assert.rejects(cache.run({ advertiserId: "1", key: "ads", load: async () => "no" }), /already loading/i);
  release();
  await first;
});

test("TikTok management cache never caches provider failures", async () => {
  const cache = createTikTokManagementCache();
  let calls = 0;
  await assert.rejects(cache.run({ advertiserId: "1", key: "campaigns", load: async () => { calls += 1; throw new Error("provider failed"); } }));
  assert.equal((await cache.run({ advertiserId: "1", key: "campaigns", load: async () => { calls += 1; return "ok"; } })).value, "ok");
  assert.equal(calls, 2);
});
