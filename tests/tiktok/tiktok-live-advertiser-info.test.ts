import assert from "node:assert/strict";
import test from "node:test";

import {
  TikTokAdsClient,
  type TikTokAdsClientDependencies,
} from "../../lib/tiktok/ads-client";
import type { TikTokRateLimiter } from "../../lib/tiktok/ads-rate-limit";

const authorization = {
  accessToken: "server-only-test-token",
  advertisers: [{ advertiser_id: "123", advertiser_name: "Stored advertiser name" }],
  grantedScopes: ["advertiser.info"],
};

const passThroughRateLimiter: TikTokRateLimiter = {
  acquire: async () => () => undefined,
  registerProviderLimit: () => ({
    source: "provider",
    scope: "provider_unknown",
    retryAfterMs: 300_000,
    retryAfterAt: "2026-08-18T00:05:00.000Z",
    autoRetry: false,
  }),
};

function clientFor(
  data: unknown,
  inspectRequest?: (url: URL) => void,
) {
  const dependencies: TikTokAdsClientDependencies = {
    fetch: async (input) => {
      inspectRequest?.(new URL(String(input)));
      return Response.json({ code: 0, request_id: "req-live-advertiser", data });
    },
    sleep: async () => undefined,
    rateLimiter: passThroughRateLimiter,
    dynamicReadAuthorization: true,
  };
  return new TikTokAdsClient(authorization, dependencies);
}

test("returns the exact live advertiser row among unrelated rows", async () => {
  let requestedIds: string[] | undefined;
  const client = clientFor({
    list: [
      {
        advertiser_id: "999",
        advertiser_name: "Wrong advertiser",
        currency: "USD",
        timezone: "America/New_York",
      },
      {
        advertiser_id: "123",
        advertiser_name: " Live Advertiser ",
        currency: "myr",
        timezone: "Asia/Kuala_Lumpur",
      },
    ],
  }, (url) => {
    requestedIds = JSON.parse(url.searchParams.get("advertiser_ids") ?? "[]") as string[];
    assert.equal(url.searchParams.has("advertiser_id"), false);
  });

  assert.deepEqual(await client.getLiveAdvertiserInfo("123"), {
    advertiser_id: "123",
    advertiser_name: "Live Advertiser",
    currency: "MYR",
    timezone: "Asia/Kuala_Lumpur",
  });
  assert.deepEqual(requestedIds, ["123"]);
});

test("maps the official advertiser info name field", async () => {
  const client = clientFor({
    list: [{
      advertiser_id: "123",
      name: "Bellamy TikTok MY",
      currency: "MYR",
      timezone: "Asia/Kuala_Lumpur",
    }],
  });

  assert.deepEqual(await client.getLiveAdvertiserInfo("123"), {
    advertiser_id: "123",
    advertiser_name: "Bellamy TikTok MY",
    currency: "MYR",
    timezone: "Asia/Kuala_Lumpur",
  });
});

test("never substitutes the first unrelated advertiser row", async () => {
  const client = clientFor({
    list: [{
      advertiser_id: "999",
      advertiser_name: "Wrong advertiser",
      currency: "USD",
      timezone: "America/New_York",
    }],
  });

  await assert.rejects(
    client.getLiveAdvertiserInfo("123"),
    /did not confirm exact advertiser access: 123/,
  );
});

for (const [missingField, advertiser] of [
  ["name", { advertiser_id: "123", advertiser_name: "", currency: "MYR", timezone: "Asia/Kuala_Lumpur" }],
  ["currency", { advertiser_id: "123", advertiser_name: "Live Advertiser", currency: "", timezone: "Asia/Kuala_Lumpur" }],
  ["timezone", { advertiser_id: "123", advertiser_name: "Live Advertiser", currency: "MYR", timezone: "" }],
] as const) {
  test(`rejects an exact advertiser row with missing ${missingField}`, async () => {
    const client = clientFor({ list: [advertiser] });

    await assert.rejects(
      client.getLiveAdvertiserInfo("123"),
      /advertiser info is incomplete for launch: 123/,
    );
  });
}

test("rejects duplicate rows for the exact advertiser ID", async () => {
  const client = clientFor({
    list: [
      {
        advertiser_id: "123",
        advertiser_name: "Live Advertiser",
        currency: "MYR",
        timezone: "Asia/Kuala_Lumpur",
      },
      {
        advertiser_id: "123",
        advertiser_name: "Conflicting Advertiser",
        currency: "USD",
        timezone: "UTC",
      },
    ],
  });

  await assert.rejects(
    client.getLiveAdvertiserInfo("123"),
    /did not return exactly one advertiser row: 123/,
  );
});
