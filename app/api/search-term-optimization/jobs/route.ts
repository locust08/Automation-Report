import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { getActiveDurableAnalysisJob, getActiveDurableAnalysisJobs, toClientJob } from "@/lib/search-term-optimization/durable-analysis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  }
  try {
    const requestedAccountId = new URL(request.url).searchParams.get("accountId");
    if (requestedAccountId !== null) {
      const accountId = requestedAccountId.replace(/\D/g, "");
      if (accountId.length !== 10) {
        return NextResponse.json({ error: "A valid Google Ads account is required." }, { status: 400 });
      }
      const job = await getActiveDurableAnalysisJob(accountId);
      return NextResponse.json({ job: job ? toClientJob(job) : null });
    }
    return NextResponse.json({ jobs: await getActiveDurableAnalysisJobs() });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to load active search-term analyses.",
    }, { status: 503 });
  }
}
