import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {Google,ProviderError} from '../src/google';
import {Actions} from '../src/actions';
import {ActionStore} from '../src/action-store';
import {Store} from '../src/store';
import {Meta} from '../src/meta';
import {database} from './db';
import type {Scope,Plan} from '../src/contracts';
import type {Environment,Provider} from '../src/service';

const scope:Scope={subject:'actor',grantRevision:1,accountPageId:'00000000-0000-4000-8000-000000000001',clientId:'00000000-0000-4000-8000-000000000002',platform:'Google',platformAccountId:'2315114913',connectionRevision:'test',providerRevision:'test'};
const plan:Plan={campaign_type:'search',name:'M18',currency:'MYR',timezone:'Asia/Kuala_Lumpur',daily_budget:'10',final_url:'https://example.com/',locations:['geoTargetConstants/2458'],languages:['languageConstants/1000'],ad_group_name:'Group',keywords:['example'],headlines:['One','Two','Three'],descriptions:['First','Second']};
const prefix='customers/2315114913';
const snapshot={campaign:{id:'1',resourceName:prefix+'/campaigns/1',status:'PAUSED'},ad_group:{id:'2',resourceName:prefix+'/adGroups/2',status:'PAUSED'},ad:{resourceName:prefix+'/adGroupAds/2~3',status:'PAUSED'},targeting:[{adGroupCriterion:{resourceName:prefix+'/adGroupCriteria/2~4',type:'KEYWORD',status:'PAUSED'}}]};
const schedule={mode:'scheduled',scheduled_at:'2099-11-05T16:00:00.000Z',timezone:plan.timezone};
const locked='google_CANNOT_MODIFY_START_DATE_IF_ALREADY_STARTED';
let f:Awaited<ReturnType<typeof database>>,env:Environment,store:Store,ledger:ActionStore;
beforeEach(async()=>{f=await database();store=new Store(f.db);ledger=new ActionStore(f.db);env={DB:f.db,M04_ENABLED:'true',M04_GATE2_ENABLED:'true',GOOGLE_ADS_CLIENT_ID:'synthetic',GOOGLE_ADS_CLIENT_SECRET:'synthetic',GOOGLE_ADS_REFRESH_TOKEN:'synthetic',CREATION_QUEUE:{send:vi.fn(async()=>{})}} as unknown as Environment;});
afterEach(()=>{vi.restoreAllMocks();f.dispose();});
async function paused(savedPlan:Plan=plan){
 const w=await store.save(scope,savedPlan,crypto.randomUUID(),'backend');await store.status(w,'validated');
 const a=await store.prepare(w,'approve','hash','request');await store.approve(w,{challenge:a.token,confirmation_hash:'hash'});
 const approved=(await store.workflow(w.id,scope))!,g=await store.prepare(approved,'gate1','hash','request'),parent=crypto.randomUUID();
 await store.reserve(approved,{idempotency_key:parent,challenge:g.token,confirmation_hash:'hash'},'request',scope);await store.dispatched(parent);await store.finish(approved,parent,'verified',snapshot);
 const current=(await store.workflow(w.id,scope))!;
 env.M04_GATE2_ALLOWLIST=JSON.stringify([{subject:scope.subject,platform:scope.platform,account_id:scope.platformAccountId,service_id:scope.accountPageId,workflow_id:w.id,revision_id:w.revision_id,campaign_id:'1'}]);
 return {w:current,parent};
}
function provider(){return {validate:vi.fn(async()=>{}),create:vi.fn(async()=>[]),qa:vi.fn(async()=>snapshot),validateSchedule:vi.fn(async()=>{}),schedule:vi.fn(async()=>{}),readback:vi.fn(async():Promise<Record<string,unknown>>=>{throw new Error('readback unavailable');}),readSchedulingState:vi.fn(async()=>({campaign:{id:prefix+'/campaigns/1',status:'PAUSED',start_at:'2026-10-12 11:39:00'},ad_group:{id:prefix+'/adGroups/2',status:'PAUSED'},ad:{id:prefix+'/adGroupAds/2~3',status:'PAUSED'},timezone:plan.timezone,captured_at:new Date().toISOString()}))};}
const actions=(p:Provider,check=async()=>{})=>new Actions(env,scope,p,new Meta(env,scope),check);
async function reserved(p:ReturnType<typeof provider>){const {w,parent}=await paused(),a=actions(p),prepared=await a.prepare(w,'gate2',{schedule},'prepare'),id=crypto.randomUUID();await a.reserve(w,'gate2',{idempotency_key:id,challenge:prepared.challenge!.token,confirmation_hash:prepared.challenge!.confirmation_hash,schedule},'reserve');return {w,parent,a,r:(await ledger.get(id,scope))!};}

