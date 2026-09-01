const DEFAULT_FRESH_TTL_MS = 5 * 60 * 1_000;
const DEFAULT_STALE_TTL_MS = 30 * 60 * 1_000;
const DEFAULT_COOLDOWN_MS = 15 * 60 * 1_000;
const DEFAULT_USAGE_THRESHOLD = 70;

export type MetaUsage = {
  utilizationPercent: number;
  recoverySeconds: number | null;
};

export type MetaProtectionStatus = {
  circuitOpen: boolean;
  blockedUntil: string | null;
  reason: string | null;
};

type CacheEntry = {
  value: unknown;
  freshUntil: number;
  staleUntil: number;
};

type ActiveEntry = {
  key: string;
  promise: Promise<MetaProtectedResult<unknown>>;
};

export type MetaProtectedResult<T> = {
  value: T;
  source: "live" | "fresh-cache" | "stale-cache";
  protection: MetaProtectionStatus;
};

export class MetaAccountCircuitOpenError extends Error {
  status: MetaProtectionStatus;

  constructor(status: MetaProtectionStatus) {
    super(status.reason || "Meta requests are temporarily paused for this ad account.");
    this.name = "MetaAccountCircuitOpenError";
    this.status = status;
  }
}

export class MetaAccountRequestBusyError extends Error {
  constructor() {
    super("Another Meta request is already running for this ad account.");
    this.name = "MetaAccountRequestBusyError";
  }
}

export function createMetaAccountProtection(options: {
  now?: () => number;
  freshTtlMs?: number;
  staleTtlMs?: number;
  cooldownMs?: number;
  usageThreshold?: number;
} = {}) {
  const now = options.now ?? Date.now;
  const freshTtlMs = options.freshTtlMs ?? DEFAULT_FRESH_TTL_MS;
  const staleTtlMs = options.staleTtlMs ?? DEFAULT_STALE_TTL_MS;
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const usageThreshold = options.usageThreshold ?? DEFAULT_USAGE_THRESHOLD;
  const cache = new Map<string, CacheEntry>();
  const activeByAccount = new Map<string, ActiveEntry>();
  const circuitByAccount = new Map<string, { blockedUntil: number; reason: string }>();

  function getStatus(accountId: string): MetaProtectionStatus {
    const circuit = circuitByAccount.get(accountId);
    if (!circuit || circuit.blockedUntil <= now()) {
      if (circuit) circuitByAccount.delete(accountId);
      return { circuitOpen: false, blockedUntil: null, reason: null };
    }
    return {
      circuitOpen: true,
      blockedUntil: new Date(circuit.blockedUntil).toISOString(),
      reason: circuit.reason,
    };
  }

  function recordRateLimit(accountId: string, reason: string, recoverySeconds?: number | null) {
    const recoveryMs = recoverySeconds && recoverySeconds > 0
      ? recoverySeconds * 1_000
      : cooldownMs;
    circuitByAccount.set(accountId, {
      blockedUntil: now() + recoveryMs,
      reason,
    });
  }

  function recordUsage(accountId: string, usage: MetaUsage) {
    if (usage.utilizationPercent < usageThreshold) return;
    recordRateLimit(
      accountId,
      `Meta API utilization reached ${usage.utilizationPercent}%. Requests are paused to protect this ad account.`,
      usage.recoverySeconds,
    );
  }

  async function run<T>(input: {
    accountId: string;
    key: string;
    load: () => Promise<T>;
  }): Promise<MetaProtectedResult<T>> {
    const cacheKey = `${input.accountId}:${input.key}`;
    const cached = cache.get(cacheKey);
    const status = getStatus(input.accountId);
    if (status.circuitOpen) {
      if (cached && cached.staleUntil > now()) {
        return { value: cached.value as T, source: "stale-cache", protection: status };
      }
      throw new MetaAccountCircuitOpenError(status);
    }

    if (cached && cached.freshUntil > now()) {
      return { value: cached.value as T, source: "fresh-cache", protection: status };
    }

    const active = activeByAccount.get(input.accountId);
    if (active) {
      if (active.key === cacheKey) {
        return active.promise as Promise<MetaProtectedResult<T>>;
      }
      throw new MetaAccountRequestBusyError();
    }

    const promise = (async (): Promise<MetaProtectedResult<T>> => {
      try {
        const value = await input.load();
        const completedAt = now();
        cache.set(cacheKey, {
          value,
          freshUntil: completedAt + freshTtlMs,
          staleUntil: completedAt + staleTtlMs,
        });
        return { value, source: "live", protection: getStatus(input.accountId) };
      } catch (error) {
        const rateLimited = isMetaRateLimitError(error);
        if (rateLimited) {
          recordRateLimit(
            input.accountId,
            "Meta temporarily rate-limited this ad account. Requests are paused until manual refresh is available.",
          );
        }
        const fallback = cache.get(cacheKey);
        if (fallback && fallback.staleUntil > now()) {
          return {
            value: fallback.value as T,
            source: "stale-cache",
            protection: getStatus(input.accountId),
          };
        }
        if (rateLimited) throw new MetaAccountCircuitOpenError(getStatus(input.accountId));
        throw error;
      } finally {
        activeByAccount.delete(input.accountId);
      }
    })();

    activeByAccount.set(input.accountId, { key: cacheKey, promise: promise as Promise<MetaProtectedResult<unknown>> });
    return promise;
  }

  return { getStatus, recordRateLimit, recordUsage, run };
}

export const metaAccountProtection = createMetaAccountProtection();

export function parseMetaUsage(appUsageHeader: string | null, adAccountUsageHeader: string | null): MetaUsage {
  const app = parseUsageObject(appUsageHeader);
  const account = parseUsageObject(adAccountUsageHeader);
  const values = [app.call_count, app.total_cputime, app.total_time, account.acc_id_util_pct]
    .map(Number)
    .filter(Number.isFinite);
  const recoverySeconds = Number(account.reset_time_duration);
  return {
    utilizationPercent: values.length ? Math.max(...values) : 0,
    recoverySeconds: Number.isFinite(recoverySeconds) && recoverySeconds > 0 ? recoverySeconds : null,
  };
}

export function isMetaRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; subcode?: unknown };
  return Number(value.code) === 80004 || Number(value.subcode) === 2446079;
}

function parseUsageObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
