import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { SignJWT } from "jose";
import { mcpPauseService, type McpPauseDependencies } from "./mcp-pause-service";
import { resolveTrustedIp } from "./request-context";
import { buildM03ProviderWorkflowPreview } from "./provider-workflow";
import type { M03ChangeRequestDetail } from "./types";

const actor="00000000-0000-4000-8000-000000000001",requestId="00000000-0000-4000-8000-000000000002",revisionId="00000000-0000-4000-8000-000000000003",service="00000000-0000-4000-8000-000000000004";
const env={M03_PAUSE_MCP_ENABLED:"true",M03_PAUSE_MCP_SERVICE_TOKEN:"s".repeat(40),M03_PAUSE_MCP_DELEGATION_KEY:"d".repeat(40),M03_PAUSE_MCP_SUBJECT:"fixture-actor",M03_PAUSE_MCP_ACTOR_ID:actor,M03_PAUSE_MCP_CONNECTION_REVISION:"fixture",M03_PAUSE_ENABLED:"approved-test-pilot",M03_PAUSE_ALLOWLIST:JSON.stringify([{actor_id:actor,platform:"google",account_identity:"2315114913",campaign_identity:"123"}]),DIGITALBEE_GRANT_VERIFY_URL:"https://digitalbee.example/v1/internal/grants/verify",DIGITALBEE_GRANT_VERIFY_TOKEN:"g".repeat(40)};
function fixture(realPreview=false,failures:{preview?:Error;grant?:Error;reconcile?:Error}={},baseline="PAUSED"){
 const item={id:"item",entity_type:"campaign",entity_identity:"123",field_path:"campaign.status",value_type:"string",baseline_value:baseline,proposed_value:"PAUSED",evidence:baseline==="ENABLED"?{m18_workflow_id:actor,m18_revision_id:revisionId,m18_receipt_id:requestId}:{},platform_resource_mapping:{}};
 const payload={platform:"google",account_identity:"2315114913",campaign_identity:"123",items:[item]},canonical=JSON.stringify(payload),hash=createHash("sha256").update(canonical).digest("hex");
 const detail={request:{id:requestId,platform:"google",account_identity:"2315114913",campaign_identity:"123",status:"awaiting_approval"},items:[item],source_verification:{platform:"google",provider_account_identity:"2315114913",provider_campaign_identity:"123"},revisions:[{id:revisionId,payload_hash:hash,canonical_payload:payload}],approvals:[]} as unknown as M03ChangeRequestDetail;
 let approvals=0,mutations=0,recoveries=0,revoked=false,receipts:Array<{id:string;operation_key:string;state:string;created_at:string;updated_at?:string;result?:unknown;readback?:unknown}>=[],disposition:null|{old_receipt_id:string;old_revision_id:string;old_revision_hash:string;new_request_id:string}=null;
 let providerStatus=baseline,providerReads=0,providerPauses=0;
 const dependencies={operator:async()=>revoked?null:{actor_id:actor,actor_email:"fixture@example.test",actor_name:"Fixture",actor_role:"admin",trusted_ip:"",user_agent:"fixture"},assertOperator:async()=>{},get:async()=>structuredClone(detail),integrity:async()=>({revision_id:revisionId,payload_hash:hash,canonical_text:canonical}),fetch:async(_url:unknown,init:RequestInit)=>{if(failures.grant)throw failures.grant;return Response.json({allowed:!revoked,...JSON.parse(String(init.body)),email:"fixture@example.test"});},
  preview:async(...args:Parameters<typeof buildM03ProviderWorkflowPreview>)=>{if(failures.preview)throw failures.preview;return realPreview?buildM03ProviderWorkflowPreview(...args):{conflict_issues:[],capability_issues:[]};},transport:async()=>({read:async()=>{providerReads++;return {account_id:"2315114913",campaign_id:"123",status:providerStatus};},pause:async()=>{providerPauses++;throw Error("Transport bypass forbidden");}}),
  receipts:async()=>receipts,disposition:async()=>disposition,
  recover:async(input:{requestId:string;revisionId:string;revisionHash:string;receiptId:string;items:{evidence:Record<string,unknown>}[]})=>{assert.equal(input.requestId,requestId);assert.equal(input.revisionId,revisionId);assert.equal(input.revisionHash,hash);assert.equal(input.receiptId,actor);assert.equal(input.items[0]?.evidence.m18_workflow_id,actor);recoveries++;disposition={old_receipt_id:actor,old_revision_id:revisionId,old_revision_hash:hash,new_request_id:service};return {old_request_id:requestId,new_request_id:service,already_recovered:false};},
  approve:async(_r:string,rev:string,h:string)=>{assert.equal(rev,revisionId);assert.equal(h,hash);approvals++;detail.request.status="approved";detail.approvals=[{id:actor,decision:"approved",created_at:"2026-10-14T00:00:00.000Z",revision_id:revisionId,revision_hash:hash}] as typeof detail.approvals;return{};},
  execute:async(input:{reconcileOnly:boolean;reauthorize:()=>Promise<void>})=>{await input.reauthorize();if(input.reconcileOnly&&failures.reconcile)throw failures.reconcile;if(input.reconcileOnly&&providerStatus!=="PAUSED")throw Error("Official campaign is not paused; reconciliation remains required.");if(!input.reconcileOnly&&!receipts.length)mutations++;receipts=[{id:actor,operation_key:"fixture-operation",state:"verified",created_at:new Date().toISOString()}];detail.request.status="verified";return{};},
  create:async()=>{throw Error("No create expected");},validate:async()=>{throw Error("Already validated");},boundary:async(input:{items:Array<{evidence:Record<string,unknown>}>})=>{const evidence={...input.items[0]!.evidence},payload={"campaign:123:campaign.status":"ENABLED"};return {source_kind:"legacy_provider_adoption",evidence,baseline:{canonical_payload:payload,payload_hash:createHash("sha256").update(JSON.stringify(payload)).digest("hex"),captured_at:new Date().toISOString()}};},
 } as unknown as McpPauseDependencies;
 async function call(action:string,token?:string,options:{bodyPatch?:Record<string,unknown>;scopePatch?:Record<string,unknown>;envPatch?:Record<string,string|undefined>;badBearer?:boolean}={}){
  const body={action,service_id:service,campaign_id:"123",request_id:requestId,idempotency_key:crypto.randomUUID(),...(token?{confirmation_token:token}:{}),...options.bodyPatch},raw=JSON.stringify(body);
  const scope={subject:"fixture-actor",grantRevision:1,accountPageId:service,clientId:service,platform:"Google",platformAccountId:"2315114913",campaignIdentity:"123",connectionRevision:"fixture",action:`m03_pause:${action}`,requestHash:createHash("sha256").update(raw).digest("base64url"),sessionBinding:"a".repeat(43),...options.scopePatch};
  const proof=await new SignJWT(scope).setProtectedHeader({alg:"HS256"}).setIssuer("digitalbee").setAudience("https://backend.example").setSubject("fixture-actor").setIssuedAt().setExpirationTime("30s").setJti(crypto.randomUUID()).sign(new TextEncoder().encode(env.M03_PAUSE_MCP_DELEGATION_KEY));
  return (await mcpPauseService(new Request("https://backend.example/api/service/digitalbee/m03-pause",{method:"POST",headers:{Authorization:options.badBearer?"Bearer wrong":`Bearer ${env.M03_PAUSE_MCP_SERVICE_TOKEN}`,"X-DigitalBee-Delegation":proof,"X-Connection-Revision":"fixture","x-vercel-id":"fixture","x-forwarded-for":"127.0.0.1",...(options.envPatch?.VERCEL==="1"?{"cf-ray":"fixture-worker-trace"}:{})},body:raw}),dependencies,{...env,...options.envPatch})).json();
 }
 return {call,detail,revoke:()=>{revoked=true;},counts:()=>({approvals,mutations}),recoveryCount:()=>recoveries,transportCounts:()=>({reads:providerReads,pauses:providerPauses}),setProviderStatus:(status:string)=>{providerStatus=status;},setAmbiguous:()=>{receipts=[{id:actor,operation_key:"fixture-operation",state:"ambiguous",created_at:new Date().toISOString()}];detail.request.status="publishing";},setVerifiedUnfinalized:()=>{receipts=[{id:actor,operation_key:"fixture-operation",state:"verified",created_at:new Date().toISOString(),readback:{verified_at:new Date(Date.now()-1200000).toISOString()}}];detail.request.status="approved";},setStarted:(age:number)=>{const created_at=new Date(Date.now()-age).toISOString();receipts=[{id:actor,operation_key:"fixture-operation",state:"started",created_at,updated_at:created_at}];detail.request.status="publishing";},setDisposition:()=>{disposition={old_receipt_id:actor,old_revision_id:revisionId,old_revision_hash:hash,new_request_id:service};}};
}
test("approval preparation uses the real scoped provider preview and preserves exact PAUSED-to-PAUSED authority without mutation",async()=>{
 const f=fixture(true),result=await f.call("prepare_approve",undefined,{envPatch:{VERCEL:"1"}});
 assert.equal(result.outcome,"prepared");assert.match(result.correlation_id,/^[a-f0-9-]{36}$/);
 assert.equal(result.display.request_id,requestId);assert.equal(result.display.revision_id,revisionId);
 assert.equal(result.display.revision_hash,f.detail.revisions[0]!.payload_hash);
 assert.equal(result.display.action,"approve");assert.equal(result.display.status,"awaiting_approval");
 assert.equal(result.display.baseline,"PAUSED");assert.equal(result.display.proposed,"PAUSED");
 assert.equal(typeof result.confirmation_token,"string");
 assert.deepEqual(f.counts(),{approvals:0,mutations:0});assert.deepEqual(f.transportCounts(),{reads:1,pauses:0});
});
test("real preparation preview blocks official baseline drift and retains a diagnostic correlation before any approval or pause",async()=>{
 const f=fixture(true);f.setProviderStatus("ENABLED");
 const result=await f.call("prepare_approve",undefined,{envPatch:{VERCEL:"1"}});
 assert.equal(result.outcome,"blocked");assert.equal(result.blocker,"baseline_or_capability_changed");
 assert.match(result.correlation_id,/^[a-f0-9-]{36}$/);assert.equal(result.provider_action,false);
 assert.equal(result.confirmation_token,undefined);assert.equal(f.detail.request.status,"awaiting_approval");
 assert.deepEqual(f.counts(),{approvals:0,mutations:0});assert.deepEqual(f.transportCounts(),{reads:1,pauses:0});
});
test("preparation state and operator denial remain distinct from provider preview failures without provider dispatch",async()=>{
 for(const blocker of ["state_changed","access_denied"]){
  const f=fixture(true);if(blocker==="state_changed")f.detail.request.status="approved";else f.revoke();
  const result=await f.call("prepare_approve",undefined,{envPatch:{VERCEL:"1"}});
  assert.equal(result.outcome,"blocked");assert.equal(result.blocker,blocker);assert.equal(result.provider_action,false);
  assert.match(result.correlation_id,/^[a-f0-9-]{36}$/);assert.equal(result.confirmation_token,undefined);
  assert.deepEqual(f.counts(),{approvals:0,mutations:0});assert.deepEqual(f.transportCounts(),{reads:0,pauses:0});
 }
});
test("unexpected preparation failures retain only safe stage/category and correlation in response and log",async()=>{
 const warnings:string[]=[],originalWarn=console.warn;
 console.warn=(value:unknown)=>{warnings.push(String(value));};
 try{
  for(const failure of [{stage:"provider_preview",category:"unexpected",options:{preview:Error("Bearer private-upstream-token")}},
   {stage:"grant_verification",category:"timeout",options:{grant:Object.assign(Error("private-grant-url-and-token"),{name:"TimeoutError"})}}]){
   const f=fixture(true,failure.options),result=await f.call("prepare_approve",undefined,{envPatch:{VERCEL:"1"}});
   assert.equal(result.outcome,"blocked");assert.equal(result.blocker,"request_failed");assert.equal(result.provider_action,false);
   assert.deepEqual(result.diagnostic,{stage:failure.stage,category:failure.category});
   assert.match(result.correlation_id,/^[a-f0-9-]{36}$/);
   const warning=JSON.parse(warnings.at(-1)!);
   assert.equal(warning.event,"m03_pause_failure");assert.equal(warning.correlation_id,result.correlation_id);
   assert.deepEqual(warning.diagnostic,result.diagnostic);
   assert.doesNotMatch(JSON.stringify({result,warning}),/private-upstream-token|private-grant-url|confirmation_token|Authorization|Bearer/);
   assert.deepEqual(f.counts(),{approvals:0,mutations:0});assert.equal(f.transportCounts().pauses,0);
  }
 }finally{console.warn=originalWarn;}
});
test("two separate private confirmations retain exact revision authority and never resend pause",async()=>{
 const f=fixture(),approve=await f.call("prepare_approve");assert.equal(approve.outcome,"prepared");assert.deepEqual(f.counts(),{approvals:0,mutations:0});
 assert.equal((await f.call("approve",approve.confirmation_token)).outcome,"success");assert.equal((await f.call("approve",approve.confirmation_token)).outcome,"success");assert.equal(f.counts().approvals,1);
 const pause=await f.call("prepare_pause");assert.equal(pause.outcome,"prepared");assert.equal(f.counts().mutations,0);
 assert.equal((await f.call("pause",pause.confirmation_token)).outcome,"success");assert.equal((await f.call("pause",pause.confirmation_token)).outcome,"success");assert.equal(f.counts().mutations,1);
 assert.equal((await f.call("read")).official_status,"PAUSED");assert.equal(f.counts().mutations,1);
});
test("Vercel-hosted MCP reads retain a trusted host address despite a Worker trace without a Cloudflare IP",async()=>{
 const f=fixture(),read=await f.call("read",undefined,{envPatch:{VERCEL:"1"}});
 assert.equal(read.outcome,"success");assert.equal(read.official_status,"PAUSED");assert.equal(read.provider_action,false);
 assert.deepEqual(f.counts(),{approvals:0,mutations:0});
 const request=(headers:Record<string,string>)=>new Request("https://backend.example",{headers});
 assert.equal(resolveTrustedIp(request({"cf-ray":"worker-trace","x-vercel-id":"host","x-forwarded-for":"192.0.2.12"}),"vercel"),"192.0.2.12");
 assert.equal(resolveTrustedIp(request({"cf-ray":"worker-trace","cf-connecting-ip":"198.51.100.22","x-vercel-id":"host","x-forwarded-for":"192.0.2.12"}),"vercel"),"192.0.2.12");
 assert.equal(resolveTrustedIp(request({"cf-ray":"worker-trace","cf-connecting-ip":"198.51.100.22"}),"vercel"),null);
 assert.equal(resolveTrustedIp(request({"x-vercel-id":"host","x-forwarded-for":"invalid"}),"vercel"),null);
 assert.equal(resolveTrustedIp(request({"cf-ray":"worker-trace","x-vercel-id":"host","x-forwarded-for":"192.0.2.12"})),null);
});
test("rejects mismatched account/campaign, actor, action, session and disabled controls",async()=>{
 for(const options of [{badBearer:true},{bodyPatch:{campaign_id:"999"}},{scopePatch:{subject:"foreign"}},{scopePatch:{action:"m03_pause:pause"}},{envPatch:{M03_PAUSE_MCP_ENABLED:"false"}},{envPatch:{M03_PAUSE_ALLOWLIST:"[]"}}]){
  const f=fixture(),result=await f.call("prepare_approve",undefined,options);assert.notEqual(result.outcome,"prepared");assert.deepEqual(f.counts(),{approvals:0,mutations:0});
 }
 const f=fixture(),prepared=await f.call("prepare_approve");assert.equal((await f.call("approve",prepared.confirmation_token,{scopePatch:{sessionBinding:"b".repeat(43)}})).outcome,"blocked");
});
test("revoked authorization and stale immutable evidence block confirmation",async()=>{
 const f=fixture(),prepared=await f.call("prepare_approve");f.revoke();assert.equal((await f.call("approve",prepared.confirmation_token)).outcome,"blocked");assert.equal(f.counts().approvals,0);
 const stale=fixture(),p=await stale.call("prepare_approve");stale.detail.items[0]!.proposed_value="ENABLED";assert.equal((await stale.call("approve",p.confirmation_token)).outcome,"blocked");assert.equal(stale.counts().approvals,0);
});
test("read reconciles an ambiguous attempted pause without dispatching a provider mutation",async()=>{
 const f=fixture(),prepared=await f.call("prepare_approve");await f.call("approve",prepared.confirmation_token);f.setAmbiguous();const read=await f.call("read");assert.equal(read.outcome,"success");assert.equal(read.display.status,"verified");assert.equal(read.provider_action,false);assert.equal(f.counts().mutations,0);
});
test("read finalizes a verified receipt left on an approved request without another provider pause",async()=>{
 const f=fixture(),prepared=await f.call("prepare_approve");await f.call("approve",prepared.confirmation_token);
 f.setVerifiedUnfinalized();const read=await f.call("read");
 assert.equal(read.outcome,"success");assert.equal(read.display.status,"verified");
 assert.equal(read.official_status,"PAUSED");assert.deepEqual(read.receipts,[{operation_key:"fixture-operation",state:"verified"}]);
 assert.equal(read.provider_action,false);assert.deepEqual(f.counts(),{approvals:1,mutations:0});assert.deepEqual(f.transportCounts(),{reads:1,pauses:0});
});
test("concurrent confirmation waits for its active claim; interrupted claims reconcile by readback only",async()=>{
 const f=fixture(),approval=await f.call("prepare_approve");await f.call("approve",approval.confirmation_token);
 const pause=await f.call("prepare_pause");f.setStarted(0);
 assert.equal((await f.call("pause",pause.confirmation_token)).outcome,"unknown");
 assert.equal((await f.call("read")).display.status,"publishing");assert.equal(f.counts().mutations,0);
 f.setStarted(180000);const recovered=await f.call("read");
 assert.equal(recovered.display.status,"verified");assert.equal(recovered.provider_action,false);assert.equal(f.counts().mutations,0);
});
test("aged started receipt with official ENABLED stays unresolved and reports the reconciliation stage",async()=>{
 const f=fixture(),approval=await f.call("prepare_approve");await f.call("approve",approval.confirmation_token);
 f.setStarted(180000);f.setProviderStatus("ENABLED");
 const read=await f.call("read");
 assert.equal(read.outcome,"success");assert.equal(read.official_status,"ENABLED");
 assert.equal(read.reconciliation_state,"pause_not_observed");assert.equal(read.retry_allowed,false);
 assert.deepEqual(read.receipts,[{operation_key:"fixture-operation",state:"started"}]);
 assert.deepEqual(f.counts(),{approvals:1,mutations:0});assert.equal(f.transportCounts().pauses,0);
});
test("a later reconciliation fault is diagnosed at its own stage after authorization succeeds",async()=>{
 const f=fixture(false,{reconcile:Error("private readback detail")}),approval=await f.call("prepare_approve");await f.call("approve",approval.confirmation_token);
 f.setStarted(180000);const read=await f.call("read");
 assert.equal(read.outcome,"blocked");assert.deepEqual(read.diagnostic,{stage:"receipt_reconciliation",category:"unexpected"});
 assert.equal(read.blocker,"request_failed");assert.equal(read.provider_action,false);assert.equal(f.transportCounts().pauses,0);
 assert.doesNotMatch(JSON.stringify(read),/private readback detail/);
});
test("a disposed old receipt stays started even after a separate request pauses the campaign",async()=>{
 const f=fixture(),approval=await f.call("prepare_approve");await f.call("approve",approval.confirmation_token);
 f.setStarted(900000);f.setDisposition();f.setProviderStatus("PAUSED");
 const read=await f.call("read");
 assert.equal(read.outcome,"success");assert.equal(read.reconciliation_state,"superseded");assert.equal(read.retry_allowed,false);
 assert.equal(read.new_request_id,service);assert.deepEqual(read.receipts,[{operation_key:"fixture-operation",state:"started"}]);
 assert.equal(f.transportCounts().pauses,0);assert.equal(f.counts().mutations,0);
});
test("recovery needs an aged claim, fresh ENABLED status, exact source and a separate human token",async()=>{
 const source={workflow_id:actor,revision_id:revisionId,receipt_id:requestId},key=crypto.randomUUID();
 const f=fixture(false,{},"ENABLED"),approval=await f.call("prepare_approve");await f.call("approve",approval.confirmation_token);
 f.setStarted(660000);
 const prepared=await f.call("prepare_recover",undefined,{bodyPatch:{source,idempotency_key:key}});
 assert.equal(prepared.outcome,"prepared");assert.equal(prepared.display.action,"recover");
 assert.equal(f.recoveryCount(),0);assert.equal(f.transportCounts().pauses,0);
 const wrong=await f.call("recover",prepared.confirmation_token,{bodyPatch:{source:{...source,receipt_id:service},idempotency_key:key}});
 assert.equal(wrong.outcome,"blocked");assert.equal(f.recoveryCount(),0);
 const confirmed=await f.call("recover",prepared.confirmation_token,{bodyPatch:{source,idempotency_key:key}});
 assert.equal(confirmed.outcome,"success");assert.equal(confirmed.new_request_id,service);assert.equal(f.recoveryCount(),1);
 const repeated=await f.call("recover",prepared.confirmation_token,{bodyPatch:{source,idempotency_key:key}});
 assert.equal(repeated.outcome,"success");assert.equal(repeated.already_recovered,true);assert.equal(f.recoveryCount(),1);
 const stale=await f.call("recover",prepared.confirmation_token,{bodyPatch:{source,idempotency_key:key},scopePatch:{sessionBinding:"b".repeat(43)}});
 assert.equal(stale.outcome,"blocked");assert.equal(stale.blocker,"stale_confirmation");assert.equal(f.recoveryCount(),1);
 f.setProviderStatus("PAUSED");const oldRead=await f.call("read");
 assert.equal(oldRead.reconciliation_state,"superseded");assert.equal(oldRead.receipts[0].state,"started");
 assert.equal(f.transportCounts().pauses,0);
});
test("recovery rejects young claims, changed official status and revoked scope without writes",async()=>{
 const source={workflow_id:actor,revision_id:revisionId,receipt_id:requestId},key=crypto.randomUUID();
 const f=fixture(false,{},"ENABLED"),approval=await f.call("prepare_approve");await f.call("approve",approval.confirmation_token);
 f.setStarted(540000);assert.equal((await f.call("prepare_recover",undefined,{bodyPatch:{source,idempotency_key:key}})).blocker,"recovery_not_eligible");
 f.setStarted(660000);f.setProviderStatus("PAUSED");assert.equal((await f.call("prepare_recover",undefined,{bodyPatch:{source,idempotency_key:key}})).blocker,"stale_official_status");
 f.setProviderStatus("ENABLED");const prepared=await f.call("prepare_recover",undefined,{bodyPatch:{source,idempotency_key:key}});
 assert.equal(prepared.outcome,"prepared");f.revoke();
 assert.equal((await f.call("recover",prepared.confirmation_token,{bodyPatch:{source,idempotency_key:key}})).blocker,"access_denied");
 assert.equal(f.recoveryCount(),0);assert.equal(f.transportCounts().pauses,0);
});

test("approval evidence is read from one durable row and stays distinct from provider receipts",async()=>{
 const f=fixture(),p=await f.call("prepare_approve"),confirmed=await f.call("approve",p.confirmation_token);
 assert.deepEqual(confirmed.approval_evidence,{approval_id:actor,revision_id:revisionId,revision_hash:f.detail.revisions[0]!.payload_hash,created_at:"2026-10-14T00:00:00.000Z"});
 const repeat=await f.call("approve",p.confirmation_token),read=await f.call("read");
 assert.deepEqual(repeat.approval_evidence,confirmed.approval_evidence);assert.deepEqual(read.approval_evidence,confirmed.approval_evidence);
 assert.equal(read.display.status,"approved");assert.equal(read.official_status,"PAUSED");assert.deepEqual(read.receipts,[]);assert.deepEqual(f.counts(),{approvals:1,mutations:0});assert.equal(f.transportCounts().pauses,0);
});
