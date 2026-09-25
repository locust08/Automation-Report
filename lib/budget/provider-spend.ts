import { createHash } from "node:crypto";
import { GoogleAdsRestClient } from "@/lib/google-ads/rest-client";
import { fetchTikTokReportLevel, validateTikTokAdvertiser } from "@/lib/reporting/tiktok";

export type SpendPlatform = "google" | "meta" | "tiktok";
export type SpendDay = { date: string; amount: number };
export type SpendRead = {
  platform: SpendPlatform; accountId: string; currency: string; timezone: string;
  start: string; end: string; daily: SpendDay[]; missingDays: string[];
  capturedAt: string; providerSnapshotId: string; providerRequestIds: string[];
};
export type SpendRequest = {
  platform: SpendPlatform; accountId: string; currency: string; timezone: string;
  start: string; end: string; googleLoginCustomerId?: string | null;
};

function dateList(start: string, end: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) throw new Error("Invalid spend period.");
  if (new Date(`${start}T00:00:00Z`).toISOString().slice(0, 10) !== start
    || new Date(`${end}T00:00:00Z`).toISOString().slice(0, 10) !== end) throw new Error("Invalid spend period.");
  const result: string[] = [];
  for (let current = Date.parse(`${start}T00:00:00Z`); current <= Date.parse(`${end}T00:00:00Z`); current += 86_400_000) {
    result.push(new Date(current).toISOString().slice(0, 10));
    if (result.length > 31) throw new Error("Read daily spend in windows of at most 31 days.");
  }
  return result;
}
function amount(value: unknown, scale = 1): number {
  if (typeof value !== "string" && typeof value !== "number") throw new Error("Provider spend is missing.");
  const number = Number(value) / scale;
  if (!Number.isFinite(number) || number < 0 || number > 1e12) throw new Error("Provider spend is invalid.");
  return number;
}
function rowRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function exactIdentity(actual: unknown, expected: string, label: string): void {
  if (String(actual ?? "") !== expected) throw new Error(`${label} does not match the approved account mapping.`);
}

/** Sparse provider rows remain sparse. A missing report day never becomes zero. */
export function normalizeSpendRows(request: SpendRequest, rows: SpendDay[], providerRequestIds: string[], capturedAt = new Date().toISOString()): SpendRead {
  const dates = dateList(request.start, request.end);
  if (!/^\d{1,30}$/.test(request.accountId) || !/^[A-Z]{3}$/.test(request.currency) || !request.timezone) throw new Error("Invalid approved account mapping.");
  const seen = new Set<string>();
  for (const row of rows) {
    if (!dates.includes(row.date) || seen.has(row.date) || !Number.isFinite(row.amount) || row.amount < 0) throw new Error("Provider daily spend contains an invalid or duplicate day.");
    seen.add(row.date);
  }
  const daily = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const missingDays = dates.filter((date) => !seen.has(date));
  const providerSnapshotId = createHash("sha256").update(JSON.stringify({
    platform: request.platform, accountId: request.accountId, start: request.start, end: request.end,
    currency: request.currency, daily, providerRequestIds,
  })).digest("hex");
  return { platform: request.platform, accountId: request.accountId, currency: request.currency,
    timezone: request.timezone, start: request.start, end: request.end, daily, missingDays,
    capturedAt, providerSnapshotId, providerRequestIds };
}

export async function readGoogleDailySpend(request: SpendRequest, client?: GoogleAdsRestClient): Promise<SpendRead> {
  if (request.platform !== "google" || !/^\d{10}$/.test(request.accountId)) throw new Error("Invalid Google account identity.");
  dateList(request.start, request.end);
  const transport = client ?? new GoogleAdsRestClient({
    clientId: process.env.GOOGLE_ADS_CLIENT_ID || null,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET || null,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN || null,
    apiVersion: process.env.GOOGLE_ADS_API_VERSION,
  });
  const loginCustomerId = request.googleLoginCustomerId || undefined;
  const options = { loginCustomerId };
  const metadata = await transport.searchAll<{ customer?: { id?: string; currencyCode?: string; currency_code?: string; timeZone?: string; time_zone?: string } }>(
    request.accountId, "SELECT customer.id, customer.currency_code, customer.time_zone FROM customer LIMIT 1", options);
  const customer = metadata[0]?.customer;
  exactIdentity(customer?.id, request.accountId, "Google customer ID");
  exactIdentity(customer?.currencyCode ?? customer?.currency_code, request.currency, "Google currency");
  exactIdentity(customer?.timeZone ?? customer?.time_zone, request.timezone, "Google timezone");
  const results = await transport.searchAll<{ segments?: { date?: string }; metrics?: { costMicros?: string; cost_micros?: string } }>(
    request.accountId,
    `SELECT segments.date, metrics.cost_micros FROM customer WHERE segments.date BETWEEN '${request.start}' AND '${request.end}'`, options);
  const rows = results.map((row) => ({ date: String(row.segments?.date ?? ""), amount: amount(row.metrics?.costMicros ?? row.metrics?.cost_micros, 1_000_000) }));
  return normalizeSpendRows(request, rows, []);
}