it('blocks an elapsed Google start before minting a confirmation or scheduling',async()=>{
 const {w}=await paused(),p=provider();p.validateSchedule.mockRejectedValue(new ProviderError('rejected',locked));
 const result=await actions(p).prepare(w,'gate2',{schedule},'prepare');
 expect(result).toMatchObject({outcome:'unavailable',data:{provider_action:false},validation_issues:[{field:'schedule',code:locked}]});expect(result.challenge).toBeUndefined();
 expect((await f.db.prepare('SELECT count(*) n FROM m04_action_challenges').first<{n:number}>())!.n).toBe(0);expect(await ledger.list(w)).toEqual([]);expect(p.schedule).not.toHaveBeenCalled();
});
it('fails closed when scheduling validation is missing or unavailable and hides raw errors',async()=>{
 const {w}=await paused(),p=provider();p.validateSchedule.mockRejectedValue(new Error('SENTINEL_SECRET_RAW_BODY'));
 const result=await actions(p).prepare(w,'gate2',{schedule},'prepare');expect(JSON.stringify(result)).not.toContain('SENTINEL');expect(result.challenge).toBeUndefined();
 const missing:Provider={...p,validateSchedule:undefined};await expect(actions(missing).prepare(w,'gate2',{schedule},'prepare')).rejects.toThrow('unavailable');expect(p.schedule).not.toHaveBeenCalled();
});
it('revalidates before dispatch and rejects a newly locked start without mutation',async()=>{
 const p=provider(),{w,a,r}=await reserved(p);p.validateSchedule.mockRejectedValueOnce(new ProviderError('rejected',locked));await a.process(r,w);
 const saved=(await ledger.get(r.id,scope))!;expect(saved.status).toBe('rejected');expect(saved.dispatched_at).toBeNull();expect(JSON.parse(saved.result_json!)).toEqual({reason:locked,provider_action:false});expect(p.schedule).not.toHaveBeenCalled();
});
it('retains an authoritative atomic Google mutation rejection and never dispatches it twice',async()=>{
 const p=provider(),{w,a,r,parent}=await reserved(p);p.schedule.mockRejectedValue(new ProviderError('rejected',locked));await a.process(r,w);const saved=(await ledger.get(r.id,scope))!;await a.process(saved,w);
 expect(saved.status).toBe('rejected');expect(JSON.parse(saved.result_json!)).toEqual({provider_action:'rejected',reason:locked,failure_stage:'schedule'});expect(p.schedule).toHaveBeenCalledTimes(1);expect(p.readback).not.toHaveBeenCalled();expect((await store.operation(parent,scope))!.status).toBe('verified');
});
it('keeps an ambiguous mutation unknown, sanitized and readback-only on repeat processing',async()=>{
 const p=provider(),{w,a,r}=await reserved(p);p.schedule.mockRejectedValue(new Error('SENTINEL_SECRET_RESPONSE'));await a.process(r,w);await a.process((await ledger.get(r.id,scope))!,w);
 const saved=(await ledger.get(r.id,scope))!;expect(saved.status).toBe('unknown');expect(saved.result_json).not.toContain('SENTINEL');expect(JSON.parse(saved.result_json!)).toMatchObject({failure_stage:'schedule'});expect(p.schedule).toHaveBeenCalledTimes(1);
});
it('never labels a successful mutation rejected when later readback fails',async()=>{
 const p=provider(),{w,a,r}=await reserved(p);p.readback.mockRejectedValue(new ProviderError('rejected','google_PERMISSION_DENIED'));await a.process(r,w);
 const saved=(await ledger.get(r.id,scope))!;expect(saved.status).toBe('unknown');expect(JSON.parse(saved.result_json!)).toMatchObject({provider_action:'unknown',failure_stage:'readback'});expect(p.schedule).toHaveBeenCalledTimes(1);
});
it('diagnoses the same unknown receipt without rewriting it, minting a card or executing',async()=>{
 const p=provider(),{w,r,a}=await reserved(p);await ledger.dispatch(r);await ledger.finish(r,'unknown',{provider_action:'unknown'});const before=(await ledger.get(r.id,scope))!;
 p.validateSchedule.mockRejectedValue(new ProviderError('rejected',locked));const auditBefore=await f.db.prepare('SELECT count(*) n FROM m04_audit').first();const result=await a.diagnoseSnapshot(before,w);
 expect(result).toMatchObject({receipt_ref:r.id,data:{status:'unknown',provider_action:false,schedule_diagnostic:{current_validate_only:{status:'rejected',reason:locked},receipt_unchanged:true,retry_authorized:false,historical_execution_response_available:false,original_provider_error_recorded:false}}});
 expect(await ledger.get(r.id,scope)).toEqual(before);expect(await f.db.prepare('SELECT count(*) n FROM m04_audit').first()).toEqual(auditBefore);expect(p.schedule).not.toHaveBeenCalled();expect((await ledger.list(w))).toHaveLength(1);
});
it('denies diagnosis for a revoked exact scope without provider calls',async()=>{
 const p=provider(),{w,r,a}=await reserved(p);await ledger.dispatch(r);await ledger.finish(r,'unknown',{provider_action:'unknown'});env.M04_GATE2_ALLOWLIST='[]';p.validateSchedule.mockClear();
 expect((await a.diagnoseSnapshot((await ledger.get(r.id,scope))!,w)).outcome).toBe('unavailable');expect(p.readSchedulingState).not.toHaveBeenCalled();expect(p.validateSchedule).not.toHaveBeenCalled();
});

