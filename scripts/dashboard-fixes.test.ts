import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { completeCreativeReason } from "../lib/reporting/creative-reason";
import { safeReportUrl, youtubePreviewId } from "../lib/reporting/safe-report-url";
import { campaignTotalChanges } from "../lib/reporting/campaign-total-changes";
import { emptyCampaignRow, mergeCampaignRows } from "../lib/reporting/metrics";
import { parseRequestContext } from "../lib/reporting/request";
import { buildOverallReportCacheKey } from "../lib/reporting/overall-cache";
import { scopeGoogleAudienceQuery } from "../lib/reporting/google";
import { fetchMetaAudienceBreakdown } from "../lib/reporting/meta";
import { fetchWithTimeout, createAdvancedGeneration, advanceAdvancedGeneration, advancedAvailableSections, retryAdvancedChunk } from "../lib/reporting/advanced-report";
import { readAdvancedGeneration, saveAdvancedGeneration } from "../lib/reporting/advanced-generation-store";
import worker from "../cloudflare/advanced-report-cache/src/index";

const input = { accountId: "test-scope", country: "MY", startDate: "2026-09-01", endDate: "2026-09-30" };
test("complete reasons retain long text and decimal amounts; unfinished ellipses use fallback", () => {
  const reason = "RM71.96 CPA reflects the clear offer and visible e-invoice message. " + "The creative provides a useful benchmark for the next test. ".repeat(5);
  assert.equal(completeCreativeReason(reason), reason.trim());
  assert.equal(completeCreativeReason("unfinished…"), "");
  assert.equal(completeCreativeReason("unfinished..."), "");
});
test("safe destinations and validated YouTube IDs", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,x", "https://user:password@example.com", "file:///tmp/a"]) assert.equal(safeReportUrl(value), null);
  assert.equal(safeReportUrl("example.com/landing?q=1"), "https://example.com/landing?q=1");
  assert.equal(youtubePreviewId("https://youtu.be/abcdefghijk"), "abcdefghijk");
  assert.equal(youtubePreviewId("https://youtube.com.evil.test/watch?v=abcdefghijk"), null);
});
test("weighted grand-total rates and zero/missing comparison semantics", () => {
  const row = (impressions: number, clicks: number, spend: number, results: number) => ({ ...emptyCampaignRow("x", "google", "Search", "A"), impressions, clicks, spend, results });
  const current = mergeCampaignRows(row(0,0,0,0), row(1000,100,200,20));
  const previous = [row(100,20,40,4), row(900,30,60,6)];
  const changes = campaignTotalChanges(current, previous);
  assert.equal(changes.ctr, 100); // 10% versus 5%, rather than an average of row CTRs.
  assert.equal(changes.cpm, 100);
  assert.equal(changes.costPerResult, 0); // 200/20 versus 100/10.
  assert.equal(changes.spend, 100);
  assert.equal(campaignTotalChanges(current).spend, null);
  assert.equal(campaignTotalChanges(current, []).spend, null);
  assert.equal(campaignTotalChanges(row(0,0,0,0), [row(10,1,2,1)]).spend, -100);
  assert.equal(campaignTotalChanges(row(0,0,0,0), []).spend, 0);
  assert.equal(campaignTotalChanges(row(0,0,0,0), []).ctr, null);
});
test("filter inclusion/exclusion and clearing produce separate cache scopes", () => {
  const include = parseRequestContext(new URLSearchParams("googleAccountId=1234567890&campaignNameFilterValue=A&campaignNameFilterValue=B"));
  const exclude = parseRequestContext(new URLSearchParams("googleAccountId=1234567890&campaignNameFilterMode=exclude&campaignNameFilterValue=A"));
  const clear = parseRequestContext(new URLSearchParams("googleAccountId=1234567890"));
  assert.deepEqual(include.campaignNameFilter, { mode: "include", values: ["A","B"] });
  assert.equal(clear.campaignNameFilter, null);
  assert.notEqual(buildOverallReportCacheKey(include), buildOverallReportCacheKey(exclude));
  assert.notEqual(buildOverallReportCacheKey(include), buildOverallReportCacheKey(clear));
});
test("audience query uses exact campaign identities; empty selection cannot become account-wide", () => {
  assert.match(scopeGoogleAudienceQuery("SELECT metrics.clicks FROM age_range_view WHERE metrics.clicks > 0", ["12","34"]), /campaign.id IN \(12,34\)$/);
  assert.match(scopeGoogleAudienceQuery("SELECT metrics.clicks FROM age_range_view WHERE metrics.clicks > 0", []), /IN \(0\)$/);
  assert.throws(() => scopeGoogleAudienceQuery("query", ["1) OR TRUE"]));
});
test("Meta audience excludes unselected campaign clicks in every dimension", async () => {
  const calls: URL[] = [];
  mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    calls.push(new URL(String(url)));
    return Response.json({ data: [ { campaign_id: "1", clicks: "7", age: "25-34", gender: "male", country: "MY", region: "Selangor" }, { campaign_id: "2", clicks: "100", age: "25-34", gender: "male", country: "MY", region: "Selangor" } ] });
  });
  try {
    const result = await fetchMetaAudienceBreakdown({ accountId: "1", accessToken: "fixture", startDate: input.startDate!, endDate: input.endDate!, campaignIds: ["1"] });
    assert.equal(result.age.reduce((n,r) => n+r.clicks,0), 7);
    assert.equal(result.gender.reduce((n,r) => n+r.clicks,0), 7);
    assert.equal(result.location.country.reduce((n,r) => n+r.clicks,0), 7);
    assert.ok(calls.every(url => url.searchParams.get("fields")?.includes("campaign_id")));
  } finally { mock.restoreAll(); }
});
test("initial sections are pending; a completed source is published progressively", async () => {
  const state = createAdvancedGeneration(input);
  assert.deepEqual(advancedAvailableSections(state), []);
  state.steps = state.steps.filter(s => s.kind === "usage");
  await advanceAdvancedGeneration(state);
  assert.ok(advancedAvailableSections(state).includes("final-url-performance"));
});
test("transient AI failure retries in a separate invocation then exposes a fallback", async () => {
  const old = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "fixture";
  let requests = 0;
  mock.method(globalThis, "fetch", async () => { requests++; return new Response("busy", { status: 429 }); });
  try {
    const state = createAdvancedGeneration(input);
    state.steps = state.steps.filter(s => s.kind === "discovery");
    await advanceAdvancedGeneration(state);
    assert.equal(state.cursor,0);
    assert.equal(requests,1);
    assert.equal(state.steps[0].status,"retrying");
    await advanceAdvancedGeneration(state);
    assert.equal(requests,2);
    assert.equal(state.steps[0].status,"fallback");
    assert.ok(state.steps.some(s => s.kind === "discovery-review"));
    retryAdvancedChunk(state,state.steps[0].id);
    assert.equal(state.steps[state.cursor].attempt,0);
  } finally { mock.restoreAll(); if (old === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = old; }
});
test("revision checks resume progress and prevent stale regeneration writes", async () => {
  const state = createAdvancedGeneration({ ...input, accountId: "revision-fixture" });
  const revision = await saveAdvancedGeneration(state,null);
  assert.ok(revision);
  const stored = await readAdvancedGeneration(state.cacheKey);
  assert.equal(stored?.state.generationId,state.generationId);
  const next = createAdvancedGeneration(state.input);
  assert.ok(await saveAdvancedGeneration(next,revision));
  assert.equal(await saveAdvancedGeneration(state,revision),null);
  assert.equal((await readAdvancedGeneration(state.cacheKey))?.state.generationId,next.generationId);
});
function fakeCache() {
  const rows = new Map<string,{cache_key:string;r2_key:string}>();
  const objects = new Map<string,string>();
  const env = { ADVANCED_REPORT_CACHE_SECRET: "fixture", ADVANCED_REPORTS: {
    async put(key:string,value:string) { objects.set(key,value); }, async get(key:string) { const value=objects.get(key); return value===undefined?null:{async text(){return value;}}; }
  }, ADVANCED_REPORT_DB: {
    prepare(sql:string) { let values: unknown[]=[]; return {
      bind(...v:unknown[]) { values=v; return this; }, async first(){return rows.get(String(values[0]))??null;},
      async run(){ let changes=0;
        if(sql.startsWith("UPDATE")) { const row=rows.get(String(values[2])); if(row && row.r2_key===values[3]){row.r2_key=String(values[0]);changes=1;} }
        else if(sql.includes("SELECT ?,")) { if(rows.get(String(values[9]))?.r2_key===values[10]) { rows.set(String(values[0]),{cache_key:String(values[0]),r2_key:String(values[1])});changes=1; } }
        else if(!rows.has(String(values[0]))) { rows.set(String(values[0]),{cache_key:String(values[0]),r2_key:String(values[1])});changes=1; }
        return {meta:{changes}};
      }
    };}, async batch(statements:Array<{run:()=>Promise<unknown>}>){const result=[];for(const statement of statements)result.push(await statement.run());return result;}
  }};
  const put=(state:object, expected:string)=>worker.fetch(new Request("https://fixture/advanced-report-generation/report",{method:"PUT",headers:{Authorization:"Bearer fixture","If-Match":expected},body:JSON.stringify(state)}),env as never);
  return {env,put};
}
test("concurrent durable updates elect one revision; stale finalization cannot publish", async () => {
  const {env,put}=fakeCache();
  const state={generationId:"one",cacheKey:"report"};
  const first=await put(state,"*"); const rev=first.headers.get("ETag")!;
  const races=await Promise.all([put({...state,generationId:"two"},rev),put({...state,generationId:"three"},rev)]);
  assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);
  const stale=await put({...state,completePayload:{metadata:{cacheKey:"report"},warnings:[]}},rev);
  assert.equal(stale.status,409);
  const missing=await worker.fetch(new Request("https://fixture/advanced-report-cache/report",{headers:{Authorization:"Bearer fixture"}}),env as never);
  assert.equal(missing.status,404);
  const winner=races.find(r=>r.status===200)!;
  const final=await put({...state,generationId:"current",completePayload:{metadata:{cacheKey:"report"},warnings:[]}},winner.headers.get("ETag")!);
  assert.equal(final.status,200);
  const cached=await worker.fetch(new Request("https://fixture/advanced-report-cache/report",{headers:{Authorization:"Bearer fixture"}}),env as never);
  assert.equal(cached.status,200);
  assert.deepEqual(await cached.json(),{metadata:{cacheKey:"report"},warnings:[]});
});

