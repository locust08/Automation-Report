import { createHash } from "node:crypto";
import { publishSearchTermOptimizations } from "@/lib/optimization/google-ads-mutations";
import { jsonBody, qs, supabaseRest } from "@/lib/optimization/supabase-rest";
import type { LeadQualityImportRow, LeadQualityValues } from "@/lib/search-term-optimization/lead-quality-repository";
import { getSearchTermAccountSettings } from "@/lib/search-term-optimization/supabase-settings";
import type { OptimizationDashboardPayload, OptimizationResult } from "@/lib/search-term-optimization/types";
import type { RawCurrentSearchTerm } from "@/lib/search-term-optimization/repository";

export type SpecialistDecision="approved"|"rejected"; export type ApproverDecision="accepted"|"rejected";
export type SearchTermDecisionSummaryRow={customerId:string;customerName:string;searchTerm:string;campaign:string;outcome:"approved"|"negative";clicks:number;spend:number;conversions:number;classification:string;decidedAt:string|null};
type Run={id:number;google_customer_id:string;customer_name:string|null;reporting_start_date:string;reporting_end_date:string;analyzed_at:string;recommendations:OptimizationResult[];last_checked_at?:string|null;source_fingerprint?:string|null;current_term_count?:number;reused_term_count?:number;new_term_count?:number;queued_new_term_count?:number;refresh_status?:string|null};
type Decision={id:number;analysis_run_id:number;recommendation_key:string;item_key?:string|null;decision:string|null;status:string;reviewer_user_id:string|null;reviewer_email:string|null;reviewer_role:string|null;reviewed_at:string|null;metadata:Record<string,unknown>};

export function stableSearchTermKey(row:Pick<OptimizationResult,"campaignId"|"adGroupId"|"searchTerm">){return `${row.campaignId??""}|${row.adGroupId??""}|${normalize(row.searchTerm)}`;}
function rawKey(row:RawCurrentSearchTerm){return `${row.campaign_id}|${row.ad_group_id}|${normalize(row.search_term)}`;}
function normalize(value:string){return value.trim().toLowerCase().replace(/\s+/g," ");}
function accountFilter(customerId:string){const normalized=customerId.replace(/\D/g,"");const formatted=`${normalized.slice(0,3)}-${normalized.slice(3,6)}-${normalized.slice(6)}`;return `or=(google_customer_id.eq.${qs(normalized)},google_customer_id.eq.${qs(formatted)})`;}
function summary(results:OptimizationResult[]):OptimizationDashboardPayload["summary"]{return {totalReviewed:results.length,automaticallyExcluded:results.filter(r=>r.executionStatus==="published").length,addExactRecommendations:results.filter(r=>r.proposedAction==="add exact").length,needsReview:results.filter(r=>r.proposedAction!=="no action"&&r.executionStatus==="review-required").length,noAction:results.filter(r=>r.proposedAction==="no action").length,failedOrUnverified:results.filter(r=>r.executionStatus==="failed"||r.verificationStatus==="failed").length};}
function fingerprint(rows:RawCurrentSearchTerm[]){return createHash("sha256").update(rows.map(rawKey).sort().join("\n")).digest("hex");}

export async function persistDashboardToSupabase(payload:OptimizationDashboardPayload):Promise<OptimizationDashboardPayload>{
 const refresh=payload.refresh??{mode:"full" as const,checkedAt:payload.account.lastAnalysisAt,currentTerms:payload.results.length,reusedTerms:0,newTerms:payload.results.length,queuedNewTerms:0};
 const runs=await supabaseRest<Run[]>("ad_automation_search_term_analysis_runs?on_conflict=google_customer_id,analyzed_at",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:jsonBody({google_customer_id:payload.account.customerId.replace(/\D/g,""),customer_name:payload.account.customerName,reporting_start_date:payload.account.reportingPeriod.startDate,reporting_end_date:payload.account.reportingPeriod.endDate,analyzed_at:payload.account.lastAnalysisAt,recommendations:payload.results,last_checked_at:refresh.checkedAt,source_fingerprint:createHash("sha256").update(payload.results.map(stableSearchTermKey).sort().join("\n")).digest("hex"),current_term_count:refresh.currentTerms,reused_term_count:refresh.reusedTerms,new_term_count:refresh.newTerms,queued_new_term_count:refresh.queuedNewTerms,refresh_status:refresh.mode})});
 return dashboardForRun(runs[0],payload);
}

