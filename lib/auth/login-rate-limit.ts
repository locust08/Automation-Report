import { createHash } from "node:crypto";

const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 15 * 60 * 1000;
const ENTRY_TTL_MS = 24 * 60 * 60 * 1000;

type LoginAttempt = { failures: number; lockedUntil: number | null; updatedAt: number };

const rateLimitState = globalThis as typeof globalThis & {
  __adsReportingLoginAttemptsV2?: Map<string, LoginAttempt>;
};

function getStore() {
  rateLimitState.__adsReportingLoginAttemptsV2 ??= new Map();
  const store = rateLimitState.__adsReportingLoginAttemptsV2;
  const now = Date.now();
  for (const [key, value] of store) {
    if (now - value.updatedAt > ENTRY_TTL_MS) store.delete(key);
  }
  return store;
}

export function getLoginAttemptKey(email: string, request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientIp = forwardedFor || request.headers.get("x-real-ip")?.trim() || "unknown";
  return createHash("sha256").update(`${email.toLowerCase()}|${clientIp}`).digest("hex");
}

export function checkLoginRateLimit(key: string) {
  const store = getStore();
  const attempt = store.get(key);
  if (!attempt) return { allowed: true, attemptsRemaining: MAX_ATTEMPTS, retryAfterSeconds: 0 };
  const now = Date.now();
  if (attempt.lockedUntil && attempt.lockedUntil > now) {
    return { allowed: false, attemptsRemaining: 0, retryAfterSeconds: Math.ceil((attempt.lockedUntil - now) / 1000) };
  }
  if (attempt.lockedUntil && attempt.lockedUntil <= now) {
    store.delete(key);
    return { allowed: true, attemptsRemaining: MAX_ATTEMPTS, retryAfterSeconds: 0 };
  }
  return { allowed: true, attemptsRemaining: Math.max(0, MAX_ATTEMPTS - attempt.failures), retryAfterSeconds: 0 };
}

export function recordLoginFailure(key: string) {
  const store = getStore();
  const now = Date.now();
  const current = store.get(key);
  const failures = (current?.failures ?? 0) + 1;
  const lockedUntil = failures >= MAX_ATTEMPTS ? now + LOCKOUT_MS : null;
  store.set(key, { failures, lockedUntil, updatedAt: now });
  return {
    attemptsRemaining: Math.max(0, MAX_ATTEMPTS - failures),
    retryAfterSeconds: lockedUntil ? Math.ceil((lockedUntil - now) / 1000) : 0,
  };
}

export function clearLoginFailures(key: string) {
  getStore().delete(key);
}
