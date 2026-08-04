import { NextResponse } from "next/server";

import { runDueSearchTermAnalyses } from "@/lib/search-term-optimization/workflow";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runDueSearchTermAnalyses());
}