export async function getLatestDashboardFromSupabase(customerId?:string):Promise<OptimizationDashboardPayload|null>{
 const normalizedId=customerId?.replace(/\D/g,"");
 const filter=normalizedId?`${accountFilter(normalizedId)}&`:"";
 const runs=await supabaseRest<Run[]>(`ad_automation_search_term_analysis_runs?${filter}select=*&order=analyzed_at.desc&limit=1`);
 if(!runs[0])return null;
 return dashboardForRun(runs[0]);
}

export async function mergeIncrementalDashboard(input:{cached:OptimizationDashboardPayload|null;newlyAnalyzed:OptimizationDashboardPayload;currentRows:RawCurrentSearchTerm[];checkedAt:string;queuedNewTerms:number}):Promise<OptimizationDashboardPayload>{
 const cachedByKey=new Map((input.cached?.results??[]).map(row=>[stableSearchTermKey(row),row]));
 const newByKey=new Map(input.newlyAnalyzed.results.map(row=>[stableSearchTermKey(row),row]));
 let reused=0,newTerms=0;
 const results=input.currentRows.flatMap(raw=>{
   const key=rawKey(raw);const analyzed=newByKey.get(key);const previous=cachedByKey.get(key);const base=analyzed??previous;
   if(!base)return [];
   if(analyzed)newTerms++;else reused++;
   return [{...base,campaignId:raw.campaign_id,campaign:raw.campaign_name,adGroupId:raw.ad_group_id,adGroup:raw.ad_group_name,searchTerm:raw.search_term,destinationUrl:raw.destination_url??base.destinationUrl,impressions:Number(raw.impressions),clicks:Number(raw.clicks),spend:Number(raw.cost),conversions:Number(raw.conversions),dataRetrievedAt:input.checkedAt}];
 });
 const mode=input.cached?(newTerms?"incremental":"cached"):"full";
 return {...input.newlyAnalyzed,account:{...input.newlyAnalyzed.account,lastAnalysisAt:newTerms||!input.cached?input.newlyAnalyzed.account.lastAnalysisAt:input.cached.account.lastAnalysisAt},source:{...input.newlyAnalyzed.source,label:mode==="cached"?"Supabase cached analysis with refreshed Google Ads metrics":"Incremental Google Ads analysis",termsReviewed:newTerms},summary:summary(results),results,history:results.filter(row=>row.verificationStatus==="verified"),refresh:{mode,checkedAt:input.checkedAt,currentTerms:input.currentRows.length,reusedTerms:reused,newTerms,queuedNewTerms:input.queuedNewTerms}};
}

