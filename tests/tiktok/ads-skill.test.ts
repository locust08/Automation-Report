import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { TIKTOK_ADS_API_BASE } from "../../lib/tiktok/ads-actions";
import { summarizeTikTokReport } from "../../lib/tiktok/ads-analysis";
import {
  TikTokAdsApiError,
  TikTokAdsClient,
  type TikTokAdsClientDependencies,
} from "../../lib/tiktok/ads-client";
import {
  getTikTokActionRateLimit,
  getTikTokRateLimitConfig,
  inferTikTokProviderRateLimitScope,
  TikTokAdsRateLimiter,
  TikTokLocalRateLimitError,
  type TikTokRateLimitConfig,
  type TikTokRateLimiter,
} from "../../lib/tiktok/ads-rate-limit";
import { prepareTikTokMutationPayload } from "../../lib/tiktok/ads-operations";
import {
  createTikTokMutationPreview,
  finalizeTikTokMutationReceipt,
  requireTikTokMutationPreview,
} from "../../lib/tiktok/ads-receipts";
import {
  redactTikTokSecrets,
  TikTokAuctionCampaignCreateSchema,
} from "../../lib/tiktok/ads-schemas";
import {
  getTikTokBusinessAuthorizationContext,
  TIKTOK_BUSINESS_SECRET_NAMES,
  type TikTokBusinessTokenManagerDependencies,
} from "../../lib/tiktok/token-manager";

const authorization = {
  accessToken: "server-only-token",
  advertisers: [{ advertiser_id: "123", advertiser_name: "Primary Ads" }],
  grantedScopes: ["1", "2"],
};

const passThroughRateLimiter: TikTokRateLimiter = {
  acquire: async () => () => undefined,
  registerProviderLimit: () => ({
    source: "provider",
    scope: "provider_unknown",
    retryAfterMs: 300_000,
    retryAfterAt: "2026-08-10T00:05:00.000Z",
    autoRetry: false,
  }),
};

function clientDependencies(
  fetch: typeof globalThis.fetch,
  rateLimiter: TikTokRateLimiter = passThroughRateLimiter,
): TikTokAdsClientDependencies {
  return { fetch, sleep: async () => undefined, rateLimiter };
}

function rateLimitConfig(overrides: Partial<TikTokRateLimitConfig> = {}): TikTokRateLimitConfig {
  return {
    level: "basic",
    qps: 8,
    qpm: 480,
    qpd: 691_200,
    maxConcurrency: 3,
    maxAutoWaitMs: 2_000,
    ...overrides,
  };
}

test("reads the advertiser allowlist and granted scopes from the Doppler bundle", async () => {
  const dependencies: TikTokBusinessTokenManagerDependencies = {
    now: Date.now,
    readSecrets: async () => ({
      [TIKTOK_BUSINESS_SECRET_NAMES.accessToken]: "server-only-token",
      [TIKTOK_BUSINESS_SECRET_NAMES.authorizedAdvertisers]: JSON.stringify([
        { advertiser_id: "123", advertiser_name: "Primary Ads" },
      ]),
      [TIKTOK_BUSINESS_SECRET_NAMES.grantedScopes]: "[1,\"reporting\"]",
      [TIKTOK_BUSINESS_SECRET_NAMES.updatedAt]: "2026-08-10T00:00:00.000Z",
    }),
    writeSecrets: async () => assert.fail("read must not write"),
  };
  const context = await getTikTokBusinessAuthorizationContext({ dependencies });
  assert.equal(context.accessToken, "server-only-token");
  assert.deepEqual(context.advertisers, [{ advertiser_id: "123", advertiser_name: "Primary Ads" }]);
  assert.deepEqual(context.grantedScopes, ["1", "reporting"]);
});

test("rejects advertiser IDs outside the Doppler allowlist before fetching", async () => {
  let fetchCalls = 0;
  const client = new TikTokAdsClient(authorization, clientDependencies(async () => {
    fetchCalls += 1;
    return Response.json({ code: 0, data: {} });
  }));
  await assert.rejects(
    client.request("campaign.list", { advertiser_id: "999" }),
    /authorized Doppler allowlist/,
  );
  assert.equal(fetchCalls, 0);
});

