import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import { authenticateBudget } from "./digitalbee-auth";

const key = "m05-delegation-test-key-with-32-characters";
const scope = {
  subject: "employee-1", grantRevision: 4,
  notionAccountId: "3b14fcc4-f701-8154-b252-e794968759f9",
  clientId: "3b14fcc4-f701-810e-a95a-f78bbc129ca9",
  platform: "Google", platformAccountId: "2315114913", cycleId: null,
  requested: { start: "2026-09-01", end: "2026-09-24" },
};

test("M05 delegation binds current account and exact evidence dates", async () => {
  const prior = { token: process.env.M05_SERVICE_TOKEN, key: process.env.M05_DELEGATION_KEY,
    revision: process.env.M05_CONNECTION_REVISION };
  process.env.M05_SERVICE_TOKEN = "test-service-token";
  process.env.M05_DELEGATION_KEY = key;
  process.env.M05_CONNECTION_REVISION = "test-revision";
  try {
    const url = new URL("https://dashboard.example/v1/budget/evidence");
    url.searchParams.set("account_id", scope.notionAccountId);
    url.searchParams.set("start", scope.requested.start);
    url.searchParams.set("end", scope.requested.end);
    const jwt = await new SignJWT(scope).setProtectedHeader({ alg: "HS256" }).setIssuer("digitalbee")
      .setAudience(url.origin).setSubject(scope.subject).setIssuedAt().setExpirationTime("30s")
      .setJti(crypto.randomUUID()).sign(new TextEncoder().encode(key));
    const headers = { Authorization: "Bearer test-service-token", "X-DigitalBee-Delegation": jwt,
      "X-Connection-Revision": "test-revision" };
    assert.equal((await authenticateBudget(new Request(url, { headers }))).platformAccountId, scope.platformAccountId);
    url.searchParams.set("end", "2026-09-23");
    await assert.rejects(authenticateBudget(new Request(url, { headers })), { code: "access_denied" });
  } finally {
    for (const [name, value] of Object.entries({ M05_SERVICE_TOKEN: prior.token,
      M05_DELEGATION_KEY: prior.key, M05_CONNECTION_REVISION: prior.revision })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