async function dashboardForRun(run:Run,template?:OptimizationDashboardPayload):Promise<OptimizationDashboardPayload>{
 const accountRuns=await supabaseRest<Array<Pick<Run,"id">>>(`ad_automation_search_term_analysis_runs?${accountFilter(run.google_customer_id)}&select=id`);
 const runIds=accountRuns.map(item=>item.id);
 const decisions=runIds.length?await supabaseRest<Decision[]>(`ad_automation_search_term_decisions?analysis_run_id=in.(${runIds.join(",")})&select=*&order=reviewed_at.desc.nullslast`):[];
 const latestByItem=new Map<string,Decision>();for(const decision of decisions){const key=decision.item_key;if(key&&!latestByItem.has(key))latestByItem.set(key,decision);}
 const settings=await getSearchTermAccountSettings(run.google_customer_id,run.analyzed_at);
 const results=run.recommendations.map((row,index)=>hydrate(row,run.id,String(index),latestByItem.get(stableSearchTermKey(row))));
 const base:OptimizationDashboardPayload=template??{account:{customerId:run.google_customer_id,customerName:run.customer_name||`Google Ads ${run.google_customer_id}`,reportingPeriod:{startDate:run.reporting_start_date,endDate:run.reporting_end_date},lastAnalysisAt:run.analyzed_at,nextRunAt:settings.nextRunAt,automationEnabled:false},source:{label:"Supabase analyzed search terms",fresh:true,termsReviewed:results.length,mutatingGoogleAdsChanges:false},summary:summary(results),results,history:results.filter(row=>row.verificationStatus==="verified"),googleRecommendations:[],googleRecommendationsWarning:null,changeSets:[],settings};
 return {...base,account:{...base.account,nextRunAt:settings.nextRunAt},settings,summary:summary(results),results,history:results.filter(row=>row.verificationStatus==="verified"),refresh:{mode:(run.refresh_status as "cached"|"incremental"|"full")||"cached",checkedAt:run.last_checked_at||run.analyzed_at,currentTerms:run.current_term_count??results.length,reusedTerms:run.reused_term_count??results.length,newTerms:run.new_term_count??0,queuedNewTerms:run.queued_new_term_count??0}};
}
function hydrate(row:OptimizationResult,runId:number,key:string,d?:Decision):OptimizationResult{const meta=d?.metadata??{};return {...row,id:`${runId}:${key}`,recommendationId:`${runId}:${key}`,searchTermId:`${runId}:${key}`,qualifiedLeads:numberOr(row.qualifiedLeads,meta.qualifiedLeads),spamLeads:numberOr(row.spamLeads,meta.spamLeads),invalidLeads:numberOr(row.invalidLeads,meta.invalidLeads),clientComplaints:numberOr(row.clientComplaints,meta.clientComplaints),lastReviewedAt:d?.reviewed_at??row.lastReviewedAt,previousDecision:d?.decision??row.previousDecision,reviewStatus:d?.status,reviewDecision:d?.decision==="submit_for_approval"||d?.decision==="approver_approved"?"approved":d?.decision?.includes("reject")?"rejected":undefined,approverDecision:d?.decision==="approver_approved"?"accepted":d?.decision==="return_to_specialist"?"rejected":undefined};}
function numberOr(fallback:number|null,value:unknown){return value==null?fallback:Number(value);} function ref(value:string){const match=/^(\d+):(\d+)$/.exec(value);if(!match)throw new Error("Invalid recommendation reference.");return {runId:Number(match[1]),key:match[2],index:Number(match[2])};}
async function loadItems(ids:string[]){const parsed=ids.map(ref);if(new Set(parsed.map(p=>p.runId)).size!==1)throw new Error("Selected recommendations must belong to one analysis run.");const runs=await supabaseRest<Run[]>(`ad_automation_search_term_analysis_runs?id=eq.${parsed[0].runId}&select=*`);if(!runs[0])throw new Error("Analysis run was not found.");return {run:runs[0],items:parsed.map(p=>({key:p.key,row:runs[0].recommendations[p.index]})).filter(x=>x.row)};}
async function save(ids:string[],status:string,decision:string,reviewer:{id:string;email:string;role:string},metadata:Record<string,unknown>={}){const {run,items}=await loadItems(ids);await supabaseRest("ad_automation_search_term_decisions?on_conflict=analysis_run_id,recommendation_key",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:jsonBody(items.map(i=>({analysis_run_id:run.id,recommendation_key:i.key,item_key:stableSearchTermKey(i.row),status,decision,reviewer_user_id:reviewer.id,reviewer_email:reviewer.email,reviewer_role:reviewer.role,reviewed_at:new Date().toISOString(),metadata,updated_at:new Date().toISOString()})))});return {updated:items.length,skipped:ids.length-items.length,decision};}
export async function saveSpecialistDecision(input:{recommendationIds:string[];decision:SpecialistDecision;reviewer:{id:string;email:string;role:string}}){
 const {run,items}=await loadItems(input.recommendationIds);
 const action=input.decision==="approved"?"add exact":"negative exact";
 const keys=items.map(({key})=>key);
 const previous=keys.length?await supabaseRest<Decision[]>(`ad_automation_search_term_decisions?analysis_run_id=eq.${run.id}&recommendation_key=in.(${keys.join(",")})&select=*`):[];
 const completed=new Set(previous.filter((decision)=>decision.metadata?.publishedAction===action).map((decision)=>decision.recommendation_key));
 const pending=items.filter(({key})=>!completed.has(key));
 const publication=await publishSearchTermOptimizations(run.google_customer_id,pending.map(({row})=>({campaignId:row.campaignId,adGroupId:row.adGroupId,searchTerm:row.searchTerm,action})));
 const pendingIds=pending.map(({key})=>`${run.id}:${key}`);
 const saved=pendingIds.length?await save(pendingIds,input.decision==="approved"?"approved_for_publishing":"approver_rejected",input.decision==="approved"?"approver_approved":"approver_rejected",input.reviewer,{publishedCount:publication.published,publishedAction:action,googleResourceNames:publication.resourceNames}):{updated:0,skipped:0,decision:input.decision};
 return {...saved,published:publication.published,alreadyPublished:completed.size,deduplicated:publication.deduplicated,action};
}
export async function saveApproverDecision(input:{recommendationIds:string[];decision:ApproverDecision;approver:{id:string;email:string;role:string}}){if(input.decision==="rejected")return save(input.recommendationIds,"returned_for_clarification","return_to_specialist",input.approver);const {run,items}=await loadItems(input.recommendationIds);const actionable=items.map(i=>i.row).filter(r=>["negative exact","negative phrase","add exact"].includes(r.proposedAction));await publishSearchTermOptimizations(run.google_customer_id,actionable.map(r=>({campaignId:r.campaignId,adGroupId:r.adGroupId,searchTerm:r.searchTerm,action:r.proposedAction})));return save(input.recommendationIds,"approved_for_publishing","approver_approved",input.approver,{publishedCount:actionable.length});}
export async function updateLeadQuality(searchTermId:string,values:LeadQualityValues){const p=ref(searchTermId);const current=await supabaseRest<Decision[]>(`ad_automation_search_term_decisions?analysis_run_id=eq.${p.runId}&recommendation_key=eq.${p.key}&select=*`);const existing=current[0];await supabaseRest("ad_automation_search_term_decisions?on_conflict=analysis_run_id,recommendation_key",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:jsonBody({analysis_run_id:p.runId,recommendation_key:p.key,status:existing?.status??"pending",decision:existing?.decision??null,metadata:{...(existing?.metadata??{}),qualifiedLeads:values.qualifiedLeads,spamLeads:values.spamLeads,invalidLeads:values.invalidLeads,clientComplaints:values.clientComplaints},updated_at:new Date().toISOString()})});return {updated:1};}
export async function importLeadQuality(rows:LeadQualityImportRow[]){let updated=0;const errors:Array<{row:number;message:string}>=[];for(const item of rows){const runs=await supabaseRest<Run[]>(`ad_automation_search_term_analysis_runs?google_customer_id=eq.${qs(item.customerId.replace(/\D/g,""))}&select=*&order=analyzed_at.desc&limit=1`);const index=runs[0]?.recommendations.findIndex(r=>r.campaign.trim().toLowerCase()===item.campaign.trim().toLowerCase()&&r.adGroup.trim().toLowerCase()===item.adGroup.trim().toLowerCase()&&r.searchTerm.trim().toLowerCase()===item.searchTerm.trim().toLowerCase())??-1;if(index<0){errors.push({row:item.rowNumber,message:"No matching search term was found."});continue;}await updateLeadQuality(`${runs[0].id}:${index}`,item);updated++;}return {updated,errors};}
export async function listSearchTermDecisionSummaryRows(filter?:{date?:string;startDate?:string;endDate?:string}):Promise<SearchTermDecisionSummaryRow[]>{
 const exactDate=filter?.date?.trim();
 const startDate=filter?.startDate?.trim();
 const endDate=filter?.endDate?.trim();
 const dateFilter = exactDate
  ? `&reviewed_at=gte.${qs(`${exactDate}T00:00:00+08:00`)}&reviewed_at=lt.${qs(`${nextDate(exactDate)}T00:00:00+08:00`)}`
  : `${startDate ? `&reviewed_at=gte.${qs(`${startDate}T00:00:00+08:00`)}` : ""}${endDate ? `&reviewed_at=lt.${qs(`${nextDate(endDate)}T00:00:00+08:00`)}` : ""}`;
 const decisions=await supabaseRest<Decision[]>(`ad_automation_search_term_decisions?status=in.(approved_for_publishing,approver_rejected)&select=*&order=reviewed_at.desc${dateFilter}`);
 const latest=new Map<string,Decision>();for(const decision of decisions){const key=decision.item_key??`${decision.analysis_run_id}:${decision.recommendation_key}`;if(!latest.has(key))latest.set(key,decision);}
 const selected=[...latest.values()];const runIds=[...new Set(selected.map(d=>d.analysis_run_id))];
 const runs=runIds.length?await supabaseRest<Run[]>(`ad_automation_search_term_analysis_runs?id=in.(${runIds.join(",")})&select=*`):[];const byId=new Map(runs.map(r=>[r.id,r]));
 return selected.flatMap(d=>{const run=byId.get(d.analysis_run_id),row=run?.recommendations[Number(d.recommendation_key)];return run&&row?[{customerId:run.google_customer_id,customerName:run.customer_name||"Google Ads account",searchTerm:row.searchTerm,campaign:row.campaign,outcome:d.status==="approved_for_publishing"?"approved":"negative",clicks:row.clicks,spend:row.spend,conversions:row.conversions,classification:row.classification,decidedAt:d.reviewed_at}]:[];});
}
function nextDate(value:string){const date=new Date(`${value}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10);}