test("default AI deadline allows a response body slower than eight seconds", async () => {
  const previous = process.env.ADVANCED_REPORT_AI_TIMEOUT_MS;
  delete process.env.ADVANCED_REPORT_AI_TIMEOUT_MS;
  mock.method(globalThis,"fetch",async (_url: string, options: RequestInit) => new Response(new ReadableStream({ start(controller) {
    const timer = setTimeout(() => { controller.enqueue(new TextEncoder().encode("complete")); controller.close(); }, 8100);
    options.signal?.addEventListener("abort", () => { clearTimeout(timer); controller.error(new Error("aborted")); });
  }})));
  try { assert.equal(await (await fetchWithTimeout("https://fixture",{})).text(),"complete"); }
  finally { mock.restoreAll(); if(previous===undefined)delete process.env.ADVANCED_REPORT_AI_TIMEOUT_MS;else process.env.ADVANCED_REPORT_AI_TIMEOUT_MS=previous; }
});
test("AI deadline covers body reading, not just response headers", async () => {
  const previous = process.env.ADVANCED_REPORT_AI_TIMEOUT_MS;
  process.env.ADVANCED_REPORT_AI_TIMEOUT_MS="20";
  mock.method(globalThis,"fetch",async (_url: string, options: RequestInit) => new Response(new ReadableStream({ start(controller) {
    options.signal?.addEventListener("abort", () => controller.error(new Error("body aborted")));
  }})));
  try { await assert.rejects(fetchWithTimeout("https://fixture",{}),/timed out after 20ms/); }
  finally { mock.restoreAll(); if(previous===undefined)delete process.env.ADVANCED_REPORT_AI_TIMEOUT_MS;else process.env.ADVANCED_REPORT_AI_TIMEOUT_MS=previous; }
});

