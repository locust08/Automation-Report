import { TIKTOK_ADS_API_VERSION } from "@/lib/tiktok/ads-actions";
import { TikTokAdsClient } from "@/lib/tiktok/ads-client";
import {
  getSharedTikTokAdsRateLimiter,
  getTikTokRateLimitConfig,
  type TikTokRateLimitConfig,
} from "@/lib/tiktok/ads-rate-limit";
import type { TikTokBusinessAuthorizationContext } from "@/lib/tiktok/token-manager";

const DOPPLER_API_URL = "https://api.doppler.com/v3/configs/config/secrets";
const TIKTOK_AUTH_SECRET_NAMES = [
  "TIKTOK_BUSINESS_ACCESS_TOKEN",
  "TIKTOK_BUSINESS_AUTHORIZED_ADVERTISERS",
  "TIKTOK_BUSINESS_GRANTED_SCOPES",
  "TIKTOK_BUSINESS_TOKEN_UPDATED_AT",
] as const;
const TIKTOK_RATE_LIMIT_SECRET_NAMES = [
  "TIKTOK_BUSINESS_RATE_LIMIT_LEVEL",
  "TIKTOK_BUSINESS_MAX_QPS",
  "TIKTOK_BUSINESS_MAX_QPM",
  "TIKTOK_BUSINESS_MAX_CONCURRENCY",
] as const;
const TIKTOK_WORKER_SECRET_NAMES = [
  ...TIKTOK_AUTH_SECRET_NAMES,
  ...TIKTOK_RATE_LIMIT_SECRET_NAMES,
] as const;
export const TIKTOK_REPORT_MAX_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type TikTokWorkerEnv = Record<string, string | undefined>;
type JsonRecord = Record<string, unknown>;

export interface TikTokDailyReportResult {
  rows: Array<{ date: string; spend: number; conversions: number; results: number }>;
  apiVersion: string;
  requestIds: string[];
  currency: string | null;
  timezone: string | null;
  cacheHitDates?: string[];
  cacheMissDates?: string[];
  dataTimestamps?: Record<string, string>;
  originatingRequestIds?: string[];
  providerRequestIds?: string[];
}

export interface TikTokBudgetResult {
  platform: "TikTok";
  liveDailyBudget: number | null;
  source: string | null;
  comparisonAvailable: boolean;
  apiVersion: string;
  metadata: Record<string, unknown>;
}

export interface TikTokWorkerRuntimeContext {
  authorization: TikTokBusinessAuthorizationContext;
  rateLimitConfig: TikTokRateLimitConfig;
}

