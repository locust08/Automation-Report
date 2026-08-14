import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { deleteLatestManualRunnerOutput, ManualRunnerOutputRepository, readLatestCurrentSearchTerms } from "@/lib/search-term-optimization/repository";
import { getLatestDashboardFromSupabase, mergeIncrementalDashboard, persistDashboardToSupabase, stableSearchTermKey } from "@/lib/search-term-optimization/supabase-repository";
import { recordSearchTermAnalysisCompleted } from "@/lib/search-term-optimization/supabase-settings";
import { claimDailySlot, createDurableAnalysisJob, getActiveDurableAnalysisJob, getDurableAnalysisJob, releaseManualClaim, requestDurableAnalysisStop, retryDurableAnalysis, stopDurableAnalysisImmediately, toClientJob } from "@/lib/search-term-optimization/durable-analysis";

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
  finalized?: boolean;
};

function jobsDirectory() {
  return path.join(process.cwd(), "tmp", "search-term-analysis-jobs");
}
function malaysiaDate(value:string){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));}

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  let claimedAccountId="";
  try {
    const body = await request.json() as { accountId?: string };
    const accountId = body.accountId?.replace(/\D/g, "") ?? "";
    if (accountId.length !== 10) return NextResponse.json({ error: "Select a valid Google Ads account first." }, { status: 400 });
    const existing = await getLatestDashboardFromSupabase(accountId);
    if (existing?.refresh?.checkedAt && malaysiaDate(existing.refresh.checkedAt) === malaysiaDate(new Date().toISOString()) && existing.refresh.queuedNewTerms === 0) {
      return NextResponse.json({ status:"completed", stage:"No new check needed today — loading saved analysis", dashboard:existing, mode:"cached", checkedAt:existing.refresh.checkedAt, newTerms:0, reusedTerms:existing.results.length, currentTerms:existing.refresh.currentTerms });
    }
    const durableActive=await getActiveDurableAnalysisJob(accountId);
    if(durableActive)return NextResponse.json(toClientJob(durableActive),{status:202});
    const activeJobs=(await fs.readdir(jobsDirectory()).catch(()=>[])).filter(name=>name.endsWith(".json"));
    for(const name of activeJobs){const job=JSON.parse(await fs.readFile(path.join(jobsDirectory(),name),"utf8")) as JobStatus;if(job.accountId===accountId&&["queued","running"].includes(job.status))return NextResponse.json({jobId:job.jobId,status:job.status,stage:job.stage},{status:202});}
    const jobId = randomUUID();
    await claimDailySlot({customerId:accountId,accountName:existing?.account.customerName??"",source:"manual"});
    claimedAccountId=accountId;
    await createDurableAnalysisJob({id:jobId,customerId:accountId,accountName:existing?.account.customerName??"",source:"manual"});
    await fs.mkdir(jobsDirectory(), { recursive: true });
    const retentionCutoff=Date.now()-7*24*60*60*1000;
    for(const name of await fs.readdir(jobsDirectory())){const file=path.join(jobsDirectory(),name);const stat=await fs.stat(file).catch(()=>null);if(stat&&stat.mtimeMs<retentionCutoff)await fs.unlink(file).catch(()=>undefined);}
    await fs.writeFile(path.join(jobsDirectory(), `${jobId}.json`), JSON.stringify({
      jobId, accountId, status: "queued", stage: "Checking Google Ads for new search terms", startedAt: new Date().toISOString(),
    }, null, 2), "utf8");
    await fs.writeFile(path.join(jobsDirectory(), `${jobId}.baseline.json`),JSON.stringify((existing?.results??[]).map(stableSearchTermKey)),"utf8");
    const workerUrl=process.env.SEARCH_TERM_ANALYSIS_WORKER_URL?.replace(/\/$/,"");const workerSecret=process.env.WORKER_API_SECRET;
    if(workerUrl&&workerSecret){const queued=await fetch(`${workerUrl}/search-term-analysis/jobs`,{method:"POST",headers:{Authorization:`Bearer ${workerSecret}`,"Content-Type":"application/json"},body:JSON.stringify({runId:jobId,scheduleId:"",googleCustomerId:accountId,accountName:existing?.account.customerName??"",startDate:"",endDate:"",scheduledFor:new Date().toISOString(),scheduled:false})});if(!queued.ok)throw new Error(`Unable to queue analysis worker (${queued.status}).`);return NextResponse.json({jobId,status:"queued",stage:"Queued for background analysis"},{status:202});}
    if (process.env.VERCEL) throw new Error("Search-term background Worker is not configured for this Vercel environment.");
    const child = spawn("doppler", [
      "run", "--", process.execPath,
      path.join(process.cwd(), "scripts", "run-search-term-analysis-job.mjs"),
      jobId, accountId,
    ], { cwd: process.cwd(), windowsHide: true, stdio: "ignore" });
    child.unref();
    return NextResponse.json({ jobId, status: "queued", stage: "Checking Google Ads for new search terms" }, { status: 202 });
  } catch (error) {
    if(claimedAccountId)await releaseManualClaim(claimedAccountId).catch(()=>undefined);
    const message=error instanceof Error?error.message:"Unable to start search-term analysis.";
    return NextResponse.json({ error:message.includes("SEARCH_TERM_DAILY_CAPACITY_REACHED")?"Max analysis reached today.":message,code:message.includes("SEARCH_TERM_DAILY_CAPACITY_REACHED")?"SEARCH_TERM_DAILY_CAPACITY_REACHED":undefined }, { status: message.includes("SEARCH_TERM_DAILY_CAPACITY_REACHED")?429:500 });
  }
}

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const jobId = new URL(request.url).searchParams.get("jobId")?.trim() ?? "";
  if (!/^[-\w]+$/.test(jobId)) return NextResponse.json({ error: "A valid analysis job ID is required." }, { status: 400 });
  try {
    const durable=await getDurableAnalysisJob(jobId);
    if(durable?.status==="completed"){const dashboard=await getLatestDashboardFromSupabase(durable.google_customer_id);return NextResponse.json({...toClientJob(durable),dashboard});}
    const localStatus=await fs.readFile(path.join(jobsDirectory(), `${jobId}.json`), "utf8").catch(()=>null);
    if(!localStatus&&durable)return NextResponse.json(toClientJob(durable));
    const status = JSON.parse(localStatus!) as JobStatus;
    if (status.status !== "completed") {
      const log = await fs.stat(path.join(jobsDirectory(), `${jobId}.log`)).catch(() => null);
      const activityAt = [status.heartbeatAt, status.updatedAt, log?.mtime.toISOString()]
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1);
      const completedRuns=durable?.completed_runs??Number((status as JobStatus&{completedBatches?:number}).completedBatches??0);
      const dashboard=completedRuns>0?await getLatestDashboardFromSupabase(status.accountId):null;
      return NextResponse.json({ ...status, ...(durable?toClientJob(durable):{}), activityAt, dashboard });
    }
    if (status.finalized) {
      const savedDashboard = await getLatestDashboardFromSupabase(status.accountId);
      if (!savedDashboard) throw new Error("The saved analysis could not be loaded.");
      return NextResponse.json({ ...status, dashboard: savedDashboard, ...savedDashboard.refresh });
    }
    const cached=await getLatestDashboardFromSupabase(status.accountId);
    const dashboard = await new ManualRunnerOutputRepository().getDashboard(status.accountId);
    const current=await readLatestCurrentSearchTerms(status.accountId);
    const merged=await mergeIncrementalDashboard({cached,newlyAnalyzed:dashboard,currentRows:current.rows,checkedAt:status.finishedAt??current.generatedAt,queuedNewTerms:current.source.queuedNewTerms??0});
    const persisted = await persistDashboardToSupabase(merged);
    await deleteLatestManualRunnerOutput(status.accountId);
    const settings = await recordSearchTermAnalysisCompleted(status.accountId, status.finishedAt ?? dashboard.account.lastAnalysisAt);
    const finalDashboard=settings ? { ...persisted, settings, account: { ...persisted.account, nextRunAt: settings.nextRunAt } } : persisted;
    await fs.writeFile(path.join(jobsDirectory(), `${jobId}.json`), JSON.stringify({ ...status, finalized: true, stage: finalDashboard.refresh?.mode === "cached" ? "No new terms - loaded saved analysis" : "Incremental refresh completed", updatedAt: new Date().toISOString() }, null, 2), "utf8");
    return NextResponse.json({ ...status, dashboard:finalDashboard, ...finalDashboard.refresh });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read analysis status." }, { status: 404 });
  }
}

