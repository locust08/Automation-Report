import { calculateNextRun } from "@/lib/search-term-optimization/account-settings";
import type { AnalysisScheduleFrequency, SearchTermAccountSettings } from "@/lib/search-term-optimization/types";
import { jsonBody, qs, supabaseRest } from "@/lib/optimization/supabase-rest";

type Row = { google_customer_id:string;schedule_frequency:AnalysisScheduleFrequency;auto_safe_score_threshold:number;review_score_threshold:number;high_spend_threshold:number;minimum_clicks_threshold:number;last_run_at:string|null;next_run_at:string|null };
const map=(r:Row):SearchTermAccountSettings=>({googleCustomerId:r.google_customer_id,scheduleFrequency:r.schedule_frequency,autoSafeScoreThreshold:r.auto_safe_score_threshold,reviewScoreThreshold:r.review_score_threshold,highSpendThreshold:Number(r.high_spend_threshold),minimumClicksThreshold:r.minimum_clicks_threshold,lastRunAt:r.last_run_at,nextRunAt:r.next_run_at});

export async function getSearchTermAccountSettings(customerId:string,lastRunAt?:string|null){
  let rows=await supabaseRest<Row[]>(`ad_automation_search_term_account_settings?google_customer_id=eq.${qs(customerId)}&select=*`);
  if(!rows[0]) rows=await supabaseRest<Row[]>("ad_automation_search_term_account_settings",{method:"POST",body:jsonBody({google_customer_id:customerId,last_run_at:lastRunAt??null,next_run_at:calculateNextRun("monthly",lastRunAt?new Date(lastRunAt):new Date())})});
  return map(rows[0]);
}
export async function saveSearchTermAccountSettings(input:Omit<SearchTermAccountSettings,"lastRunAt"|"nextRunAt">){
  if(input.reviewScoreThreshold>=input.autoSafeScoreThreshold)throw new Error("Review score must be lower than the auto-safe score.");
  const current=await getSearchTermAccountSettings(input.googleCustomerId);
  const anchor=current.lastRunAt?new Date(current.lastRunAt):new Date();
  const rows=await supabaseRest<Row[]>(`ad_automation_search_term_account_settings?on_conflict=google_customer_id`,{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:jsonBody({google_customer_id:input.googleCustomerId,schedule_frequency:input.scheduleFrequency,auto_safe_score_threshold:input.autoSafeScoreThreshold,review_score_threshold:input.reviewScoreThreshold,high_spend_threshold:input.highSpendThreshold,minimum_clicks_threshold:input.minimumClicksThreshold,next_run_at:calculateNextRun(input.scheduleFrequency,anchor),updated_at:new Date().toISOString()})});
  return map(rows[0]);
}
export async function recordSearchTermAnalysisCompleted(customerId:string,completedAt:string){const current=await getSearchTermAccountSettings(customerId);const rows=await supabaseRest<Row[]>(`ad_automation_search_term_account_settings?google_customer_id=eq.${qs(customerId)}`,{method:"PATCH",body:jsonBody({last_run_at:completedAt,next_run_at:calculateNextRun(current.scheduleFrequency,new Date(completedAt)),updated_at:new Date().toISOString()})});return map(rows[0]);}
