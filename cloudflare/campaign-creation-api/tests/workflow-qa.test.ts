import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {database} from './db';
import {Store} from '../src/store';
import {WorkflowQA} from '../src/qa';
import {Meta,metaProviderName} from '../src/meta';
import {Google,ProviderError} from '../src/google';
import {digest,type Scope,type Plan} from '../src/contracts';
import {execute,type Environment,type Provider} from '../src/service';
import {Actions} from '../src/actions';
import {ActionStore} from '../src/action-store';
import {inputs} from '../src/inputs';

const scope:Scope={subject:'ava-test',grantRevision:1,accountPageId:'00000000-0000-4000-8000-000000000001',clientId:'00000000-0000-4000-8000-000000000002',platform:'Google',platformAccountId:'2315114913',connectionRevision:'test',providerRevision:'test'};
const plan:Plan={campaign_type:'search',name:'QA paused test',currency:'MYR',timezone:'Asia/Kuala_Lumpur',daily_budget:'1',final_url:'https://example.com/',locations:['geoTargetConstants/2458'],languages:['languageConstants/1000'],ad_group_name:'Group',keywords:['example'],headlines:['One','Two','Three'],descriptions:['First','Second']};
const snapshot={campaign:{id:'1',resourceName:'customers/2315114913/campaigns/1',status:'PAUSED'},ad_group:{id:'2',resourceName:'customers/2315114913/adGroups/2',status:'PAUSED'},ad:{resourceName:'customers/2315114913/adGroupAds/2~3',status:'PAUSED'}};
let f:Awaited<ReturnType<typeof database>>,env:Environment,store:Store,provider:Provider;
let authorize=vi.fn(async()=>{});
beforeEach(async()=>{
 f=await database();store=new Store(f.db);env={DB:f.db,M04_ENABLED:'true',M04_QA_ENABLED:'true',M04_GATE2_ENABLED:'false',M04_RECOVERY_ENABLED:'false'} as Environment;
 provider={validate:vi.fn(async()=>{}),create:vi.fn(async()=>[]),readback:vi.fn(async()=>snapshot),qa:vi.fn(async()=>snapshot),schedule:vi.fn(async()=>{})};
 authorize=vi.fn(async()=>{});
});
afterEach(()=>{vi.restoreAllMocks();f.dispose();});
async function paused(s=scope,p:Plan|any=plan,recovered=false){
 const backend=s.platform==='Meta'?await digest([env.META_API_VERSION,env.META_ACCESS_TOKEN]):await digest([env.GOOGLE_ADS_CONNECTION_REVISION,env.GOOGLE_ADS_CLIENT_ID,env.GOOGLE_ADS_CLIENT_SECRET,env.GOOGLE_ADS_REFRESH_TOKEN,env.GOOGLE_ADS_DEVELOPER_TOKEN]);
 const w=await store.save(s,p,crypto.randomUUID(),backend);await store.status(w,'validated');
 const approval=await store.prepare(w,'approve','confirm','hash');await store.approve(w,{challenge:approval.token,confirmation_hash:'confirm'});
 const approved=(await store.workflow(w.id,s))!,gate=await store.prepare(approved,'gate1','confirm','hash'),id=crypto.randomUUID();
 await store.reserve(approved,{idempotency_key:id,challenge:gate.token,confirmation_hash:'confirm'},'hash',s);await store.dispatched(id);
 await store.finish(approved,id,recovered?'unknown':'verified',snapshot);
 if(recovered)await f.db.prepare("INSERT INTO m04_followup_operations(id,workflow_id,revision_id,subject,service_id,request_hash,action,parent_receipt,schedule_json,refs_json,confirmation_json,status,result_json,scope_json,created_at,updated_at) VALUES(?,?,?,?,?,?,'resume',?,NULL,'[]','{}','verified',NULL,?,?,?)")
  .bind(crypto.randomUUID(),w.id,w.revision_id,s.subject,s.accountPageId,'recover',id,JSON.stringify(s),Date.now(),Date.now()).run();
 return {w:(await store.workflow(w.id,s))!,id,input:{service_id:s.accountPageId,workflow_id:w.id,revision_id:w.revision_id,idempotency_key:crypto.randomUUID()}};
}
const call=(input:Record<string,any>,s=scope)=>execute(env,s,'campaign_workflow_qa',input,'hash',{authorize,provider:()=>provider});
it('persists independent QA with Gate2 disabled, reconciles the receipt and never invokes creation or scheduling',async()=>{
 const {w,id,input}=await paused(),before=await store.operation(id,scope),out=await call(input);
 expect(out).toMatchObject({outcome:'success',receipt_ref:input.idempotency_key,data:{qa_status:'passed',provider_action:false}});
 expect(provider.qa).toHaveBeenCalledOnce();expect(provider.create).not.toHaveBeenCalled();expect(provider.schedule).not.toHaveBeenCalled();
 expect(await store.operation(id,scope)).toEqual(before);expect((await store.workflow(w.id,scope))!.version).toBe(w.version);
 expect(await new ActionStore(f.db).list(w)).toEqual([]);
 expect((await new Actions(env,scope,provider,new Meta(env,scope),authorize).state(w)).qa_status).toBe('passed');
 expect((await execute(env,scope,'campaign_operation_get',{service_id:scope.accountPageId,idempotency_key:input.idempotency_key},'read',{authorize,provider:()=>provider})).data!.qa_status).toBe('passed');
 await call(input);expect(provider.qa).toHaveBeenCalledOnce();
 expect((await f.db.prepare('SELECT count(*) n FROM m04_workflow_qa').first<any>())!.n).toBe(1);
 expect((await f.db.prepare('SELECT count(*) n FROM m04_action_challenges').first<any>())!.n).toBe(0);
});
it('accepts a verified Meta recovery without rewriting its unknown original parent',async()=>{
 const s:Scope={...scope,platform:'Meta',platformAccountId:'321606578570386'};
 const p={campaign_type:'meta_existing_ad',name:'Meta QA',currency:'MYR',timezone:'Asia/Kuala_Lumpur',daily_budget:'4.13',source_ad_id:'9',source_campaign_id:'8',source_adset_id:'7',source_fingerprint:'A'.repeat(43)};
 const {id,input}=await paused(s,p,true),metaQA=vi.spyOn(Meta.prototype,'qa').mockResolvedValue({campaign_id:'1',adset_id:'2',ad_id:'3'} as any);
 expect((await call(input,s)).data).toMatchObject({qa_status:'passed',daily_budget:'4.13',currency:'MYR'});
 expect(metaQA).toHaveBeenCalledOnce();expect((await store.operation(id,s))!.status).toBe('unknown');
});
it('records explicit QA failures separately from unknown transport failures and never retries',async()=>{
 const {input}=await paused();vi.mocked(provider.qa!).mockRejectedValueOnce(new ProviderError('unavailable','google_qa_policy'));
 expect((await call(input)).data).toMatchObject({qa_status:'failed',status:'failed',issue:{code:'google_qa_policy'}});
 vi.mocked(provider.qa!).mockRejectedValueOnce(new TypeError('secret must not escape'));
 const out=await call({...input,idempotency_key:crypto.randomUUID()});
 expect(out.data).toMatchObject({qa_status:'pending',status:'unknown',issue:{code:'qa_unavailable'}});expect(JSON.stringify(out)).not.toContain('secret');expect(provider.qa).toHaveBeenCalledTimes(2);
});
it('rejects stale revisions, disabled QA, incomplete creation and collisions before provider QA',async()=>{
 const {w,id,input}=await paused();
 await expect(call({...input,revision_id:crypto.randomUUID()})).rejects.toThrow('stale_revision');
 await expect(call({...input,idempotency_key:id})).rejects.toThrow('idempotency_conflict');
 env.M04_QA_ENABLED='false';expect((await call(input)).outcome).toBe('locked');env.M04_QA_ENABLED='true';
 await f.db.prepare("UPDATE m04_operations SET status='unknown' WHERE id=?").bind(id).run();
 await expect(call(input)).rejects.toThrow('conflict');expect(provider.qa).not.toHaveBeenCalled();
 expect(inputs.campaign_workflow_qa.safeParse({...input,schedule:{mode:'now'}}).success).toBe(false);
 expect(await new WorkflowQA(f.db,{...scope,subject:'other'}).get(input.idempotency_key)).toBeNull();
 expect((await store.workflow(w.id,scope))!.id).toBe(w.id);
});
it('rolls back observation and audit on a concurrent revision change or audit failure',async()=>{
 const {w,input}=await paused();vi.mocked(provider.qa!).mockImplementationOnce(async()=>{await f.db.prepare('UPDATE m04_workflows SET version=version+1 WHERE id=?').bind(w.id).run();return snapshot;});
 await expect(call(input)).rejects.toThrow();
 expect((await f.db.prepare('SELECT count(*) n FROM m04_workflow_qa').first<any>())!.n).toBe(0);
 // A DB trigger simulates a failed audit insert; evidence must roll back too.
 await f.db.prepare("CREATE TRIGGER fail_qa_audit BEFORE INSERT ON m04_audit WHEN NEW.action='workflow_qa' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END").run();
 await expect(call({...input,idempotency_key:crypto.randomUUID()})).rejects.toThrow('audit unavailable');
 expect((await f.db.prepare('SELECT count(*) n FROM m04_workflow_qa').first<any>())!.n).toBe(0);
});
it('rechecks authorization after provider reads before persisting evidence',async()=>{
 const {input}=await paused();authorize.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('access_denied'));
 await expect(call(input)).rejects.toThrow('access_denied');expect(provider.qa).toHaveBeenCalledOnce();
 expect((await f.db.prepare('SELECT count(*) n FROM m04_workflow_qa').first<any>())!.n).toBe(0);
});
it('expires prior passes and excludes evidence under changed scope or revision',async()=>{
 const {w,input}=await paused();await call(input);const qa=new WorkflowQA(f.db,scope),row=(await qa.latest(w))!;
 expect(await new WorkflowQA(f.db,{...scope,grantRevision:2}).latest(w)).toBeNull();
 expect(await qa.latest({...w,revision_id:crypto.randomUUID()})).toBeNull();
 vi.spyOn(Date,'now').mockReturnValue(row.expires_at+1);expect(qa.detail(row)).toMatchObject({status:'passed',qa_status:'pending',fresh:false});
 await expect(f.db.prepare("UPDATE m04_workflow_qa SET status='failed'").run()).rejects.toThrow('Immutable QA');
});
it('does not persist a pass while a Gate2 confirmation challenge is outstanding',async()=>{
 const {w,id,input}=await paused();await new ActionStore(f.db).prepare(w,scope,'gate2',id,{mode:'scheduled',scheduled_at:'2099-10-12T16:00:00.000Z',timezone:plan.timezone},[],snapshot,{},'schedule');
 await expect(call(input)).rejects.toThrow();expect((await f.db.prepare('SELECT count(*) n FROM m04_workflow_qa').first<any>())!.n).toBe(0);
});

