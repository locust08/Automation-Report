import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { applyAutomaticExclusionPolicy, isAutomaticExclusionEligible } from "./automatic-exclusion-rules";
import { executeAutomaticExclusionsForBatch, type ClaimedAutomaticAction } from "./automatic-actions";
import { calculateSafetyScore } from "./scoring";
import { stableSearchTermKey } from "./stable-search-term-key";
import type { OptimizationResult, SearchTermAccountSettings } from "./types";

const source = {label:"Test",fresh:true,termsReviewed:1,mutatingGoogleAdsChanges:false};
function row(overrides: Partial<OptimizationResult> = {}): OptimizationResult {
  const score = calculateSafetyScore({mismatchIsClear:true,mismatchCategory:"wrong_product",conversions:0,noPositiveKeywordOverlap:true,landingIntentAbsent:true,noQualifiedLeadSignal:true,hasPaidClicksOrSpend:true,meaningIsAmbiguous:false,requiresConfirmation:false});
  return {id:"1",searchTerm:"unrelated product",campaignId:"456",campaign:"Campaign",adGroupId:"123",adGroup:"Group",proposedAction:"negative exact",conversions:0,qualifiedLeads:0,safetyScore:score.total,scoreBreakdown:score.breakdown,hardGateFailures:["Account automation is disabled"],mismatchCategory:"wrong_product",dataRetrievedAt:new Date().toISOString(),executionStatus:"review-required",...overrides} as OptimizationResult;
}

test("legacy activation is removed on read without losing other blockers", () => {
  const eligible = applyAutomaticExclusionPolicy(row(), {source}, 90);
  assert.equal(eligible.executionEligibility, true);
  assert.equal(eligible.executionStatus, "eligible");
  assert.deepEqual(eligible.hardGateFailures, []);
  const blocked = applyAutomaticExclusionPolicy(row({qualifiedLeads:null}), {source}, 90);
  assert.equal(blocked.safetyScore, 90);
  assert.equal(blocked.executionEligibility, false);
  assert.equal(blocked.executionStatus, "review-required");
});

test("all mandatory blockers prevent automatic exclusion", () => {
  const variants: Partial<OptimizationResult>[] = [
    {conversions:1}, {qualifiedLeads:1}, {qualifiedLeads:null},
    {mismatchCategory:"other"}, {proposedAction:"negative phrase"},
    {adGroupId:null}, {searchTerm:"x".repeat(81)}, {searchTerm:Array(11).fill("word").join(" ")},
    {addedExcludedStatus:"EXCLUDED"}, {previousDecision:"keep"}, {reviewStatus:"pending"},
    {dataRetrievedAt:"invalid"}, {dataRetrievedAt:new Date(Date.now()+3600000).toISOString()},
    {dataRetrievedAt:new Date(Date.now()-49*3600000).toISOString()},
    {hardGateFailures:["Landing-page context did not load"]},
    {scoreBreakdown:[]},
  ];
  for (const variant of variants) assert.equal(applyAutomaticExclusionPolicy(row(variant),{source},90).executionEligibility,false,JSON.stringify(variant));
  for (const signal of ["Meaning is broad or ambiguous", "PM or client confirmation is required"]) {
    const original=row();
    assert.equal(isAutomaticExclusionEligible({...original,scoreBreakdown:original.scoreBreakdown.map(item=>item.signal===signal?{...item,applied:true,status:"yes"}:item)},{source},90),false);
  }
  assert.equal(isAutomaticExclusionEligible(row({safetyScore:89}),{source},90),false);
  assert.equal(isAutomaticExclusionEligible(row({safetyScore:95}),{source},96),false);
  assert.equal(isAutomaticExclusionEligible(row({safetyScore:NaN}),{source},90),false);
});

test("eligible accounts publish even when legacy activation and scheduling are disabled", async () => {
  for (const legacyEnabled of [false, undefined, true]) {
    const term=row(); let published=0;
    const result=await executeAutomaticExclusionsForBatch({jobId:"job",batchId:"batch",customerId:"1234567890"},{
      environment:{SEARCH_TERM_AUTOMATION_LIVE_PUBLISH_ENABLED:"true"},
      getSettings:async()=>({automaticExclusionEnabled:legacyEnabled,automationEnabled:false,autoSafeScoreThreshold:90} as SearchTermAccountSettings),
      loadRows:async()=>[{id:1,stable_term_key:stableSearchTermKey(term),result_json:term}],
      claim:async({candidates,mode})=>{assert.equal(candidates.length,1);assert.equal(mode,"live");return [{id:"action",campaign_id:"456",ad_group_id:"123",search_term:term.searchTerm,status:"pending",claim_attempt:1} as ClaimedAutomaticAction];},
      publish:async(_customer,terms,options)=>{published++;assert.equal(terms[0].action,"negative exact");assert.equal(options?.rejectPositiveExactOverlap,true);return {published:1,deduplicated:0,resourceNames:["resource"]};},
      complete:async()=>{},
    });
    assert.equal(published,1); assert.equal(result.disabled,false);
  }
});

test("manual and scheduled jobs retain the same batch completion path", async () => {
  const worker=await readFile("scripts/run-search-term-analysis-job.mjs","utf8");
  const commit=await readFile("scripts/commit-search-term-analysis-batch.mts","utf8");
  const workflow=await readFile(".github/workflows/search-term-optimization.yml","utf8");
  assert.match(worker,/commit-search-term-analysis-batch\.mts/);
  assert.match(commit,/executeAutomaticExclusionsForBatch/);
  assert.match(workflow,/vars\.SEARCH_TERM_AUTOMATION_LIVE_PUBLISH_ENABLED \|\| 'true'/);
});

test("a human decision from an earlier analysis blocks a fresh automatic claim", async (t) => {
  const previousUrl=process.env.SUPABASE_URL, previousKey=process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL="https://example.invalid"; process.env.SUPABASE_SECRET_KEY="test";
  t.after(()=>{if(previousUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=previousUrl;if(previousKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=previousKey;});
  const term=row(); const key=stableSearchTermKey(term);
  t.mock.method(globalThis,"fetch",async(input:unknown)=>{
    const url=String(input);
    if(url.includes("batch_id=eq.batch"))return Response.json([{id:1,stable_term_key:key,result_json:term,review_status:null,review_decision:null}]);
    if(url.includes("analysis_jobs!inner"))return Response.json([{stable_term_key:key}]);
    if(url.includes("analysis_runs!inner"))return Response.json([]);
    throw new Error(`Unexpected test request: ${url}`);
  });
  const result=await executeAutomaticExclusionsForBatch({jobId:"job",batchId:"batch",customerId:"1234567890"},{
    environment:{SEARCH_TERM_AUTOMATION_LIVE_PUBLISH_ENABLED:"true"},
    getSettings:async()=>({autoSafeScoreThreshold:90} as SearchTermAccountSettings),
    claim:async()=>assert.fail("A reviewed term must not be claimed"),
    publish:async()=>assert.fail("A reviewed term must not be published"),
  });
  assert.equal(result.claimed,0);
});
