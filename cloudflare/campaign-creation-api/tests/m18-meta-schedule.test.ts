import {expect,it} from 'vitest';
import {Meta} from '../src/meta';
import {Store} from '../src/store';
import {ActionStore} from '../src/action-store';
import {database} from './db';
import type {MetaPlan,Scope} from '../src/contracts';
const scope:Scope={subject:'actor',grantRevision:1,accountPageId:'00000000-0000-4000-8000-000000000001',clientId:'00000000-0000-4000-8000-000000000002',platform:'Meta',platformAccountId:'123',connectionRevision:'test',providerRevision:'test'};
const plan:MetaPlan={campaign_type:'meta_existing_ad',name:'Future fixture',currency:'MYR',timezone:'Asia/Kuala_Lumpur',daily_budget:'10',source_ad_id:'66',source_campaign_id:'11',source_adset_id:'22',source_fingerprint:'f'.repeat(43)};
const start='2099-10-12T16:00:00.000Z';
async function fixture(){
 const db=await database(),store=new Store(db.db),ledger=new ActionStore(db.db),w=await store.save(scope,plan,crypto.randomUUID(),'backend');
 await store.status(w,'validated');const a=await store.prepare(w,'approve','hash','request');await store.approve(w,{challenge:a.token,confirmation_hash:'hash'});
 const approved=(await store.workflow(w.id,scope))!,g=await store.prepare(approved,'gate1','hash','request'),parent=crypto.randomUUID();
 await store.reserve(approved,{idempotency_key:parent,challenge:g.token,confirmation_hash:'hash'},'request',scope);await store.dispatched(parent);await store.finish(approved,parent,'verified',{});
 const snapshot={campaign_id:'101',adset_id:'102',ad_id:'103',creative_id:'33',daily_budget:'10',campaign_configuration:{id:'101',name:'Campaign',account_id:'123',objective:'OUTCOME_LEADS',special_ad_categories:[],status:'PAUSED'},configuration:{id:'102',name:'Ad set',account_id:'123',campaign_id:'101',daily_budget:'1000',targeting:{geo_locations:{countries:['MY']}},status:'PAUSED'},ad_configuration:{id:'103',name:'Ad',account_id:'123',adset_id:'102',status:'PAUSED',creative:{id:'33',account_id:'123',object_story_spec:{page_id:'44',link_data:{link:'https://example.com/'}}}}};
 const current=(await store.workflow(w.id,scope))!;
 const challenge=await ledger.prepare(current,scope,'gate2',parent,{mode:'scheduled',scheduled_at:start,timezone:plan.timezone},[],snapshot,{},'request'),receipt=crypto.randomUUID();
 await ledger.reserve(current,scope,'gate2',{idempotency_key:receipt,challenge:challenge.token,confirmation_hash:challenge.confirmation_hash,schedule:{mode:'scheduled',scheduled_at:start,timezone:plan.timezone}},'request');
 const rows:Record<string,any>={'101':structuredClone(snapshot.campaign_configuration),'102':structuredClone(snapshot.configuration),'103':structuredClone(snapshot.ad_configuration)},writes:string[]=[];
 const meta=new Meta({META_ACCESS_TOKEN:'synthetic',META_API_VERSION:'v25.0'},scope,async(input,init)=>{
  const id=new URL(String(input)).pathname.split('/').at(-1)!,row=rows[id];if(!row)throw Error('unexpected ID');
  if(init?.method==='POST'){
   if(id!=='101')expect(rows['101'].status).toBe('PAUSED');
   const values=new URLSearchParams(String(init.body));writes.push(id);for(const [key,value] of values)row[key]=value;
   if(id==='102')throw Error('response lost after committed child update');
   return Response.json({success:true});
  }
  return Response.json(row);
 });
 return {db,ledger,meta,snapshot,receipt,rows,writes};
}
it('reads back an ambiguous child once, schedules children while parent paused, and enables campaign last',async()=>{
 const f=await fixture();try{
  expect(await f.meta.schedule(f.snapshot,start,f.receipt,f.ledger,async()=>{})).toMatchObject({scheduled_at:start,campaign:{status:'ACTIVE'},adset:{status:'ACTIVE',start_time:start},ad:{status:'ACTIVE'}});
  expect(f.writes).toEqual(['102','103','101']);
  await expect(f.meta.schedule(f.snapshot,start,f.receipt,f.ledger,async()=>{})).rejects.toThrow('meta_parent_not_paused');expect(f.writes).toHaveLength(3);
  f.rows['101'].objective='OUTCOME_SALES';await expect(f.meta.readScheduled(f.snapshot,start)).rejects.toThrow('meta_qa_mismatch');
  f.rows['101'].objective='OUTCOME_LEADS';f.rows['103'].creative.object_story_spec.link_data.link='https://changed.example/';await expect(f.meta.readScheduled(f.snapshot,start)).rejects.toThrow('meta_qa_mismatch');
 }finally{f.db.dispose();}
});
it('stops remaining Meta updates when authorization changes and keeps the parent paused',async()=>{
 const f=await fixture();try{let checks=0;
  await expect(f.meta.schedule(f.snapshot,start,f.receipt,f.ledger,async()=>{if(++checks===2)throw Error('emergency stop');})).rejects.toThrow('emergency stop');
  expect(f.writes).toEqual(['102']);expect(f.rows['101'].status).toBe('PAUSED');expect(f.rows['103'].status).toBe('PAUSED');
 }finally{f.db.dispose();}
});