test("actual report API validates generations and cursors while completing one claimed chunk", async () => {
  const { GET, POST } = await import("../app/api/reporting/advanced/route");
  const state = createAdvancedGeneration({ ...input, accountId: "api-fixture" });
  state.steps = state.steps.filter(step => step.kind === "finalize");
  assert.ok(await saveAdvancedGeneration(state,null));
  const params = new URLSearchParams({accountId:"api-fixture",country:"MY",startDate:input.startDate!,endDate:input.endDate!,reportMode:"advanced",reportType:"advanced"});
  const url = `https://fixture/api/reporting/advanced?${params}`;
  const body = Object.fromEntries(params);
  const invalid = await POST(new Request(url,{method:"POST",body:JSON.stringify({...body,generationId:state.generationId,cursor:"wrong"})}));
  assert.equal(invalid.status,409);
  const outcomes = await Promise.all([1,2].map(() => POST(new Request(url,{method:"POST",body:JSON.stringify({...body,generationId:state.generationId,cursor:state.steps[0].id})}))));
  assert.ok(outcomes.some(response => response.ok));
  const ready = await (await GET(new Request(url))).json();
  assert.equal(ready.status,"ready");
  assert.equal(ready.nextCursor,null);
  assert.ok(ready.payload.metadata.cached);
  const regenerated = await (await POST(new Request(url,{method:"POST",body:JSON.stringify({...body,regenerate:true})}))).json();
  assert.notEqual(regenerated.generationId,state.generationId);
  const stale = await POST(new Request(url,{method:"POST",body:JSON.stringify({...body,generationId:state.generationId,cursor:state.steps[0].id})}));
  assert.equal(stale.status,409);
  assert.equal((await stale.json()).generationId,regenerated.generationId);
});

