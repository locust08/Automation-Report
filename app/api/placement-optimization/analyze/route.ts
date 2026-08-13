import { spawn } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { buildDateRange } from "@/lib/reporting/date";
import { createPlacementJob, getActivePlacementJob, getPlacementJob, requestPlacementJobCancellation } from "@/lib/placement-optimization/relational-repository";

export const dynamic="force-dynamic"; export const runtime="nodejs";

export async function POST(request:Request){
  const session=await getServerAuthSession(); if(!session||session.role!=="admin")return NextResponse.json({error:"Administrator access is required."},{status:403});
  const body=await request.json().catch(()=>({})) as {accountId?:string;startDate?:string;endDate?:string};
  const accountId=body.accountId?.replace(/\D/g,"")??""; if(accountId.length!==10)return NextResponse.json({error:"Select a valid Google Ads account first."},{status:400});
  const active=await getActivePlacementJob(accountId); if(active)return NextResponse.json(active,{status:202});
  const range=buildDateRange(body.startDate??null,body.endDate??null); const jobId=randomUUID();
  const job=await createPlacementJob({id:jobId,customerId:accountId,startDate:range.startDate,endDate:range.endDate});
  const child=spawn("doppler",["run","--","npx","tsx",path.join(process.cwd(),"scripts","run-placement-analysis-job.mts"),jobId,accountId,range.startDate,range.endDate],{cwd:process.cwd(),windowsHide:true,stdio:"ignore"}); child.unref();
  return NextResponse.json(job,{status:202});
}

export async function GET(request:Request){const session=await getServerAuthSession();if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});const jobId=new URL(request.url).searchParams.get("jobId")??"";const job=await getPlacementJob(jobId);return job?NextResponse.json(job):NextResponse.json({error:"Placement job was not found."},{status:404});}

export async function DELETE(request:Request){const session=await getServerAuthSession();if(!session||session.role!=="admin")return NextResponse.json({error:"Administrator access is required."},{status:403});const jobId=new URL(request.url).searchParams.get("jobId")??"";const job=await requestPlacementJobCancellation(jobId);return job?NextResponse.json(job):NextResponse.json({error:"Placement job was not found."},{status:404});}
