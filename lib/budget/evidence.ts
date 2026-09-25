import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { BudgetScope } from "@/lib/budget/digitalbee-auth";
import { budgetRows, resolveBudgetAccount } from "@/lib/budget/repository";
import { DigitalBeeServiceError } from "@/lib/digitalbee/service-auth";

function dateInZone(date: Date, zone: string): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
  catch { throw new DigitalBeeServiceError("unavailable", 503); }
}
function days(start: string, end: string): string[] {
  const values: string[] = [];
  for (let time = Date.parse(`${start}T00:00:00Z`); time <= Date.parse(`${end}T00:00:00Z`); time += 86_400_000) {
    values.push(new Date(time).toISOString().slice(0, 10));
    if (values.length > 3_660) throw new DigitalBeeServiceError("invalid_request", 400);
  }
  return values;
}
function money(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || Math.abs(amount) > 1e12) throw new DigitalBeeServiceError("unavailable", 503);
  return amount;
}
export function dailyCoverage(dates: string[], amounts: ReadonlyMap<string, number>, offset: number, limit: number) {
  const pageDates = dates.slice(offset, offset + limit);
  const daily = pageDates.filter((date) => amounts.has(date)).map((date) => ({ date, amount: amounts.get(date)! }));
  const missing = pageDates.filter((date) => !amounts.has(date));
  return { daily, missing, complete: offset === 0 && offset + limit >= dates.length && missing.length === 0 };
}
function cursorKey(): string {
  const key = process.env.M05_CURSOR_KEY;
  if (!key || key.length < 32) throw new DigitalBeeServiceError("unavailable", 503);
  return key;
}
function encodeCursor(offset: number, revision: string, scope: BudgetScope): string {
  const payload = Buffer.from(JSON.stringify({ offset, revision, account: scope.notionAccountId,
    subject: scope.subject, grantRevision: scope.grantRevision, requested: scope.requested, cycleId: scope.cycleId })).toString("base64url");
  const mac = createHmac("sha256", cursorKey()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}
function decodeCursor(value: string | null, revision: string, scope: BudgetScope): number {
  if (!value) return 0;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra || value.length > 2048) throw new DigitalBeeServiceError("invalid_request", 400);
  const expected = createHmac("sha256", cursorKey()).update(payload).digest("base64url");
  const left = Buffer.from(signature), right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new DigitalBeeServiceError("access_denied", 403);
  let decoded: Record<string, unknown>;
  try { decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); }
  catch { throw new DigitalBeeServiceError("invalid_request", 400); }
  if (decoded.revision !== revision || decoded.account !== scope.notionAccountId || decoded.subject !== scope.subject
    || decoded.grantRevision !== scope.grantRevision || decoded.cycleId !== scope.cycleId
    || JSON.stringify(decoded.requested) !== JSON.stringify(scope.requested)
    || !Number.isSafeInteger(decoded.offset) || Number(decoded.offset) < 1) throw new DigitalBeeServiceError("access_denied", 403);
  return Number(decoded.offset);
}

export async function budgetAccess(scope: BudgetScope) {
  await resolveBudgetAccount(scope);
  return { version: "m05-budget-v1", allowed: true, subject: scope.subject, grantRevision: scope.grantRevision,
    notionAccountId: scope.notionAccountId, clientId: scope.clientId, platform: scope.platform,
    platformAccountId: scope.platformAccountId, expiresAt: new Date(Date.now() + 20_000).toISOString() };
}

