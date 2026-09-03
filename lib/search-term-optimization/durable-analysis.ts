import { jsonBody, qs, supabaseRest } from "@/lib/optimization/supabase-rest";
import { ACTIVE_ANALYSIS_JOB_STATUSES, GLOBALLY_VISIBLE_ANALYSIS_JOB_STATUSES, dedupeLatestAnalysisJobsByAccount, toSearchTermAnalysisJobSummary, type SearchTermAnalysisJobSummary } from "@/lib/search-term-optimization/job-summary";

export const DAILY_ACCOUNT_LIMIT = 4;
export const SEARCH_TERMS_PER_RUN = 250;
export const MAX_SEARCH_TERMS_PER_ACCOUNT = 2_500;

export type DailyCapacity = { total: number; used: number; reserved: number; claiming: number; available: number; malaysiaDate: string; allocatedAccountIds:string[] };
export type DurableAnalysisJob = {
  id:string; google_customer_id:string; account_name:string; malaysia_run_date:string; source:"manual"|"scheduled";
  status:"queued"|"fetching"|"running"|"needs_retry"|"stopping"|"stopped"|"completed"|"failed";
  stage:string; reporting_start_date:string|null; reporting_end_date:string|null; r2_object_key:string|null; snapshot_expires_at:string|null;
  total_terms:number; planned_runs:number; current_run:number; completed_runs:number; terms_processed:number; retry_count:number;
  cancellation_requested:boolean; last_worker_ping_at:string|null; error:string|null; started_at:string|null; completed_at:string|null; created_at:string; updated_at:string;
};

type Slot={id:string;status:"reserved"|"claiming"|"used";source:"manual"|"scheduled";fulfillment_source:"manual"|"scheduled"|null;google_customer_id:string;malaysia_run_date:string;schedule_run_id:string|null};

export function malaysiaDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
}

export async function getDailyCapacity(date = malaysiaDate()):Promise<DailyCapacity>{
  await reserveScheduledSlots(date);
  const slots=await supabaseRest<Slot[]>(`ad_automation_search_term_daily_slots?malaysia_run_date=eq.${qs(date)}&select=status,google_customer_id`);
  const used=slots.filter(slot=>slot.status==="used").length;
  const reserved=slots.filter(slot=>slot.status==="reserved").length;
  const claiming=slots.filter(slot=>slot.status==="claiming").length;
  return{total:DAILY_ACCOUNT_LIMIT,used,reserved,claiming,available:Math.max(0,DAILY_ACCOUNT_LIMIT-slots.length),malaysiaDate:date,allocatedAccountIds:slots.map(slot=>slot.google_customer_id)};
}

async function reserveScheduledSlots(date:string){
  const start=new Date(`${date}T00:00:00+08:00`);const end=new Date(start.getTime()+86400000);
  const schedules=await supabaseRest<Array<{id:string;google_customer_id:string;account_name:string}>>(`ad_automation_search_term_schedules?enabled=eq.true&next_run_at=gte.${qs(start.toISOString())}&next_run_at=lt.${qs(end.toISOString())}&select=id,google_customer_id,account_name`);
  if(!schedules.length)return;
  await supabaseRest("ad_automation_search_term_daily_slots?on_conflict=malaysia_run_date,google_customer_id",{
    method:"POST",
    headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},
    body:jsonBody(schedules.map(schedule=>({malaysia_run_date:date,google_customer_id:schedule.google_customer_id,account_name:schedule.account_name,source:"scheduled",status:"reserved"}))),
  });
}

export async function getDailySlot(customerId:string,date=malaysiaDate()){const rows=await supabaseRest<Slot[]>(`ad_automation_search_term_daily_slots?malaysia_run_date=eq.${qs(date)}&google_customer_id=eq.${qs(customerId)}&select=*&limit=1`);return rows[0]??null;}

export async function claimDailySlot(input:{customerId:string;accountName?:string;source:"manual"|"scheduled";scheduleRunId?:string|null;date?:string}){
  const rows=await supabaseRest<Slot[]>("rpc/claim_search_term_daily_slot",{method:"POST",body:jsonBody({requested_date:input.date??malaysiaDate(),requested_customer_id:input.customerId,requested_account_name:input.accountName??"",requested_source:input.source,requested_schedule_run_id:input.scheduleRunId??null})});
  return rows[0];
}

