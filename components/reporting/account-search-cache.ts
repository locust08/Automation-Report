const cache = new Map<string, { accounts: unknown[]; expires: number }>();
const pending = new Map<string, Promise<unknown[]>>();

export async function searchCachedAccounts<T>(query: string): Promise<T[]> {
  const key = query.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return structuredClone(cached.accounts) as T[];
  if (cached) cache.delete(key);
  let request = pending.get(key);
  if (!request) {
    request = fetch(`/api/notion/accounts/search?q=${encodeURIComponent(key)}`, { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as { accounts?: unknown[]; error?: string; message?: string };
      if (!response.ok || !Array.isArray(payload.accounts)) throw new Error(payload.error ?? payload.message ?? "Unable to search accounts.");
      cache.set(key, { accounts: payload.accounts, expires: Date.now() + 5 * 60 * 1000 });
      while (cache.size > 100) cache.delete(cache.keys().next().value!);
      return payload.accounts;
    }).finally(() => pending.delete(key));
    pending.set(key, request);
  }
  return structuredClone(await request) as T[];
}
