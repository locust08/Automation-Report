import {afterEach,expect,it,vi} from 'vitest';
import {metaBudgetMeetsMinimum} from '../src/meta-budget';
import {Meta} from '../src/meta';
import {Sources} from '../src/sources';
import {execute,type Environment} from '../src/service';
import {Store} from '../src/store';
import type {MetaPlan,Scope} from '../src/contracts';
import {database} from './db';

const scope:Scope={subject:'ava',grantRevision:7,accountPageId:'2de4fcc4-f701-80ad-aab2-c4ae709c7f9e',clientId:'12345678-1234-4234-8234-123456789def',platform:'Meta',platformAccountId:'321606578570386',connectionRevision:'test',providerRevision:'test'};
const plan:MetaPlan={campaign_type:'meta_existing_ad',name:'Paused budget regression',currency:'MYR',timezone:'Asia/Kuala_Lumpur',daily_budget:'4.13',source_ad_id:'66',source_campaign_id:'11',source_adset_id:'22',source_fingerprint:'a'.repeat(43)};
const refs={account:{currency:plan.currency,timezone_name:plan.timezone},sources:[{source_ad_id:'66',source_campaign_id:'11',source_adset_id:'22',source_fingerprint:plan.source_fingerprint,minimum_daily_budget:'4.12'}]};
afterEach(()=>vi.restoreAllMocks());

it.each([['4.13','4.12',true],['4.12','4.12',true],['10','10.00',true],['4.11','4.12',false],['100.01','4.12',false],['4.125','4.12',false],['4.13','4.125',false],['4.13','NaN',false],['4.13','0',false],['0','4.12',false]])('compares budget %s against floor %s without rounding',(budget,floor,expected)=>{
 expect(metaBudgetMeetsMinimum(budget,floor)).toBe(expected);
});

it.each(['4.12','4.13','10'])('saves a fresh immutable Meta draft at or above the minimum: %s',async budget=>{
 const fixture=await database();
 try{
  vi.spyOn(Sources.prototype,'normalize').mockResolvedValue({fields:{...plan,daily_budget:budget},provenance:{kind:'brief'}} as any);
  vi.spyOn(Meta.prototype,'referenceAssets').mockResolvedValue(refs as any);
  const key=crypto.randomUUID(),env={DB:fixture.db,META_ACCESS_TOKEN:'synthetic',META_API_VERSION:'v25.0'} as Environment;
  const result=await execute(env,scope,'campaign_draft_save',{service_id:scope.accountPageId,idempotency_key:key,source:{kind:'brief',fields:plan}},'hash',{authorize:vi.fn(async()=>{}) as any,provider:()=>({}) as any});
  expect(result.outcome).toBe('success');
  const stored=await new Store(fixture.db).source(key,scope);
  expect(JSON.parse(stored!.plan_json).daily_budget).toBe(budget);
  expect(stored!.status).toBe('draft');
 }finally{fixture.dispose();}
});

it('rejects a below-minimum draft with a budget diagnostic and persists nothing',async()=>{
 const fixture=await database();
 try{
  vi.spyOn(Sources.prototype,'normalize').mockResolvedValue({fields:{...plan,daily_budget:'4.11'},provenance:{kind:'brief'}} as any);
  vi.spyOn(Meta.prototype,'referenceAssets').mockResolvedValue(refs as any);
  const key=crypto.randomUUID();
  const result=await execute({DB:fixture.db} as Environment,scope,'campaign_draft_save',{service_id:scope.accountPageId,idempotency_key:key},'hash',{authorize:vi.fn(async()=>{}) as any,provider:()=>({}) as any});
  expect(result).toMatchObject({outcome:'clarification_required',validation_issues:[{code:'meta_budget'}]});
  expect(await new Store(fixture.db).source(key,scope)).toBeNull();
 }finally{fixture.dispose();}
});

it('still rejects changed source fingerprints before saving a draft',async()=>{
 const fixture=await database();
 try{
  vi.spyOn(Sources.prototype,'normalize').mockResolvedValue({fields:plan,provenance:{kind:'brief'}} as any);
  vi.spyOn(Meta.prototype,'referenceAssets').mockResolvedValue({...refs,sources:[{...refs.sources[0],source_fingerprint:'b'.repeat(43)}]} as any);
  const key=crypto.randomUUID();
  await expect(execute({DB:fixture.db} as Environment,scope,'campaign_draft_save',{service_id:scope.accountPageId,idempotency_key:key},'hash',{authorize:vi.fn(async()=>{}) as any,provider:()=>({}) as any})).rejects.toThrow('stale_revision');
  expect(await new Store(fixture.db).source(key,scope)).toBeNull();
 }finally{fixture.dispose();}
});

it.each(['4.11','4.125'])('rejects invalid provider-validation budgets before any validation post: %s',async budget=>{
 const request=vi.fn();
 const meta=new Meta({META_ACCESS_TOKEN:'synthetic',META_API_VERSION:'v25.0'},scope,request);
 vi.spyOn(meta,'referenceAssets').mockResolvedValue(refs as any);
 await expect(meta.validate({...plan,daily_budget:budget},'workflow')).rejects.toMatchObject({code:'meta_budget'});
 expect(request).not.toHaveBeenCalled();
});
