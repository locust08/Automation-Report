import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import {canonicalM03Hash} from "../../../lib/change-control/provider-contract";
import { handle, type Env } from "./handler";
import type { McpPauseDependencies } from "../../../lib/change-control/mcp-pause-service";
import { getM03McpOperator, assertM03Operator, createM03ExecutionStore } from "../../../lib/change-control/repository";
import { withM03RuntimeEnvironment, m03RuntimeEnvironment } from "../../../lib/change-control/runtime-environment";
import { getCredentials } from "../../../lib/reporting/env";

const actor="00000000-0000-4000-8000-000000000001",requestId="00000000-0000-4000-8000-000000000002",revisionId="00000000-0000-4000-8000-000000000003",service="00000000-0000-4000-8000-000000000004";
function fixture() {
 const env:Env={M03_WORKER_ENABLED:"true",M03_CANONICAL_ORIGIN:"https://m03.example",M03_PAUSE_MCP_ENABLED:"true",M03_PAUSE_MCP_SERVICE_TOKEN:"s".repeat(40),M03_PAUSE_MCP_DELEGATION_KEY:"d".repeat(40),M03_PAUSE_MCP_SUBJECT:"fixture",M03_PAUSE_MCP_ACTOR_ID:actor,M03_PAUSE_MCP_CONNECTION_REVISION:"fixture",M03_PAUSE_ENABLED:"approved-test-pilot",M03_PAUSE_ALLOWLIST:JSON.stringify([{actor_id:actor,platform:"google",account_identity:"2315114913",campaign_identity:"123"}]),DIGITALBEE_GRANT_VERIFY_URL:"https://authority.example/v1/internal/grants/verify",DIGITALBEE_GRANT_VERIFY_TOKEN:"g".repeat(40)};
 const item={id:"item",entity_type:"campaign",entity_identity:"123",field_path:"campaign.status",value_type:"string",baseline_value:"PAUSED",proposed_value:"PAUSED",evidence:{},platform_resource_mapping:{}};
 const payload={platform:"google",account_identity:"2315114913",campaign_identity:"123",items:[item]},canonical=JSON.stringify(payload),hash=createHash("sha256").update(canonical).digest("hex");
 const detail={request:{id:requestId,platform:"google",account_identity:"2315114913",campaign_identity:"123",status:"awaiting_approval"},items:[item],source_verification:{platform:"google",provider_account_identity:"2315114913",provider_campaign_identity:"123"},revisions:[{id:revisionId,payload_hash:hash,canonical_payload:payload}],approvals:[] as {id:string;decision:"approved";created_at:string;revision_id:string;revision_hash:string}[]};
 let authorizedActor=actor;
 let approvals=0,mutations=0,reads=0,operatorAllowed=true,grantAllowed=true,revoked=false,claims=false;
 const ips:string[]=[],grants:Record<string,unknown>[]=[];
 env.DIGITALBEE_AUTHORITY={fetch:async(input,init)=>{assert.equal(String(input),env.DIGITALBEE_GRANT_VERIFY_URL);const g=JSON.parse(String(init?.body));assert.equal(g.networkContext,undefined);grants.push(g);return Response.json({...g,allowed:grantAllowed,email:"fixture@example.test"});}};
 const deps={operator:async()=>revoked?null:{actor_id:authorizedActor,actor_email:"fixture@example.test",actor_name:"Fixture",actor_role:"admin",trusted_ip:"",user_agent:"fixture"},assertOperator:async(ctx:{trusted_ip:string})=>{ips.push(ctx.trusted_ip);if(!operatorAllowed||!["203.0.113.8","203.0.113.9"].includes(ctx.trusted_ip))throw Error("access_denied");},get:async()=>structuredClone(detail),integrity:async()=>({revision_id:revisionId,payload_hash:hash,canonical_text:canonical}),fetch:async()=>{throw Error("Public authority fallback forbidden");},preview:async()=>({conflict_issues:[],capability_issues:[]}),transport:async()=>({read:async()=>{reads++;return {account_id:"2315114913",campaign_id:"123",status:"PAUSED"};},pause:async()=>{throw Error("Bypass forbidden");}}),receipts:async()=>claims?[{operation_key:"fixture-operation",state:"verified"}]:[],approve:async()=>{approvals++;detail.request.status="approved";detail.approvals=[{id:actor,decision:"approved",created_at:"2026-10-14T00:00:00+00:00",revision_id:revisionId,revision_hash:hash}];},execute:async(input:{reauthorize:()=>Promise<void>;reconcileOnly:boolean})=>{await input.reauthorize();if(!claims&&!input.reconcileOnly)mutations++;claims=true;detail.request.status="verified";},create:async()=>{throw Error("unexpected adoption");},validate:async()=>{throw Error("unexpected validate");},boundary:async()=>{throw Error("unexpected source");}} as unknown as McpPauseDependencies;
 async function call(action:string,token?:string,options:{scope?:Record<string,unknown>;body?:Record<string,unknown>;audience?:string;env?:Record<string,unknown>;bearer?:string;unsigned?:boolean}={}) {
  const raw=JSON.stringify({action,service_id:service,campaign_id:"123",request_id:requestId,idempotency_key:crypto.randomUUID(),...(token?{confirmation_token:token}:{}),...options.body});
  const scope={subject:"fixture",grantRevision:1,accountPageId:service,clientId:service,platform:"Google",platformAccountId:"2315114913",campaignIdentity:"123",connectionRevision:"fixture",action:`m03_pause:${action}`,requestHash:createHash("sha256").update(raw).digest("base64url"),sessionBinding:"a".repeat(43),networkContext:{source:"cloudflare-ingress",ip:"203.0.113.8"},...options.scope};
  const proof=await new SignJWT(scope).setProtectedHeader({alg:"HS256"}).setIssuer("digitalbee").setAudience(options.audience??"https://m03.example").setSubject("fixture").setIssuedAt().setExpirationTime("30s").setJti(crypto.randomUUID()).sign(new TextEncoder().encode(String(env.M03_PAUSE_MCP_DELEGATION_KEY)));
  const response=await handle(new Request("https://private-binding.invalid/api/service/digitalbee/m03-pause",{method:"POST",headers:{Authorization:options.bearer??`Bearer ${env.M03_PAUSE_MCP_SERVICE_TOKEN}`,"X-DigitalBee-Delegation":options.unsigned?"unsigned":proof,"X-Connection-Revision":"fixture","cf-ray":"spoof","cf-connecting-ip":"127.0.0.1","x-vercel-id":"spoof","x-forwarded-for":"127.0.0.1"},body:raw}),{...env,...options.env},deps);
  return response.json();
 }
 return {env,call,detail,ips,grants,changeActor:()=>authorizedActor=service,denyOperator:()=>operatorAllowed=false,denyGrant:()=>grantAllowed=false,revoke:()=>revoked=true,counts:()=>({approvals,mutations,reads})};
}
test("private binding uses canonical audience, signed network and current authority; separate cards retain exact immutable state",async()=>{
 const f=fixture();const read=await f.call("read");assert.equal(read.outcome,"success");assert.equal(read.display.revision_hash,f.detail.revisions[0]!.payload_hash);
 const prepared=await f.call("prepare_approve");assert.equal(prepared.outcome,"prepared");assert.equal(prepared.display.action,"approve");
 const approved=await f.call("approve",prepared.confirmation_token);assert.equal(approved.outcome,"success");assert.equal(f.counts().mutations,0);
 const pause=await f.call("prepare_pause");assert.equal(pause.outcome,"prepared");assert.equal(pause.display.action,"pause");
 assert.equal((await f.call("pause",pause.confirmation_token)).outcome,"success");await f.call("pause",pause.confirmation_token);
 assert.equal(f.counts().approvals,1);assert.equal(f.counts().mutations,1);assert(f.ips.every(ip=>ip==="203.0.113.8"));assert(f.grants.length>4);
});
test("missing/malformed network, body/action/revision/subject/audience/session tampering and wrong bearer fail before provider calls",async()=>{
 for(const options of [{scope:{networkContext:undefined}},{scope:{networkContext:{source:"cloudflare-ingress",ip:"127.0.0.1,1.2.3.4"}}},{scope:{networkContext:{source:"user",ip:"203.0.113.8"}}},{scope:{action:"m03_pause:pause"}},{scope:{connectionRevision:"stale"}},{scope:{subject:"other"}},{scope:{requestHash:"wrong"}},{audience:"https://other.example"},{bearer:"Bearer wrong"}]) {
  const f=fixture(),r=await f.call("prepare_approve",undefined,options);assert.equal(r.outcome,"blocked");assert.equal(r.provider_action,false);assert.equal(r.confirmation_token,undefined);assert.deepEqual(f.counts(),{approvals:0,mutations:0,reads:0});
 }
 const f=fixture(),p=await f.call("prepare_approve");const r=await f.call("approve",p.confirmation_token,{scope:{sessionBinding:"b".repeat(43)}});assert.equal(r.blocker,"stale_confirmation");assert.deepEqual(r.binding_mismatch,["session"]);assert.equal(f.counts().approvals,0);
 const moved=await f.call("approve",p.confirmation_token,{scope:{networkContext:{source:"cloudflare-ingress",ip:"203.0.113.9"}}});assert.equal(moved.outcome,"success");assert.equal(f.counts().approvals,1);assert.equal(f.counts().mutations,0);
});
test("current operator/domain policy, grant revocation and operator revocation remain mandatory",async()=>{
 for(const deny of ["denyOperator","denyGrant","revoke"] as const){const f=fixture();f[deny]();const r=await f.call("read");assert.equal(r.outcome,"blocked");assert.equal(r.provider_action,false);assert.equal(f.counts().reads,0);}
});
test("disabled Worker, missing binding, unsafe canonical URL and oversized payload fail closed",async()=>{
 const f=fixture();for(const env of [{M03_WORKER_ENABLED:"false"},{DIGITALBEE_AUTHORITY:undefined},{M03_CANONICAL_ORIGIN:"http://m03.example"},{M03_CANONICAL_ORIGIN:"https://m03.example/"}])assert.equal((await f.call("read",undefined,{env})).outcome,"locked");
 const r=await f.call("read",undefined,{body:{extra:"x".repeat(17000)}});assert.equal(r.blocker,"invalid_request");assert.equal(f.counts().reads,0);
});
test("oversized grant decision fails before provider calls and leaks no authority response",async()=>{
 const f=fixture();f.env.DIGITALBEE_AUTHORITY={fetch:async()=>new Response('private-authority-response'.repeat(2000))};
 const r=await f.call("read");assert.equal(r.outcome,"blocked");assert.equal(f.counts().reads,0);assert.equal(JSON.stringify(r).includes('private-authority-response'),false);
});
test("request-local environment does not leak concurrent Supabase/provider credentials into process.env",async()=>{
 const original=process.env.GOOGLE_OAUTH_CLIENT_SECRET;
 await Promise.all(["first","second"].map(secret=>withM03RuntimeEnvironment({GOOGLE_OAUTH_CLIENT_SECRET:secret},async()=>{await new Promise(resolve=>setTimeout(resolve,5));assert.equal(getCredentials(m03RuntimeEnvironment()).googleClientSecret,secret);assert.equal(m03RuntimeEnvironment().GOOGLE_OAUTH_CLIENT_SECRET,secret);})));assert.equal(process.env.GOOGLE_OAUTH_CLIENT_SECRET,original);
});
test("Supabase server credentials cannot be sent to another project, insecure origin, or redirect",async()=>{
 for(const url of ["http://gsmxeosdjsbujhiwhbzk.supabase.co", "https://other.supabase.co", "https://gsmxeosdjsbujhiwhbzk.supabase.co/path", "https://user:pass@gsmxeosdjsbujhiwhbzk.supabase.co"])
  await assert.rejects(withM03RuntimeEnvironment({SUPABASE_URL:url,SUPABASE_SECRET_KEY:"sb_secret_synthetic_key_for_tests_only"},()=>getM03McpOperator(actor)));
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(_input,init)=>{calls++;assert.equal(init?.redirect,"manual");return new Response("",{status:302,headers:{Location:"https://other.example"}});};
 try{await assert.rejects(withM03RuntimeEnvironment({SUPABASE_URL:"https://gsmxeosdjsbujhiwhbzk.supabase.co",SUPABASE_SECRET_KEY:"sb_secret_synthetic_key_for_tests_only"},()=>getM03McpOperator(actor)));assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test("Supabase operator/network/claim RPC contracts use the same project, context and deterministic operation hashes",async()=>{
 const previous=globalThis.fetch,calls:{url:string;init:RequestInit}[]=[];
 globalThis.fetch=async(input,init)=>{calls.push({url:String(input),init:init!});if(String(input).includes("ads_reporting_auth?"))return Response.json([{user_id:actor,email:"fixture@example.test",full_name:"Fixture",role:"admin",is_active:true}]);if(String(input).includes("claim_execution"))return Response.json({acquired:false,receipt:{state:"verified",operation_hash:"hash",claim_token:"existing"}});return Response.json({});};
 try {await withM03RuntimeEnvironment({SUPABASE_URL:"https://gsmxeosdjsbujhiwhbzk.supabase.co",SUPABASE_SECRET_KEY:"sb_secret_synthetic_key_for_tests_only"},async()=>{
  const context=(await getM03McpOperator(actor))!;context.trusted_ip="203.0.113.8";await assertM03Operator(context);
  const store=createM03ExecutionStore({requestId,revisionId,revisionHash:"h".repeat(64),context});const operation={operation_key:"stable-operation",depends_on:[]} as unknown as Parameters<typeof store.claim>[0];const result=await store.claim(operation);assert.equal(result.acquired,false);
 });assert(calls.every(c=>c.url.startsWith("https://gsmxeosdjsbujhiwhbzk.supabase.co/rest/v1/")));assert.equal(JSON.parse(String(calls[1]!.init.body)).p_trusted_ip,"203.0.113.8");assert.equal(JSON.parse(String(calls[2]!.init.body)).p_request_id,requestId);assert.match(JSON.parse(String(calls[2]!.init.body)).p_operation_hash,/^[a-f0-9]{64}$/);assert.equal(new Headers(calls[0]!.init.headers).get("apikey"),"sb_secret_synthetic_key_for_tests_only");}
 finally{globalThis.fetch=previous;}
});

test("diagnostic tags remain private and legacy tokens retain exact-IP validation",async()=>{
 const f=fixture(),p=await f.call("prepare_approve"),key=new TextEncoder().encode(String(f.env.M03_PAUSE_MCP_DELEGATION_KEY));
 const {payload}=await jwtVerify(p.confirmation_token,key);const {binding_tags,binding_nonce,version,...legacy}=payload;
 legacy.scope_hash=canonicalM03Hash({platform:"google",account_identity:"2315114913",campaign_identity:"123",subject:"fixture",actor_id:actor,grantRevision:1,service_id:service,client_id:service,connectionRevision:"fixture",sessionBinding:"a".repeat(43),networkContext:{source:"cloudflare-ingress",ip:"203.0.113.8"},canonicalOrigin:"https://m03.example"});
 assert.equal(version,2);assert.equal(typeof binding_nonce,"string");assert.equal(Object.keys(binding_tags as object).length,15);
 const token=await new SignJWT(legacy).setProtectedHeader({alg:"HS256"}).sign(key);
 const moved=await f.call("approve",token,{scope:{networkContext:{source:"cloudflare-ingress",ip:"203.0.113.9"}}});
 assert.equal(moved.blocker,"stale_confirmation");assert.deepEqual(moved.binding_mismatch,["scope_hash"]);assert.equal(f.counts().approvals,0);
 const diagnosticLegacy=await new SignJWT({...legacy,binding_tags,binding_nonce}).setProtectedHeader({alg:"HS256"}).sign(key);
 const diagnosticMoved=await f.call("approve",diagnosticLegacy,{scope:{networkContext:{source:"cloudflare-ingress",ip:"203.0.113.9"}}});assert.deepEqual(diagnosticMoved.binding_mismatch,["ingress_ip"]);assert.equal(diagnosticMoved.blocker,"stale_confirmation");
 assert.equal((await f.call("approve",token)).outcome,"success");assert.equal(f.counts().approvals,1);assert.equal(f.counts().mutations,0);
});
test("fresh diagnostic confirmations retain grant and expiry checks without provider mutation",async()=>{
 const f=fixture(),p=await f.call("prepare_approve");
 const changed=await f.call("approve",p.confirmation_token,{scope:{grantRevision:2}});assert.equal(changed.blocker,"stale_confirmation");assert.deepEqual(changed.binding_mismatch,["grant_revision"]);
 const key=new TextEncoder().encode(String(f.env.M03_PAUSE_MCP_DELEGATION_KEY)),{payload}=await jwtVerify(p.confirmation_token,key);
 const expired=await new SignJWT({...payload,iat:Math.floor(Date.now()/1000)-400,exp:Math.floor(Date.now()/1000)-100}).setProtectedHeader({alg:"HS256"}).sign(key);
 assert.equal((await f.call("approve",expired)).outcome,"blocked");assert.equal(f.counts().approvals,0);assert.equal(f.counts().mutations,0);
});

test("v2 permits separately authorized proxy rotation while keeping unapproved/unsigned ingress and stop controls blocked",async()=>{
 const f=fixture(),p=await f.call("prepare_approve"),key=new TextEncoder().encode(String(f.env.M03_PAUSE_MCP_DELEGATION_KEY)),{payload}=await jwtVerify(p.confirmation_token,key);
 assert.equal(payload.version,2);
 for(const options of [{unsigned:true},{scope:{networkContext:{source:"cloudflare-ingress",ip:"203.0.113.10"}}},{scope:{networkContext:undefined}},{scope:{networkContext:{source:"spoofed",ip:"203.0.113.9"}}},{env:{M03_WORKER_ENABLED:"false"}},{env:{M03_PAUSE_MCP_ENABLED:"false"}}]){
  const rejected=await f.call("approve",p.confirmation_token,options);assert.notEqual(rejected.outcome,"success");assert.equal(f.counts().approvals,0);assert.equal(f.counts().mutations,0);
 }
 const moved=await f.call("approve",p.confirmation_token,{scope:{networkContext:{source:"cloudflare-ingress",ip:"203.0.113.9"}}});assert.equal(moved.outcome,"success");
 await f.call("approve",p.confirmation_token);assert.equal(f.counts().approvals,1);assert.equal(f.counts().mutations,0);assert(f.ips.includes("203.0.113.8")&&f.ips.includes("203.0.113.9"));
 const read=await f.call("read");assert.deepEqual(read.approval_evidence,moved.approval_evidence);assert.equal(read.approval_evidence.approval_id,actor);assert.equal(read.approval_evidence.revision_id,revisionId);assert.equal(read.display.status,"approved");assert.equal(read.official_status,"PAUSED");assert.deepEqual(read.receipts,[]);assert.equal(read.provider_action,false);
});
test("v2 rotation cannot authorize changed stable bindings or immutable evidence",async()=>{
 for(const scope of [{sessionBinding:"b".repeat(43)},{grantRevision:2},{clientId:actor},{campaignIdentity:"999"},{subject:"other"},{connectionRevision:"changed"}]){
  const f=fixture(),p=await f.call("prepare_approve");const result=await f.call("approve",p.confirmation_token,{scope:{...scope,networkContext:{source:"cloudflare-ingress",ip:"203.0.113.9"}}});assert.equal(result.outcome,"blocked");assert.equal(f.counts().approvals,0);assert.equal(f.counts().mutations,0);
  assert(!result.binding_mismatch?.includes("ingress_ip"));
 }
 const f=fixture(),p=await f.call("prepare_approve");f.detail.revisions[0]!.id=actor;assert.equal((await f.call("approve",p.confirmation_token)).outcome,"blocked");assert.equal(f.counts().approvals,0);
});

test("v2 rejects an authoritative actor change and revision hash change before approval",async()=>{
 for(const change of ["actor","revision_hash"]){const f=fixture(),p=await f.call("prepare_approve");if(change==="actor")f.changeActor();else f.detail.revisions[0]!.payload_hash="b".repeat(64);
  assert.equal((await f.call("approve",p.confirmation_token)).outcome,"blocked");assert.equal(f.counts().approvals,0);assert.equal(f.counts().mutations,0);
 }
});