const rejection=(status=400)=>({error:{code:status,status:'INVALID_ARGUMENT',message:'SENTINEL_SECRET_BODY',details:[{'@type':'type.googleapis.com/google.ads.googleads.v25.errors.GoogleAdsFailure',errors:[{errorCode:{dateRangeError:'CANNOT_MODIFY_START_DATE_IF_ALREADY_STARTED'},message:'SENTINEL_SECRET_BODY'}]}]}});
it.each([400,401,403,408,429,500])('classifies HTTP %i safely without retry and sends validateOnly',async status=>{
 const calls:Array<{validateOnly:boolean;partialFailure:boolean;mutateOperations:unknown[]}>=[],g=new Google(env,scope,async(url,init)=>{if(String(url).includes('oauth2'))return Response.json({access_token:'SENTINEL_TOKEN'});calls.push(JSON.parse(String(init?.body)));return Response.json(rejection(status),{status});});
 await expect(g.validateSchedule(snapshot,'2099-11-06')).rejects.toMatchObject({outcome:[400,401,403].includes(status)?'rejected':'unknown',code:locked});expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({validateOnly:true,partialFailure:false});expect(calls[0].mutateOperations).toHaveLength(4);
});
it.each(['empty','malformed','oversized','redirect','network','timeout'])('keeps %s responses ambiguous',async kind=>{
 let calls=0;const g=new Google(env,scope,async(url)=>{if(String(url).includes('oauth2'))return Response.json({access_token:'synthetic'});calls++;if(kind==='timeout')throw new DOMException('SENTINEL_TIMEOUT','TimeoutError');if(kind==='network')throw Error('SENTINEL_NETWORK');if(kind==='malformed')return new Response('{',{status:400});if(kind==='oversized')return new Response('x'.repeat(262145),{status:400});if(kind==='redirect')return Response.json({}, {status:302});return Response.json({error:{}},{status:400});});
 await expect(g.validateSchedule(snapshot,'2099-11-06')).rejects.toMatchObject({outcome:'unknown',code:'google_response'});expect(calls).toBe(1);
});
it('uses the same exact atomic payload for validation and confirmed scheduling',async()=>{
 const calls:Array<{validateOnly:boolean;partialFailure:boolean;mutateOperations:unknown[]}>=[],g=new Google(env,scope,async(url,init)=>{if(String(url).includes('oauth2'))return Response.json({access_token:'synthetic'});calls.push(JSON.parse(String(init?.body)));return Response.json({});});
 await g.validateSchedule(snapshot,'2099-11-06');await g.schedule(snapshot,'2099-11-06');expect(calls).toHaveLength(2);expect(calls[0]).toEqual({...calls[1],validateOnly:true});expect(calls[1].validateOnly).toBe(false);
});
it('reads only exact same-account hierarchy identities and rejects foreign or missing objects',async()=>{
 const g=new Google(env,scope),query=vi.spyOn(g,'query').mockResolvedValueOnce([{campaign:{resourceName:prefix+'/campaigns/1',status:'PAUSED',startDateTime:'2026-10-12 11:39:00'},customer:{timeZone:plan.timezone}}]).mockResolvedValueOnce([{adGroup:{resourceName:prefix+'/adGroups/2',status:'PAUSED'}}]).mockResolvedValueOnce([{adGroupAd:{resourceName:prefix+'/adGroupAds/2~3',status:'PAUSED'}}]);
 expect(await g.readSchedulingState(snapshot)).toMatchObject({campaign:{status:'PAUSED',start_at:'2026-10-12 11:39:00'},timezone:plan.timezone});expect(query).toHaveBeenCalledTimes(3);
 query.mockClear();await expect(g.readSchedulingState({...snapshot,campaign:{resourceName:'customers/999/campaigns/1'}})).rejects.toMatchObject({code:'schedule_ownership'});expect(query).not.toHaveBeenCalled();
 query.mockResolvedValue([]);await expect(g.readSchedulingState(snapshot)).rejects.toMatchObject({code:'schedule_readback'});
});
it('does not expose malformed provider status fields in diagnostics',async()=>{
 const g=new Google(env,scope);vi.spyOn(g,'query').mockResolvedValueOnce([{campaign:{resourceName:prefix+'/campaigns/1',status:'SENTINEL_RAW_STATUS'},customer:{timeZone:plan.timezone}}]).mockResolvedValueOnce([{adGroup:{resourceName:prefix+'/adGroups/2',status:'PAUSED'}}]).mockResolvedValueOnce([{adGroupAd:{resourceName:prefix+'/adGroupAds/2~3',status:'PAUSED'}}]);
 await expect(g.readSchedulingState(snapshot)).rejects.toMatchObject({code:'schedule_readback'});
});