function requireEnv(env: TikTokWorkerEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required Worker binding: ${name}`);
  return value;
}

function secretValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  const entry = value as { computed?: unknown; raw?: unknown };
  if (typeof entry.computed === "string") return entry.computed;
  return typeof entry.raw === "string" ? entry.raw : undefined;
}

function parseStringArray(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function readTikTokWorkerRuntimeContext(
  env: TikTokWorkerEnv,
  fetchFn: typeof fetch = fetch,
): Promise<TikTokWorkerRuntimeContext> {
  let values: Record<(typeof TIKTOK_WORKER_SECRET_NAMES)[number], string | undefined>;
  const token = env.DOPPLER_TOKEN?.trim();
  if (token) {
    const url = new URL(DOPPLER_API_URL);
    url.searchParams.set("project", requireEnv(env, "DOPPLER_PROJECT"));
    url.searchParams.set("config", requireEnv(env, "DOPPLER_CONFIG"));
    url.searchParams.set("secrets", TIKTOK_WORKER_SECRET_NAMES.join(","));
    const response = await fetchFn(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Failed to read TikTok authorization from Doppler (${response.status})`);
    const body = await response.json() as { secrets?: Record<string, unknown> };
    values = Object.fromEntries(
      TIKTOK_WORKER_SECRET_NAMES.map((name) => [name, secretValue(body.secrets?.[name])]),
    ) as Record<(typeof TIKTOK_WORKER_SECRET_NAMES)[number], string | undefined>;
  } else {
    values = Object.fromEntries(
      TIKTOK_WORKER_SECRET_NAMES.map((name) => [name, env[name]]),
    ) as Record<(typeof TIKTOK_WORKER_SECRET_NAMES)[number], string | undefined>;
  }
  const accessToken = values.TIKTOK_BUSINESS_ACCESS_TOKEN?.trim();
  if (!accessToken) throw new Error("TikTok advertiser authorization is missing or revoked");
  let advertisers: Array<{ advertiser_id: string; advertiser_name: string }> = [];
  try {
    const parsed = JSON.parse(values.TIKTOK_BUSINESS_AUTHORIZED_ADVERTISERS ?? "[]") as unknown;
    if (Array.isArray(parsed)) {
      advertisers = parsed.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        return typeof row.advertiser_id === "string" && typeof row.advertiser_name === "string"
          ? [{ advertiser_id: row.advertiser_id, advertiser_name: row.advertiser_name }]
          : [];
      });
    }
  } catch {
    advertisers = [];
  }
  const rateLimitEnvironment = Object.fromEntries(TIKTOK_RATE_LIMIT_SECRET_NAMES.map((name) => {
    const value = values[name]?.trim();
    if (!value) throw new Error(`Missing required TikTok rate-limit control in Doppler: ${name}`);
    return [name, value];
  })) as Record<(typeof TIKTOK_RATE_LIMIT_SECRET_NAMES)[number], string>;
  if (!/^(basic|advanced|premium|ultimate)$/i.test(rateLimitEnvironment.TIKTOK_BUSINESS_RATE_LIMIT_LEVEL)) {
    throw new Error("Invalid TikTok rate-limit control in Doppler: TIKTOK_BUSINESS_RATE_LIMIT_LEVEL");
  }
  for (const name of ["TIKTOK_BUSINESS_MAX_QPS", "TIKTOK_BUSINESS_MAX_QPM", "TIKTOK_BUSINESS_MAX_CONCURRENCY"] as const) {
    if (!/^\d+$/.test(rateLimitEnvironment[name]) || Number(rateLimitEnvironment[name]) <= 0) {
      throw new Error(`Invalid TikTok rate-limit control in Doppler: ${name}`);
    }
  }
  return {
    authorization: {
      accessToken,
      advertisers,
      grantedScopes: parseStringArray(values.TIKTOK_BUSINESS_GRANTED_SCOPES),
      updatedAt: values.TIKTOK_BUSINESS_TOKEN_UPDATED_AT,
    },
    rateLimitConfig: getTikTokRateLimitConfig(rateLimitEnvironment),
  };
}

export async function readTikTokWorkerAuthorization(
  env: TikTokWorkerEnv,
  fetchFn: typeof fetch = fetch,
): Promise<TikTokBusinessAuthorizationContext> {
  return (await readTikTokWorkerRuntimeContext(env, fetchFn)).authorization;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? value as JsonRecord : {};
}

export function listFrom(data: unknown): JsonRecord[] {
  if (!data || typeof data !== "object") return [];
  const value = asRecord(data);
  const nested = asRecord(value.data);
  const list = Array.isArray(value.list) ? value.list : Array.isArray(nested.list) ? nested.list : [];
  return list.filter((row): row is JsonRecord => Boolean(row) && typeof row === "object");
}

export function totalPages(data: unknown, currentPage: number): number {
  if (!data || typeof data !== "object") return currentPage;
  const value = asRecord(data);
  const info = asRecord(value.page_info ?? asRecord(value.data).page_info);
  const parsed = Number(info.total_page ?? info.total_pages ?? currentPage);
  return Number.isFinite(parsed) && parsed >= currentPage ? parsed : currentPage;
}

function metric(row: JsonRecord, name: string): number {
  const value = Number(asRecord(row.metrics)[name] ?? row[name] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function dimension(row: JsonRecord, name: string): string {
  return String(asRecord(row.dimensions)[name] ?? row[name] ?? "").trim();
}

function parseIsoDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid TikTok report date: ${value}`);
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid TikTok report date: ${value}`);
  }
  return timestamp;
}

