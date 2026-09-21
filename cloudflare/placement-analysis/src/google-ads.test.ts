import assert from "node:assert/strict";
import test from "node:test";
import { placementGoogleAdsClient, resolveLoginCustomerId } from "./index";

function env(path: string | null) {
  return { GOOGLE_ADS_CLIENT_ID: crypto.randomUUID(), GOOGLE_ADS_CLIENT_SECRET: "fixture-secret", GOOGLE_ADS_REFRESH_TOKEN: "fixture-refresh", GOOGLE_ADS_LOGIN_CUSTOMER_ID: "3666137525",
    ACCOUNT_DIRECTORY: { prepare: () => ({ bind: () => ({ first: async () => ({ access_path: path }) }) }) } } as unknown as Parameters<typeof placementGoogleAdsClient>[0];
}
test("Worker preserves explicit direct, account MCC and fallback routing", async () => {
  assert.equal(await resolveLoginCustomerId(env("Personal"), "1234567890"), null);
  assert.equal(await resolveLoginCustomerId(env("411-468-5827"), "1234567890"), "4114685827");
  assert.equal(await resolveLoginCustomerId(env(null), "1234567890"), "3666137525");
});
test("Worker shares OAuth-only v25 transport", async () => {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return String(url).includes("oauth2") ? Response.json({ access_token: "fixture", expires_in: 3600 }) : Response.json([{ results: [] }]); };
  try {
    await placementGoogleAdsClient(env("Personal")).searchStream("1234567890", "query");
    assert.match(calls[1].url, /\/v25\//);
    assert.equal(new Headers(calls[1].init?.headers).get("login-customer-id"), null);
    assert.equal(new Headers(calls[1].init?.headers).get(["developer", "token"].join("-")), null);
  } finally { globalThis.fetch = original; }
});
