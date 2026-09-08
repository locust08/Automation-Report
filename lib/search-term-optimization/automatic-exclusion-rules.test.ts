import assert from "node:assert/strict";
import test from "node:test";

import { automaticExclusionSkipReasons, isAutomaticExclusionEligible, selectAutomaticExclusionCandidates } from "./automatic-exclusion-rules";
import type { OptimizationDashboardPayload, OptimizationResult } from "./types";

const scoreBreakdown = [
  { signal:"No live positive-keyword overlap", points:10, applied:true, status:"yes" as const },
  { signal:"Search intent is absent from the landing page", points:10, applied:true, status:"yes" as const },
];
const row = {id:"1",proposedAction:"negative exact",safetyScore:95,spend:10,conversions:0,qualifiedLeads:0,mismatchCategory:"wrong_product",hardGateFailures:["Account automation is disabled","Required signal is unknown: qualified-lead signal"],scoreBreakdown,adGroupId:"123",addedExcludedStatus:null,campaignId:"456",campaign:"Campaign",adGroup:"Group",searchTerm:"bad query"} as unknown as OptimizationResult;
const dashboard = {source:{fresh:true}} as Pick<OptimizationDashboardPayload,"source">;

test("strictly eligible negative exact passes",()=>assert.equal(isAutomaticExclusionEligible(row,dashboard,90),true));
test("unknown required data blocks publishing",()=>{
  assert.ok(automaticExclusionSkipReasons({...row,qualifiedLeads:null},dashboard,90).includes("Qualified-lead signal is unknown"));
  assert.ok(automaticExclusionSkipReasons({...row,scoreBreakdown:[]},dashboard,90).includes("Positive-keyword overlap was not explicitly ruled out"));
  assert.ok(automaticExclusionSkipReasons(row,{source:{...dashboard.source,fresh:false}},90).includes("Google Ads data is stale"));
});
test("only approved negative exact terms qualify",()=>{
  assert.equal(isAutomaticExclusionEligible({...row,proposedAction:"negative phrase"},dashboard,90),false);
  assert.equal(isAutomaticExclusionEligible({...row,mismatchCategory:"ambiguous"},dashboard,90),false);
  assert.equal(isAutomaticExclusionEligible({...row,safetyScore:89},dashboard,90),false);
  assert.equal(isAutomaticExclusionEligible({...row,qualifiedLeads:1},dashboard,90),false);
  assert.equal(isAutomaticExclusionEligible({...row,reviewStatus:"ready_for_approval"},dashboard,90),false);
});
test("selection is deterministic by score, spend, then stable identity",()=>{
  const selected=selectAutomaticExclusionCandidates([
    {...row,id:"a",searchTerm:"z",safetyScore:95,spend:20},
    {...row,id:"b",searchTerm:"a",safetyScore:96,spend:1},
    {...row,id:"c",searchTerm:"b",safetyScore:95,spend:20},
  ],dashboard,90);
  assert.deepEqual(selected.map(item=>item.id),["b","c","a"]);
});
