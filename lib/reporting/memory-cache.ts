export type MemoryCacheEntry<T> =
  | {
      status: "pending";
      promise: Promise<T>;
      expiresAt: number;
      lastAccessedAt: number;
    }
  | {
      status: "ready";
      value: T;
      expiresAt: number;
      lastAccessedAt: number;
    };

interface ReadThroughMemoryCacheOptions<T> {
  ttlMs: number;
  maxEntries?: number;
  clone?: (value: T) => T;
}

const DEFAULT_MAX_ENTRIES = 100;

export async function readThroughMemoryCache<T>(
  cache: Map<string, MemoryCacheEntry<T>>,
  key: string,
  factory: () => Promise<T>,
  options: ReadThroughMemoryCacheOptions<T>
): Promise<T> {
  const { ttlMs, maxEntries = DEFAULT_MAX_ENTRIES, clone = clonePlainData } = options;

  if (ttlMs <= 0) {
    return factory();
  }

  const now = Date.now();
  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) {
    existing.lastAccessedAt = now;
    if (existing.status === "pending") {
      return clone(await existing.promise);
    }
    return clone(existing.value);
  }

  if (existing) {
    cache.delete(key);
  }

  pruneExpiredEntries(cache, now);
  pruneLeastRecentlyUsedEntries(cache, maxEntries - 1);

  const pendingExpiresAt = now + ttlMs;
  const promise = factory()
    .then((value) => {
      cache.set(key, {
        status: "ready",
        value,
        expiresAt: Date.now() + ttlMs,
        lastAccessedAt: Date.now(),
      });
      return value;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, {
    status: "pending",
    promise,
    expiresAt: pendingExpiresAt,
    lastAccessedAt: now,
  });

  return clone(await promise);
}

export function clonePlainData<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function pruneExpiredEntries<T>(cache: Map<string, MemoryCacheEntry<T>>, now: number) {
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

function pruneLeastRecentlyUsedEntries<T>(
  cache: Map<string, MemoryCacheEntry<T>>,
  maxEntries: number
) {
  while (cache.size > Math.max(0, maxEntries)) {
    let oldestKey: string | null = null;
    let oldestAccessedAt = Number.POSITIVE_INFINITY;

    for (const [key, entry] of cache.entries()) {
      if (entry.lastAccessedAt < oldestAccessedAt) {
        oldestKey = key;
        oldestAccessedAt = entry.lastAccessedAt;
      }
    }

    if (!oldestKey) {
      return;
    }

    cache.delete(oldestKey);
  }
}