test("uses the fixed v1.3 host and retries GET requests only", async () => {
  const urls: string[] = [];
  let calls = 0;
  const client = new TikTokAdsClient(authorization, clientDependencies(async (input) => {
    calls += 1;
    urls.push(String(input));
    if (calls === 1) return Response.json({ code: 50001 }, { status: 500 });
    return Response.json({ code: 0, request_id: "req-2", data: { list: [] } });
  }));
  const result = await client.request("campaign.list", {
    advertiser_id: "123",
    filtering: { campaign_ids: ["456"] },
  });
  assert.equal(calls, 2);
  assert.equal(result.requestId, "req-2");
  assert.ok(urls.every((url) => url.startsWith(`${TIKTOK_ADS_API_BASE}/campaign/get/`)));
});

test("validates account access locally while sending the provider advertiser_ids shape", async () => {
  let requestedUrl = "";
  const client = new TikTokAdsClient(authorization, clientDependencies(async (input) => {
    requestedUrl = String(input);
    return Response.json({ code: 0, request_id: "req-account", data: { list: [] } });
  }));
  await client.request("account.get", {
    advertiser_id: "123",
    advertiser_ids: ["123"],
  });
  const parsed = new URL(requestedUrl);
  assert.equal(parsed.searchParams.has("advertiser_id"), false);
  assert.deepEqual(JSON.parse(parsed.searchParams.get("advertiser_ids") ?? "[]"), ["123"]);
});

test("uses JSON for URL uploads and multipart only for binary file uploads", async () => {
  const requests: RequestInit[] = [];
  const client = new TikTokAdsClient(authorization, clientDependencies(async (_input, init) => {
    requests.push(init ?? {});
    return Response.json({ code: 0, request_id: "req-upload", data: {} });
  }));

  await client.request("asset.image-upload", {
    advertiser_id: "123",
    upload_type: "UPLOAD_BY_URL",
    image_url: "https://example.com/image.png",
  });
  await client.request("asset.image-upload", {
    advertiser_id: "123",
    upload_type: "UPLOAD_BY_FILE",
    image_file: new Blob(["image-bytes"]),
    file_name: "image.png",
  });

  assert.equal((requests[0].headers as Record<string, string>)["Content-Type"], "application/json");
  assert.equal(typeof requests[0].body, "string");
  assert.ok(requests[1].body instanceof FormData);
  assert.equal((requests[1].headers as Record<string, string>)["Content-Type"], undefined);
});

