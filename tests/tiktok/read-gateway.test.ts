import assert from "node:assert/strict";
import test from "node:test";

import { TikTokAdsClient } from "../../lib/tiktok/ads-client";
import { createTikTokGatewayReporting, type TikTokReadGatewayService } from "../../lib/tiktok/read-gateway";
import { getTikTokBusinessAuthorizationContext, TIKTOK_BUSINESS_SECRET_NAMES } from "../../lib/tiktok/token-manager";

const limiter = {
  acquire: async () => () => undefined,
  registerProviderLimit: () => ({
    source: "provider" as const,
    scope: "provider_unknown" as const,
    retryAfterMs: 300_000,
    retryAfterAt: "2026-08-10T00:05:00.000Z",
    autoRetry: false,
  }),
};

test("authorization context permits an absent stored advertiser inventory", async () => {
  const context = await getTikTokBusinessAuthorizationContext({
    dependencies: {
      now: Date.now,
      readSecrets: async () => ({
        [TIKTOK_BUSINESS_SECRET_NAMES.accessToken]: "server-only-token",
        [TIKTOK_BUSINESS_SECRET_NAMES.grantedScopes]: "[]",
        [TIKTOK_BUSINESS_SECRET_NAMES.updatedAt]: "2026-08-10T00:00:00.000Z",
      }),
      writeSecrets: async () => assert.fail("read must not write"),
    },
  });
  assert.deepEqual(context.advertisers, []);
});

test("known-ID reads dynamically validate exact provider access without a stored list", async () => {
  const calls: string[] = [];
  const client = new TikTokAdsClient(
    { accessToken: "server-only-token", advertisers: [], grantedScopes: [], updatedAt: "v1" },
    {
      dynamicReadAuthorization: true,
      rateLimiter: limiter,
      sleep: async () => undefined,
      fetch: async (input) => {
        const url = new URL(String(input));
        calls.push(url.pathname);
        if (url.pathname.endsWith("/advertiser/info/")) {
          return Response.json({ code: 0, request_id: "validation", data: { list: [{ advertiser_id: "7123", advertiser_name: "Dynamic" }] } });
        }
        return Response.json({ code: 0, request_id: "campaigns", data: { list: [] } });
      },
    },
  );
  await client.request("campaign.list", { advertiser_id: "7123" });
  assert.deepEqual(calls, ["/open_api/v1.3/advertiser/info/", "/open_api/v1.3/campaign/get/"]);
  assert.equal(client.isMutationAllowed("7123"), false);
  await assert.rejects(
    client.request("campaign.status", { advertiser_id: "7123", campaign_ids: ["1"], operation_status: "DISABLE" }),
    /authorized Doppler allowlist/,
  );
});

test("dynamic validation rejects an exact-ID mismatch and coalesces concurrent validation", async () => {
  let calls = 0;
  const client = new TikTokAdsClient(
    { accessToken: "server-only-token", advertisers: [], grantedScopes: [] },
    {
      dynamicReadAuthorization: true,
      rateLimiter: limiter,
      sleep: async () => undefined,
      fetch: async () => {
        calls += 1;
        return Response.json({ code: 0, data: { list: [{ advertiser_id: "9999", advertiser_name: "Wrong" }] } });
      },
    },
  );
  const outcomes = await Promise.allSettled([
    client.validateReadableAdvertiser("7123"),
    client.validateReadableAdvertiser("7123"),
  ]);
  assert.equal(calls, 1);
  assert.ok(outcomes.every((outcome) => outcome.status === "rejected"));
});

test("service adapter preserves gateway cache provenance", async () => {
  const service = {
    getBillingDaily: async () => ({
      rows: [{ date: "2026-08-01", spend: 4, conversions: 1, results: 0 }],
      apiVersion: "v1.3",
      requestIds: ["cached-request"],
      currency: "MYR",
      timezone: "Asia/Kuala_Lumpur",
      cacheHitDates: ["2026-08-01"],
      cacheMissDates: [],
      dataTimestamps: { "2026-08-01": "2026-08-10T00:00:00.000Z" },
      originatingRequestIds: ["cached-request"],
      providerRequestIds: [],
    }),
    getLiveBudget: async () => assert.fail("not used"),
  } as unknown as TikTokReadGatewayService;
  const result = await createTikTokGatewayReporting(service).fetchDailyPerformance("7123", "2026-08-01", "2026-08-01");
  assert.deepEqual(result.cacheHitDates, ["2026-08-01"]);
  assert.deepEqual(result.providerRequestIds, []);
});

