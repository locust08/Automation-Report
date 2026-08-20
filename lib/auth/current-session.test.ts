import assert from "node:assert/strict";
import test from "node:test";

import { getCurrentAuthSession } from "./current-session";
import { createAuthToken } from "./session";

test("returns a local administrator session when the development bypass is enabled", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBypass = process.env.DEV_AUTH_BYPASS;
  setNodeEnv("development");
  process.env.DEV_AUTH_BYPASS = "true";

  try {
    const session = await getCurrentAuthSession(undefined as unknown as string);

    assert.equal(session?.sub, "local-development-admin");
    assert.equal(session?.email, "dev-admin@localhost");
    assert.equal(session?.role, "admin");
  } finally {
    restoreEnv("NODE_ENV", originalNodeEnv);
    restoreEnv("DEV_AUTH_BYPASS", originalBypass);
  }
});

test("does not enable the development bypass in production", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBypass = process.env.DEV_AUTH_BYPASS;
  setNodeEnv("production");
  process.env.DEV_AUTH_BYPASS = "true";

  try {
    const session = await getCurrentAuthSession(undefined as unknown as string);
    assert.equal(session, null);
  } finally {
    restoreEnv("NODE_ENV", originalNodeEnv);
    restoreEnv("DEV_AUTH_BYPASS", originalBypass);
  }
});

test("returns no session when the auth profile lookup exceeds its timeout", async () => {
  const originalFetch = globalThis.fetch;
  const originalJwtSecret = process.env.ADS_REPORTING_JWT_SECRET;
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalSupabaseSecret = process.env.SUPABASE_SECRET_KEY;
  const originalTimeout = process.env.AUTH_UPSTREAM_TIMEOUT_MS;

  process.env.ADS_REPORTING_JWT_SECRET = "test-secret-that-is-at-least-thirty-two-characters";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret-key";
  process.env.AUTH_UPSTREAM_TIMEOUT_MS = "10";
  globalThis.fetch = ((_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
  })) as typeof fetch;

  try {
    const token = await createAuthToken(
      { id: "user-1", email: "user@example.com", role: "admin", fullName: "Test User" },
      false,
    );
    const result = await Promise.race([
      getCurrentAuthSession(token),
      new Promise<"test-deadline">((resolve) => setTimeout(() => resolve("test-deadline"), 100)),
    ]);

    assert.equal(result, null);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("ADS_REPORTING_JWT_SECRET", originalJwtSecret);
    restoreEnv("SUPABASE_URL", originalSupabaseUrl);
    restoreEnv("SUPABASE_SECRET_KEY", originalSupabaseSecret);
    restoreEnv("AUTH_UPSTREAM_TIMEOUT_MS", originalTimeout);
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function setNodeEnv(value: string) {
  Reflect.set(process.env, "NODE_ENV", value);
}
