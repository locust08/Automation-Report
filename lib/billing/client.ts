import type { BillingReportResponse } from "@/lib/billing/types";

const CACHE_TTL_MS = 30_000;
const CACHE_STALE_MS = 120_000;
const MAX_CACHE_ENTRIES = 100;
const responseCache = new Map<string, { expiresAt: number; staleUntil: number; value: BillingReportResponse }>();
const pendingRequests = new Map<string, Promise<BillingReportResponse>>();
let cacheGeneration = 0;

function getConfig() {
  const baseUrl = process.env.BILLING_OPERATIONS_API_BASE_URL?.trim().replace(/\/$/, "");
  const token = process.env.WORKER_API_TOKEN?.trim();
  if (!baseUrl || !token) {
    throw new Error(
      "Billing Operations is not configured. Set BILLING_OPERATIONS_API_BASE_URL and WORKER_API_TOKEN."
    );
  }
  return { baseUrl, token };
}

export async function getBillingReport(searchParams: URLSearchParams): Promise<BillingReportResponse> {
  const { baseUrl, token } = getConfig();
  const query = searchParams.toString();
  const cacheKey = query;
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return structuredClone(cached.value);

  if (cached && cached.staleUntil > Date.now()) {
    void fetchAndCacheReport(baseUrl, token, query, cacheKey).catch(() => undefined);
    return structuredClone(cached.value);
  }

  return structuredClone(await fetchAndCacheReport(baseUrl, token, query, cacheKey));
}

function fetchAndCacheReport(baseUrl: string, token: string, query: string, cacheKey: string): Promise<BillingReportResponse> {
  const pending = pendingRequests.get(cacheKey);
  if (pending) return pending;

  const generation = cacheGeneration;
  const request = fetchBillingReport(baseUrl, token, query).then((payload) => {
    if (generation === cacheGeneration) {
      const now = Date.now();
      responseCache.delete(cacheKey);
      responseCache.set(cacheKey, {
        expiresAt: now + CACHE_TTL_MS,
        staleUntil: now + CACHE_TTL_MS + CACHE_STALE_MS,
        value: payload,
      });
      while (responseCache.size > MAX_CACHE_ENTRIES) {
        const oldestKey = responseCache.keys().next().value;
        if (oldestKey === undefined) break;
        responseCache.delete(oldestKey);
      }
    }
    return payload;
  }).finally(() => {
    if (pendingRequests.get(cacheKey) === request) pendingRequests.delete(cacheKey);
  });

  pendingRequests.set(cacheKey, request);
  return request;
}

async function fetchBillingReport(baseUrl: string, token: string, query: string): Promise<BillingReportResponse> {
  const response = await fetch(`${baseUrl}/reports${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as BillingReportResponse | { message?: string } | null;
  if (!response.ok || !payload || !("companies" in payload)) {
    throw new Error(payload && "message" in payload && payload.message ? payload.message : `Billing API failed (${response.status}).`);
  }
  return payload;
}

function invalidateReportCache() {
  cacheGeneration += 1;
  responseCache.clear();
  pendingRequests.clear();
}

export async function mutateBillingItem(
  itemKey: string,
  input: { reportDate: string; checked?: boolean; remark?: string }
): Promise<void> {
  const { baseUrl, token } = getConfig();
  const response = await fetch(`${baseUrl}/items/${encodeURIComponent(itemKey)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? `Billing update failed (${response.status}).`);
  }
  invalidateReportCache();
}

export async function mutateCompanyPic(input: {
  reportDate: string;
  accountKeys: string[];
  picKey: string;
}): Promise<void> {
  const { baseUrl, token } = getConfig();
  const response = await fetch(`${baseUrl}/companies/assignment/pic`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? `PIC update failed (${response.status}).`);
  }
  invalidateReportCache();
}