test("does not retry POST and does not expose provider data or tokens in errors", async () => {
  let calls = 0;
  const client = new TikTokAdsClient(authorization, clientDependencies(async () => {
    calls += 1;
    return Response.json({
      code: 40100,
      message: "server-only-token should never surface",
      request_id: "req-secret",
    }, { status: 400 });
  }));
  await assert.rejects(
    client.request("campaign.create", {
      advertiser_id: "123",
      campaign_name: "Test",
      objective_type: "TRAFFIC",
    }),
    (error) => {
      assert.ok(error instanceof TikTokAdsApiError);
      assert.equal(error.details.kind, "rate_limited");
      assert.equal(error.details.rateLimitSource, "provider");
      assert.equal(error.details.rateLimitScope, "provider_unknown");
      assert.equal(error.details.retryAfterAt, "2026-08-10T00:05:00.000Z");
      assert.equal(error.details.requestId, "req-secret");
      assert.equal(JSON.stringify(error).includes("server-only-token"), false);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test("treats provider code 40100 on HTTP 200 as a five-minute cooldown without rapid GET retries", async () => {
  let now = Date.UTC(2026, 7, 10, 0, 0, 0);
  const sleeps: number[] = [];
  const limiter = new TikTokAdsRateLimiter(rateLimitConfig(), {
    now: () => now,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      now += milliseconds;
    },
  });
  let calls = 0;
  const client = new TikTokAdsClient(authorization, clientDependencies(async () => {
    calls += 1;
    return Response.json({ code: 40100, message: "throttled", request_id: "req-rate" });
  }, limiter));

  await assert.rejects(
    client.request("campaign.list", { advertiser_id: "123" }),
    (error) => {
      assert.ok(error instanceof TikTokAdsApiError);
      assert.equal(error.details.kind, "rate_limited");
      assert.equal(error.details.retryable, true);
      assert.equal(error.details.rateLimitScope, "provider_unknown");
      assert.equal(error.details.retryAfterMs, 300_000);
      assert.equal(error.details.retryAfterAt, "2026-08-10T00:05:00.000Z");
      assert.equal(JSON.stringify(error).includes("throttled"), false);
      return true;
    },
  );
  assert.equal(calls, 1);
  assert.deepEqual(sleeps, []);
});

test("honors a short Retry-After header for a bounded GET retry", async () => {
  let now = Date.UTC(2026, 7, 10, 0, 0, 0);
  const sleeps: number[] = [];
  const limiter = new TikTokAdsRateLimiter(rateLimitConfig(), {
    now: () => now,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      now += milliseconds;
    },
  });
  let calls = 0;
  const client = new TikTokAdsClient(authorization, clientDependencies(async () => {
    calls += 1;
    if (calls === 1) {
      return Response.json(
        { code: 40100, request_id: "req-short" },
        { headers: { "Retry-After": "1" } },
      );
    }
    return Response.json({ code: 0, request_id: "req-ok", data: { list: [] } });
  }, limiter));

  const result = await client.request("campaign.list", { advertiser_id: "123" });
  assert.equal(result.requestId, "req-ok");
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [1_000]);
});

test("shares the app-wide QPS budget across advertisers and client instances", async () => {
  let now = Date.UTC(2026, 7, 10, 0, 0, 0);
  const sleeps: number[] = [];
  const limiter = new TikTokAdsRateLimiter(rateLimitConfig({ qps: 1, qpm: 60, qpd: 1_000 }), {
    now: () => now,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      now += milliseconds;
    },
  });
  const sharedAuthorization = {
    ...authorization,
    advertisers: [
      ...authorization.advertisers,
      { advertiser_id: "456", advertiser_name: "Secondary Ads" },
    ],
  };
  const requestTimes: number[] = [];
  const fetch = async () => {
    requestTimes.push(now);
    return Response.json({ code: 0, data: { list: [] } });
  };
  const firstClient = new TikTokAdsClient(sharedAuthorization, clientDependencies(fetch, limiter));
  const secondClient = new TikTokAdsClient(sharedAuthorization, clientDependencies(fetch, limiter));

  await firstClient.request("campaign.list", { advertiser_id: "123" });
  await secondClient.request("ad.list", { advertiser_id: "456" });

  assert.deepEqual(requestTimes, [Date.UTC(2026, 7, 10, 0, 0, 0), Date.UTC(2026, 7, 10, 0, 0, 1)]);
  assert.deepEqual(sleeps, [1_000]);
});

