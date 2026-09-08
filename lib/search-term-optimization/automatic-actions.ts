import { publishSearchTermOptimizations } from "@/lib/optimization/google-ads-mutations";
import { jsonBody, qs, supabaseRest, supabaseRestCount } from "@/lib/optimization/supabase-rest";
import { AUTOMATIC_EXCLUSION_RUN_CAP, selectAutomaticExclusionCandidates } from "@/lib/search-term-optimization/automatic-exclusion-rules";
import { getSearchTermAccountSettings } from "@/lib/search-term-optimization/supabase-settings";
import { stableSearchTermKey } from "@/lib/search-term-optimization/stable-search-term-key";
import type { AutomaticActionHistoryItem, AutomaticActionHistoryPayload, AutomaticActionStatus, OptimizationResult } from "@/lib/search-term-optimization/types";

type AnalysisRow = { id:number;stable_term_key:string;result_json:OptimizationResult };
export type ClaimedAutomaticAction = {
  id:string;analysis_job_id:string;analysis_row_id:number;stable_term_key:string;search_term:string;
  campaign_id:string|null;campaign_name:string;ad_group_id:string;ad_group_name:string;
  safety_score:number;score_threshold:number;safety_snapshot:OptimizationResult;execution_mode:"dry_run"|"live";
  status:AutomaticActionStatus;claim_attempt:number;google_resource_name:string|null;error:string|null;
  created_at:string;completed_at:string|null;
};

export function isLiveAutomaticPublishingEnabled(environment:Record<string,string|undefined>=process.env) {
  return environment.SEARCH_TERM_AUTOMATION_LIVE_PUBLISH_ENABLED === "true";
}

const mapHistory=(row:ClaimedAutomaticAction):AutomaticActionHistoryItem=>({
  id:row.id,analysisJobId:row.analysis_job_id,searchTerm:row.search_term,campaign:row.campaign_name,
  adGroup:row.ad_group_name,action:"negative exact",safetyScore:row.safety_score,scoreThreshold:row.score_threshold,
  executionMode:row.execution_mode,status:row.status,googleResourceName:row.google_resource_name,error:row.error,
  createdAt:row.created_at,completedAt:row.completed_at,
});

async function completeAction(id:string,status:AutomaticActionStatus,values:{error?:string|null;googleResourceName?:string|null}={}) {
  await supabaseRest(`ad_automation_search_term_automatic_actions?id=eq.${qs(id)}`,{
    method:"PATCH",headers:{Prefer:"return=minimal"},body:jsonBody({status,error:values.error??null,google_resource_name:values.googleResourceName??null,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}),
  });
}

export async function processClaimedAutomaticActions(
  customerId:string,
  actions:ClaimedAutomaticAction[],
  dependencies:{
    publish?:(customerId:string,rows:Array<{campaignId:string|null;adGroupId:string|null;searchTerm:string;action:string}>,options?:{rejectPositiveExactOverlap?:boolean})=>Promise<{published:number;deduplicated:number;resourceNames:string[]}>;
    complete?:(id:string,status:AutomaticActionStatus,values?:{error?:string|null;googleResourceName?:string|null})=>Promise<void>;
  }={},
) {
  const publish=dependencies.publish??publishSearchTermOptimizations;
  const complete=dependencies.complete??completeAction;
  const totals={published:0,reconciled:0,skipped:0,failed:0};
  for(const action of actions) {
    if(action.status!=="pending")continue;
    try {
      const result=await publish(customerId,[{campaignId:action.campaign_id,adGroupId:action.ad_group_id,searchTerm:action.search_term,action:"negative exact"}],{rejectPositiveExactOverlap:true});
      if(result.published===1) {
        await complete(action.id,"published",{googleResourceName:result.resourceNames[0]??null});totals.published++;
      } else if(result.deduplicated===1&&action.claim_attempt>1) {
        await complete(action.id,"reconciled",{error:"Exact-match negative exists after an interrupted publishing attempt"});totals.reconciled++;
      } else {
        await complete(action.id,"skipped",{error:"An identical exact-match negative keyword already exists"});totals.skipped++;
      }
    } catch(error) {
      await complete(action.id,"failed",{error:error instanceof Error?error.message:"Google Ads publishing failed"});totals.failed++;
    }
  }
  return totals;
}

