import assert from "node:assert/strict";
import test from "node:test";

import { isLiveAutomaticPublishingEnabled, processClaimedAutomaticActions, type ClaimedAutomaticAction } from "./automatic-actions";

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
