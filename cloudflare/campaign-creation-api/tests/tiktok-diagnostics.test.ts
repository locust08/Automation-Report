import {expect,it,vi} from 'vitest';
import {TikTok} from '../src/tiktok';
import {Store} from '../src/store';
import {database} from './db';
import {execute} from '../src/service';
import {mappingDigest} from '../src/contracts';

const scope:any={subject:'ava',accountPageId:'service',platform:'TikTok',platformAccountId:'7647057541075271700'};
const native=(code=0,request_id:any='20260930_REQ_1')=>Response.json({code,request_id,message:'synthetic-secret campaign_name advertiser_id',data:{campaign_id:'77'}});
function setup(fetcher:typeof fetch,save=vi.fn().mockResolvedValue(undefined)){
  const provider=new TikTok({TIKTOK_ACCESS_TOKEN:'synthetic-secret'},scope,fetcher);
  const store:any={beginProviderStep:async()=>({claimed:true,provider_id:null}),confirmProviderStep:vi.fn(),appendTikTokDiagnostic:save};
  return {provider,store,save};
}
it('captures a native response before confirming a created ID without arbitrary response text',async()=>{
  const f=setup(vi.fn(async()=>native()));
  await expect((f.provider as any).createStep(f.store,'op','campaign','Name',{})).resolves.toBe('77');
  expect(f.save).toHaveBeenCalledWith('op',expect.objectContaining({endpoint:'campaign/create',step:'campaign',phase:'creation',classification:'success',http_status:200,native_code:0,provider_request_id:'20260930_REQ_1'}));
  expect(f.save.mock.invocationCallOrder[0]).toBeLessThan(f.store.confirmProviderStep.mock.invocationCallOrder[0]);
  expect(JSON.stringify(f.save.mock.calls)).not.toContain('synthetic-secret');
});
it('retains native error evidence separately from an empty successful reconciliation read',async()=>{
  const f=setup(vi.fn(async(_input,init)=>init?.method==='POST'?native(40000):Response.json({code:0,request_id:'GET_1',data:{list:[],page_info:{total_page:1}}})));
  await expect((f.provider as any).createStep(f.store,'op','campaign','Name',{})).rejects.toMatchObject({outcome:'unknown'});
  expect(f.save.mock.calls.map(c=>c[1])).toEqual([expect.objectContaining({phase:'creation',native_code:40000,classification:'native_error'}),expect.objectContaining({phase:'reconciliation',native_code:0,classification:'success'})]);
});
it('retains successful creation evidence when subsequent native readback fails',async()=>{
 const f=setup(vi.fn(async(_input,init)=>init?.method==='POST'?native():native(40000,'READ_FAILURE')));
 await (f.provider as any).createStep(f.store,'op','campaign','Name',{});
 await expect((f.provider as any).one('campaign','77')).rejects.toMatchObject({code:'tiktok_40000'});
 expect(f.save.mock.calls.map(call=>call[1])).toEqual([expect.objectContaining({phase:'creation',classification:'success',provider_request_id:'20260930_REQ_1'}),expect.objectContaining({phase:'reconciliation',classification:'native_error',provider_request_id:'READ_FAILURE'})]);
});
it.each([
 ['timeout',()=>{throw new DOMException('synthetic-secret','TimeoutError');}],
 ['transport_error',()=>{throw new Error('synthetic-secret');}],
 ['invalid_json',()=>new Response('synthetic-secret')],
 ['transport_error',()=>new Response(new ReadableStream({start(controller){controller.error(new Error('synthetic-secret'));}}))],
 ['oversized_response',()=>new Response('x'.repeat(262145))],
 ['http_error',()=>Response.json({code:0},{status:503})],
] as const)('classifies %s without exposing transport/body errors',async(classification,reply)=>{
  const f=setup(vi.fn(async()=>reply()));
  await expect((f.provider as any).createStep(f.store,'op','campaign','Name',{})).rejects.toMatchObject({outcome:'unknown'});
  expect(f.save.mock.calls[0]?.[1]).toMatchObject({phase:'creation',classification});
  expect(JSON.stringify(f.save.mock.calls)).not.toContain('synthetic-secret');
});
it.each([undefined,'Bearer synthetic-secret','synthetic-secret','x'.repeat(257),123])('omits missing/unsafe native request IDs: %j',async(id)=>{
 const f=setup(vi.fn(async()=>Response.json({code:0,request_id:id,data:{campaign_id:'77'}})));
 await (f.provider as any).createStep(f.store,'op','campaign','Name',{});
 expect(f.save.mock.calls[0]?.[1].provider_request_id).toBeNull();
});
it('stops after successful POST when diagnostic persistence fails and logs only safe fields',async()=>{
 const log=vi.spyOn(console,'warn').mockImplementation(()=>{});let writes=0;
 try{
  const f=setup(vi.fn(async(_input,init)=>{if(init?.method==='POST'){writes++;return native();}return Response.json({code:0,data:{list:[],page_info:{total_page:1}}});}),vi.fn().mockRejectedValue(new Error('synthetic-secret')));
  await expect((f.provider as any).createStep(f.store,'op','campaign','Name',{})).rejects.toMatchObject({outcome:'unknown'});
  expect(writes).toBe(1);expect(f.store.confirmProviderStep).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalled();expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-secret');
 }finally{log.mockRestore();}
});
it('retains creation observations and only ten latest reconciliation observations, scoped to operation ownership',async()=>{
 const f=await database();const store=new Store(f.db);
 try{
  const now=Date.now();
  await f.db.prepare("INSERT INTO m04_workflows(id,subject,service_id,account_id,permission_revision,connection_revision,provider_revision,scope_hash,mapping_hash,backend_revision,plan_json,plan_hash,revision_id,source_key,status,created_at,updated_at) VALUES('wf','ava','service',?,1,'r','r','h','h','h','{}','h','r','source','unknown',?,?)").bind(scope.platformAccountId,now,now).run();
  await f.db.prepare("INSERT INTO m04_operations(id,workflow_id,subject,service_id,request_hash,status,created_at,updated_at) VALUES('op','wf','ava','service','hash','unknown',?,?)").bind(now,now).run();
  await store.beginProviderStep('op','campaign','Name');
  const d:any={endpoint:'campaign/create',step:'campaign',phase:'creation',timestamp:now,duration_ms:1,http_status:200,native_code:40000,provider_request_id:'FIRST',classification:'native_error',recognized_fields:[]};
  await (store as any).appendTikTokDiagnostic('op',d);
  for(let i=0;i<15;i++)await (store as any).appendTikTokDiagnostic('op',{...d,endpoint:'campaign/get',phase:'reconciliation',provider_request_id:'READ_'+i});
  await store.beginProviderStep('op','adset','Group');
  await store.appendTikTokDiagnostic('op',{...d,step:'adset',endpoint:'adgroup/get',phase:'reconciliation',provider_request_id:'GROUP_READ'});
  const rows=await (store as any).tikTokDiagnostics('op',scope);
  expect(rows).toHaveLength(12);expect(rows[0].provider_request_id).toBe('FIRST');expect(rows[1].provider_request_id).toBe('READ_5');expect(rows.at(-1).provider_request_id).toBe('GROUP_READ');
  expect(await (store as any).tikTokDiagnostics('op',{...scope,subject:'other'})).toEqual([]);
  expect(await (store as any).tikTokDiagnostics('op',{...scope,accountPageId:'other'})).toEqual([]);
  expect(await (store as any).tikTokDiagnostics('op',{...scope,platformAccountId:'other'})).toEqual([]);
  await expect(f.db.prepare('UPDATE m04_tiktok_diagnostics SET diagnostic_json=?').bind('{}').run()).rejects.toThrow('Immutable');
  await expect(f.db.prepare("DELETE FROM m04_tiktok_diagnostics WHERE phase='creation'").run()).rejects.toThrow('Preserve');
 }finally{f.dispose();}
});
it.each(['verified','unknown'])('returns scoped diagnostics on the existing %s receipt without changing its result or dispatching a write',async(status)=>{
 const f=await database(),store=new Store(f.db),now=Date.now();
 try{
  const scopeHash=await mappingDigest(scope);
  const plan={campaign_type:'tiktok_existing_ad',name:'Name',currency:'MYR',timezone:'Asia/Singapore',daily_budget:'20.00',source_ad_id:'3',source_adgroup_id:'2',source_campaign_id:'1',source_fingerprint:'a'.repeat(43)};
  await f.db.prepare("INSERT INTO m04_workflows(id,subject,service_id,account_id,permission_revision,connection_revision,provider_revision,scope_hash,mapping_hash,backend_revision,plan_json,plan_hash,revision_id,source_key,status,created_at,updated_at) VALUES('wf','ava','service',?,1,'r','r','h',?,'h',?,'h','r','source','verified',?,?)").bind(scope.platformAccountId,scopeHash,JSON.stringify(plan),now,now).run();
  const original='{"preserved":true}';
  await f.db.prepare("INSERT INTO m04_operations(id,workflow_id,subject,service_id,request_hash,status,result_json,created_at,updated_at) VALUES('op','wf','ava','service','hash','verified',?,?,?)").bind(original,now,now).run();
  await store.beginProviderStep('op','campaign',status==='unknown'?'Name [wf]':'Name');
  if(status==='unknown'){
   await f.db.prepare("UPDATE m04_operations SET status='unknown' WHERE id='op'").run();
  }
  await (store as any).appendTikTokDiagnostic('op',{endpoint:'campaign/create',step:'campaign',phase:'creation',timestamp:now,duration_ms:1,http_status:200,native_code:0,provider_request_id:'REQ_1',classification:'success',recognized_fields:[]});
  const deps:any={authorize:vi.fn(),provider:()=>({})};
  const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({code:0,request_id:'READ_1',data:{list:[],page_info:{total_page:1}}}));
  const env={DB:f.db,TIKTOK_ACCESS_TOKEN:'synthetic-secret'} as any;
  const result=await execute(env,scope,'campaign_operation_get',{service_id:'service',idempotency_key:'op'},'hash',deps);
  expect(result.data?.diagnostics).toMatchObject({original_response_available:true,reconciliation_outcome:status==='verified'?'verified':'unresolved'});
  expect((result.data?.diagnostics as any).observations[0].provider_request_id).toBe('REQ_1');
  await execute(env,scope,'campaign_operation_get',{service_id:'service',idempotency_key:'op'},'hash',deps);
  expect(fetcher.mock.calls.every(call=>call[1]?.method==='GET')).toBe(true);
  expect((await store.operation('op',scope))?.status).toBe(status);
  fetcher.mockRestore();
  expect((await store.operation('op',scope))?.result_json).toBe(original);
  const denied=await execute({DB:f.db} as any,{...scope,subject:'other'},'campaign_operation_get',{service_id:'service',idempotency_key:'op'},'hash',deps);
  expect(denied.data?.diagnostics).toBeUndefined();
 }finally{f.dispose();}
});
