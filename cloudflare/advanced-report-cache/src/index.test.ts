import assert from "node:assert/strict";
import test from "node:test";

import worker from "./index";

test("stores and retrieves an unexpired TikTok insights cache envelope", async () => {
  const rows = new Map<string, { cache_key: string; r2_key: string; expires_at: string }>();
  const objects = new Map<string, string>();
  const env = {
    ADVANCED_REPORT_CACHE_SECRET: "secret",
    ADVANCED_REPORTS: {
      async put(key: string, value: string) { objects.set(key, value); },
      async get(key: string) {
        const value = objects.get(key);
        return value === undefined ? null : { async text() { return value; } };
      },
    },
    ADVANCED_REPORT_DB: {
      prepare(sql: string) {
        let values: unknown[] = [];
        return {
          bind(...next: unknown[]) { values = next; return this; },
          async first() { return rows.get(String(values[0])) ?? null; },
          async run() {
            if (sql.includes("tiktok_insights_cache")) {
              rows.set(String(values[0]), {
                cache_key: String(values[0]),
                r2_key: String(values[1]),
                expires_at: String(values[5]),
              });
            }
          },
        };
      },
    },
  };
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const payload = { account: { advertiserId: "123" }, topAds: [], deviceOs: [] };
  const headers = { Authorization: "Bearer secret", "Content-Type": "application/json" };

  const put = await worker.fetch(new Request("https://cache.test/tiktok-insights-cache/key-1", {
    method: "PUT",
    headers,
    body: JSON.stringify({ payload, expiresAt }),
  }), env as never);
  assert.equal(put.status, 200);

  const get = await worker.fetch(new Request("https://cache.test/tiktok-insights-cache/key-1", { headers }), env as never);
  assert.equal(get.status, 200);
  assert.deepEqual(await get.json(), { payload, expiresAt });
});