export async function DELETE(request:Request){const session=await getServerAuthSession();if(!session||session.role!=="admin")return NextResponse.json({error:"Administrator access is required."},{status:403});const jobId=new URL(request.url).searchParams.get("jobId")??"";const current=await getDurableAnalysisJob(jobId);if(!current)return NextResponse.json({error:"Analysis job was not found."},{status:404});if(["completed","failed","stopped"].includes(current.status))return NextResponse.json(toClientJob(current));const pingAt=current.last_worker_ping_at?Date.parse(current.last_worker_ping_at):0;const stale=pingAt>0&&Date.now()-pingAt>30_000;const job=stale?await stopDurableAnalysisImmediately(jobId,"Analysis stopped because the worker was no longer responding; completed runs were kept"):await requestDurableAnalysisStop(jobId);return NextResponse.json(toClientJob(job!));}

export async function PUT(request:Request){
  const session=await getServerAuthSession();if(!session||session.role!=="admin")return NextResponse.json({error:"Administrator access is required."},{status:403});
  const body=await request.json() as {jobId?:string;action?:"retry"};if(!body.jobId||body.action!=="retry")return NextResponse.json({error:"A retry job is required."},{status:400});
  const job=await retryDurableAnalysis(body.jobId);if(!job)return NextResponse.json({error:"Analysis job was not found."},{status:404});
  const workerUrl=process.env.SEARCH_TERM_ANALYSIS_WORKER_URL?.replace(/\/$/,"");const workerSecret=process.env.WORKER_API_SECRET;
  if(workerUrl&&workerSecret){const queued=await fetch(`${workerUrl}/search-term-analysis/jobs`,{method:"POST",headers:{Authorization:`Bearer ${workerSecret}`,"Content-Type":"application/json"},body:JSON.stringify({runId:job.id,scheduleId:"",googleCustomerId:job.google_customer_id,accountName:job.account_name,startDate:job.reporting_start_date??"",endDate:job.reporting_end_date??"",scheduledFor:new Date().toISOString(),scheduled:job.source==="scheduled"})});if(!queued.ok)return NextResponse.json({error:"Unable to queue the retry."},{status:502});}
  else{if(process.env.VERCEL)return NextResponse.json({error:"Search-term background Worker is not configured for this Vercel environment."},{status:503});const child=spawn("doppler",["run","--",process.execPath,path.join(process.cwd(),"scripts","run-search-term-analysis-job.mjs"),job.id,job.google_customer_id,job.reporting_start_date??"",job.reporting_end_date??""],{cwd:process.cwd(),windowsHide:true,stdio:"ignore"});child.unref();}
  return NextResponse.json(toClientJob(job));
}