export async function readMetaDailySpend(request: SpendRequest, fetcher: typeof fetch = fetch): Promise<SpendRead> {
  if (request.platform !== "meta" || !/^\d{1,30}$/.test(request.accountId)) throw new Error("Invalid Meta account identity.");
  dateList(request.start, request.end);
  const token = process.env.META_ACCESS_TOKEN;
  const version = process.env.META_GRAPH_API_VERSION;
  if (!token || !version || !/^v\d+\.\d+$/.test(version)) throw new Error("Meta read authorization or reviewed API version is unavailable.");
  const base = `https://graph.facebook.com/${version}/act_${request.accountId}`;
  async function read(url: URL) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetcher(url, { cache: "no-store", signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Meta read failed (${response.status}).`);
      const raw = await response.text();
      if (raw.length > 2 * 1024 * 1024) throw new Error("Meta response exceeds the spend evidence limit.");
      return JSON.parse(raw) as Record<string, unknown>;
    } finally { clearTimeout(timeout); }
  }
  const accountUrl = new URL(base);
  accountUrl.searchParams.set("fields", "account_id,currency,timezone_name");
  const account = await read(accountUrl);
  exactIdentity(account.account_id, request.accountId, "Meta account ID");
  exactIdentity(account.currency, request.currency, "Meta currency");
  exactIdentity(account.timezone_name, request.timezone, "Meta timezone");
  const insights = new URL(`${base}/insights`);
  insights.searchParams.set("fields", "date_start,spend");
  insights.searchParams.set("level", "account");
  insights.searchParams.set("time_increment", "1");
  insights.searchParams.set("limit", "200");
  insights.searchParams.set("time_range", JSON.stringify({ since: request.start, until: request.end }));
  const rows: SpendDay[] = [];
  const cursors = new Set<string>();
  for (let page = 0; page < 100; page++) {
    const result = await read(insights);
    if (!Array.isArray(result.data)) throw new Error("Meta daily insights are incomplete.");
    for (const value of result.data) {
      const row = rowRecord(value);
      rows.push({ date: String(row.date_start ?? ""), amount: amount(row.spend) });
    }
    const cursor = rowRecord(rowRecord(result.paging).cursors).after;
    if (!cursor) return normalizeSpendRows(request, rows, []);
    if (typeof cursor !== "string" || !cursor || cursors.has(cursor)) throw new Error("Meta pagination did not advance.");
    cursors.add(cursor);
    insights.searchParams.set("after", cursor);
  }
  throw new Error("Meta insights exceed the paging limit.");
}

export async function readTikTokDailySpend(request: SpendRequest): Promise<SpendRead> {
  if (request.platform !== "tiktok" || !/^\d{1,30}$/.test(request.accountId)) throw new Error("Invalid TikTok advertiser identity.");
  dateList(request.start, request.end);
  const { client, advertiser } = await validateTikTokAdvertiser(request.accountId);
  exactIdentity(advertiser.currency, request.currency, "TikTok currency");
  exactIdentity(advertiser.timezone, request.timezone, "TikTok timezone");
  const report = await fetchTikTokReportLevel(client, { advertiserId: request.accountId,
    startDate: request.start, endDate: request.end, level: "campaign",
    dimensions: ["campaign_id", "stat_time_day"], metrics: ["spend"] });
  const byDate = new Map<string, number>();
  for (const value of report.rows) {
    const dimensions = rowRecord(value.dimensions);
    const metrics = rowRecord(value.metrics);
    const date = String(dimensions.stat_time_day ?? "").slice(0, 10);
    if (!date) throw new Error("TikTok report date is missing.");
    byDate.set(date, (byDate.get(date) ?? 0) + amount(metrics.spend));
  }
  return normalizeSpendRows(request, [...byDate].map(([date, value]) => ({ date, amount: value })), report.requestIds);
}

export function readProviderDailySpend(request: SpendRequest): Promise<SpendRead> {
  if (request.platform === "google") return readGoogleDailySpend(request);
  if (request.platform === "meta") return readMetaDailySpend(request);
  return readTikTokDailySpend(request);
}
