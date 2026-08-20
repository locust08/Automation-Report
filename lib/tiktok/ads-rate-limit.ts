import type { TikTokAdsActionName } from "@/lib/tiktok/ads-actions";

export type TikTokRateLimitLevel = "basic" | "advanced" | "premium" | "ultimate";
export type TikTokRateLimitScope =
  | "qps"
  | "qpm"
  | "qpd"
  | "retry_after"
  | "provider_unknown";

type TikTokProviderLimit = {
  qps: number;
  qpm: number;
  qpd: number;
};

export type TikTokRateLimitConfig = TikTokProviderLimit & {
  level: TikTokRateLimitLevel;
  maxConcurrency: number;
  maxAutoWaitMs: number;
};

export type TikTokRateLimitDecision = {
  source: "local" | "provider";
  scope: TikTokRateLimitScope;
  retryAfterMs: number;
  retryAfterAt: string;
  autoRetry: boolean;
};

export type TikTokRateLimiter = {
  acquire(action: TikTokAdsActionName): Promise<() => void>;
  registerProviderLimit(
    action: TikTokAdsActionName,
    retryAfterHeader?: string | null,
    scopeHint?: "qps" | "qpm" | "qpd",
  ): TikTokRateLimitDecision;
};

export type TikTokRateLimiterDependencies = {
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
};

const SECOND_MS = 1_000;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const DEFAULT_PROVIDER_COOLDOWN_MS = 5 * MINUTE_MS;

const LEVEL_LIMITS: Record<TikTokRateLimitLevel, TikTokProviderLimit> = {
  basic: { qps: 10, qpm: 600, qpd: 864_000 },
  advanced: { qps: 20, qpm: 1_200, qpd: 1_728_000 },
  premium: { qps: 30, qpm: 1_800, qpd: 2_592_000 },
  ultimate: { qps: 50, qpm: 3_000, qpd: 4_320_000 },
};

const ENDPOINT_LIMITS: Partial<Record<
  TikTokAdsActionName,
  Record<TikTokRateLimitLevel, TikTokProviderLimit>
>> = {
  "ad.create": {
    basic: { qps: 5, qpm: 150, qpd: 86_400 },
    advanced: { qps: 10, qpm: 200, qpd: 86_400 },
    premium: { qps: 10, qpm: 300, qpd: 86_400 },
    ultimate: { qps: 15, qpm: 300, qpd: 86_400 },
  },
  "report.async-create": {
    basic: { qps: 2, qpm: 60, qpd: 4_500 },
    advanced: { qps: 2, qpm: 60, qpd: 4_500 },
    premium: { qps: 2, qpm: 60, qpd: 4_500 },
    ultimate: { qps: 2, qpm: 60, qpd: 4_500 },
  },
};

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function safetyLimit(providerLimit: number) {
  return Math.max(1, Math.floor(providerLimit * 0.8));
}

export function getTikTokRateLimitConfig(
  environment: Record<string, string | undefined> = process.env,
): TikTokRateLimitConfig {
  const requestedLevel = environment.TIKTOK_BUSINESS_RATE_LIMIT_LEVEL?.toLowerCase();
  const level: TikTokRateLimitLevel = requestedLevel && Object.hasOwn(LEVEL_LIMITS, requestedLevel)
    ? requestedLevel as TikTokRateLimitLevel
    : "basic";
  const provider = LEVEL_LIMITS[level];
  return {
    level,
    qps: Math.min(
      parsePositiveInteger(environment.TIKTOK_BUSINESS_MAX_QPS, safetyLimit(provider.qps)),
      provider.qps,
    ),
    qpm: Math.min(
      parsePositiveInteger(environment.TIKTOK_BUSINESS_MAX_QPM, safetyLimit(provider.qpm)),
      provider.qpm,
    ),
    qpd: safetyLimit(provider.qpd),
    maxConcurrency: parsePositiveInteger(environment.TIKTOK_BUSINESS_MAX_CONCURRENCY, 3),
    maxAutoWaitMs: 2_000,
  };
}

