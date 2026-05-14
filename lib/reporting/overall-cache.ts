import { createHash } from "node:crypto";

import type { OverallReportPayload } from "@/lib/reporting/types";
import { clonePlainData, MemoryCacheEntry, readThroughMemoryCache } from "@/lib/reporting/memory-cache";

const OVERALL_REPORT_CACHE_SCHEMA_VERSION = 1;
const localOverallReportCache = new Map<string, MemoryCacheEntry<OverallReportPayload>>();
const DEFAULT_OVERALL_REPORT_CACHE_TTL_MS = 1000 * 60 * 60 * 6;

function getCacheTtlMs(): number {
  const raw = process.env.OVERALL_REPORT_CACHE_TTL_SECONDS?.trim();
  if (!raw) {
    return DEFAULT_OVERALL_REPORT_CACHE_TTL_MS;
  }

  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }
  return Math.round(seconds * 1000);
}

function getWorkerConfig(): { baseUrl: string; secret: string } | null {
  const baseUrl =
    process.env.OVERALL_REPORT_CACHE_WORKER_URL?.trim() ||
    process.env.REPORT_CACHE_WORKER_URL?.trim();
  const secret =
    process.env.OVERALL_REPORT_CACHE_SECRET?.trim() ||
    process.env.REPORT_CACHE_SECRET?.trim();
  if (!baseUrl || !secret) {
    return null;
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), secret };
}

export function buildOverallReportCacheKey(input: {
  accountId: string | null;
  metaAccountId: string | null;
  googleAccountId: string | null;
  startDate: string | null;
  endDate: string | null;
}): string {
  const payload = {
    version: OVERALL_REPORT_CACHE_SCHEMA_VERSION,
    accountId: normalizeCacheValue(input.accountId),
    metaAccountId: normalizeAccountList(input.metaAccountId),
    googleAccountId: normalizeAccountList(input.googleAccountId),
    startDate: normalizeCacheValue(input.startDate),
    endDate: normalizeCacheValue(input.endDate),
  };
  return `overall-v${OVERALL_REPORT_CACHE_SCHEMA_VERSION}-${createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")}`;
}

export async function readOverallReportCache(cacheKey: string): Promise<OverallReportPayload | null> {
  const ttlMs = getCacheTtlMs();
  if (ttlMs <= 0) {
    return null;
  }

  const workerConfig = getWorkerConfig();
  if (workerConfig) {
    try {
      const response = await fetch(
        `${workerConfig.baseUrl}/overall-report-cache/${encodeURIComponent(cacheKey)}`,
        {
          headers: {
            Authorization: `Bearer ${workerConfig.secret}`,
          },
          cache: "no-store",
        }
      );

      if (response.status === 404) {
        return null;
      }

      if (response.ok) {
        return (await response.json()) as OverallReportPayload;
      }

      console.warn(`[overall-report] Cloudflare cache read failed status=${response.status}`);
    } catch (error) {
      console.warn("[overall-report] Cloudflare cache read failed", error);
    }
  }

  return readThroughMemoryCache(
    localOverallReportCache,
    cacheKey,
    async () => {
      throw new Error("Overall report cache miss.");
    },
    {
      ttlMs,
      clone: clonePlainData,
    }
  ).catch(() => null);
}

export async function writeOverallReportCache(
  cacheKey: string,
  payload: OverallReportPayload
): Promise<void> {
  const ttlMs = getCacheTtlMs();
  if (ttlMs <= 0) {
    return;
  }

  const workerConfig = getWorkerConfig();
  if (workerConfig) {
    try {
      const response = await fetch(
        `${workerConfig.baseUrl}/overall-report-cache/${encodeURIComponent(cacheKey)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${workerConfig.secret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            payload,
            expiresAt: new Date(Date.now() + ttlMs).toISOString(),
          }),
          cache: "no-store",
        }
      );

      if (!response.ok) {
        console.warn(`[overall-report] Cloudflare cache write failed status=${response.status}`);
      }
    } catch (error) {
      console.warn("[overall-report] Cloudflare cache write failed", error);
    }
  }

  const now = Date.now();
  localOverallReportCache.set(cacheKey, {
    status: "ready",
    value: clonePlainData(payload),
    expiresAt: now + ttlMs,
    lastAccessedAt: now,
  });
}

function normalizeCacheValue(value: string | null): string {
  return value?.trim() ?? "";
}

function normalizeAccountList(value: string | null): string[] {
  return normalizeCacheValue(value)
    .split(/[\s,;|]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}
