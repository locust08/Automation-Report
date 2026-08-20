import { createHash } from "node:crypto";

import { clonePlainData, type MemoryCacheEntry } from "@/lib/reporting/memory-cache";
import type { TikTokInsightsPayload } from "@/lib/reporting/tiktok-insights";

const CACHE_SCHEMA_VERSION = 1;
const ACTIVE_RANGE_TTL_MS = 15 * 60 * 1000;
const HISTORICAL_RANGE_TTL_MS = 6 * 60 * 60 * 1000;
const THUMBNAIL_EXPIRY_BUFFER_MS = 30 * 60 * 1000;
const localCache = new Map<string, MemoryCacheEntry<TikTokInsightsPayload>>();

interface CacheInput {
  advertiserId: string;
  startDate: string;
  endDate: string;
}

interface ResolveOptions {
  now?: number;
}

export function buildTikTokInsightsCacheKey(input: CacheInput): string {
  const value = JSON.stringify({
    version: CACHE_SCHEMA_VERSION,
    advertiserId: input.advertiserId.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
  });
  return `tiktok-insights-v${CACHE_SCHEMA_VERSION}-${createHash("sha256").update(value).digest("hex")}`;
}

export function resolveTikTokInsightsCacheTtlMs(input: {
  endDate: string;
  payload: TikTokInsightsPayload;
  now?: number;
}): number {
  const now = input.now ?? Date.now();
  const currentMonthStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
  const endTimestamp = Date.parse(`${input.endDate}T23:59:59Z`);
  let ttl = Number.isFinite(endTimestamp) && endTimestamp < currentMonthStart
    ? HISTORICAL_RANGE_TTL_MS
    : ACTIVE_RANGE_TTL_MS;

  for (const ad of input.payload.topAds) {
    if (!ad.thumbnailUrl) continue;
    let expires: string | null = null;
    try {
      expires = new URL(ad.thumbnailUrl).searchParams.get("x-expires");
    } catch {
      continue;
    }
    if (!expires) continue;
    const expiresAt = Number(expires) * 1000;
    if (Number.isFinite(expiresAt)) ttl = Math.min(ttl, expiresAt - now - THUMBNAIL_EXPIRY_BUFFER_MS);
  }
  return Math.max(0, ttl);
}

export async function resolveTikTokInsightsWithCache(
  input: CacheInput,
  fetcher: () => Promise<TikTokInsightsPayload>,
  options: ResolveOptions = {},
): Promise<TikTokInsightsPayload> {
  const now = options.now ?? Date.now();
  const cacheKey = buildTikTokInsightsCacheKey(input);
  const existing = localCache.get(cacheKey);
  if (existing?.status === "ready" && existing.expiresAt > now) {
    existing.lastAccessedAt = now;
    return clonePlainData(existing.value);
  }
  if (existing?.status === "pending") return clonePlainData(await existing.promise);
  localCache.delete(cacheKey);

  const pending = (async () => {
    const shared = await readSharedCache(cacheKey, now);
    if (shared) return shared;

    const payload = await fetcher();
    const ttlMs = resolveTikTokInsightsCacheTtlMs({ endDate: input.endDate, payload, now });
    if (ttlMs > 0) await writeSharedCache(cacheKey, payload, now + ttlMs);
    return payload;
  })();
  localCache.set(cacheKey, { status: "pending", promise: pending, expiresAt: now + 30_000, lastAccessedAt: now });

  try {
    const payload = await pending;
    const ttlMs = resolveTikTokInsightsCacheTtlMs({ endDate: input.endDate, payload, now });
    if (ttlMs > 0) {
      localCache.set(cacheKey, {
        status: "ready",
        value: clonePlainData(payload),
        expiresAt: now + ttlMs,
        lastAccessedAt: now,
      });
    } else {
      localCache.delete(cacheKey);
    }
    return clonePlainData(payload);
  } catch (error) {
    localCache.delete(cacheKey);
    throw error;
  }
}

function getWorkerConfig(): { baseUrl: string; secret: string } | null {
  const baseUrl = process.env.TIKTOK_INSIGHTS_CACHE_WORKER_URL?.trim()
    || process.env.OVERALL_REPORT_CACHE_WORKER_URL?.trim()
    || process.env.REPORT_CACHE_WORKER_URL?.trim();
  const secret = process.env.TIKTOK_INSIGHTS_CACHE_SECRET?.trim()
    || process.env.OVERALL_REPORT_CACHE_SECRET?.trim()
    || process.env.REPORT_CACHE_SECRET?.trim();
  return baseUrl && secret ? { baseUrl: baseUrl.replace(/\/+$/, ""), secret } : null;
}

async function readSharedCache(cacheKey: string, now: number): Promise<TikTokInsightsPayload | null> {
  const config = getWorkerConfig();
  if (!config) return null;
  try {
    const response = await fetch(`${config.baseUrl}/tiktok-insights-cache/${encodeURIComponent(cacheKey)}`, {
      headers: { Authorization: `Bearer ${config.secret}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const envelope = await response.json() as { payload?: TikTokInsightsPayload; expiresAt?: string };
    if (!envelope.payload || !envelope.expiresAt || Date.parse(envelope.expiresAt) <= now) return null;
    return envelope.payload;
  } catch {
    return null;
  }
}

async function writeSharedCache(cacheKey: string, payload: TikTokInsightsPayload, expiresAt: number): Promise<void> {
  const config = getWorkerConfig();
  if (!config) return;
  try {
    await fetch(`${config.baseUrl}/tiktok-insights-cache/${encodeURIComponent(cacheKey)}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${config.secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload, expiresAt: new Date(expiresAt).toISOString() }),
      cache: "no-store",
    });
  } catch {
    // Shared caching is an optimization; provider results remain authoritative.
  }
}
