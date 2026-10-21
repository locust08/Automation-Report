import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {database} from './db';
import {Store,type Workflow} from '../src/store';
import {execute,processReservedCreation,type Environment,type Dependencies} from '../src/service';
import type {MetaPlan,Scope} from '../src/contracts';

const scope:Scope={subject:'ava',grantRevision:7,accountPageId:'2de4fcc4-f701-80ad-aab2-c4ae709c7f9e',clientId:'12345678-1234-4234-8234-123456789def',platform:'Meta',platformAccountId:'321606578570386',connectionRevision:'test',providerRevision:'test'};
const plan:MetaPlan={campaign_type:'meta_existing_ad',name:'Interrupted',currency:'MYR',timezone:'Asia/Kuala_Lumpur',daily_budget:'4.13',source_ad_id:'66',source_campaign_id:'11',source_adset_id:'22',source_fingerprint:'a'.repeat(43)};
let f:Awaited<ReturnType<typeof database>>,store:Store,w:Workflow,id:string,env:Environment,deps:Dependencies,fetcher:ReturnType<typeof vi.fn>;
beforeEach(async()=>{
 f=await database();store=new Store(f.db);w=await store.save(scope,plan,crypto.randomUUID(),'backend');await store.status(w,'creating');id=crypto.randomUUID();
 const old=Date.now()-181_000;
 await f.db.prepare("INSERT INTO m04_operations(id,workflow_id,subject,service_id,request_hash,status,created_at,dispatched_at,updated_at) VALUES(?,?,?,?,?,'dispatched',?,?,?)").bind(id,w.id,scope.subject,scope.accountPageId,'hash',old,old,old).run();
 await f.db.prepare('INSERT INTO m04_creation_outbox(operation_id,scope_json,created_at,enqueued_at) VALUES(?,?,?,?)').bind(id,JSON.stringify(scope),old,old).run();
 await store.beginProviderStep(id,'campaign','test campaign');await store.confirmProviderStep(id,'campaign','101');
 env={DB:f.db,META_ACCESS_TOKEN:'synthetic',META_API_VERSION:'v25.0',M04_RECOVERY_ENABLED:'false',M04_GATE2_ENABLED:'false'} as Environment;
 deps={authorize:vi.fn(async()=>{}) as any,provider:()=>({create:vi.fn(),validate:vi.fn(),readback:vi.fn()}) as any};
 fetcher=vi.fn(()=>{throw new Error('No external fetch is permitted');});vi.stubGlobal('fetch',fetcher);
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();f.dispose();});
const read=()=>execute(env,scope,'campaign_operation_get',{service_id:scope.accountPageId,idempotency_key:id},'hash',deps);

it('persists an aged incomplete receipt without another provider mutation',async()=>{
 const result=await read();expect(result).toMatchObject({outcome:'unknown',data:{status:'unknown',creation_verified:false,readback:{reason:'meta_incomplete',diagnostic:{kind:'aged_dispatch_readback_failed',original_failure:false,no_automatic_retry:true}}}});
 expect((await store.workflow(w.id,scope))?.status).toBe('unknown');
 expect(await store.providerStep(id,'campaign')).toMatchObject({status:'confirmed',provider_id:'101'});
 expect(await store.providerStep(id,'adset')).toBeNull();expect(fetcher).not.toHaveBeenCalled();
 expect(env.M04_RECOVERY_ENABLED).toBe('false');expect(env.M04_GATE2_ENABLED).toBe('false');
});
it('records the same non-replaying observation on an aged queue redelivery',async()=>{
 await processReservedCreation(env,id,deps);
 const operation=await store.operation(id,scope);expect(operation?.status).toBe('unknown');expect(JSON.parse(operation!.result_json!)).toMatchObject({reason:'meta_incomplete',diagnostic:{original_failure:false}});
 expect(fetcher).not.toHaveBeenCalled();
});
it('leaves a fresh potentially running dispatch unchanged',async()=>{
 await f.db.prepare('UPDATE m04_operations SET dispatched_at=? WHERE id=?').bind(Date.now(),id).run();
 expect((await read()).data?.status).toBe('dispatched');expect((await store.operation(id,scope))?.result_json).toBeNull();
 expect((await store.workflow(w.id,scope))?.status).toBe('creating');expect(fetcher).not.toHaveBeenCalled();
});
it('preserves an existing original diagnostic and does not append duplicate observations',async()=>{
 const original=JSON.stringify({reason:'original_provider_failure',provider_action:'unknown'});
 await f.db.prepare("UPDATE m04_operations SET status='unknown',result_json=? WHERE id=?").bind(original,id).run();
 await read();expect((await store.operation(id,scope))?.result_json).toBe(original);
});
it('keeps an already verified operation and workflow intact',async()=>{
 await store.finish(w,id,'verified',{campaign_id:'101',status:'PAUSED'});
 const before=await store.operation(id,scope);await store.recordInterruptedDispatch(w,id,'meta_incomplete');
 expect(await store.operation(id,scope)).toEqual(before);expect((await store.workflow(w.id,scope))?.status).toBe('verified');
});
it('does not downgrade a verification that wins the persistence race',async()=>{
 const batch=f.db.batch.bind(f.db);
 vi.spyOn(f.db,'batch').mockImplementationOnce(async statements=>{
  await f.db.prepare("UPDATE m04_operations SET status='verified',result_json='{}' WHERE id=?").bind(id).run();
  await f.db.prepare("UPDATE m04_workflows SET status='verified' WHERE id=?").bind(w.id).run();
  return batch(statements);
 });
 await store.recordInterruptedDispatch(w,id,'meta_incomplete');
 expect((await store.operation(id,scope))?.status).toBe('verified');expect((await store.workflow(w.id,scope))?.status).toBe('verified');
});
it('rolls back the observation when its audit cannot be persisted',async()=>{
 await f.db.prepare("CREATE TRIGGER interrupted_audit_down BEFORE INSERT ON m04_audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END").run();
 await expect(store.recordInterruptedDispatch(w,id,'meta_incomplete')).rejects.toThrow('audit unavailable');
 expect((await store.operation(id,scope))?.status).toBe('dispatched');expect((await store.operation(id,scope))?.result_json).toBeNull();
 expect((await store.workflow(w.id,scope))?.status).toBe('creating');
});
it('rechecks authorization before recording a later receipt observation',async()=>{
 vi.mocked(deps.authorize).mockResolvedValueOnce(undefined).mockRejectedValue(new Error('access_denied'));
 await expect(read()).rejects.toThrow('access_denied');expect((await store.operation(id,scope))?.status).toBe('dispatched');
});
it('does not store arbitrary exception text as a reason',async()=>{
 await store.recordInterruptedDispatch(w,id,'private token and arbitrary provider body');
 const saved=(await store.operation(id,scope))!.result_json!;expect(JSON.parse(saved).reason).toBe('readback_unavailable');expect(saved).not.toContain('private token');
});
