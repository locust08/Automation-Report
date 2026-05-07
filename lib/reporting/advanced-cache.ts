import type { AdvancedReportPayload } from "@/lib/reporting/advanced-types";
import { clonePlainData, MemoryCacheEntry, readThroughMemoryCache } from "@/lib/reporting/memory-cache";

const localAdvancedReportCache = new Map<string, MemoryCacheEntry<AdvancedReportPayload>>();
const LOCAL_ADVANCED_REPORT_CACHE_TTL_MS = 1000 * 60 * 60;

function getWorkerConfig(): { baseUrl: string; secret: string } | null {
  const baseUrl = process.env.ADVANCED_REPORT_CACHE_WORKER_URL?.trim();
  const secret = process.env.ADVANCED_REPORT_CACHE_SECRET?.trim();
  if (!baseUrl || !secret) {
    return null;
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), secret };
}

export async function readAdvancedReportCache(cacheKey: string): Promise<AdvancedReportPayload | null> {
  const workerConfig = getWorkerConfig();
  if (workerConfig) {
    try {
      const response = await fetch(
        `${workerConfig.baseUrl}/advanced-report-cache/${encodeURIComponent(cacheKey)}`,
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
        const payload = (await response.json()) as AdvancedReportPayload;
        return { ...payload, metadata: { ...payload.metadata, cached: true } };
      }
    } catch (error) {
      console.warn("[advanced-report] Cloudflare cache read failed", error);
    }
  }

  const cached = await readThroughMemoryCache(
    localAdvancedReportCache,
    cacheKey,
    async () => {
      throw new Error("Advanced report cache miss.");
    },
    {
      ttlMs: LOCAL_ADVANCED_REPORT_CACHE_TTL_MS,
      clone: clonePlainData,
    }
  ).catch(() => null);

  return cached ? { ...cached, metadata: { ...cached.metadata, cached: true } } : null;
}

export async function writeAdvancedReportCache(
  cacheKey: string,
  payload: AdvancedReportPayload
): Promise<void> {
  const workerConfig = getWorkerConfig();
  if (workerConfig) {
    try {
      const response = await fetch(
        `${workerConfig.baseUrl}/advanced-report-cache/${encodeURIComponent(cacheKey)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${workerConfig.secret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          cache: "no-store",
        }
      );

      if (!response.ok) {
        console.warn(
          `[advanced-report] Cloudflare cache write failed status=${response.status}`
        );
      }
    } catch (error) {
      console.warn("[advanced-report] Cloudflare cache write failed", error);
    }
  }

  const now = Date.now();
  localAdvancedReportCache.set(cacheKey, {
    status: "ready",
    value: clonePlainData(payload),
    expiresAt: now + LOCAL_ADVANCED_REPORT_CACHE_TTL_MS,
    lastAccessedAt: now,
  });
}
