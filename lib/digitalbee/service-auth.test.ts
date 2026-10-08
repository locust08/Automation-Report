import assert from "node:assert/strict";
import test from "node:test";
import { SignJWT } from "jose";
import { authenticateDigitalBeeRequest, DigitalBeeServiceError, readBoundedJson, requestHash } from "./service-auth";

const origin = "https://dashboard.example.test";
const key = "this-is-a-long-test-delegation-key-with-32-chars";
const scope = {
  subject: "employee-123", grantRevision: 7,
  accountPageId: "00000000-0000-4000-8000-000000000001",
  clientId: "00000000-0000-4000-8000-000000000002",
  platform: "Google", platformAccountId: "2315114913", connectionRevision: "revision-1",
} as const;

async function signedRequest(hash: string, action = "list") {
  const proof = await new SignJWT({ ...scope, action, requestHash: hash })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("digitalbee").setAudience(origin).setSubject(scope.subject)
    .setIssuedAt().setExpirationTime("30s").setJti(crypto.randomUUID())
    .sign(new TextEncoder().encode(key));
  return new Request(`${origin}/api/service/digitalbee/m03-review`, {
    method: "POST", body: JSON.stringify({ action }), headers: {
      Authorization: "Bearer service-token", "X-DigitalBee-Delegation": proof,
      "X-Connection-Revision": scope.connectionRevision,
    },
  });
}

test("DigitalBee delegation binds the action, request hash and account scope", async () => {
  const hash = requestHash({ action: "list" });
  const request = await signedRequest(hash);
  assert.deepEqual(await authenticateDigitalBeeRequest(request, {
    serviceToken: "service-token", delegationKey: key,
    connectionRevision: scope.connectionRevision, action: "list", hash,
  }), scope);
  await assert.rejects(() => authenticateDigitalBeeRequest(request, {
    serviceToken: "service-token", delegationKey: key,
    connectionRevision: scope.connectionRevision, action: "approve_revision", hash,
  }), (error: unknown) => error instanceof DigitalBeeServiceError && error.code === "access_denied");
  await assert.rejects(() => authenticateDigitalBeeRequest(request, {
    serviceToken: "service-token", delegationKey: key,
    connectionRevision: scope.connectionRevision, action: "list", hash: requestHash({ action: "get" }),
  }), (error: unknown) => error instanceof DigitalBeeServiceError && error.code === "access_denied");
});

test("service JSON reader rejects oversized bodies before parsing", async () => {
  const request = new Request(origin, { method: "POST", body: JSON.stringify({ value: "a".repeat(1_000) }) });
  await assert.rejects(() => readBoundedJson(request, 100),
    (error: unknown) => error instanceof DigitalBeeServiceError && error.status === 413);
});