test("service applies the same campaign filter to both summary periods and audience; clearing restores cached scope", async () => {
  const { getOverallSummaryStage, getOverallAudienceBreakdownStage } = await import("../lib/reporting/service");
  const previousToken = process.env.META_ACCESS_TOKEN;
  process.env.META_ACCESS_TOKEN = "fixture";
  mock.method(globalThis,"fetch",async (url: string | URL | Request) => {
    const parsed = new URL(String(url));
    if(parsed.searchParams.get("fields")==="name")return Response.json({name:"Fixture"});
    const range = JSON.parse(parsed.searchParams.get("time_range") ?? "{}");
    const prior = String(range.since).startsWith("2026-08");
    return Response.json({data:[1,2].map(id => ({ campaign_id:String(id), campaign_name:prior ? `Previous name ${id}` : `Campaign ${id===1?"A":"B"}`, objective:"OUTCOME_SALES",
      impressions:String(id*1000), clicks:String(id*50), spend:String(id*(prior?50:100)), actions:[{action_type:"purchase",value:String(id*10)}],
      age:"25-34",gender:"male",country:"MY",region:"Selangor" }))});
  });
  try {
    const scope = {accountId:null,metaAccountId:"111222333444",googleAccountId:null,startDate:input.startDate,endDate:input.endDate};
    const spend = async (filter: {mode:"include"|"exclude";values:string[]} | null) => (await getOverallSummaryStage({...scope,campaignNameFilter:filter})).summaries.find(s=>s.platform==="meta")!.metrics.find(m=>m.key==="spend")!;
    const included = await spend({mode:"include",values:["Campaign A"]});
    assert.equal(included.value,100); assert.equal(included.previousValue,50);assert.equal(included.delta,100);
    const excluded = await spend({mode:"exclude",values:["Campaign A"]});
    assert.equal(excluded.value,200);assert.equal(excluded.previousValue,100);
    const audience = await getOverallAudienceBreakdownStage({...scope,campaignNameFilter:{mode:"include",values:["Campaign A"]}});
    assert.equal(audience.audienceClickBreakdown.age.reduce((n,row)=>n+row.clicks,0),50);
    assert.equal((await spend(null)).value,300);
  } finally { mock.restoreAll();if(previousToken===undefined)delete process.env.META_ACCESS_TOKEN;else process.env.META_ACCESS_TOKEN=previousToken; }
});