export function splitTikTokReportDateRange(
  startDate: string,
  endDate: string,
  maxWindowDays = TIKTOK_REPORT_MAX_WINDOW_DAYS,
): Array<{ startDate: string; endDate: string }> {
  if (!Number.isInteger(maxWindowDays) || maxWindowDays <= 0) {
    throw new Error("TikTok report window must be a positive integer number of days");
  }
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (start > end) throw new Error(`TikTok report start date ${startDate} is after end date ${endDate}`);
  const windows: Array<{ startDate: string; endDate: string }> = [];
  for (let cursor = start; cursor <= end;) {
    const windowEnd = Math.min(end, cursor + ((maxWindowDays - 1) * DAY_MS));
    windows.push({
      startDate: new Date(cursor).toISOString().slice(0, 10),
      endDate: new Date(windowEnd).toISOString().slice(0, 10),
    });
    cursor = windowEnd + DAY_MS;
  }
  return windows;
}

async function createClient(env: TikTokWorkerEnv, fetchFn: typeof fetch, sleepFn: (ms: number) => Promise<void>) {
  const runtime = await readTikTokWorkerRuntimeContext(env, fetchFn);
  return new TikTokAdsClient(runtime.authorization, {
    fetch: fetchFn,
    sleep: sleepFn,
    rateLimiter: getSharedTikTokAdsRateLimiter(runtime.rateLimitConfig),
    dynamicReadAuthorization: true,
  });
}

async function fetchAccountMetadata(client: TikTokAdsClient, advertiserId: string) {
  const response = await client.request<unknown>("account.get", {
    advertiser_id: advertiserId,
    advertiser_ids: [advertiserId],
  });
  const account = listFrom(response.data).find((row) => String(row.advertiser_id ?? "") === advertiserId)
    ?? listFrom(response.data)[0]
    ?? asRecord(asRecord(response.data).advertiser_info)
    ?? {};
  return {
    currency: typeof account.currency === "string" ? account.currency.toUpperCase() : null,
    timezone: typeof account.timezone === "string" ? account.timezone : null,
    requestId: response.requestId,
  };
}

