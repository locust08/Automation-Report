import type { DemandGenPayload } from "./demand-gen";
import { readThroughMemoryCache, type MemoryCacheEntry } from "./memory-cache";

const cache = new Map<string, MemoryCacheEntry<DemandGenPayload>>();
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function resolveDemandGenWithCache(key: string, load: () => Promise<DemandGenPayload>, refresh = false) {
  if (refresh) cache.delete(key);
  const payload = await readThroughMemoryCache(cache, key, load, { ttlMs: TTL_MS, maxEntries: 100 });
  // Partial snapshots must remain retrievable on retry rather than becoming sticky failures.
  if (!payload.complete || payload.creativeCoverageComplete === false) cache.delete(key);
  return payload;
}