it('runs actual Meta paused QA using GET only, without minimum-budget probes or validate-only submissions',async()=>{
 const s:Scope={...scope,platform:'Meta',platformAccountId:'321606578570386'};
 const source={id:'9',name:'Source',account_id:s.platformAccountId,status:'ACTIVE',campaign:{id:'8',account_id:s.platformAccountId,objective:'OUTCOME_TRAFFIC',special_ad_categories:[]},
  adset:{id:'7',account_id:s.platformAccountId,campaign_id:'8',daily_budget:'1000',targeting:{geo_locations:{countries:['MY']}},billing_event:'IMPRESSIONS',optimization_goal:'LINK_CLICKS',bid_strategy:'LOWEST_COST_WITHOUT_CAP',regional_regulation_identities:{universal_beneficiary:'77',universal_payer:'77'}},
  creative:{id:'6',account_id:s.platformAccountId,object_story_spec:{page_id:'5',link_data:{link:'https://example.com/'}}}};
 let base='',drift=false;
 const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  expect(init?.method??'GET').toBe('GET');const edge=new URL(String(input)).pathname.split('/').at(-1);
  if(edge===`act_${s.platformAccountId}`)return Response.json({account_id:s.platformAccountId,currency:'MYR',timezone_name:'Asia/Kuala_Lumpur',account_status:1});
  if(edge==='9')return Response.json(source);
  if(edge==='1')return Response.json({id:'1',name:base,account_id:s.platformAccountId,objective:'OUTCOME_TRAFFIC',status:'PAUSED',special_ad_categories:[]});
  if(edge==='2')return Response.json({...source.adset,id:'2',name:base+' ad set',campaign_id:'1',daily_budget:'413',status:'PAUSED',...(drift?{optimization_goal:'OTHER'}:{})});
  if(edge==='3')return Response.json({id:'3',name:base+' ad',account_id:s.platformAccountId,adset_id:'2',status:'PAUSED',creative:source.creative});
  throw Error('Unexpected provider path');
 });
 const meta=new Meta({META_ACCESS_TOKEN:'synthetic',META_API_VERSION:'v25.0'},s,fetcher),references=await meta.referenceAssets('9',true);
 const p={campaign_type:'meta_existing_ad',name:'Meta QA',currency:'MYR',timezone:'Asia/Kuala_Lumpur',daily_budget:'4.13',source_ad_id:'9',source_campaign_id:'8',source_adset_id:'7',source_fingerprint:references.sources[0].source_fingerprint} as const;
 const {w,id}=await paused(s,p,true);base=metaProviderName(p,w.id);
 for(const [step,pid] of [['campaign','1'],['adset','2'],['ad','3']] as const){await store.beginProviderStep(id,step,'fixture');await store.confirmProviderStep(id,step,pid);}
 expect(await meta.qa(p,w.id,id,store,{readOnly:true})).toMatchObject({campaign_id:'1',adset_id:'2',ad_id:'3',daily_budget:'4.13'});
 drift=true;await expect(meta.qa(p,w.id,id,store,{readOnly:true})).rejects.toMatchObject({code:'meta_qa_mismatch'});
 expect(fetcher).toHaveBeenCalled();
});

it('runs Google paused QA through queries without mutation validation',async()=>{
 const google=new Google(env,scope),validate=vi.spyOn(google,'validate'),query=vi.spyOn(google,'query');
 query.mockImplementation(async q=>q.includes('customer.id')?[{customer:{id:scope.platformAccountId,currencyCode:'MYR',timeZone:plan.timezone,manager:false}}]:[{adGroupAd:{resourceName:snapshot.ad.resourceName,policySummary:{approvalStatus:'APPROVED'}}}]);
 vi.spyOn(google,'readback').mockResolvedValue({...snapshot,budget:{amountMicros:'1000000'},targeting:[],verified_at:new Date().toISOString()});vi.spyOn(google,'conversionConfiguration').mockResolvedValue({} as any);
 await expect(google.qa(plan,'workflow',{readOnly:true})).resolves.toMatchObject(snapshot);expect(validate).not.toHaveBeenCalled();
});