export async function executeAutomaticExclusionsForBatch(input:{jobId:string;batchId:string;customerId:string}) {
  const customerId=input.customerId.replace(/\D/g,"");
  const settings=await getSearchTermAccountSettings(customerId);
  const livePublishingEnabled=isLiveAutomaticPublishingEnabled();
  if(!settings.automaticExclusionEnabled)return {disabled:true,mode:livePublishingEnabled?"live":"dry_run",claimed:0,published:0,reconciled:0,skipped:0,failed:0};
  const stored=await supabaseRest<AnalysisRow[]>(`ad_automation_search_term_analysis_rows?batch_id=eq.${qs(input.batchId)}&select=id,stable_term_key,result_json&order=id.asc`);
  const fresh=stored.length>0&&stored.every(item=>Date.now()-new Date(item.result_json.dataRetrievedAt).getTime()<=48*60*60*1000);
  const byStableKey=new Map(stored.map(item=>[item.stable_term_key,item]));
  const selected=selectAutomaticExclusionCandidates(stored.map(item=>item.result_json),{source:{label:"Durable analysis batch",fresh,termsReviewed:stored.length,mutatingGoogleAdsChanges:false}},settings.autoSafeScoreThreshold).slice(0,AUTOMATIC_EXCLUSION_RUN_CAP);
  const candidates=selected.flatMap(row=>{
    const storedRow=byStableKey.get(stableSearchTermKey(row));
    if(!storedRow)return [];
    return [{analysisRowId:storedRow.id,stableTermKey:storedRow.stable_term_key,searchTerm:row.searchTerm,campaignId:row.campaignId,campaign:row.campaign,adGroupId:row.adGroupId,adGroup:row.adGroup,safetyScore:row.safetyScore,scoreThreshold:settings.autoSafeScoreThreshold,safetySnapshot:row}];
  });
  if(!candidates.length)return {disabled:false,mode:livePublishingEnabled?"live":"dry_run",claimed:0,published:0,reconciled:0,skipped:0,failed:0};
  const mode=livePublishingEnabled?"live":"dry_run";
  const claimed=await supabaseRest<ClaimedAutomaticAction[]>("rpc/claim_automatic_search_term_actions",{method:"POST",body:jsonBody({p_job_id:input.jobId,p_batch_id:input.batchId,p_customer_id:customerId,p_mode:mode,p_candidates:candidates,p_run_cap:AUTOMATIC_EXCLUSION_RUN_CAP})});
  if(!livePublishingEnabled)return {disabled:false,mode,claimed:claimed.length,published:0,reconciled:0,skipped:0,failed:0};
  return {disabled:false,mode,claimed:claimed.length,...await processClaimedAutomaticActions(customerId,claimed)};
}

export async function getAutomaticActionHistory(customerId:string,page=1,pageSize=10):Promise<AutomaticActionHistoryPayload> {
  const normalized=customerId.replace(/\D/g,"");const offset=(page-1)*pageSize;
  const base=`ad_automation_search_term_automatic_actions?google_customer_id=eq.${qs(normalized)}`;
  const [items,total]=await Promise.all([
    supabaseRest<ClaimedAutomaticAction[]>(`${base}&select=*&order=created_at.desc&limit=${pageSize}&offset=${offset}`),
    supabaseRestCount(`${base}&select=id`),
  ]);
  return {items:items.map(mapHistory),page,pageSize,total,livePublishingEnabled:isLiveAutomaticPublishingEnabled()};
}