export function aggregateTikTokDailyRows(
  rows: JsonRecord[],
  startDate: string,
  endDate: string,
): TikTokDailyReportResult["rows"] {
  const buckets = new Map<string, TikTokDailyReportResult["rows"][number]>();
  for (let cursor = new Date(`${startDate}T00:00:00Z`); cursor <= new Date(`${endDate}T00:00:00Z`); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    buckets.set(date, { date, spend: 0, conversions: 0, results: 0 });
  }
  for (const row of rows) {
    const date = dimension(row, "stat_time_day").slice(0, 10);
    const bucket = buckets.get(date);
    if (!bucket) continue;
    bucket.spend += metric(row, "spend");
    bucket.conversions += metric(row, "conversion");
  }
  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function summarizeTikTokDailyBudget(
  campaigns: JsonRecord[],
  adGroups: JsonRecord[],
  now = new Date(),
): Omit<TikTokBudgetResult, "platform" | "apiVersion"> {
  const inactive = (status: unknown) => /DISABLE|DELETE|TIME_DONE|CAMPAIGN_STATUS_END|ADGROUP_STATUS_END/.test(String(status ?? "").toUpperCase());
  const enabledCampaigns = campaigns.filter((row) => row.operation_status === "ENABLE" && !inactive(row.secondary_status));
  const dailyCampaignIds = new Set<string>();
  let total = 0;
  let dailyCampaignCount = 0;
  for (const campaign of enabledCampaigns) {
    if (campaign.budget_mode !== "BUDGET_MODE_DAY") continue;
    const budget = Number(campaign.budget);
    if (!Number.isFinite(budget) || budget <= 0) continue;
    dailyCampaignIds.add(String(campaign.campaign_id));
    total += budget;
    dailyCampaignCount += 1;
  }
  let dailyAdGroupCount = 0;
  let unrepresentableCount = 0;
  for (const adGroup of adGroups) {
    if (adGroup.operation_status !== "ENABLE" || inactive(adGroup.secondary_status)) continue;
    const start = typeof adGroup.schedule_start_time === "string" ? Date.parse(adGroup.schedule_start_time) : Number.NEGATIVE_INFINITY;
    const end = typeof adGroup.schedule_end_time === "string" ? Date.parse(adGroup.schedule_end_time) : Number.POSITIVE_INFINITY;
    if ((Number.isFinite(start) && now.getTime() < start) || (Number.isFinite(end) && now.getTime() > end)) continue;
    if (dailyCampaignIds.has(String(adGroup.campaign_id))) continue;
    const budget = Number(adGroup.budget);
    if (adGroup.budget_mode === "BUDGET_MODE_DAY" && Number.isFinite(budget) && budget > 0) {
      total += budget;
      dailyAdGroupCount += 1;
    } else {
      unrepresentableCount += 1;
    }
  }
  const comparisonAvailable = unrepresentableCount === 0;
  return {
    liveDailyBudget: comparisonAvailable ? Math.round((total + Number.EPSILON) * 100) / 100 : null,
    source: comparisonAvailable ? "enabled-daily-budgets:tiktok" : null,
    comparisonAvailable,
    metadata: { dailyCampaignCount, dailyAdGroupCount, unrepresentableCount },
  };
}

export function createTikTokWorkerReporting(env: TikTokWorkerEnv, options: {
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
} = {}) {
  const fetchFn = options.fetchFn ?? fetch;
  const sleepFn = options.sleepFn ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let clientPromise: Promise<TikTokAdsClient> | null = null;
  const getClient = () => clientPromise ??= createClient(env, fetchFn, sleepFn);

  return {
    async fetchDailyPerformance(advertiserId: string, startDate: string, endDate: string): Promise<TikTokDailyReportResult> {
      const client = await getClient();
      await client.validateReadableAdvertiser(advertiserId);
      const metadata = await fetchAccountMetadata(client, advertiserId);
      const requestIds = metadata.requestId ? [metadata.requestId] : [];
      const rawRows: JsonRecord[] = [];
      const windows = splitTikTokReportDateRange(startDate, endDate);
      for (const window of windows) {
        for (let page = 1; page <= 100; page += 1) {
          const response = await client.request<unknown>("report.sync", {
            advertiser_id: advertiserId,
            report_type: "BASIC",
            data_level: "AUCTION_CAMPAIGN",
            dimensions: ["campaign_id", "stat_time_day"],
            metrics: ["spend", "conversion"],
            start_date: window.startDate,
            end_date: window.endDate,
            page,
            page_size: 1000,
          });
          if (response.requestId) requestIds.push(response.requestId);
          rawRows.push(...listFrom(response.data));
          if (page >= totalPages(response.data, page)) break;
        }
      }
      return {
        rows: aggregateTikTokDailyRows(rawRows, startDate, endDate),
        apiVersion: TIKTOK_ADS_API_VERSION,
        requestIds,
        currency: metadata.currency,
        timezone: metadata.timezone,
      };
    },

    async fetchLiveDailyBudget(advertiserId: string): Promise<TikTokBudgetResult> {
      const client = await getClient();
      await client.validateReadableAdvertiser(advertiserId);
      const requestIds: string[] = [];
      const fetchAll = async (action: "campaign.list" | "adgroup.list") => {
        const rows: JsonRecord[] = [];
        for (let page = 1; page <= 100; page += 1) {
          const response = await client.request<unknown>(action, { advertiser_id: advertiserId, page, page_size: 1000 });
          if (response.requestId) requestIds.push(response.requestId);
          rows.push(...listFrom(response.data));
          if (page >= totalPages(response.data, page)) break;
        }
        return rows;
      };
      const [campaigns, adGroups] = await Promise.all([fetchAll("campaign.list"), fetchAll("adgroup.list")]);
      const summary = summarizeTikTokDailyBudget(campaigns, adGroups);
      return {
        platform: "TikTok",
        apiVersion: TIKTOK_ADS_API_VERSION,
        ...summary,
        metadata: { ...summary.metadata, requestIds },
      };
    },
  };
}


