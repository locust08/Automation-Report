import { NextResponse } from "next/server";

import { runMonthlyReportCron } from "@/lib/automation/monthly-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json({ message: "CRON ENDPOINT LIVE" });
}

export async function POST(request: Request): Promise<NextResponse> {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization")?.trim();

  if (!expectedSecret || authorization !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runMonthlyReportCron();
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Monthly report cron failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
