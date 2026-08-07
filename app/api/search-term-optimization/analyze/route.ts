import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { ManualRunnerOutputRepository } from "@/lib/search-term-optimization/repository";
import { persistDashboardToSqlite } from "@/lib/search-term-optimization/sqlite-repository";
import { recordSearchTermAnalysisCompleted } from "@/lib/search-term-optimization/account-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JobStatus = {
  jobId: string;
  accountId: string;
  status: "queued" | "running" | "completed" | "failed";
  stage: string;
  error?: string;
  startedAt?: string;
  updatedAt?: string;
  heartbeatAt?: string;
  finishedAt?: string;
};

function jobsDirectory() {
  return path.join(process.cwd(), "tmp", "search-term-analysis-jobs");
}

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session || !["admin", "ethan"].includes(session.role)) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  try {
    const body = await request.json() as { accountId?: string };
    const accountId = body.accountId?.replace(/\D/g, "") ?? "";
    if (accountId.length !== 10) return NextResponse.json({ error: "Select a valid Google Ads account first." }, { status: 400 });
    const jobId = randomUUID();
    await fs.mkdir(jobsDirectory(), { recursive: true });
    await fs.writeFile(path.join(jobsDirectory(), `${jobId}.json`), JSON.stringify({
      jobId, accountId, status: "queued", stage: "Preparing full search-term analysis", startedAt: new Date().toISOString(),
    }, null, 2), "utf8");
    const child = spawn("doppler", [
      "run", "--", process.execPath,
      path.join(process.cwd(), "scripts", "run-search-term-analysis-job.mjs"),
      jobId, accountId,
    ], { cwd: process.cwd(), windowsHide: true, stdio: "ignore" });
    child.unref();
    return NextResponse.json({ jobId, status: "queued", stage: "Preparing full search-term analysis" }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start search-term analysis." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session || !["admin", "ethan"].includes(session.role)) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const jobId = new URL(request.url).searchParams.get("jobId")?.trim() ?? "";
  if (!/^[-\w]+$/.test(jobId)) return NextResponse.json({ error: "A valid analysis job ID is required." }, { status: 400 });
  try {
    const status = JSON.parse(await fs.readFile(path.join(jobsDirectory(), `${jobId}.json`), "utf8")) as JobStatus;
    if (status.status !== "completed") {
      const log = await fs.stat(path.join(jobsDirectory(), `${jobId}.log`)).catch(() => null);
      const activityAt = [status.heartbeatAt, status.updatedAt, log?.mtime.toISOString()]
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1);
      return NextResponse.json({ ...status, activityAt });
    }
    const dashboard = await new ManualRunnerOutputRepository().getDashboard(status.accountId);
    const persisted = persistDashboardToSqlite(dashboard);
    const settings = recordSearchTermAnalysisCompleted(status.accountId, status.finishedAt ?? dashboard.account.lastAnalysisAt);
    return NextResponse.json({ ...status, dashboard: settings ? { ...persisted, settings, account: { ...persisted.account, nextRunAt: settings.nextRunAt } } : persisted });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read analysis status." }, { status: 404 });
  }
}
