import { AsyncLocalStorage } from "node:async_hooks";
import { getTikTokBusinessAuthorizationContext } from "@/lib/tiktok/token-manager";
import { createHash } from "node:crypto";
import { readThroughMemoryCache, type MemoryCacheEntry } from "./memory-cache";

export const reportPageCacheContext = new AsyncLocalStorage<{ refresh: boolean }>();

const cache = new Map<string, MemoryCacheEntry<unknown>>();
export async function cachedReportPage<T extends { warnings?: string[]; complete?: boolean }>(scope: unknown, load: () => Promise<T>, refresh = false): Promise<T> {
  const identity = [process.env.META_ACCESS_TOKEN, process.env.TIKTOK_BUSINESS_ACCESS_TOKEN, process.env.TIKTOK_BUSINESS_TOKEN_UPDATED_AT, process.env.TIKTOK_BUSINESS_AUTHORIZED_ADVERTISERS, process.env.GOOGLE_ADS_REFRESH_TOKEN, process.env.GOOGLE_ADS_API_VERSION];
  const accounts = (scope as { accounts?: { tiktokAccountIds?: string[] } }).accounts;
  if (accounts?.tiktokAccountIds?.length) {
    const authorization = await getTikTokBusinessAuthorizationContext();
    identity.push(authorization.accessToken, authorization.updatedAt, JSON.stringify(authorization.advertisers), JSON.stringify(authorization.grantedScopes));
  }
  const key = createHash("sha256").update(JSON.stringify({ version: 4, scope, identity })).digest("hex");
  if (refresh) cache.delete(key);
  const payload = await readThroughMemoryCache(cache, key, () => reportPageCacheContext.run({ refresh }, load), { ttlMs: 7 * 24 * 60 * 60 * 1000, maxEntries: 500 }) as T;
  if (payload.complete === false || payload.warnings?.some((warning) => !warning.startsWith("Notion resolved "))) cache.delete(key);
  return payload;
}