export function getTikTokActionRateLimit(
  action: TikTokAdsActionName,
  config: TikTokRateLimitConfig,
): TikTokProviderLimit {
  const endpointProvider = ENDPOINT_LIMITS[action]?.[config.level];
  if (!endpointProvider) return { qps: config.qps, qpm: config.qpm, qpd: config.qpd };
  return {
    qps: Math.min(config.qps, safetyLimit(endpointProvider.qps)),
    qpm: Math.min(config.qpm, safetyLimit(endpointProvider.qpm)),
    qpd: Math.min(config.qpd, safetyLimit(endpointProvider.qpd)),
  };
}

export class TikTokLocalRateLimitError extends Error {
  constructor(public readonly decision: TikTokRateLimitDecision) {
    super("TikTok request is locally rate limited");
    this.name = "TikTokLocalRateLimitError";
  }
}

function startOfUtcDay(timestamp: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function prune(timestamps: number[], now: number) {
  const oldest = startOfUtcDay(now);
  if (timestamps.length > 0 && timestamps[0] < oldest) timestamps.length = 0;
}

function windowDelay(timestamps: number[], maximum: number, windowMs: number, now: number) {
  if (timestamps.length < maximum) return 0;
  const oldestRelevant = timestamps[timestamps.length - maximum];
  return oldestRelevant > now - windowMs
    ? Math.max(0, oldestRelevant + windowMs - now)
    : 0;
}

function dailyDelay(timestamps: number[], maximum: number, now: number) {
  const dayStart = startOfUtcDay(now);
  return timestamps.length >= maximum ? dayStart + DAY_MS - now : 0;
}

function parseRetryAfter(value: string | null | undefined, now: number) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(250, seconds * 1_000);
  const date = Date.parse(value);
  if (Number.isFinite(date) && date > now) return date - now;
  return undefined;
}

export class TikTokAdsRateLimiter implements TikTokRateLimiter {
  private readonly globalTimestamps: number[] = [];
  private readonly actionTimestamps = new Map<TikTokAdsActionName, number[]>();
  private readonly actionCooldowns = new Map<
    TikTokAdsActionName,
    { until: number; scope: TikTokRateLimitScope }
  >();
  private activeRequests = 0;
  private schedulerTail: Promise<void> = Promise.resolve();
  private capacityWaiters = new Set<() => void>();

  constructor(
    private config: TikTokRateLimitConfig,
    private readonly dependencies: TikTokRateLimiterDependencies = {
      now: Date.now,
      sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    },
  ) {}

  updateConfig(config: TikTokRateLimitConfig) {
    this.config = config;
  }

  private actionHistory(action: TikTokAdsActionName) {
    const existing = this.actionTimestamps.get(action);
    if (existing) return existing;
    const created: number[] = [];
    this.actionTimestamps.set(action, created);
    return created;
  }

  private nextDelay(action: TikTokAdsActionName, now: number) {
    prune(this.globalTimestamps, now);
    const actionHistory = this.actionHistory(action);
    prune(actionHistory, now);
    const actionLimit = getTikTokActionRateLimit(action, this.config);
    const providerCooldown = this.actionCooldowns.get(action);
    const candidates: Array<{ delay: number; scope: TikTokRateLimitScope }> = [
      { delay: windowDelay(this.globalTimestamps, this.config.qps, SECOND_MS, now), scope: "qps" },
      { delay: windowDelay(this.globalTimestamps, this.config.qpm, MINUTE_MS, now), scope: "qpm" },
      { delay: dailyDelay(this.globalTimestamps, this.config.qpd, now), scope: "qpd" },
      { delay: windowDelay(actionHistory, actionLimit.qps, SECOND_MS, now), scope: "qps" },
      { delay: windowDelay(actionHistory, actionLimit.qpm, MINUTE_MS, now), scope: "qpm" },
      { delay: dailyDelay(actionHistory, actionLimit.qpd, now), scope: "qpd" },
      {
        delay: Math.max(0, (providerCooldown?.until ?? 0) - now),
        scope: providerCooldown?.scope ?? "provider_unknown",
      },
    ];
    return candidates.reduce((selected, candidate) => (
      candidate.delay > selected.delay ? candidate : selected
    ), { delay: 0, scope: "qps" as TikTokRateLimitScope });
  }