it.each([false,true])('reconciles scheduled Google readback for legacy/future-start plans (%s) without second mutation',async future=>{
 const savedPlan=future?{...plan,start_at:schedule.scheduled_at}:plan,{w}=await paused(savedPlan),p=provider();
 const pausedSnapshot={...snapshot,campaign:{...snapshot.campaign,...(future?{startDateTime:'2099-11-06 00:00:00'}:{})}};
 p.qa.mockResolvedValue(pausedSnapshot);
 p.readback.mockResolvedValue({...pausedSnapshot,campaign:{...pausedSnapshot.campaign,status:'ENABLED',startDateTime:'2099-11-06 00:00:00'},ad_group:{...snapshot.ad_group,status:'ENABLED'},ad:{...snapshot.ad,status:'ENABLED'},targeting:snapshot.targeting.map(row=>({adGroupCriterion:{...row.adGroupCriterion,status:'ENABLED'}}))});
 const a=new Actions(env,scope,p as Provider,new Meta(env,scope),async()=>{}),prep=await a.prepare(w,'gate2',{schedule},'prepare');
 const input={schedule,idempotency_key:crypto.randomUUID(),challenge:prep.challenge!.token,confirmation_hash:prep.challenge!.confirmation_hash};
 await a.reserve(w,'gate2',input,'reserve');let r=(await ledger.get(input.idempotency_key,scope))!;await a.process(r,w);
 r=(await ledger.get(r.id,scope))!;expect(r.status).toBe('verified');await a.process(r,w);expect(p.schedule).toHaveBeenCalledOnce();
});
