export class TikTokManagementRequestBusyError extends Error {
  constructor(advertiserId: string) {
    super(`TikTok advertiser ${advertiserId} is already loading another management section.`);
    this.name = "TikTokManagementRequestBusyError";
  }
}

type ReadyEntry = { value: unknown; expiresAt: number };

export function createTikTokManagementCache(options: { now?: () => number; ttlMs?: number } = {}) {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? 5 * 60_000;
  const ready = new Map<string, ReadyEntry>();
  const pendingByKey = new Map<string, Promise<unknown>>();
  const activeKeyByAdvertiser = new Map<string, string>();

  return {
    async run<T>(input: { advertiserId: string; key: string; load: () => Promise<T> }): Promise<{ value: T; source: "provider" | "cache" }> {
      const cacheKey = `${input.advertiserId}:${input.key}`;
      const cached = ready.get(cacheKey);
      if (cached && cached.expiresAt > now()) return { value: clone(cached.value) as T, source: "cache" };
      if (cached) ready.delete(cacheKey);

      const identical = pendingByKey.get(cacheKey);
      if (identical) return { value: clone(await identical) as T, source: "provider" };
      const activeKey = activeKeyByAdvertiser.get(input.advertiserId);
      if (activeKey && activeKey !== cacheKey) throw new TikTokManagementRequestBusyError(input.advertiserId);

      const promise = input.load().then((value) => {
        ready.set(cacheKey, { value: clone(value), expiresAt: now() + ttlMs });
        return value;
      }).finally(() => {
        pendingByKey.delete(cacheKey);
        if (activeKeyByAdvertiser.get(input.advertiserId) === cacheKey) activeKeyByAdvertiser.delete(input.advertiserId);
      });
      pendingByKey.set(cacheKey, promise);
      activeKeyByAdvertiser.set(input.advertiserId, cacheKey);
      return { value: clone(await promise), source: "provider" };
    },
  };
}

export const tiktokManagementCache = createTikTokManagementCache();

function clone<T>(value: T): T {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
}
