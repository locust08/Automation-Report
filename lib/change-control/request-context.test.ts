import assert from "node:assert/strict";
import test from "node:test";
import { resolveTrustedIp } from "./request-context";

test("trusted IPs require attested Cloudflare or Vercel proxy headers", () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const oldNodeEnv = mutableEnv.NODE_ENV; const oldBypass = mutableEnv.DEV_AUTH_BYPASS;
  mutableEnv.NODE_ENV = "production"; delete mutableEnv.DEV_AUTH_BYPASS;
  try {
    assert.equal(resolveTrustedIp(new Request("https://example.test", { headers: { "cf-ray": "abc", "cf-connecting-ip": "203.0.113.4" } })), "203.0.113.4");
    assert.equal(resolveTrustedIp(new Request("https://example.test", { headers: { "x-forwarded-for": "203.0.113.8" } })), null);
    assert.equal(resolveTrustedIp(new Request("https://example.test", { headers: { "x-vercel-id": "iad1::abc", "x-forwarded-for": "203.0.113.9, 10.0.0.1" } })), "203.0.113.9");
  } finally { if (oldNodeEnv === undefined) delete mutableEnv.NODE_ENV; else mutableEnv.NODE_ENV = oldNodeEnv; if (oldBypass === undefined) delete mutableEnv.DEV_AUTH_BYPASS; else mutableEnv.DEV_AUTH_BYPASS = oldBypass; }
});