test("enforces the configured app-wide concurrency across advertisers", async () => {
  const limiter = new TikTokAdsRateLimiter(rateLimitConfig({ maxConcurrency: 1 }));
  const sharedAuthorization = {
    ...authorization,
    advertisers: [
      ...authorization.advertisers,
      { advertiser_id: "456", advertiser_name: "Secondary Ads" },
    ],
  };
  let releaseFirstResponse = () => {};
  const firstResponse = new Promise<Response>((resolve) => {
    releaseFirstResponse = () => resolve(Response.json({ code: 0, data: { list: [] } }));
  });
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return calls === 1
      ? firstResponse
      : Response.json({ code: 0, data: { list: [] } });
  };
  const firstClient = new TikTokAdsClient(sharedAuthorization, clientDependencies(fetch, limiter));
  const secondClient = new TikTokAdsClient(sharedAuthorization, clientDependencies(fetch, limiter));

  const firstRequest = firstClient.request("campaign.list", { advertiser_id: "123" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const secondRequest = secondClient.request("ad.list", { advertiser_id: "456" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 1);
  releaseFirstResponse();
  await Promise.all([firstRequest, secondRequest]);
  assert.equal(calls, 2);
});

test("applies conservative endpoint ceilings and clamps Doppler overrides to the approved tier", () => {
  const advanced = getTikTokRateLimitConfig({
    TIKTOK_BUSINESS_RATE_LIMIT_LEVEL: "advanced",
    TIKTOK_BUSINESS_MAX_QPS: "999",
    TIKTOK_BUSINESS_MAX_QPM: "9999",
    TIKTOK_BUSINESS_MAX_CONCURRENCY: "4",
  });
  assert.equal(advanced.qps, 20);
  assert.equal(advanced.qpm, 1_200);
  assert.equal(advanced.maxConcurrency, 4);

  const basic = getTikTokRateLimitConfig({ TIKTOK_BUSINESS_RATE_LIMIT_LEVEL: "basic" });
  assert.deepEqual(getTikTokActionRateLimit("ad.create", basic), {
    qps: 4,
    qpm: 120,
    qpd: 69_120,
  });
  assert.deepEqual(getTikTokActionRateLimit("report.async-create", basic), {
    qps: 1,
    qpm: 48,
    qpd: 3_600,
  });
});

test("returns a UTC-midnight retry time when the local daily budget is exhausted", async () => {
  const now = Date.UTC(2026, 7, 10, 23, 59, 0);
  const limiter = new TikTokAdsRateLimiter(rateLimitConfig({ qpd: 1 }), {
    now: () => now,
    sleep: async () => assert.fail("daily cooldown must not block the process"),
  });
  const release = await limiter.acquire("campaign.list");
  release();
  await assert.rejects(
    limiter.acquire("campaign.list"),
    (error) => {
      assert.ok(error instanceof TikTokLocalRateLimitError);
      assert.equal(error.decision.scope, "qpd");
      assert.equal(error.decision.retryAfterMs, 60_000);
      assert.equal(error.decision.retryAfterAt, "2026-08-11T00:00:00.000Z");
      return true;
    },
  );
});

test("maps provider QPS, QPM, and QPD hints to their documented cooldown windows", async () => {
  const now = Date.UTC(2026, 7, 10, 23, 59, 0);
  const limiter = new TikTokAdsRateLimiter(rateLimitConfig(), {
    now: () => now,
    sleep: async () => undefined,
  });
  assert.equal(inferTikTokProviderRateLimitScope("QPS second limit reached"), "qps");
  assert.equal(inferTikTokProviderRateLimitScope("QPM per minute limit reached"), "qpm");
  assert.equal(inferTikTokProviderRateLimitScope("Daily QPD limit reached"), "qpd");
  assert.equal(inferTikTokProviderRateLimitScope("request throttled"), undefined);

  const qps = limiter.registerProviderLimit("campaign.list", null, "qps");
  const qpm = limiter.registerProviderLimit("ad.list", null, "qpm");
  const qpd = limiter.registerProviderLimit("adgroup.list", null, "qpd");
  assert.equal(qps.retryAfterMs, 1_000);
  assert.equal(qps.autoRetry, true);
  assert.equal(qpm.retryAfterMs, 300_000);
  assert.equal(qpm.autoRetry, false);
  assert.equal(qpd.retryAfterMs, 60_000);
  assert.equal(qpd.retryAfterAt, "2026-08-11T00:00:00.000Z");
  assert.equal(qpd.autoRetry, false);
  await assert.rejects(
    limiter.acquire("adgroup.list"),
    (error) => {
      assert.ok(error instanceof TikTokLocalRateLimitError);
      assert.equal(error.decision.scope, "qpd");
      return true;
    },
  );
});

test("validates every supported Auction objective and defaults creates to disabled", () => {
  const objectives = [
    "APP_PROMOTION", "WEB_CONVERSIONS", "REACH", "TRAFFIC", "VIDEO_VIEWS",
    "ENGAGEMENT", "LEAD_GENERATION", "PRODUCT_SALES",
  ] as const;
  for (const objective of objectives) {
    const parsed = TikTokAuctionCampaignCreateSchema.parse({
      campaign_name: `Test ${objective}`,
      objective_type: objective,
      ...(objective === "APP_PROMOTION" ? { app_promotion_type: "APP_INSTALL" } : {}),
    });
    assert.equal(parsed.objective_type, objective);
    assert.equal(parsed.operation_status, "DISABLE");
  }
  const prepared = prepareTikTokMutationPayload("campaign.create", "123", {
    campaign_name: "Traffic Test",
    objective_type: "TRAFFIC",
  });
  assert.equal(prepared.payload.operation_status, "DISABLE");
  assert.match(String(prepared.payload.request_id), /^\d+$/);
});

test("redacts authorization codes and refuses sensitive JSON input", () => {
  const redacted = redactTikTokSecrets({ auth_code: "one-time-code", nested: { access_token: "x" } });
  assert.deepEqual(redacted, {
    auth_code: "[REDACTED]",
    nested: { access_token: "[REDACTED]" },
  });
  assert.throws(
    () => prepareTikTokMutationPayload("ad.create", "123", { access_token: "x" }),
    /Sensitive field/,
  );
});

test("requires a matching preview receipt before apply and keeps it token-free", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tiktok-receipt-test-"));
  try {
    const advertiser = authorization.advertisers[0];
    const input = {
      advertiser_id: "123",
      operation_status: "DISABLE",
      authorization_code_fingerprint: "fingerprint-only",
    };
    const preview = await createTikTokMutationPreview({
      action: "spark.authorize",
      advertiser,
      input,
      root,
      now: new Date("2026-08-10T00:00:00.000Z"),
    });
    const raw = await readFile(preview.receiptPath, "utf8");
    assert.equal(raw.includes("one-time-code"), false);
    assert.equal(raw.includes("server-only-token"), false);
    assert.equal(raw.includes("[REDACTED]"), true);
    const matched = await requireTikTokMutationPreview({
      action: "spark.authorize",
      advertiser,
      input,
      root,
    });
    assert.equal(matched.receipt.runId, preview.receipt.runId);
    await assert.rejects(
      requireTikTokMutationPreview({
        action: "spark.authorize",
        advertiser,
        input: { ...input, operation_status: "ENABLE" },
        root,
      }),
      /Run the mutation without --apply first/,
    );
    const finalized = await finalizeTikTokMutationReceipt({
      receipt: preview.receipt,
      mode: "applied",
      providerRequestId: "req-1",
      resultIds: { item_id: "item-1" },
      root,
    });
    assert.equal(finalized.receipt.mode, "applied");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps structured rate-limit failure receipts free of tokens and provider messages", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tiktok-rate-receipt-test-"));
  try {
    const preview = await createTikTokMutationPreview({
      action: "campaign.create",
      advertiser: authorization.advertisers[0],
      input: { advertiser_id: "123", campaign_name: "Paused test" },
      root,
      now: new Date("2026-08-10T00:00:00.000Z"),
    });
    const error = new TikTokAdsApiError("TikTok API request failed", {
      action: "campaign.create",
      kind: "rate_limited",
      providerCode: 40100,
      requestId: "req-rate-receipt",
      retryable: false,
      rateLimitSource: "provider",
      rateLimitScope: "qpm",
      retryAfterMs: 300_000,
      retryAfterAt: "2026-08-10T00:05:00.000Z",
    });
    const finalized = await finalizeTikTokMutationReceipt({
      receipt: preview.receipt,
      mode: "failed",
      error: error.toJSON(),
      root,
    });
    const raw = await readFile(finalized.receiptPath, "utf8");
    assert.equal(raw.includes("rate_limited"), true);
    assert.equal(raw.includes("req-rate-receipt"), true);
    assert.equal(raw.includes("server-only-token"), false);
    assert.equal(raw.includes("provider detail"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("computes analysis KPIs from additive report totals", () => {
  const summary = summarizeTikTokReport({
    list: [
      { metrics: { spend: "10", impressions: "1000", clicks: "50", conversion: "2", total_complete_payment_value: "30" } },
      { metrics: { spend: "5", impressions: "500", clicks: "25", conversion: "1", total_complete_payment_value: "15" } },
    ],
  });
  assert.equal(summary.rowCount, 2);
  assert.equal(summary.totals.spend, 15);
  assert.equal(summary.derived.ctr, 0.05);
  assert.equal(summary.derived.cpc, 0.2);
  assert.equal(summary.derived.cpa, 5);
  assert.equal(summary.derived.roas, 3);
});

