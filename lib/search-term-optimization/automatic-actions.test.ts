import assert from "node:assert/strict";
import test from "node:test";

import { executeAutomaticExclusionsForBatch, isLiveAutomaticPublishingEnabled, processClaimedAutomaticActions, type ClaimedAutomaticAction } from "./automatic-actions";
import type { OptimizationResult, SearchTermAccountSettings } from "./types";

const action=(values:Partial<ClaimedAutomaticAction>={}):ClaimedAutomaticAction=>({id:"1",analysis_job_id:"job",analysis_row_id:1,stable_term_key:"key",search_term:"bad query",campaign_id:"1",campaign_name:"Campaign",ad_group_id:"2",ad_group_name:"Group",safety_score:95,score_threshold:90,safety_snapshot:{} as never,execution_mode:"live",status:"pending",claim_attempt:1,google_resource_name:null,error:null,created_at:"2026-09-08T00:00:00Z",completed_at:null,...values});

test("live publishing is fail-closed",()=>{
  assert.equal(isLiveAutomaticPublishingEnabled({}),false);
  assert.equal(isLiveAutomaticPublishingEnabled({SEARCH_TERM_AUTOMATION_LIVE_PUBLISH_ENABLED:"TRUE"}),false);
  assert.equal(isLiveAutomaticPublishingEnabled({SEARCH_TERM_AUTOMATION_LIVE_PUBLISH_ENABLED:"true"}),true);
});
test("serial processing records mixed outcomes and continues",async()=>{
  const completed:Array<[string,string]>=[];let active=0,maxActive=0;
  const result=await processClaimedAutomaticActions("1234567890",[action({id:"publish"}),action({id:"duplicate"}),action({id:"failure"})],{
    publish:async(_customer,[row])=>{active++;maxActive=Math.max(maxActive,active);await Promise.resolve();active--;if(row.searchTerm==="bad query"&&completed.length===0)return{published:1,deduplicated:0,resourceNames:["resource/1"]};if(completed.length===1)return{published:0,deduplicated:1,resourceNames:[]};throw new Error("denied");},
    complete:async(id,status)=>{completed.push([id,status]);},
  });
  assert.deepEqual(result,{published:1,reconciled:0,skipped:1,failed:1});
  assert.deepEqual(completed,[["publish","published"],["duplicate","skipped"],["failure","failed"]]);
  assert.equal(maxActive,1);
});
test("a reclaimed duplicate is reconciled",async()=>{
  const completed:string[]=[];
  const result=await processClaimedAutomaticActions("1234567890",[action({claim_attempt:2})],{publish:async()=>({published:0,deduplicated:1,resourceNames:[]}),complete:async(_id,status)=>{completed.push(status);}});
  assert.equal(result.reconciled,1);assert.deepEqual(completed,["reconciled"]);
});

test("dry-run execution records a claim and trips if Google publishing is attempted",async()=>{
  let claims=0;
  const resultJson={
    id:"dry-run-fixture",searchTerm:"codex dry run irrelevant query",campaignId:"456",campaign:"Dry Run Campaign",
    adGroupId:"123",adGroup:"Dry Run Ad Group",proposedAction:"negative exact",safetyScore:95,spend:50,
    conversions:0,qualifiedLeads:0,mismatchCategory:"wrong_product",hardGateFailures:[],addedExcludedStatus:null,
    scoreBreakdown:[
      {signal:"No live positive-keyword overlap",points:10,applied:true,status:"yes"},
      {signal:"Search intent is absent from the landing page",points:10,applied:true,status:"yes"},
    ],
    dataRetrievedAt:new Date().toISOString(),
  } as unknown as OptimizationResult;
  const settings={automaticExclusionEnabled:true,autoSafeScoreThreshold:90} as SearchTermAccountSettings;
  const result=await executeAutomaticExclusionsForBatch({jobId:"job",batchId:"batch",customerId:"593-981-4778"},{
    environment:{SEARCH_TERM_AUTOMATION_LIVE_PUBLISH_ENABLED:"false"},
    getSettings:async()=>settings,
    loadRows:async()=>[{id:1,stable_term_key:"456|123|codex dry run irrelevant query",result_json:resultJson}],
    claim:async({mode,candidates})=>{claims++;assert.equal(mode,"dry_run");assert.equal(candidates.length,1);return[action({status:"dry_run",execution_mode:"dry_run"})];},
    publish:async()=>assert.fail("Dry-run attempted a Google Ads mutation"),
  });
  assert.equal(claims,1);
  assert.deepEqual(result,{disabled:false,mode:"dry_run",claimed:1,published:0,reconciled:0,skipped:0,failed:0});
});
