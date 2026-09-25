import { createHash } from "node:crypto";
import { budgetRows, budgetRpc } from "@/lib/budget/repository";
import { readProviderDailySpend, type SpendRead, type SpendRequest } from "@/lib/budget/provider-spend";
import { DigitalBeeServiceError } from "@/lib/digitalbee/service-auth";

type CaptureDependencies = {
  accountRows: typeof budgetRows;
  record: typeof budgetRpc;
  readSpend: (request: SpendRequest) => Promise<SpendRead>;
};

const defaults: CaptureDependencies = { accountRows: budgetRows, record: budgetRpc, readSpend: readProviderDailySpend };

function yesterday(zone: string): string {
  let today: string;
  try { today = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
  catch { throw new DigitalBeeServiceError("unavailable", 503); }
  const time = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(time)) throw new DigitalBeeServiceError("unavailable", 503);
  return new Date(time - 86_400_000).toISOString().slice(0, 10);
}

/** Reads an official complete day and commits observed and missing dates atomically. */
export async function captureBudgetWindow(accountId: number, start: string, end: string, dependencies: CaptureDependencies = defaults) {
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!Number.isSafeInteger(accountId) || accountId < 1 || !validDate(start) || !validDate(end)
    || end < start || (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 > 30) {
    throw new DigitalBeeServiceError("invalid_request", 400);
  }
  const accounts = await dependencies.accountRows("m05_ads_accounts", {
    select: "id,m04_ad_account_id,platform,provider_account_id,currency,timezone,google_login_customer_id,mapping_verified_at",
    id: `eq.${accountId}`, limit: "2",
  });
  const account = accounts[0];
  if (accounts.length !== 1 || !account || !["google", "meta", "tiktok"].includes(String(account.platform))
    || typeof account.provider_account_id !== "string" || typeof account.currency !== "string"
    || typeof account.timezone !== "string" || !account.mapping_verified_at) {
    throw new DigitalBeeServiceError("access_denied", 403);
  }
  if (end > yesterday(account.timezone)) throw new DigitalBeeServiceError("invalid_request", 400);
  const parent = await dependencies.accountRows("m04_ads_ad_accounts", {
    select: "id,platform,provider_account_id,currency,timezone,access_status,is_active",
    id: `eq.${account.m04_ad_account_id}`, limit: "2",
  });
  if (parent.length !== 1 || parent[0]?.platform !== account.platform
    || parent[0]?.provider_account_id !== account.provider_account_id
    || parent[0]?.currency !== account.currency || parent[0]?.timezone !== account.timezone
    || parent[0]?.access_status !== "verified" || parent[0]?.is_active !== true) {
    throw new DigitalBeeServiceError("access_denied", 403);
  }
  const request: SpendRequest = {
    platform: account.platform as SpendRequest["platform"], accountId: account.provider_account_id,
    currency: account.currency, timezone: account.timezone, start, end,
    googleLoginCustomerId: typeof account.google_login_customer_id === "string" ? account.google_login_customer_id : null,
  };
  const evidence = await dependencies.readSpend(request);
  if (evidence.platform !== request.platform || evidence.accountId !== request.accountId
    || evidence.currency !== request.currency || evidence.timezone !== request.timezone
    || evidence.start !== start || evidence.end !== end
    || evidence.daily.length + evidence.missingDays.length !==
      (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1
    || !Number.isFinite(Date.parse(evidence.capturedAt)) || Date.parse(evidence.capturedAt) > Date.now()) {
    throw new DigitalBeeServiceError("unavailable", 503);
  }
  const jobKey = createHash("sha256").update(JSON.stringify({ accountId, start, end,
    snapshot: evidence.providerSnapshotId, capturedAt: evidence.capturedAt })).digest("hex");
  const result = await dependencies.record("m05_ads_record_daily_capture", {
    p_job_key: jobKey, p_account_id: accountId, p_start_date: start, p_end_date: end,
    p_currency: evidence.currency, p_snapshot_id: evidence.providerSnapshotId,
    p_captured_at: evidence.capturedAt, p_daily: evidence.daily, p_missing_days: evidence.missingDays,
  });
  if (result.status !== "recorded" && result.status !== "already_recorded") throw new DigitalBeeServiceError("unavailable", 503);
  return { status: result.status, accountId, start, end, observedDays: evidence.daily.length,
    missingDays: evidence.missingDays, providerSnapshotId: evidence.providerSnapshotId };
}

export function captureBudgetDay(accountId: number, date: string, dependencies: CaptureDependencies = defaults) {
  return captureBudgetWindow(accountId, date, date, dependencies);
}