export async function markDailySlotUsed(customerId:string,date=malaysiaDate()){
  await supabaseRest(`ad_automation_search_term_daily_slots?malaysia_run_date=eq.${qs(date)}&google_customer_id=eq.${qs(customerId)}`,{method:"PATCH",body:jsonBody({status:"used",used_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
}

export async function releaseManualClaim(customerId:string,date=malaysiaDate()){
  await supabaseRest(`ad_automation_search_term_daily_slots?malaysia_run_date=eq.${qs(date)}&google_customer_id=eq.${qs(customerId)}&source=eq.manual&status=eq.claiming`,{method:"DELETE"});
}

export async function createDurableAnalysisJob(input:{id:string;customerId:string;accountName?:string;source:"manual"|"scheduled";startDate?:string|null;endDate?:string|null}){
  const rows=await supabaseRest<DurableAnalysisJob[]>("ad_automation_search_term_analysis_jobs",{method:"POST",body:jsonBody({id:input.id,google_customer_id:input.customerId,account_name:input.accountName??"",malaysia_run_date:malaysiaDate(),source:input.source,status:"queued",stage:"Queued for Google Ads retrieval",reporting_start_date:input.startDate??null,reporting_end_date:input.endDate??null})});
  return rows[0];
}

export async function getDurableAnalysisJob(id:string){const rows=await supabaseRest<DurableAnalysisJob[]>(`ad_automation_search_term_analysis_jobs?id=eq.${qs(id)}&select=*&limit=1`);return rows[0]??null;}
export async function getActiveDurableAnalysisJob(customerId:string){const statuses=ACTIVE_ANALYSIS_JOB_STATUSES.join(",");const rows=await supabaseRest<DurableAnalysisJob[]>(`ad_automation_search_term_analysis_jobs?google_customer_id=eq.${qs(customerId)}&status=in.(${statuses})&select=*&order=created_at.desc&limit=1`);return rows[0]??null;}
export async function getActiveDurableAnalysisJobs():Promise<SearchTermAnalysisJobSummary[]>{
  const statuses=GLOBALLY_VISIBLE_ANALYSIS_JOB_STATUSES.join(",");
  const rows=await supabaseRest<DurableAnalysisJob[]>(`ad_automation_search_term_analysis_jobs?status=in.(${statuses})&select=*&order=created_at.desc`);
  return dedupeLatestAnalysisJobsByAccount(rows.map(job=>toSearchTermAnalysisJobSummary(job)));
}
export async function patchDurableAnalysisJob(id:string,values:Record<string,unknown>){const rows=await supabaseRest<DurableAnalysisJob[]>(`ad_automation_search_term_analysis_jobs?id=eq.${qs(id)}`,{method:"PATCH",body:JSON.stringify({...values,updated_at:new Date().toISOString()})});return rows[0]??null;}

export async function requestDurableAnalysisStop(id:string){return patchDurableAnalysisJob(id,{status:"stopping",stage:"Stopping after the current run",cancellation_requested:true});}
export async function stopDurableAnalysisImmediately(id:string,reason="Analysis stopped; completed runs were kept"){
  const job=await patchDurableAnalysisJob(id,{status:"stopped",stage:reason,cancellation_requested:true,completed_at:new Date().toISOString()});
  await supabaseRest(`ad_automation_search_term_analysis_batches?job_id=eq.${qs(id)}&status=in.(running,retrying)`,{method:"PATCH",body:jsonBody({status:"needs_retry",error:"The worker stopped before this batch was confirmed; retry this batch only.",updated_at:new Date().toISOString()})});
  await supabaseRest(`ad_automation_search_term_analysis_batches?job_id=eq.${qs(id)}&status=eq.queued`,{method:"PATCH",body:jsonBody({status:"stopped",error:reason,updated_at:new Date().toISOString()})});
  return job;
}
export async function retryDurableAnalysis(id:string){return patchDurableAnalysisJob(id,{status:"queued",stage:"Queued to retry the failed run",cancellation_requested:false,error:null});}

export function toClientJob(job:DurableAnalysisJob){const summary=toSearchTermAnalysisJobSummary(job);return{...summary,currentBatch:summary.currentRun,completedBatches:summary.completedRuns,maxBatches:summary.plannedRuns,currentBatchSize:summary.currentRunTerms,heartbeatAt:job.last_worker_ping_at};}
