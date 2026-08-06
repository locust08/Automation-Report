import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { getSearchTermAccountSettings, saveSearchTermAccountSettings } from "@/lib/search-term-optimization/account-settings";
import type { AnalysisScheduleFrequency } from "@/lib/search-term-optimization/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FREQUENCIES: AnalysisScheduleFrequency[] = ["manual", "weekly", "biweekly", "monthly"];

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accountId = new URL(request.url).searchParams.get("accountId")?.replace(/\D/g, "") ?? "";
  if (accountId.length !== 10) return NextResponse.json({ error: "A valid Google Ads account is required." }, { status: 400 });
  return NextResponse.json(getSearchTermAccountSettings(accountId));
}

export async function PUT(request: Request) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const googleCustomerId = typeof body.googleCustomerId === "string" ? body.googleCustomerId.replace(/\D/g, "") : "";
    const scheduleFrequency = body.scheduleFrequency as AnalysisScheduleFrequency;
    const autoSafeScoreThreshold = Number(body.autoSafeScoreThreshold);
    const reviewScoreThreshold = Number(body.reviewScoreThreshold);
    const highSpendThreshold = Number(body.highSpendThreshold);
    const minimumClicksThreshold = Number(body.minimumClicksThreshold);
    if (googleCustomerId.length !== 10) throw new Error("A valid Google Ads account is required.");
    if (!FREQUENCIES.includes(scheduleFrequency)) throw new Error("Select a valid schedule frequency.");
    if (!Number.isInteger(autoSafeScoreThreshold) || autoSafeScoreThreshold < 90 || autoSafeScoreThreshold > 100) throw new Error("Auto-safe score must be between 90 and 100.");
    if (!Number.isInteger(reviewScoreThreshold) || reviewScoreThreshold < 0 || reviewScoreThreshold > 99) throw new Error("Review score must be between 0 and 99.");
    if (!Number.isFinite(highSpendThreshold) || highSpendThreshold < 0) throw new Error("High-spend threshold cannot be negative.");
    if (!Number.isInteger(minimumClicksThreshold) || minimumClicksThreshold < 0) throw new Error("Minimum clicks cannot be negative.");
    return NextResponse.json(saveSearchTermAccountSettings({
      googleCustomerId, scheduleFrequency, autoSafeScoreThreshold, reviewScoreThreshold,
      highSpendThreshold, minimumClicksThreshold,
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save account settings." }, { status: 400 });
  }
}
