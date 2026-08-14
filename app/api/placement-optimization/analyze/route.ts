import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { buildDateRange } from "@/lib/reporting/date";
import { createPlacementJob, getActivePlacementJob, getPlacementJob, requestPlacementJobCancellation, updatePlacementJob } from "@/lib/placement-optimization/relational-repository";
import { isSupabaseUnavailableError } from "@/lib/optimization/supabase-rest";

export const dynamic="force-dynamic"; export const runtime="nodejs";

export async function POST(request:Request){
 try {
  const session=await getServerAuthSession(); if(!session||session.role!=="admin")return NextResponse.json({error:"Administrator access is required."},{status:403});
  const body=await request.json().catch(()=>({})) as {accountId?:string;startDate?:string;endDate?:string};
  const accountId=body.accountId?.replace(/\D/g,"")??""; if(accountId.length!==10)return NextResponse.json({error:"Select a valid Google Ads account first."},{status:400});
  const active=await getActivePlacementJob(accountId); if(active)return NextResponse.json(active,{status:202});
  const range=buildDateRange(body.startDate??null,body.endDate??null); const jobId=randomUUID();
  const job=await createPlacementJob({id:jobId,customerId:accountId,startDate:range.startDate,endDate:range.endDate});
  await queuePlacementCommand({command:"retrieve",jobId,accountId,startDate:range.startDate,endDate:range.endDate});
  return NextResponse.json(job,{status:202});
 } catch(error){return placementApiError(error);}
}

export async function GET(request:Request){try{const session=await getServerAuthSession();if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});const url=new URL(request.url);const jobId=url.searchParams.get("jobId")??"";if(jobId){const job=await getPlacementJob(jobId);return job?NextResponse.json(job):NextResponse.json({error:"Placement job was not found."},{status:404});}const accountId=(url.searchParams.get("accountId")??"").replace(/\D/g,"");const job=accountId.length===10?await getActivePlacementJob(accountId):null;return NextResponse.json({job:job??null});}catch(error){return placementApiError(error);}}

export async function DELETE(request:Request){try{const session=await getServerAuthSession();if(!session||session.role!=="admin")return NextResponse.json({error:"Administrator access is required."},{status:403});const jobId=new URL(request.url).searchParams.get("jobId")??"";const job=await requestPlacementJobCancellation(jobId);if(!job)return NextResponse.json({error:"Placement job was not found."},{status:404});await queuePlacementCommand({command:"cancel",jobId:job.id,accountId:job.google_customer_id,startDate:job.reporting_start_date,endDate:job.reporting_end_date});return NextResponse.json(job);}catch(error){return placementApiError(error);}}

export async function PUT(request:Request){try{const session=await getServerAuthSession();if(!session||session.role!=="admin")return NextResponse.json({error:"Administrator access is required."},{status:403});const body=await request.json() as {jobId?:string;action?:"next"|"all"};const job=body.jobId?await getPlacementJob(body.jobId):null;if(!job)return NextResponse.json({error:"Placement job was not found."},{status:404});if(body.action!=="next"&&body.action!=="all")return NextResponse.json({error:"Choose next or all."},{status:400});await queuePlacementCommand({command:body.action,jobId:job.id,accountId:job.google_customer_id,startDate:job.reporting_start_date,endDate:job.reporting_end_date});const updated=await updatePlacementJob(job.id,{status:"running",stage:body.action==="all"?"Queued all remaining placement batches":"Queued the next 250 placements"});return NextResponse.json(updated,{status:202});}catch(error){return placementApiError(error);}}

async function queuePlacementCommand(command:{command:"retrieve"|"next"|"all"|"cancel";jobId:string;accountId:string;startDate:string;endDate:string}){const base=process.env.PLACEMENT_ANALYSIS_WORKER_URL?.replace(/\/$/,"");const secret=process.env.WORKER_API_SECRET;if(!base||!secret)throw new Error("Placement analysis Worker is not configured.");const response=await fetch(`${base}/placement-analysis/commands`,{method:"POST",headers:{authorization:`Bearer ${secret}`,"content-type":"application/json"},body:JSON.stringify(command),cache:"no-store"});if(!response.ok)throw new Error(`Placement analysis Worker rejected the job (${response.status}).`);}
function placementApiError(error:unknown){if(isSupabaseUnavailableError(error))return NextResponse.json({code:error.code,error:error.message},{status:503});return NextResponse.json({error:error instanceof Error?error.message:"Placement analysis failed."},{status:500});}
