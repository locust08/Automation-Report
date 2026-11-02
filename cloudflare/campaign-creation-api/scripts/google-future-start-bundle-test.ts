import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {SignJWT} from 'jose';
import {Store} from '../src/store';
import {ActionStore} from '../src/action-store';
import {digest,type Scope,type Plan} from '../src/contracts';

// Run after `wrangler deploy --dry-run --outdir ../../outputs/gate2-repair/bundle`.
// All external services are intercepted; only the actual bundled Worker runs in workerd.
async function testBundle(){
 let futureFlow=false;
 const scope:Scope={subject:'synthetic-actor',grantRevision:1,accountPageId:'00000000-0000-4000-8000-000000000001',clientId:'00000000-0000-4000-8000-000000000002',platform:'Google',platformAccountId:'2315114913',connectionRevision:'test',providerRevision:'test'};
 const plan:Plan={campaign_type:'search',name:'Bundle fixture',currency:'MYR',timezone:'Asia/Kuala_Lumpur',daily_budget:'10',final_url:'https://example.com/',locations:['geoTargetConstants/2458'],languages:['languageConstants/1000'],ad_group_name:'Group',keywords:['example'],headlines:['One','Two','Three'],descriptions:['First','Second']};
 const prefix='customers/2315114913',snapshot={campaign:{resourceName:prefix+'/campaigns/1',status:'PAUSED'},ad_group:{resourceName:prefix+'/adGroups/2',status:'PAUSED'},ad:{resourceName:prefix+'/adGroupAds/2~3',status:'PAUSED'},targeting:[]};
 const bindings={M04_ENABLED:'true',M04_GATE2_ENABLED:'true',M04_GATE2_ALLOWLIST:'[]',M04_CONNECTION_REVISION:'test',M04_SERVICE_TOKEN:'SENTINEL_SERVICE_'.repeat(4),M04_DELEGATION_KEY:'SENTINEL_DELEGATION_'.repeat(4),DIGITALBEE_GRANT_VERIFY_TOKEN:'SENTINEL_GRANT_'.repeat(4),DIGITALBEE_GRANT_VERIFY_URL:'https://authority.test/v1/internal/grants/verify',GOOGLE_ADS_CLIENT_ID:'synthetic',GOOGLE_ADS_CLIENT_SECRET:'SENTINEL_CLIENT_SECRET',GOOGLE_ADS_REFRESH_TOKEN:'SENTINEL_REFRESH',GOOGLE_ADS_DEVELOPER_TOKEN:'SENTINEL_DEVELOPER',GOOGLE_ADS_CONNECTION_REVISION:'test',ERROR_MONITORING_ENABLED:'false'};
 const requests:Array<{url:string;body:Record<string,unknown>}>=[];
 const outbound=async(request:Request)=>{
  const url=new URL(request.url);
  if(url.hostname==='oauth2.googleapis.com')return Response.json({access_token:'SENTINEL_ACCESS'});
  assert.equal(url.hostname,'googleads.googleapis.com');
  const body=await request.json() as Record<string,unknown>;requests.push({url:request.url,body});
  if(futureFlow&&url.pathname.endsWith('/googleAds:mutate')){
   assert.equal(body.validateOnly,true);assert.equal(body.partialFailure,false);const ops=body.mutateOperations as Array<Record<string,any>>;assert.equal(ops[1].campaignOperation.create.startDateTime,'2099-11-10 00:00:00');assert.equal(ops[1].campaignOperation.create.status,'PAUSED');return Response.json({});
  }
  if(futureFlow)return Response.json({results:[{customer:{id:scope.platformAccountId,currencyCode:plan.currency,timeZone:plan.timezone,manager:false}}]});
  if(url.pathname.endsWith('/googleAds:mutate')){
   assert.equal(body.validateOnly,true);assert.equal(body.partialFailure,false);
   return Response.json({error:{code:400,message:'SENTINEL_PROVIDER_BODY',details:[{errors:[{errorCode:{dateRangeError:'CANNOT_MODIFY_START_DATE_IF_ALREADY_STARTED'},message:'SENTINEL_PROVIDER_BODY'}]}]}},{status:400});
  }
  assert(url.pathname.endsWith('/googleAds:search'));
  const query=String(body.query);assert(query.startsWith('SELECT '));
  return Response.json({results:query.includes('FROM campaign ')?[{campaign:{...snapshot.campaign,startDateTime:'2026-10-12 11:39:00'},customer:{timeZone:plan.timezone}}]:query.includes('FROM ad_group_ad ')?[{adGroupAd:snapshot.ad}]:[{adGroup:snapshot.ad_group}]});
 };
 const options={modules:true,scriptPath:fileURLToPath(new URL('../../../outputs/google-future-start/bundle/index.js',import.meta.url)).replaceAll('\\','/'),compatibilityDate:'2026-09-28',compatibilityFlags:['nodejs_compat'],bindings,d1Databases:['DB'],outboundService:outbound,serviceBindings:{DIGITALBEE_AUTHORITY:async(request:Request)=>Response.json({allowed:true,...await request.json() as object})}};
 const mf=new Miniflare(convertV4MiniflareOptions(options));
 try{
  const db=await mf.getD1Database('DB');
  for(const name of (await readdir(new URL('../migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())await db.exec((await readFile(new URL('../migrations/'+name,import.meta.url),'utf8')).replace(/--[^\n]*/g,'').replace(/\r?\n/g,' '));
  const wrapped=Object.assign(db,{withSession:()=>db}) as unknown as D1Database;
  const store=new Store(wrapped),ledger=new ActionStore(wrapped),backend=await digest([bindings.GOOGLE_ADS_CONNECTION_REVISION,bindings.GOOGLE_ADS_CLIENT_ID,bindings.GOOGLE_ADS_CLIENT_SECRET,bindings.GOOGLE_ADS_REFRESH_TOKEN,bindings.GOOGLE_ADS_DEVELOPER_TOKEN]);
  let w=await store.save(scope,plan,crypto.randomUUID(),backend);await store.status(w,'validated');
  const approval=await store.prepare(w,'approve','hash','request');await store.approve(w,{challenge:approval.token,confirmation_hash:'hash'});w=(await store.workflow(w.id,scope))!;
  const create=await store.prepare(w,'gate1','hash','request'),parent=crypto.randomUUID();await store.reserve(w,{idempotency_key:parent,challenge:create.token,confirmation_hash:'hash'},'request',scope);await store.dispatched(parent);await store.finish(w,parent,'verified',snapshot);w=(await store.workflow(w.id,scope))!;
  const schedule={mode:'scheduled',scheduled_at:'2099-11-05T16:00:00.000Z',timezone:plan.timezone},challenge=await ledger.prepare(w,scope,'gate2',parent,schedule,[],snapshot,{},'prepare'),id=crypto.randomUUID();
  await ledger.reserve(w,scope,'gate2',{idempotency_key:id,challenge:challenge.token,confirmation_hash:challenge.confirmation_hash,schedule},'reserve');const receipt=(await ledger.get(id,scope))!;await ledger.dispatch(receipt);await ledger.finish(receipt,'unknown',{provider_action:'unknown'});
  const before=await ledger.get(id,scope),auditBefore=await db.prepare('SELECT count(*) n FROM m04_audit').first(),challengesBefore=await db.prepare('SELECT count(*) n FROM m04_action_challenges').first();
  bindings.M04_GATE2_ALLOWLIST=JSON.stringify([{subject:scope.subject,platform:scope.platform,account_id:scope.platformAccountId,service_id:scope.accountPageId,workflow_id:w.id,revision_id:w.revision_id,campaign_id:'1'}]);await mf.setOptions(convertV4MiniflareOptions(options));
  const input={service_id:scope.accountPageId,idempotency_key:id,diagnose_preflight:true},tool='campaign_operation_get',requestHash=await digest({tool,scope,input});
  const token=await new SignJWT({...scope,action:tool,requestHash}).setProtectedHeader({alg:'HS256'}).setIssuer('digitalbee').setAudience('https://worker.test').setSubject(scope.subject).setIssuedAt().setExpirationTime('30s').setJti(crypto.randomUUID()).sign(new TextEncoder().encode(bindings.M04_DELEGATION_KEY));
  const url=new URL('https://worker.test/v1/mcp/campaign-creation/operations/status');url.searchParams.set('request_hash',requestHash);url.searchParams.set('input',JSON.stringify(input));
  const response=await mf.dispatchFetch(url,{headers:{Authorization:`Bearer ${bindings.M04_SERVICE_TOKEN}`,'X-DigitalBee-Delegation':token,'X-Connection-Revision':'test'}}),text=await response.text();
  assert.equal(response.status,200);assert(!text.includes('SENTINEL'));const result=JSON.parse(text).result;
  assert.equal(result.outcome,'success');assert.equal(result.receipt_ref,id);assert.equal(result.data.status,'unknown');assert.equal(result.data.provider_action,false);
  assert.deepEqual(result.data.schedule_diagnostic.current_validate_only,{status:'rejected',reason:'google_CANNOT_MODIFY_START_DATE_IF_ALREADY_STARTED'});assert.equal(result.data.schedule_diagnostic.receipt_unchanged,true);assert.equal(result.data.schedule_diagnostic.retry_authorized,false);
  assert.equal(requests.length,4);assert.equal(requests.filter(r=>r.url.endsWith('/googleAds:mutate')).length,1);
  const currentDb=await mf.getD1Database('DB');
  assert.deepEqual(await currentDb.prepare('SELECT * FROM m04_followup_operations WHERE id=?').bind(id).first(),before);assert.deepEqual(await currentDb.prepare('SELECT count(*) n FROM m04_audit').first(),auditBefore);assert.deepEqual(await currentDb.prepare('SELECT count(*) n FROM m04_action_challenges').first(),challengesBefore);

  futureFlow=true;
  const currentStore=new Store(Object.assign(currentDb,{withSession:()=>currentDb}) as unknown as D1Database);
  const futurePlan={...plan,start_at:'2099-11-09T16:00:00.000Z'};
  let future=await currentStore.save(scope,futurePlan,crypto.randomUUID(),backend);
  async function call(path:string,tool:string,fields:Record<string,unknown>){
   const input={service_id:scope.accountPageId,workflow_id:future.id,revision_id:future.revision_id,idempotency_key:crypto.randomUUID(),...fields},requestHash=await digest({tool,scope,input});
   const token=await new SignJWT({...scope,action:tool,requestHash}).setProtectedHeader({alg:'HS256'}).setIssuer('digitalbee').setAudience('https://worker.test').setSubject(scope.subject).setIssuedAt().setExpirationTime('30s').setJti(crypto.randomUUID()).sign(new TextEncoder().encode(bindings.M04_DELEGATION_KEY));
   const response=await mf.dispatchFetch('https://worker.test/v1/mcp/campaign-creation/'+path,{method:'POST',headers:{Authorization:'Bearer '+bindings.M04_SERVICE_TOKEN,'X-DigitalBee-Delegation':token,'X-Connection-Revision':'test','Content-Type':'application/json'},body:JSON.stringify({request_hash:requestHash,input})});
   const text=await response.text();assert.equal(response.status,200);assert(!text.includes('SENTINEL'));return JSON.parse(text).result;
  }
  const validation=await call('validation','campaign_draft_validate',{});assert.equal(validation.outcome,'success');
  const futureApproval=await call('actions/prepare','campaign_action_prepare',{action:'approve'});assert.equal(futureApproval.outcome,'success');assert.equal(futureApproval.confirmation.draft.schedule.start_at,futurePlan.start_at);assert.equal(futureApproval.data.resource_plan[1].campaignOperation.create.startDateTime,'2099-11-10 00:00:00');
  assert.equal((await call('approvals','campaign_revision_approve',{challenge:futureApproval.challenge.token,confirmation_hash:futureApproval.challenge.confirmation_hash})).outcome,'success');
  const gate1=await call('actions/prepare','campaign_action_prepare',{action:'gate1'});assert.equal(gate1.outcome,'success');assert.equal(gate1.confirmation.draft.schedule.start_at,futurePlan.start_at);assert.notEqual(gate1.challenge.token,futureApproval.challenge.token);
  future=await currentStore.save(scope,{...plan,start_at:'2020-11-09T16:00:00.000Z'},crypto.randomUUID(),backend);await currentStore.status(future,'validated');
  const count=requests.length,expired=await call('actions/prepare','campaign_action_prepare',{action:'approve'});assert.equal(expired.outcome,'unavailable');assert.equal(expired.data.service_error,'google_start_lead_time');assert(!expired.challenge);assert.equal(requests.length,count);
  assert(requests.filter(r=>r.url.endsWith('/googleAds:mutate')).every(r=>r.body.validateOnly===true));
  console.log('PASS: actual bundled Worker future-start validation; separate futureApproval and Gate 1 cards; local-midnight PAUSED payload; expired-start card denied before provider calls; zero provider executions.');
  console.log('PASS: actual bundled Worker; signed existing receipt diagnosis; 3 official reads; 1 validation-only call; zero executions; unchanged receipt, audit and confirmation count; no sentinel disclosure.');
 }finally{await mf.dispose();}
}
await testBundle();


