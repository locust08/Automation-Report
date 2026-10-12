import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { SignJWT } from "jose";
import { mcpPauseService, type McpPauseDependencies } from "./mcp-pause-service";
import { resolveTrustedIp } from "./request-context";
import type { M03ChangeRequestDetail } from "./types";

const actor="00000000-0000-4000-8000-000000000001",requestId="00000000-0000-4000-8000-000000000002",revisionId="00000000-0000-4000-8000-000000000003",service="00000000-0000-4000-8000-000000000004";
const env={M03_PAUSE_MCP_ENABLED:"true",M03_PAUSE_MCP_SERVICE_TOKEN:"s".repeat(40),M03_PAUSE_MCP_DELEGATION_KEY:"d".repeat(40),M03_PAUSE_MCP_SUBJECT:"fixture-actor",M03_PAUSE_MCP_ACTOR_ID:actor,M03_PAUSE_MCP_CONNECTION_REVISION:"fixture",M03_PAUSE_ENABLED:"approved-test-pilot",M03_PAUSE_ALLOWLIST:JSON.stringify([{actor_id:actor,platform:"google",account_identity:"2315114913",campaign_identity:"123"}]),DIGITALBEE_GRANT_VERIFY_URL:"https://digitalbee.example/v1/internal/grants/verify",DIGITALBEE_GRANT_VERIFY_TOKEN:"g".repeat(40)};
function fixture(){
 const item={id:"item",entity_type:"campaign",entity_identity:"123",field_path:"campaign.status",value_type:"string",baseline_value:"PAUSED",proposed_value:"PAUSED",evidence:{},platform_resource_mapping:{}};
 const payload={platform:"google",account_identity:"2315114913",campaign_identity:"123",items:[item]},canonical=JSON.stringify(payload),hash=createHash("sha256").update(canonical).digest("hex");
 const detail={request:{id:requestId,platform:"google",account_identity:"2315114913",campaign_identity:"123",status:"awaiting_approval"},items:[item],source_verification:{platform:"google",provider_account_identity:"2315114913",provider_campaign_identity:"123"},revisions:[{id:revisionId,payload_hash:hash,canonical_payload:payload}],approvals:[]} as unknown as M03ChangeRequestDetail;
 let approvals=0,mutations=0,revoked=false,receipts:Array<{operation_key:string;state:string;updated_at?:string}>=[];
 const dependencies={operator:async()=>revoked?null:{actor_id:actor,actor_email:"fixture@example.test",actor_name:"Fixture",actor_role:"admin",trusted_ip:"",user_agent:"fixture"},assertOperator:async()=>{},get:async()=>structuredClone(detail),integrity:async()=>({revision_id:revisionId,payload_hash:hash,canonical_text:canonical}),fetch:async(_url:unknown,init:RequestInit)=>Response.json({allowed:!revoked,...JSON.parse(String(init.body)),email:"fixture@example.test"}),
  preview:async()=>({conflict_issues:[],capability_issues:[]}),transport:async()=>({read:async()=>({account_id:"2315114913",campaign_id:"123",status:"PAUSED"}),pause:async()=>{throw Error("Transport bypass forbidden");}}),
  receipts:async()=>receipts,
  approve:async(_r:string,rev:string,h:string)=>{assert.equal(rev,revisionId);assert.equal(h,hash);approvals++;detail.request.status="approved";detail.approvals=[{revision_id:revisionId,revision_hash:hash}] as typeof detail.approvals;return{};},
  execute:async(input:{reconcileOnly:boolean;reauthorize:()=>Promise<void>})=>{await input.reauthorize();if(!input.reconcileOnly&&!receipts.length)mutations++;receipts=[{operation_key:"fixture-operation",state:"verified"}];detail.request.status="verified";return{};},
  create:async()=>{throw Error("No create expected");},validate:async()=>{throw Error("Already validated");},boundary:async()=>{throw Error("No adoption expected");},
 } as unknown as McpPauseDependencies;
 async function call(action:string,token?:string,options:{bodyPatch?:Record<string,unknown>;scopePatch?:Record<string,unknown>;envPatch?:Record<string,string|undefined>;badBearer?:boolean}={}){
  const body={action,service_id:service,campaign_id:"123",request_id:requestId,idempotency_key:crypto.randomUUID(),...(token?{confirmation_token:token}:{}),...options.bodyPatch},raw=JSON.stringify(body);
  const scope={subject:"fixture-actor",grantRevision:1,accountPageId:service,clientId:service,platform:"Google",platformAccountId:"2315114913",campaignIdentity:"123",connectionRevision:"fixture",action:`m03_pause:${action}`,requestHash:createHash("sha256").update(raw).digest("base64url"),sessionBinding:"a".repeat(43),...options.scopePatch};
  const proof=await new SignJWT(scope).setProtectedHeader({alg:"HS256"}).setIssuer("digitalbee").setAudience("https://backend.example").setSubject("fixture-actor").setIssuedAt().setExpirationTime("30s").setJti(crypto.randomUUID()).sign(new TextEncoder().encode(env.M03_PAUSE_MCP_DELEGATION_KEY));
  return (await mcpPauseService(new Request("https://backend.example/api/service/digitalbee/m03-pause",{method:"POST",headers:{Authorization:options.badBearer?"Bearer wrong":`Bearer ${env.M03_PAUSE_MCP_SERVICE_TOKEN}`,"X-DigitalBee-Delegation":proof,"X-Connection-Revision":"fixture","x-vercel-id":"fixture","x-forwarded-for":"127.0.0.1",...(options.envPatch?.VERCEL==="1"?{"cf-ray":"fixture-worker-trace"}:{})},body:raw}),dependencies,{...env,...options.envPatch})).json();
 }
 return {call,detail,revoke:()=>{revoked=true;},counts:()=>({approvals,mutations}),setAmbiguous:()=>{receipts=[{operation_key:"fixture-operation",state:"ambiguous"}];detail.request.status="publishing";},setStarted:(age:number)=>{receipts=[{operation_key:"fixture-operation",state:"started",updated_at:new Date(Date.now()-age).toISOString()}];detail.request.status="publishing";}};
}
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
test("concurrent confirmation waits for its active claim; interrupted claims reconcile by readback only",async()=>{
 const f=fixture(),approval=await f.call("prepare_approve");await f.call("approve",approval.confirmation_token);
 const pause=await f.call("prepare_pause");f.setStarted(0);
 assert.equal((await f.call("pause",pause.confirmation_token)).outcome,"unknown");
 assert.equal((await f.call("read")).display.status,"publishing");assert.equal(f.counts().mutations,0);
 f.setStarted(180000);const recovered=await f.call("read");
 assert.equal(recovered.display.status,"verified");assert.equal(recovered.provider_action,false);assert.equal(f.counts().mutations,0);
});