test("failed creative analysis preserves metrics, marks fallback, and retains ranking after retry", async () => {
  const old = process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY="fixture";
  mock.method(globalThis,"fetch",async () => new Response("busy",{status:429}));
  try {
    const state=createAdvancedGeneration(input);
    state.googleImageCreativeRows=[0,1,2].map(i=>({id:`rank-${i}`,source:"image_ad" as const,campaignId:null,adGroupId:null,adGroupName:null,adType:"IMAGE_AD",adId:`ad-${i}`,assetId:`asset-${i}`,imageUrl:"https://example.com/image.png",finalUrl:"https://example.com/landing",campaignName:"Campaign A",adName:`Ad ${i}`,headline:null,description:null,cost:100,impressions:1000,clicks:100,conversions:10,ctr:10,cpa:10}));
    state.googleVisualCreativeAnalysis={generatedAt:new Date().toISOString(),rows:[0,2].map(i=>({id:`rank-${i}`,imageUrl:"https://example.com/image.png",finalUrl:"https://example.com/landing",campaignName:"Campaign A",adName:`Ad ${i}`,headline:null,description:null,spend:100,impressions:1000,clicks:100,conversions:10,ctr:10,cpa:10,reasons:["Existing completed reason."],analysisSource:"metric_fallback",aiStatus:"skipped"}))};
    state.steps=[{id:"image-retry",kind:"image-creative",index:1,attempt:0,status:"pending",label:"Image creative 2"}];
    await advanceAdvancedGeneration(state);await advanceAdvancedGeneration(state);
    assert.deepEqual(state.googleVisualCreativeAnalysis.rows.map(row=>row.id),["rank-0","rank-1","rank-2"]);
    const fallback=state.googleVisualCreativeAnalysis.rows[1];
    assert.equal(fallback.aiStatus,"fallback");assert.equal(fallback.spend,100);assert.equal(fallback.conversions,10);assert.equal(fallback.reasons.length,3);
  } finally {mock.restoreAll();if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});

test("explicit Meta platform preserves short account routing and separate cache identity", () => {
  const meta = createAdvancedGeneration({...input,accountId:"96906550",platform:"meta"});
  const inferred = createAdvancedGeneration({...input,accountId:"96906550"});
  assert.equal(meta.accountPlatform,"meta");assert.notEqual(meta.cacheKey,inferred.cacheKey);
});

test("overlapping unique outcomes do not get invented aggregate changes", () => {
  const row={...emptyCampaignRow("reach","meta","Awareness","Reach"),spend:100,results:100,resultLabel:"Reach",resultActionType:"reach",costPerResult:1000};
  assert.equal(campaignTotalChanges(row,[row,row],2).results,null);
  assert.equal(campaignTotalChanges(row,[row,row],2).costPerResult,null);
  assert.equal(campaignTotalChanges(row,[row],1).results,0);
});
