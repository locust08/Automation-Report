import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { budgetRows, budgetRpc } from "@/lib/budget/repository";
import { captureBudgetWindow } from "@/lib/budget/capture";
import { budgetSlot, dateBefore, localYesterday, pilotNotionAccountId } from "@/lib/budget/schedule";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.M05_CAPTURE_JOB_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const left = Buffer.from(supplied), right = Buffer.from(secret ?? "");
  if (!secret || secret.length < 32 || left.length !== right.length || !timingSafeEqual(left, right)) {
    return NextResponse.json({ error: "access_denied" }, { status: 401 });
  }
  try {
    const pilotAccountId = pilotNotionAccountId(process.env.M05_PILOT_NOTION_ACCOUNT_ID);
    if (!pilotAccountId) {
      return NextResponse.json({ error: "pilot_scope_unavailable" }, { status: 503 });
    }
    const raw = await request.text();
    if (raw.length > 1024) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).sort().join(",") !== "kind,mode,platforms,scheduledAt"
      || typeof body.scheduledAt !== "string" || typeof body.kind !== "string"
      || (body.mode !== "shadow" && body.mode !== "active")
      || body.mode !== process.env.M05_SCHEDULER_MODE
      || Math.abs(Date.now() - Date.parse(body.scheduledAt)) > 5 * 60_000) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const slot = budgetSlot(body.scheduledAt);
    if (!slot || slot.kind !== body.kind || JSON.stringify(slot.platforms) !== JSON.stringify(body.platforms)) {
      return NextResponse.json({ error: "invalid_slot" }, { status: 400 });
    }
    if (slot.kind === "recommendations") {
      if (body.mode === "active") return NextResponse.json({ error: "recommendations_unavailable" }, { status: 503 });
      return NextResponse.json({ status: "shadow_skipped", slot, reason: "recommendation engine is not released" });
    }
    const rows = await budgetRows("m05_ads_accounts", {
      select: "id,notion_account_id,platform,timezone", notion_account_id: `eq.${pilotAccountId}`,
      platform: `in.(${slot.platforms.join(",")})`, order: "id.asc", limit: "2",
    });
    if (rows.length > 1 || rows.some((row) => row.notion_account_id !== pilotAccountId)) {
      return NextResponse.json({ error: "pilot_scope_invalid" }, { status: 503 });
    }
    const results: Array<{ accountId: number; status: string; observedDays?: number; missingDays?: number }> = [];
    for (const row of rows) {
      const accountId = Number(row.id);
      try {
        if (!Number.isSafeInteger(accountId) || typeof row.timezone !== "string") throw new Error("Invalid account mapping.");
        const end = localYesterday(row.timezone);
        const start = dateBefore(end, 29);
        const captured = await captureBudgetWindow(accountId, start, end);
        const months = [...new Set([start.slice(0, 7), end.slice(0, 7)])];
        for (const month of months) {
          await budgetRpc("m05_ads_capture_month_snapshot", { p_account_id: accountId, p_month_start: `${month}-01`, p_allocation_id: null });
        }
        await budgetRpc("m05_ads_record_monitor_run", { p_slot_key: body.scheduledAt, p_account_id: accountId,
          p_status: "completed", p_observed_days: captured.observedDays,
          p_missing_days: captured.missingDays.length, p_error_code: null });
        results.push({ accountId, status: "captured", observedDays: captured.observedDays,
          missingDays: captured.missingDays.length });
      } catch {
        if (Number.isSafeInteger(accountId)) {
          try { await budgetRpc("m05_ads_record_monitor_run", { p_slot_key: body.scheduledAt, p_account_id: accountId,
            p_status: "failed", p_observed_days: 0, p_missing_days: 0, p_error_code: "capture_or_snapshot_failed" }); }
          catch { /* A failed log must not block other accounts. */ }
        }
        results.push({ accountId, status: "failed" });
      }
    }
    const failures = results.filter((item) => item.status === "failed").length;
    return NextResponse.json({ status: failures ? "partial" : "completed", slot,
      mode: body.mode, accounts: results, failedAccounts: failures }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "dispatch_unavailable" }, { status: 503 });
  }
}
