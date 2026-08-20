import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTikTokBusinessAuthUrl,
  exchangeTikTokBusinessCode,
  getAuthorizedTikTokAdvertisers,
  getTikTokBusinessRedirectUri,
  TikTokBusinessApiError,
  type TikTokBusinessTokens,
} from "../../lib/tiktok/oauth";
import {
  getTikTokBusinessEnvironmentSecrets,
  isTikTokLocalEnvironmentAuthorization,
  getValidTikTokBusinessAccessToken,
  saveTikTokBusinessAuthorization,
  TIKTOK_BUSINESS_SECRET_NAMES,
  TikTokBusinessAuthError,
  type TikTokBusinessTokenManagerDependencies,
} from "../../lib/tiktok/token-manager";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

function tokenResponse(overrides: Partial<TikTokBusinessTokens> = {}): TikTokBusinessTokens {
  return {
    access_token: "access-token",
    advertiser_ids: ["123"],
    scope: [1, 2],
    ...overrides,
  };
}

test("builds the TikTok Business authorization URL", () => {
  const result = new URL(buildTikTokBusinessAuthUrl({
    appId: "app-123",
    redirectUri: "https://example.com/api/auth/tiktok/callback",
    state: "state-123",
    scopes: [],
  }));
  assert.equal(result.origin + result.pathname, "https://business-api.tiktok.com/portal/auth");
  assert.equal(result.searchParams.get("app_id"), "app-123");
  assert.equal(result.searchParams.get("redirect_uri"), "https://example.com/api/auth/tiktok/callback");
  assert.equal(result.searchParams.get("state"), "state-123");
  assert.equal(result.searchParams.has("scope"), false);
});

test("requires a clean HTTPS TikTok Business redirect URI", () => {
  process.env.TIKTOK_BUSINESS_REDIRECT_URI = "http://example.com/callback";
  assert.throws(() => getTikTokBusinessRedirectUri("https://example.com"), /HTTPS/);
  process.env.TIKTOK_BUSINESS_REDIRECT_URI = "https://example.com/callback?secret=no";
  assert.throws(() => getTikTokBusinessRedirectUri("https://example.com"), /query or fragment/);
});

test("exchanges an authorization code without exposing credentials in the URL", async () => {
  let requestUrl = "";
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body));
    return Response.json({ code: 0, message: "OK", data: tokenResponse() });
  };
  const result = await exchangeTikTokBusinessCode({
    authCode: "one-time-code",
    appId: "app-id",
    appSecret: "app-secret",
  });
  assert.equal(result.access_token, "access-token");
  assert.equal(requestUrl, "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/");
  assert.equal(requestBody.secret, "app-secret");
  assert.equal(new URL(requestUrl).search, "");
});

test("parses authorized advertisers and rejects an empty authorization", async () => {
  globalThis.fetch = async () => Response.json({
    code: 0,
    data: { list: [{ advertiser_id: "123", advertiser_name: "Primary Ads" }] },
  });
  const advertisers = await getAuthorizedTikTokAdvertisers({
    accessToken: "access-token",
    appId: "app-id",
    appSecret: "app-secret",
  });
  assert.deepEqual(advertisers, [{ advertiser_id: "123", advertiser_name: "Primary Ads" }]);

  globalThis.fetch = async () => Response.json({ code: 0, data: { list: [] } });
  await assert.rejects(
    getAuthorizedTikTokAdvertisers({ accessToken: "x", appId: "x", appSecret: "x" }),
    TikTokBusinessApiError,
  );
});

function storedBundle(now: number, overrides: Record<string, string> = {}) {
  return {
    [TIKTOK_BUSINESS_SECRET_NAMES.accessToken]: "stored-access",
    [TIKTOK_BUSINESS_SECRET_NAMES.grantedScopes]: "[1,2]",
    [TIKTOK_BUSINESS_SECRET_NAMES.authorizedAdvertisers]: JSON.stringify([
      { advertiser_id: "123", advertiser_name: "Ads" },
    ]),
    [TIKTOK_BUSINESS_SECRET_NAMES.updatedAt]: new Date(now - 1_000).toISOString(),
    ...overrides,
  };
}

test("returns the stored long-term advertiser access token without writing", async () => {
  const now = Date.parse("2026-08-07T00:00:00.000Z");
  const dependencies: TikTokBusinessTokenManagerDependencies = {
    now: () => now,
    readSecrets: async () => storedBundle(now),
    writeSecrets: async () => assert.fail("should not write"),
  };
  assert.equal(await getValidTikTokBusinessAccessToken({ dependencies }), "stored-access");
});

test("prefers explicit server-side TikTok environment values without exposing unrelated variables", () => {
  const values = getTikTokBusinessEnvironmentSecrets({
    TIKTOK_BUSINESS_ACCESS_TOKEN: "local-access",
    TIKTOK_BUSINESS_GRANTED_SCOPES: "[1,2]",
    TIKTOK_BUSINESS_AUTHORIZED_ADVERTISERS: "[]",
    TIKTOK_BUSINESS_TOKEN_UPDATED_AT: "2026-08-19T00:00:00.000Z",
    META_ACCESS_TOKEN: "must-not-read",
  });

  assert.deepEqual(values, {
    TIKTOK_BUSINESS_ACCESS_TOKEN: "local-access",
    TIKTOK_BUSINESS_GRANTED_SCOPES: "[1,2]",
    TIKTOK_BUSINESS_AUTHORIZED_ADVERTISERS: "[]",
    TIKTOK_BUSINESS_TOKEN_UPDATED_AT: "2026-08-19T00:00:00.000Z",
  });
  assert.equal("META_ACCESS_TOKEN" in values, false);
  assert.equal(isTikTokLocalEnvironmentAuthorization({ TIKTOK_BUSINESS_ACCESS_TOKEN: "local-access" }), true);
  assert.equal(isTikTokLocalEnvironmentAuthorization({}), false);
});

test("writes the same authorization bundle to the primary and mirror configs", async () => {
  const writes: Array<{ config: string; secrets: Record<string, string> }> = [];
  const dependencies: TikTokBusinessTokenManagerDependencies = {
    now: () => Date.parse("2026-08-10T10:54:52.967Z"),
    readSecrets: async () => ({}),
    writeSecrets: async (secrets, target) => {
      writes.push({ config: target?.config ?? "prd", secrets: { ...secrets } });
    },
    primaryConfig: "prd",
    mirrorTargets: [{ config: "dev", token: "dev-token" }],
  };
  const configs = await saveTikTokBusinessAuthorization(
    tokenResponse(),
    [{ advertiser_id: "123", advertiser_name: "Primary Ads" }],
    dependencies,
  );
  assert.deepEqual(configs, ["prd", "dev"]);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0].secrets, writes[1].secrets);
  assert.deepEqual(writes.map((write) => write.config), ["prd", "dev"]);
});

test("requires advertiser reauthorization when no long-term token is stored", async () => {
  const now = Date.parse("2026-08-07T00:00:00.000Z");
  const dependencies: TikTokBusinessTokenManagerDependencies = {
    now: () => now,
    readSecrets: async () => ({}),
    writeSecrets: async () => assert.fail("should not write"),
  };
  await assert.rejects(
    getValidTikTokBusinessAccessToken({ dependencies }),
    (error) => error instanceof TikTokBusinessAuthError && error.code === "reauthorization_required",
  );
});