  private decision(source: "local" | "provider", scope: TikTokRateLimitScope, delay: number) {
    const now = this.dependencies.now();
    return {
      source,
      scope,
      retryAfterMs: Math.ceil(delay),
      retryAfterAt: new Date(now + delay).toISOString(),
      autoRetry: delay <= this.config.maxAutoWaitMs && !["qpm", "qpd", "provider_unknown"].includes(scope),
    } satisfies TikTokRateLimitDecision;
  }

  async acquire(action: TikTokAdsActionName) {
    let unlockScheduler = () => {};
    const predecessor = this.schedulerTail;
    this.schedulerTail = new Promise<void>((resolve) => { unlockScheduler = resolve; });
    await predecessor;
    try {
      while (this.activeRequests >= this.config.maxConcurrency) {
        await new Promise<void>((resolve) => this.capacityWaiters.add(resolve));
      }
      while (true) {
        const now = this.dependencies.now();
        const wait = this.nextDelay(action, now);
        if (wait.delay <= 0) break;
        if (wait.delay > this.config.maxAutoWaitMs) {
          throw new TikTokLocalRateLimitError(this.decision("local", wait.scope, wait.delay));
        }
        await this.dependencies.sleep(wait.delay);
      }
      const timestamp = this.dependencies.now();
      this.globalTimestamps.push(timestamp);
      this.actionHistory(action).push(timestamp);
      this.activeRequests += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        this.activeRequests = Math.max(0, this.activeRequests - 1);
        const waiters = [...this.capacityWaiters];
        this.capacityWaiters.clear();
        waiters.forEach((resolve) => resolve());
      };
    } finally {
      unlockScheduler();
    }
  }

  registerProviderLimit(
    action: TikTokAdsActionName,
    retryAfterHeader?: string | null,
    scopeHint?: "qps" | "qpm" | "qpd",
  ) {
    const now = this.dependencies.now();
    const parsedRetryAfter = parseRetryAfter(retryAfterHeader, now);
    const scope: TikTokRateLimitScope = parsedRetryAfter !== undefined
      ? "retry_after"
      : scopeHint ?? "provider_unknown";
    const retryAfterMs = parsedRetryAfter ?? (
      scope === "qps"
        ? SECOND_MS
        : scope === "qpd"
          ? startOfUtcDay(now) + DAY_MS - now
          : DEFAULT_PROVIDER_COOLDOWN_MS
    );
    this.actionCooldowns.set(action, { until: now + retryAfterMs, scope });
    return this.decision("provider", scope, retryAfterMs);
  }
}

export function inferTikTokProviderRateLimitScope(message: string | undefined) {
  if (!message) return undefined;
  const normalized = message.toLowerCase();
  if (/\bqpd\b|daily|per day|day limit/.test(normalized)) return "qpd" as const;
  if (/\bqpm\b|per minute|minute limit/.test(normalized)) return "qpm" as const;
  if (/\bqps\b|per second|second limit/.test(normalized)) return "qps" as const;
  return undefined;
}

const GLOBAL_LIMITER_KEY = Symbol.for("lt-paid-media.tiktok-ads-rate-limiter");

type TikTokGlobalRateLimiterState = {
  configKey: string;
  limiter: TikTokAdsRateLimiter;
};

export function getSharedTikTokAdsRateLimiter(
  config = getTikTokRateLimitConfig(),
) {
  const target = globalThis as typeof globalThis & {
    [GLOBAL_LIMITER_KEY]?: TikTokGlobalRateLimiterState;
  };
  const configKey = JSON.stringify(config);
  if (!target[GLOBAL_LIMITER_KEY]) {
    target[GLOBAL_LIMITER_KEY] = {
      configKey,
      limiter: new TikTokAdsRateLimiter(config),
    };
  } else if (target[GLOBAL_LIMITER_KEY]?.configKey !== configKey) {
    target[GLOBAL_LIMITER_KEY].limiter.updateConfig(config);
    target[GLOBAL_LIMITER_KEY].configKey = configKey;
  }
  return target[GLOBAL_LIMITER_KEY].limiter;
}