export async function budgetEvidence(scope: BudgetScope, query: URLSearchParams) {
  const account = await resolveBudgetAccount(scope);
  const mode = query.get("mode") || "live";
  if (mode !== "live" && mode !== "snapshot") throw new DigitalBeeServiceError("invalid_request", 400);
  if (mode === "snapshot" && query.get("max_age_seconds") !== "86400") throw new DigitalBeeServiceError("invalid_request", 400);
  const limit = Number(query.get("limit") || "100");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new DigitalBeeServiceError("invalid_request", 400);
  const today = dateInZone(new Date(), String(account.timezone));
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  if (scope.requested.start > cutoff) throw new DigitalBeeServiceError("unavailable", 503);
  const end = scope.requested.end < cutoff ? scope.requested.end : cutoff;
  const allDates = days(scope.requested.start, end);
  const rows = mode === "live" ? await budgetRows("m05_ads_daily_spend", {
    select: "spend_date,amount,currency,provider_snapshot_id,provider_captured_at",
    account_id: `eq.${account.id}`, spend_date: `gte.${scope.requested.start}`,
    and: `(spend_date.lte.${end})`, order: "spend_date.asc", limit: "3660",
  }) : [];
  const amounts = new Map<string, number>();
  let latestCapture: string | null = null;
  for (const row of rows) {
    const date = String(row.spend_date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || amounts.has(date) || row.currency !== account.currency
      || !row.provider_snapshot_id || !row.provider_captured_at) throw new DigitalBeeServiceError("unavailable", 503);
    amounts.set(date, money(row.amount));
    const captured = String(row.provider_captured_at);
    if (!latestCapture || latestCapture < captured) latestCapture = captured;
  }
  const allocations = scope.cycleId ? await budgetRows("m05_ads_allocations", {
    select: "id,notion_cycle_id,plan_reference,start_date,end_date,approved_amount,currency,source_revision",
    account_id: `eq.${account.id}`, notion_cycle_id: `eq.${scope.cycleId}`, order: "approved_at.desc", limit: "1",
  }) : [];
  const allocation = allocations[0];
  if (scope.cycleId && (!allocation || allocation.currency !== account.currency
    || allocation.start_date !== scope.requested.start || allocation.end_date !== scope.requested.end)) {
    throw new DigitalBeeServiceError("unavailable", 503);
  }
  let snapshotRows: Record<string, unknown>[] = [];
  if (mode === "snapshot") {
    const firstMonth = `${scope.requested.start.slice(0, 7)}-01`;
    const lastMonth = `${end.slice(0, 7)}-01`;
    const candidates = await budgetRows("m05_ads_snapshots", {
      select: "id,allocation_id,month_start,revision,captured_at,cutoff,daily_evidence,missing_days,coverage_complete",
      account_id: `eq.${account.id}`, month_start: `gte.${firstMonth}`,
      and: `(month_start.lte.${lastMonth})`, order: "month_start.asc,revision.desc", limit: "1000",
    });
    if (candidates.length === 1_000) throw new DigitalBeeServiceError("unavailable", 503);
    const selected = new Map<string, Record<string, unknown>>();
    for (const row of candidates) {
      const month = String(row.month_start);
      if (!/^\d{4}-\d{2}-01$/.test(month) || !Number.isInteger(Number(row.revision))) throw new DigitalBeeServiceError("unavailable", 503);
      if (!selected.has(month) || Number(row.revision) > Number(selected.get(month)?.revision)) selected.set(month, row);
    }
    snapshotRows = [...selected.values()].sort((a, b) => String(a.month_start).localeCompare(String(b.month_start)));
    if (!snapshotRows.length) throw new DigitalBeeServiceError("unavailable", 503);
    latestCapture = null;
    for (const row of snapshotRows) {
      if (scope.cycleId && row.allocation_id !== null && row.allocation_id !== allocation?.id) {
        throw new DigitalBeeServiceError("unavailable", 503);
      }
      if (!Array.isArray(row.daily_evidence) || !Array.isArray(row.missing_days)
        || typeof row.coverage_complete !== "boolean" || typeof row.captured_at !== "string") throw new DigitalBeeServiceError("unavailable", 503);
      const month = String(row.month_start).slice(0, 7);
      const disclosedMissing = new Set(row.missing_days.map(String));
      for (const value of row.daily_evidence) {
        const observed = value && typeof value === "object" ? value as Record<string, unknown> : {};
        const date = String(observed.date ?? "");
        if (!date.startsWith(month) || date > String(row.cutoff) || disclosedMissing.has(date)) {
          throw new DigitalBeeServiceError("unavailable", 503);
        }
        if (date < scope.requested.start || date > end) continue;
        if (amounts.has(date)) throw new DigitalBeeServiceError("unavailable", 503);
        amounts.set(date, money(observed.amount));
      }
      if (row.coverage_complete && [...disclosedMissing].some((date) => date.startsWith(month))) throw new DigitalBeeServiceError("unavailable", 503);
      const captured = String(row.captured_at);
      if (!latestCapture || captured < latestCapture) latestCapture = captured;
    }
  }
  const revision = createHash("sha256").update(JSON.stringify({ scope, rows, snapshotRows, allocation, cutoff })).digest("base64url");
  if (query.get("revision") && query.get("revision") !== revision) throw new DigitalBeeServiceError("access_denied", 409);
  const offset = decodeCursor(query.get("cursor"), revision, scope);
  if (offset >= allDates.length) throw new DigitalBeeServiceError("invalid_request", 400);
  const page = dailyCoverage(allDates, amounts, offset, limit);
  const daily = page.daily;
  const next = offset + limit < allDates.length ? encodeCursor(offset + limit, revision, scope) : null;
  const capturedAt = latestCapture || new Date().toISOString();
  if (Date.parse(capturedAt) > Date.now() || Date.now() - Date.parse(capturedAt) > 86_400_000
    || dateInZone(new Date(capturedAt), String(account.timezone)) <= end) {
    throw new DigitalBeeServiceError("unavailable", 503);
  }
  const complete = !next && page.complete;
  const approved = allocation ? money(allocation.approved_amount) : null;
  const actual = allDates.reduce((total, date) => total + (amounts.get(date) || 0), 0);
  const totalActiveDays = allocation ? days(scope.requested.start, scope.requested.end).length : 0;
  const elapsedActiveDays = allDates.length;
  const remainingActiveDays = Math.max(0, totalActiveDays - elapsedActiveDays);
  const expectedSpend = approved === null || !totalActiveDays ? null : approved * elapsedActiveDays / totalActiveDays;
  const pacing = allocation && complete && approved !== null && expectedSpend !== null ? {
    approvedPlan: { cycleId: scope.cycleId, reference: String(allocation.plan_reference), allocationId: scope.cycleId,
      period: scope.requested, amount: approved, currency: String(account.currency) },
    cutoff: end, totalActiveDays, elapsedActiveDays,
    remainingActiveDays, expectedSpend, actualSpend: actual, variance: actual - expectedSpend,
    requiredDailySpend: remainingActiveDays ? (approved - actual) / remainingActiveDays : null,
    forecast: null, calculationVersion: "m05-complete-days-v1",
  } : null;
  return { version: "m05-budget-v1", subject: scope.subject, grantRevision: scope.grantRevision,
    notionAccountId: scope.notionAccountId, clientId: scope.clientId, platform: scope.platform,
    platformAccountId: scope.platformAccountId, cycleId: scope.cycleId, allocationId: scope.cycleId,
    requested: scope.requested, currency: account.currency, timezone: account.timezone, revision,
    capturedAt, cutoff, source: mode, coverage: { start: scope.requested.start, end, complete },
    daily, nextCursor: next, pacing, balance: null };
}
