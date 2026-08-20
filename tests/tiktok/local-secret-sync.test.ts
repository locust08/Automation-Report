import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchTikTokSecretsFromDoppler,
  mergeTikTokSecretsIntoEnv,
  TIKTOK_LOCAL_SECRET_NAMES,
} from "../../lib/tiktok/local-secret-sync";

const completeSecrets = Object.fromEntries(
  TIKTOK_LOCAL_SECRET_NAMES.map((name) => [name, `${name.toLowerCase()}-value`]),
);

test("merges only the managed TikTok block and preserves unrelated local environment entries", () => {
  const existing = [
    "LOCAL_ONLY=keep-me",
    "# BEGIN LOCAL TIKTOK BUSINESS SECRETS",
    "TIKTOK_BUSINESS_ACCESS_TOKEN=old-token",
    "# END LOCAL TIKTOK BUSINESS SECRETS",
    "ANOTHER_SETTING=also-keep",
    "",
  ].join("\n");

  const merged = mergeTikTokSecretsIntoEnv(existing, completeSecrets);

  assert.match(merged, /^LOCAL_ONLY=keep-me/m);
  assert.match(merged, /^ANOTHER_SETTING=also-keep/m);
  assert.equal((merged.match(/BEGIN LOCAL TIKTOK BUSINESS SECRETS/g) ?? []).length, 1);
  assert.doesNotMatch(merged, /old-token/);
  assert.match(merged, /TIKTOK_BUSINESS_ACCESS_TOKEN="tiktok_business_access_token-value"/);
});

test("retrieves only the approved TikTok secret allowlist", async () => {
  let requestedNames: string[] = [];
  const secrets = await fetchTikTokSecretsFromDoppler({
    token: "service-token",
    fetchFn: async (input, init) => {
      const url = new URL(String(input));
      requestedNames = (url.searchParams.get("secrets") ?? "").split(",");
      assert.equal(url.searchParams.get("project"), "ai-backend");
      assert.equal(url.searchParams.get("config"), "dev");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer service-token");
      return Response.json({
        secrets: {
          ...Object.fromEntries(Object.entries(completeSecrets).map(([name, value]) => [name, { computed: value }])),
          UNRELATED_SECRET: { computed: "must-not-copy" },
        },
      });
    },
  });

  assert.deepEqual(requestedNames, [...TIKTOK_LOCAL_SECRET_NAMES]);
  assert.deepEqual(Object.keys(secrets), [...TIKTOK_LOCAL_SECRET_NAMES]);
  assert.equal("UNRELATED_SECRET" in secrets, false);
});

test("rejects an incomplete reporting bundle without returning partial values", async () => {
  await assert.rejects(
    fetchTikTokSecretsFromDoppler({
      token: "service-token",
      fetchFn: async () => Response.json({
        secrets: {
          TIKTOK_BUSINESS_ACCESS_TOKEN: { computed: "token" },
        },
      }),
    }),
    /missing required TikTok secrets/i,
  );
});

test("rejects failed Doppler access without exposing the service token", async () => {
  const serviceToken = "dp.st.secret-value";
  await assert.rejects(
    fetchTikTokSecretsFromDoppler({
      token: serviceToken,
      fetchFn: async () => new Response("forbidden", { status: 403 }),
    }),
    (error) => error instanceof Error
      && /403/.test(error.message)
      && !error.message.includes(serviceToken),
  );
});
