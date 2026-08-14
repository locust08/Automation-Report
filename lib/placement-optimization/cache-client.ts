import type { PlacementDashboardPayload, PlacementOptimizationRow } from "@/lib/placement-optimization/types";

export type PlacementCacheStatus = {
  id: string;
  accountId: string;
  startDate: string;
  endDate: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  stage: string;
  processedRows: number;
  totalRows: number | null;
  hasMore: boolean;
  error: string | null;
  cancellationRequested: boolean;
  startedAt: string;
  updatedAt: string;
  expiresAt: string | null;
  summary?: {
    campaignTypes: PlacementDashboardPayload["campaignTypes"];
    placementCount: number;
    totalImpressions: number;
    totalSpend: number;
    uniqueSites: number;
    topSites: PlacementDashboardPayload["placementOverview"]["topSites"];
  };
};

type CachedPlacementRow = Omit<PlacementOptimizationRow, "id" | "classification" | "recommendedAction" | "confidence" | "reason" | "confirmationRequired" | "aiStatus" | "reviewStatus" | "currentDecision" | "reviewHistory"> & { stableKey: string };

function config() {
  const baseUrl = process.env.PLACEMENT_ANALYSIS_WORKER_URL?.replace(/\/$/, "");
  const secret = process.env.WORKER_API_SECRET;
  if (!baseUrl || !secret) throw new Error("Placement cache Worker is not configured.");
  return { baseUrl, secret };
}

async function workerFetch(path: string, init?: RequestInit) {
  const { baseUrl, secret } = config();
  return fetch(`${baseUrl}${path}`, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), authorization: `Bearer ${secret}` }, cache: "no-store" });
}

export async function startPlacementCache(input: { accountId: string; startDate: string; endDate: string; refresh?: boolean }) {
  const response = await workerFetch("/placement-cache/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command: "retrieve", ...input }) });
  const payload = await response.json() as PlacementCacheStatus & { error?: string | null };
  if (!response.ok) throw new Error(payload.error ?? `Placement cache request failed (${response.status}).`);
  return payload;
}

export async function loadMorePlacementCache(input: { accountId: string; startDate: string; endDate: string }) {
  const response = await workerFetch("/placement-cache/load-more", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command: "load_more", ...input }) });
  const payload = await response.json() as PlacementCacheStatus & { error?: string | null };
  if (!response.ok) throw new Error(payload.error ?? `Load more placement request failed (${response.status}).`);
  return payload;
}

export async function getPlacementCacheStatus(input: { accountId: string; startDate: string; endDate: string }) {
  const query = new URLSearchParams(input);
  const response = await workerFetch(`/placement-cache/status?${query}`);
  const payload = await response.json() as PlacementCacheStatus | { status: null; error?: string };
  if (!response.ok) throw new Error("Unable to read placement cache status.");
  return "id" in payload ? payload : null;
}

export async function cancelPlacementCache(input: { accountId: string; startDate: string; endDate: string }) {
  const query = new URLSearchParams(input);
  const response = await workerFetch(`/placement-cache/cancel?${query}`, { method: "DELETE" });
  const payload = await response.json() as PlacementCacheStatus & { error?: string | null };
  if (!response.ok) throw new Error(payload.error ?? "Unable to stop placement retrieval.");
  return payload;
}

export async function loadPlacementCacheRows(input: { accountId: string; startDate: string; endDate: string; page: number; pageSize: number; campaignType?: string; placementType?: string }) {
  const query = new URLSearchParams({ accountId: input.accountId, startDate: input.startDate, endDate: input.endDate, page: String(input.page), pageSize: String(input.pageSize), campaignType: input.campaignType ?? "all", placementType: input.placementType ?? "all" });
  const response = await workerFetch(`/placement-cache/rows?${query}`);
  const payload = await response.json() as { rows?: CachedPlacementRow[]; page?: number; pageSize?: number; total?: number; pageCount?: number; generatedAt?: string; expiresAt?: string; error?: string; code?: string };
  if (!response.ok) throw Object.assign(new Error(payload.error ?? "Unable to load placements."), { code: payload.code, status: response.status });
  return {
    rows: (payload.rows ?? []).map((row): PlacementOptimizationRow => ({ ...row, id: `live:${encodeURIComponent(row.stableKey)}`, classification: "Live Google Ads placement", recommendedAction: "keep", confidence: 0, reason: "Live placement data. Only published exclusions are saved.", confirmationRequired: true, aiStatus: "not_required", reviewStatus: "live", currentDecision: null, reviewHistory: [] })),
    page: payload.page ?? input.page,
    pageSize: payload.pageSize ?? input.pageSize,
    total: payload.total ?? 0,
    pageCount: payload.pageCount ?? 0,
    generatedAt: payload.generatedAt ?? null,
    expiresAt: payload.expiresAt ?? null,
  };
}
