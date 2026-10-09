import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {database} from './db';
import {Store} from '../src/store';
import {Sources} from '../src/sources';
import {ActionStore} from '../src/action-store';
import {Actions,actionAllowed,scheduleFor,stable} from '../src/actions';
import {digest,type Scope,type Plan} from '../src/contracts';
import {Google} from '../src/google';
import {Meta} from '../src/meta';
import type {Environment,Provider} from '../src/service';
import {execute,processReservedCreation} from '../src/service';

const scope:Scope={subject:'actor',grantRevision:1,accountPageId:'00000000-0000-4000-8000-000000000001',clientId:'00000000-0000-4000-8000-000000000002',platform:'Google',platformAccountId:'2315114913',connectionRevision:'test',providerRevision:'test'};
const plan:Plan={campaign_type:'search',name:'M18',currency:'MYR',timezone:'Asia/Kuala_Lumpur',daily_budget:'10',final_url:'https://example.com/',locations:['geoTargetConstants/2458'],languages:['languageConstants/1000'],ad_group_name:'Group',keywords:['example'],headlines:['One','Two','Three'],descriptions:['First','Second']};
let f:Awaited<ReturnType<typeof database>>,env:Environment,store:Store;
beforeEach(async()=>{f=await database();store=new Store(f.db);env={DB:f.db,M04_ENABLED:'true',M04_TEMPLATE_PLANNING_ENABLED:'true',M04_CLONE_PLANNING_ENABLED:'true',M04_GATE2_ENABLED:'true',M04_RECOVERY_ENABLED:'true',M04_GATE2_ALLOWLIST:JSON.stringify([{subject:scope.subject,platform:scope.platform,account_id:scope.platformAccountId,service_id:scope.accountPageId}]),GOOGLE_ADS_CLIENT_ID:'synthetic',GOOGLE_ADS_CLIENT_SECRET:'synthetic',GOOGLE_ADS_REFRESH_TOKEN:'synthetic',CREATION_QUEUE:{send:async()=>{}}} as unknown as Environment;});
afterEach(()=>{vi.restoreAllMocks();f.dispose();});
const provider=()=>new Google(env,scope),meta=()=>new Meta(env,scope);
it('lists immutable administrative templates and reflects disablement without rewriting the version',async()=>{
 const sources=new Sources(f.db,env),catalog=await sources.catalog(scope);
 expect(catalog).toHaveLength(2);expect(catalog[0]).toMatchObject({version:1,eligible:true});
 await expect(f.db.prepare("UPDATE m04_templates SET defaults_json='{}'").run()).rejects.toThrow('Immutable template');
 await f.db.prepare("UPDATE m04_template_availability SET enabled=0 WHERE template_id='google-search@1'").run();
 expect((await sources.catalog(scope)).find(t=>t.template_id==='google-search@1')).toMatchObject({eligible:false,reason:'template_disabled'});
 await expect(sources.normalize(scope,{kind:'template',template_id:'google-search@1',overrides:plan},provider(),meta())).rejects.toThrow('template_disabled');
});
it('requires explicit overrides and sends template and brief into the same draft validation and approval path',async()=>{
 const sources=new Sources(f.db,env);
 await expect(sources.normalize(scope,{kind:'template',template_id:'google-search@1',overrides:{}},provider(),meta())).rejects.toThrow('required_override:name');
 const dep={authorize:async()=>{},provider:()=>({validate:async()=>{},create:async()=>[],readback:async()=>({})})};
 vi.spyOn(Google.prototype,'clonePlan').mockResolvedValue({plan,snapshot:{campaign:{id:'11'},verified_at:'fixture'}} as any);
 for(const source of [{kind:'brief',fields:plan},{kind:'template',template_id:'google-search@1',overrides:plan},{kind:'campaign_clone',source_service_id:scope.accountPageId,source_campaign_id:'11',overrides:plan}]){
  const saved=await execute(env,scope,'campaign_draft_save',{service_id:scope.accountPageId,idempotency_key:crypto.randomUUID(),source},'hash',dep);
  expect(saved.data).toMatchObject({status:'draft',plan});
  const w=await store.workflow(saved.workflow_ref!,scope);expect(w!.status).toBe('draft');
  expect(JSON.parse((await store.provenance(w!.revision_id))!.source_json).kind).toBe(source.kind);
  await expect(f.db.prepare("UPDATE m04_workflow_sources SET source_hash='changed'").run()).rejects.toThrow('Immutable source');
  const revision={service_id:scope.accountPageId,workflow_id:w!.id,revision_id:w!.revision_id,idempotency_key:crypto.randomUUID()};
  expect((await execute(env,scope,'campaign_draft_validate',revision,'hash',dep)).outcome).toBe('success');
  const prepared=await execute(env,scope,'campaign_action_prepare',{...revision,action:'approve'},'hash',dep);
  await execute(env,scope,'campaign_revision_approve',{...revision,challenge:prepared.challenge!.token,confirmation_hash:prepared.challenge!.confirmation_hash},'hash',dep);
  expect((await store.workflow(w!.id,scope))!.status).toBe('approved');
 }
});
it('denies cross-account clones before fetching source data',async()=>{
 await expect(new Sources(f.db,env).normalize(scope,{kind:'campaign_clone',source_service_id:scope.clientId,source_campaign_id:'11',overrides:{}},provider(),meta())).rejects.toThrow('cross_account_clone');
});
it('blocks a saved template after administrative disablement and clone drift before later stages',async()=>{
 const sources=new Sources(f.db,env),google=provider();
 const template=await sources.normalize(scope,{kind:'template',template_id:'google-search@1',overrides:plan},google,meta());
 const w=await store.save(scope,plan,crypto.randomUUID(),'backend',template.provenance);
 await f.db.prepare("UPDATE m04_template_availability SET enabled=0 WHERE template_id='google-search@1'").run();
 await expect(sources.assertCurrent(w,scope,google,meta())).rejects.toThrow('template_disabled');
 const snapshot={campaign:{id:'11',status:'PAUSED'},budget:{amountMicros:'10000000'},verified_at:'first'};
 const clone=vi.spyOn(google,'clonePlan').mockResolvedValue({plan,snapshot} as any);
 const normalized=await sources.normalize(scope,{kind:'campaign_clone',source_service_id:scope.accountPageId,source_campaign_id:'11',overrides:{name:'Clone'}},google,meta());
 const copied=await store.save(scope,normalized.fields as Plan,crypto.randomUUID(),'backend',normalized.provenance);
 expect(copied.status).toBe('draft');
 clone.mockResolvedValue({plan,snapshot:{...snapshot,verified_at:'second'}} as any);
 await expect(sources.assertCurrent(copied,scope,google,meta())).resolves.toBeUndefined();
 clone.mockResolvedValue({plan,snapshot:{...snapshot,budget:{amountMicros:'20000000'}}} as any);
 await expect(sources.assertCurrent(copied,scope,google,meta())).rejects.toThrow('clone_changed');
});
it('denies campaign-specific and cross-account Google conversion configuration',async()=>{
 const google=provider(),query=vi.spyOn(google as any,'query');
 for(const config of [{campaign:'customers/2315114913/campaigns/11',goalConfigLevel:'CAMPAIGN'},{campaign:'customers/999/campaigns/11',goalConfigLevel:'CUSTOMER'},{campaign:'customers/2315114913/campaigns/11',goalConfigLevel:'CUSTOMER',customConversionGoal:'custom'}]){
  query.mockResolvedValueOnce([{conversionGoalCampaignConfig:config}]);
  await expect(google.conversionConfiguration('11')).rejects.toMatchObject({code:'unsupported_conversion_configuration'});
 }
});
it('requires 72 hours and exact account timezone; Google supports only account-local midnight',()=>{
 const now=Date.parse('2026-10-09T00:00:00Z');
 expect(scheduleFor(scope,plan,{mode:'scheduled',scheduled_at:'2026-10-12T16:00:00Z',timezone:plan.timezone},now).date).toBe('2026-10-13');
 for(const schedule of [{mode:'now'},{mode:'scheduled',scheduled_at:'2026-10-10T16:00:00Z',timezone:plan.timezone},{mode:'scheduled',scheduled_at:'2026-10-12T16:01:00Z',timezone:plan.timezone},{mode:'scheduled',scheduled_at:'2026-10-12T16:00:00Z',timezone:'UTC'}])expect(()=>scheduleFor(scope,plan,schedule,now)).toThrow();
 expect(actionAllowed(env,scope,'gate2')).toBe(true);
 expect(actionAllowed(env,{...scope,subject:'other'},'gate2')).toBe(false);
 expect(actionAllowed(env,{...scope,platform:'TikTok'},'gate2')).toBe(false);
 expect(actionAllowed(env,scope,'resume')).toBe(false);
});
async function paused(){
 const w=await store.save(scope,plan,crypto.randomUUID(),'backend');await store.status(w,'validated');
 const approval=await store.prepare(w,'approve','confirm','hash');await store.approve(w,{challenge:approval.token,confirmation_hash:'confirm'});
 const approved=(await store.workflow(w.id,scope))!,gate=await store.prepare(approved,'gate1','confirm','hash'),id=crypto.randomUUID();
 await store.reserve(approved,{idempotency_key:id,challenge:gate.token,confirmation_hash:'confirm'},'hash',scope);await store.dispatched(id);
 const snapshot={campaign:{id:'1',resourceName:'customers/2315114913/campaigns/1',status:'PAUSED'},ad_group:{id:'2',resourceName:'customers/2315114913/adGroups/2',status:'PAUSED'},ad:{resourceName:'customers/2315114913/adGroupAds/2~3',status:'PAUSED'},targeting:[],verified_at:'old'};
 await store.finish(approved,id,'verified',snapshot);return {w:(await store.workflow(w.id,scope))!,id,snapshot};
}
it('rejects Gate 2 before creation QA and binds a distinct consumed confirmation to exact schedule and revision',async()=>{
 const ledger=new ActionStore(f.db),w=await store.save(scope,plan,crypto.randomUUID(),'backend');
 const p:Provider={validate:async()=>{},create:async()=>[],readback:async()=>({})};const actions=new Actions(env,scope,p,meta(),async()=>{});
 await expect(actions.prepare(w,'gate2',{schedule:{}},'hash')).rejects.toThrow('conflict');
 const pausedData=await paused(),schedule={mode:'scheduled',scheduled_at:'2099-10-12T16:00:00.000Z',timezone:plan.timezone};
 const prepared=await ledger.prepare(pausedData.w,scope,'gate2',pausedData.id,schedule,[],pausedData.snapshot,{display:true},'hash');
 const input={idempotency_key:crypto.randomUUID(),challenge:prepared.token,confirmation_hash:prepared.confirmation_hash,schedule};
 await expect(ledger.reserve(pausedData.w,scope,'gate2',{...input,schedule:{...schedule,scheduled_at:'2099-10-13T16:00:00.000Z'}},'hash')).rejects.toThrow('conflict');
 await ledger.reserve(pausedData.w,scope,'gate2',input,'hash');
 expect((await ledger.get(input.idempotency_key,scope))?.action).toBe('gate2');
 await expect(ledger.reserve(pausedData.w,scope,'gate2',{...input,idempotency_key:crypto.randomUUID()},'hash')).rejects.toThrow();
 await expect(f.db.prepare("UPDATE m04_followup_operations SET schedule_json='{}'").run()).rejects.toThrow('Immutable action');
});
it('resolves a lost Google schedule response through official readback and never sends a second mutation',async()=>{
 const {w,id,snapshot}=await paused(),ledger=new ActionStore(f.db),schedule={mode:'scheduled',scheduled_at:'2099-10-12T16:00:00.000Z',timezone:plan.timezone};
 let writes=0;const scheduled={...snapshot,campaign:{...snapshot.campaign,status:'ENABLED',startDate:'2099-10-13'},ad_group:{...snapshot.ad_group,status:'ENABLED'},ad:{...snapshot.ad,status:'ENABLED'}};
 const p:Provider={validate:async()=>{},create:async()=>[],qa:async()=>snapshot,readback:async()=>scheduled,schedule:async()=>{writes++;throw new Error('lost');}};
 const actions=new Actions(env,scope,p,meta(),async()=>{}),prepared=await actions.prepare(w,'gate2',{schedule},'prepare');
 const input={idempotency_key:crypto.randomUUID(),challenge:prepared.challenge!.token,confirmation_hash:prepared.challenge!.confirmation_hash,schedule};
 await actions.reserve(w,'gate2',input,'hash');const receipt=(await ledger.get(input.idempotency_key,scope))!;
 await actions.process(receipt,w);await actions.process((await ledger.get(receipt.id,scope))!,w);
 expect(writes).toBe(1);expect((await ledger.get(receipt.id,scope))?.status).toBe('verified');
 expect((await store.operation(id,scope))!.status).toBe('verified');
});
it('rejects expired and stale follow-up confirmations without reserving any action',async()=>{
 const {w,id,snapshot}=await paused(),ledger=new ActionStore(f.db),schedule={mode:'scheduled',scheduled_at:'2099-10-12T16:00:00.000Z',timezone:plan.timezone};
 const prepared=await ledger.prepare(w,scope,'gate2',id,schedule,[],snapshot,{},'hash');
 const input={idempotency_key:crypto.randomUUID(),challenge:prepared.token,confirmation_hash:prepared.confirmation_hash,schedule};
 await expect(ledger.reserve({...w,revision_id:crypto.randomUUID()},scope,'gate2',input,'hash')).rejects.toThrow();
 const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now+300001);
 await expect(ledger.reserve(w,scope,'gate2',input,'hash')).rejects.toThrow();
 expect(await ledger.list(w)).toEqual([]);
 expect((await store.operation(id,scope))!.status).toBe('verified');
});
it('rejects a reserved follow-up after backend connection drift without dispatch or provider calls',async()=>{
 const {w,id,snapshot}=await paused(),ledger=new ActionStore(f.db),schedule={mode:'scheduled',scheduled_at:'2099-10-12T16:00:00.000Z',timezone:plan.timezone};
 const prepared=await ledger.prepare(w,scope,'gate2',id,schedule,[],snapshot,{},'hash'),receipt=crypto.randomUUID();
 await ledger.reserve(w,scope,'gate2',{idempotency_key:receipt,challenge:prepared.token,confirmation_hash:prepared.confirmation_hash,schedule},'hash');
 const provider=vi.fn();await processReservedCreation(env,receipt,{authorize:async()=>{},provider});
 expect((await ledger.get(receipt,scope))?.status).toBe('rejected');expect(provider).not.toHaveBeenCalled();
 expect((await store.operation(id,scope))?.status).toBe('verified');
});
it('processes a valid queued action with the exact scope property order serialized by DigitalBee',async()=>{
 const raw:Scope={subject:scope.subject,grantRevision:scope.grantRevision,accountPageId:scope.accountPageId,platform:scope.platform,platformAccountId:scope.platformAccountId,connectionRevision:scope.connectionRevision,clientId:scope.clientId,providerRevision:scope.providerRevision};
 const backend=await digest([env.GOOGLE_ADS_CONNECTION_REVISION,env.GOOGLE_ADS_CLIENT_ID,env.GOOGLE_ADS_CLIENT_SECRET,env.GOOGLE_ADS_REFRESH_TOKEN,env.GOOGLE_ADS_DEVELOPER_TOKEN]);
 const w=await store.save(raw,plan,crypto.randomUUID(),backend);await store.status(w,'validated');const a=await store.prepare(w,'approve','hash','request');await store.approve(w,{challenge:a.token,confirmation_hash:'hash'});
 const approved=(await store.workflow(w.id,raw))!,g=await store.prepare(approved,'gate1','hash','request'),parent=crypto.randomUUID();
 await store.reserve(approved,{idempotency_key:parent,challenge:g.token,confirmation_hash:'hash'},'request',raw);await store.dispatched(parent);
 const snapshot={campaign:{id:'1',resourceName:'customers/2315114913/campaigns/1',status:'PAUSED'},ad_group:{id:'2',resourceName:'customers/2315114913/adGroups/2',status:'PAUSED'},ad:{resourceName:'customers/2315114913/adGroupAds/2~3',status:'PAUSED'},targeting:[]};
 await store.finish(approved,parent,'verified',snapshot);const current=(await store.workflow(w.id,raw))!,ledger=new ActionStore(f.db),schedule={mode:'scheduled',scheduled_at:'2099-10-12T16:00:00.000Z',timezone:plan.timezone};
 const challenge=await ledger.prepare(current,raw,'gate2',parent,schedule,[],stable(snapshot),{},'request'),id=crypto.randomUUID();
 await ledger.reserve(current,raw,'gate2',{idempotency_key:id,challenge:challenge.token,confirmation_hash:challenge.confirmation_hash,schedule},'request');
 const scheduleWrite=vi.fn(async()=>{}),p:Provider={validate:async()=>{},create:async()=>[],qa:async()=>snapshot,schedule:scheduleWrite,readback:async()=>({...snapshot,campaign:{...snapshot.campaign,status:'ENABLED',startDateTime:'2099-10-13 00:00:00'},ad_group:{...snapshot.ad_group,status:'ENABLED'},ad:{...snapshot.ad,status:'ENABLED'}})};
 await processReservedCreation(env,id,{authorize:async()=>{},provider:()=>p});
 expect(scheduleWrite).toHaveBeenCalledTimes(1);expect((await ledger.get(id,raw))?.status).toBe('verified');
});
