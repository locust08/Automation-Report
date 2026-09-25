import { DigitalBeeServiceError } from "@/lib/digitalbee/service-auth";
import type { BudgetScope } from "@/lib/budget/digitalbee-auth";

type Row = Record<string, unknown>;
function config() {
  const raw = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!raw || !key) throw new DigitalBeeServiceError("unavailable", 503);
  let url: URL;
  try { url = new URL(raw); } catch { throw new DigitalBeeServiceError("unavailable", 503); }
  if (url.protocol !== "https:" || url.hostname !== "gsmxeosdjsbujhiwhbzk.supabase.co"
    || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new DigitalBeeServiceError("unavailable", 503);
  }
  return { base: `${url.origin}/rest/v1/`, key };
}

export async function budgetRows(table: string, filters: Record<string, string>): Promise<Row[]> {
  const { base, key } = config();
  if (!/^m0[45]_ads_[a-z_]+$/.test(table)) throw new DigitalBeeServiceError("unavailable", 503);
  const url = new URL(table, base);
  for (const [name, value] of Object.entries(filters)) url.searchParams.set(name, value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal,
      headers: { apikey: key, Authorization: `Bearer ${key}` }, });
    if (!response.ok) throw new DigitalBeeServiceError("unavailable", 503);
    const raw = await response.text();
    if (raw.length > 512 * 1024) throw new DigitalBeeServiceError("unavailable", 503);
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows) || rows.length > 3_660) throw new DigitalBeeServiceError("unavailable", 503);
    return rows as Row[];
  } catch (error) {
    if (error instanceof DigitalBeeServiceError) throw error;
    throw new DigitalBeeServiceError("unavailable", 503);
  } finally { clearTimeout(timeout); }
}

export async function budgetRpc(name: "m05_ads_record_daily_capture" | "m05_ads_capture_month_snapshot" | "m05_ads_accept_verified_handoff" | "m05_ads_record_monitor_run", body: Record<string, unknown>): Promise<Row> {
  const { base, key } = config();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(new URL(`rpc/${name}`, base), { method: "POST", cache: "no-store", signal: controller.signal,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new DigitalBeeServiceError("unavailable", 503);
    const raw = await response.text();
    if (raw.length > 4096) throw new DigitalBeeServiceError("unavailable", 503);
    const result: unknown = JSON.parse(raw);
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new DigitalBeeServiceError("unavailable", 503);
    return result as Row;
  } catch (error) {
    if (error instanceof DigitalBeeServiceError) throw error;
    throw new DigitalBeeServiceError("unavailable", 503);
  } finally { clearTimeout(timeout); }
}

export async function resolveBudgetAccount(scope: BudgetScope): Promise<Row> {
  const rows = await budgetRows("m05_ads_accounts", {
    select: "id,notion_account_id,m04_ad_account_id,client_id,platform,provider_account_id,currency,timezone,mapping_verified_at",
    notion_account_id: `eq.${scope.notionAccountId}`, limit: "2",
  });
  const account = rows[0];
  if (rows.length !== 1 || !account || account.client_id !== scope.clientId
    || account.platform !== scope.platform.toLowerCase() || account.provider_account_id !== scope.platformAccountId
    || typeof account.currency !== "string" || typeof account.timezone !== "string") {
    throw new DigitalBeeServiceError("access_denied", 403);
  }
  const m04 = await budgetRows("m04_ads_ad_accounts", {
    select: "id,client_id,platform,provider_account_id,currency,timezone,access_status,is_active",
    id: `eq.${account.m04_ad_account_id}`, limit: "2",
  });
  if (m04.length !== 1 || m04[0]?.client_id !== account.client_id || m04[0]?.platform !== account.platform
    || m04[0]?.provider_account_id !== account.provider_account_id || m04[0]?.currency !== account.currency
    || m04[0]?.timezone !== account.timezone || m04[0]?.access_status !== "verified" || m04[0]?.is_active !== true) {
    throw new DigitalBeeServiceError("access_denied", 403);
  }
  return account;
}
