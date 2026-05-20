import { createHash } from "node:crypto";

import type { DateRangeConfig } from "@/lib/reporting/types";
import { clonePlainData, MemoryCacheEntry, readThroughMemoryCache } from "@/lib/reporting/memory-cache";

export type AdvancedCreativeAiStatus = "cached" | "generated" | "fallback" | "skipped";

export interface AdvancedCreativeAiResult {
  reasons: string[];
  themes?: string[];
}

interface AdvancedCreativeAiCacheEnvelope extends AdvancedCreativeAiResult {
  metadata: {
    cacheType: "advanced-creative-ai";
    cacheKey: string;
    accountId: string;
    platform: "google" | "meta";
    creativeRef: string;
    finalUrlHash: string;
    mediaUrlHash: string;
    dateRange: DateRangeConfig;
    generatedAt: string;
  };
}

const localAdvancedCreativeAiCache = new Map<string, MemoryCacheEntry<AdvancedCreativeAiCacheEnvelope>>();
const LOCAL_ADVANCED_CREATIVE_AI_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const LOCAL_ADVANCED_CREATIVE_AI_CACHE_MAX_ENTRIES = 500;

export function buildAdvancedCreativeAiCacheKey(input: {
  accountId: string;
  platform: "google" | "meta";
  adId?: string | null;
  creativeId?: string | null;
  finalUrl: string;
  dateRange: DateRangeConfig;
  mediaUrl: string | null;
}): string {
  const accountId = normalizeCachePart(input.accountId);
  const creativeRef = normalizeCachePart(input.creativeId || input.adId || "creative");
  const finalUrlHash = hashCachePart(input.finalUrl);
  const mediaUrlHash = hashCachePart(input.mediaUrl ?? "");
  const digest = createHash("sha256")
    .update(
      [
        "advanced-creative-ai-v1",
        accountId,
        input.platform,
        creativeRef,
        input.finalUrl.trim(),
        input.dateRange.startDate,
        input.dateRange.endDate,
        input.mediaUrl ?? "",
      ].join("\n")
    )
    .digest("hex")
    .slice(0, 24);

  return [
    "advanced",
    "creative-ai",
    "v1",
    input.platform,
    accountId,
    `${input.dateRange.startDate}_${input.dateRange.endDate}`,
    creativeRef,
    finalUrlHash,
    mediaUrlHash,
    `${digest}.json`,
  ].join("/");
}

export async function readAdvancedCreativeAiCache(cacheKey: string): Promise<AdvancedCreativeAiResult | null> {
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
        const payload = (await response.json()) as AdvancedCreativeAiCacheEnvelope;
        return clonePlainData({ reasons: payload.reasons, themes: payload.themes });
      }

      console.warn(`[advanced-report] creative AI cache read failed status=${response.status}`);
    } catch (error) {
      console.warn("[advanced-report] creative AI cache read failed", error);
    }
  }

  const cached = await readThroughMemoryCache(
    localAdvancedCreativeAiCache,
    cacheKey,
    async () => {
      throw new Error("Advanced creative AI cache miss.");
    },
    {
      ttlMs: LOCAL_ADVANCED_CREATIVE_AI_CACHE_TTL_MS,
      maxEntries: LOCAL_ADVANCED_CREATIVE_AI_CACHE_MAX_ENTRIES,
      clone: clonePlainData,
    }
  ).catch(() => null);

  return cached ? clonePlainData({ reasons: cached.reasons, themes: cached.themes }) : null;
}

export async function writeAdvancedCreativeAiCache(
  cacheKey: string,
  input: {
    accountId: string;
    platform: "google" | "meta";
    adId?: string | null;
    creativeId?: string | null;
    finalUrl: string;
    dateRange: DateRangeConfig;
    mediaUrl: string | null;
  },
  result: AdvancedCreativeAiResult
): Promise<void> {
  const envelope: AdvancedCreativeAiCacheEnvelope = {
    reasons: clonePlainData(result.reasons),
    themes: clonePlainData(result.themes ?? []),
    metadata: {
      cacheType: "advanced-creative-ai",
      cacheKey,
      accountId: input.accountId,
      platform: input.platform,
      creativeRef: normalizeCachePart(input.creativeId || input.adId || "creative"),
      finalUrlHash: hashCachePart(input.finalUrl),
      mediaUrlHash: hashCachePart(input.mediaUrl ?? ""),
      dateRange: input.dateRange,
      generatedAt: new Date().toISOString(),
    },
  };

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
          body: JSON.stringify(envelope),
          cache: "no-store",
        }
      );

      if (!response.ok) {
        console.warn(`[advanced-report] creative AI cache write failed status=${response.status}`);
      }
    } catch (error) {
      console.warn("[advanced-report] creative AI cache write failed", error);
    }
  }

  const now = Date.now();
  localAdvancedCreativeAiCache.set(cacheKey, {
    status: "ready",
    value: clonePlainData(envelope),
    expiresAt: now + LOCAL_ADVANCED_CREATIVE_AI_CACHE_TTL_MS,
    lastAccessedAt: now,
  });
}

function getWorkerConfig(): { baseUrl: string; secret: string } | null {
  const baseUrl = process.env.ADVANCED_REPORT_CACHE_WORKER_URL?.trim();
  const secret = process.env.ADVANCED_REPORT_CACHE_SECRET?.trim();
  if (!baseUrl || !secret) {
    return null;
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), secret };
}

function normalizeCachePart(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "unknown"
  );
}

function hashCachePart(value: string): string {
  return createHash("sha256").update(value.trim()).digest("hex").slice(0, 16);
}
