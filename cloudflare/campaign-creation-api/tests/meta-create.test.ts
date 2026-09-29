import {expect,it,vi} from 'vitest';
import {Meta} from '../src/meta';
import {Store} from '../src/store';
import {database} from './db';
import type {MetaPlan,Scope} from '../src/contracts';

const scope:Scope={subject:'ava',grantRevision:7,accountPageId:'2de4fcc4-f701-80ad-aab2-c4ae709c7f9e',clientId:'12345678-1234-4234-8234-123456789def',platform:'Meta',platformAccountId:'321606578570386',connectionRevision:'m04-test',providerRevision:'meta-1'};
const source={id:'66',account_id:scope.platformAccountId,name:'Existing',status:'ACTIVE',created_time:'2026-09-20T00:00:00+0000',
  campaign:{id:'11',account_id:scope.platformAccountId,objective:'OUTCOME_LEADS',special_ad_categories:[]},
  adset:{id:'22',account_id:scope.platformAccountId,campaign_id:'11',daily_budget:'3500',billing_event:'IMPRESSIONS',optimization_goal:'LEAD_GENERATION',bid_strategy:'LOWEST_COST_WITHOUT_CAP',destination_type:'ON_AD',promoted_object:{page_id:'44'},attribution_spec:[{event_type:'CLICK_THROUGH',window_days:1}],targeting:{geo_locations:{countries:['MY']}},regional_regulation_identities:{universal_beneficiary:'77',universal_payer:'77'}},
  creative:{id:'33',account_id:scope.platformAccountId,object_story_spec:{page_id:'44',link_data:{link:'https://example.com/'}}}};

it('creates one paused object at each Meta level, records IDs and verifies ownership, budget, identity and creative',async()=>{
  const fixture=await database(),store=new Store(fixture.db),writes:Array<{edge:string;body:URLSearchParams}>=[];
  let clock=Date.now();const now=vi.spyOn(Date,'now').mockImplementation(()=>clock);
  const request=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    clock+=1400;
    const url=new URL(String(input)),edge=url.pathname.split('/').at(-1)!;
    if(init?.method==='POST'){
      const body=new URLSearchParams(String(init.body));
      if(body.get('execution_options')){
        if(body.get('daily_budget')==='1')return Response.json({error:{error_subcode:1885272,error_user_msg:'Your ad set budget must be more than MYR4.12 or your ads may not be delivered.'}},{status:400});
        return Response.json({success:true});
      }
      writes.push({edge,body});return Response.json({id:edge==='campaigns'?'101':edge==='adsets'?'102':'103'});
    }
    if(edge===`act_${scope.platformAccountId}`)return Response.json({account_id:scope.platformAccountId,currency:'MYR',timezone_name:'Asia/Kuala_Lumpur',account_status:1});
    if(edge==='ads')return Response.json({data:[{id:'66',account_id:scope.platformAccountId,status:'ACTIVE',created_time:source.created_time}]});
    if(edge==='66')return Response.json(source);
    if(edge==='22')return Response.json(source.adset);
    if(edge==='101')return Response.json({id:'101',name:writes[0].body.get('name'),account_id:scope.platformAccountId,objective:'OUTCOME_LEADS',status:'PAUSED',special_ad_categories:[]});
    if(edge==='102')return Response.json({id:'102',name:writes[1].body.get('name'),account_id:scope.platformAccountId,campaign_id:'101',daily_budget:'413',status:'PAUSED',regional_regulation_identities:source.adset.regional_regulation_identities});
    if(edge==='103')return Response.json({id:'103',name:writes[2].body.get('name'),account_id:scope.platformAccountId,adset_id:'102',status:'PAUSED',creative:source.creative});
    throw new Error('unexpected read '+edge);
  });
  try{
    const meta=new Meta({META_ACCESS_TOKEN:'synthetic',META_API_VERSION:'v25.0'},scope,request);
    const selected=(await meta.referenceAssets()).sources[0];
    const plan:MetaPlan={campaign_type:'meta_existing_ad',name:'Paused test',currency:'MYR',timezone:'Asia/Kuala_Lumpur',daily_budget:selected.minimum_daily_budget,
      source_ad_id:'66',source_campaign_id:'11',source_adset_id:'22',source_fingerprint:selected.source_fingerprint};
    const operation=crypto.randomUUID(),workflow=crypto.randomUUID();
    const validate=vi.spyOn(meta,'validate');
    await meta.validate(plan,workflow);
    expect(await meta.create(plan,workflow,operation,store)).toEqual(['101','102','103']);
    expect(writes.map(row=>[row.edge,row.body.get('status')])).toEqual([['campaigns','PAUSED'],['adsets','PAUSED'],['ads','PAUSED']]);
    expect(writes[0].body.get('is_adset_budget_sharing_enabled')).toBe('false');
    expect(JSON.parse(writes[1].body.get('regional_regulation_identities')!)).toEqual(source.adset.regional_regulation_identities);
    expect((await store.providerStep(operation,'ad'))?.provider_id).toBe('103');
    expect(await meta.readback(plan,workflow,operation,store)).toMatchObject({campaign_id:'101',adset_id:'102',ad_id:'103',status:'PAUSED',daily_budget:'4.13'});
    expect(writes).toHaveLength(3);
    expect(validate).toHaveBeenCalledTimes(1);
  }finally{now.mockRestore();fixture.dispose();}
});

it('reconciles an uncertain campaign write by exact account and name without sending it again',async()=>{
  const fixture=await database(),store=new Store(fixture.db);let campaignPosts=0,campaignName='',adsetName='',adName='';
  const request=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const edge=new URL(String(input)).pathname.split('/').at(-1)!;
    if(init?.method==='POST'){
      const body=new URLSearchParams(String(init.body));
      if(body.get('execution_options')){
        if(body.get('daily_budget')==='1')return Response.json({error:{error_subcode:1885272,error_user_msg:'Your ad set budget must be more than MYR4.12 or your ads may not be delivered.'}},{status:400});
        return Response.json({success:true});
      }
      if(edge==='campaigns'){campaignPosts++;campaignName=body.get('name')!;throw new Error('connection lost after write');}
      if(edge==='adsets'){adsetName=body.get('name')!;return Response.json({id:'102'});}
      adName=body.get('name')!;return Response.json({id:'103'});
    }
    if(edge===`act_${scope.platformAccountId}`)return Response.json({account_id:scope.platformAccountId,currency:'MYR',timezone_name:'Asia/Kuala_Lumpur',account_status:1});
    if(edge==='ads')return Response.json({data:[{id:'66',account_id:scope.platformAccountId,status:'ACTIVE',created_time:source.created_time}]});
    if(edge==='campaigns')return Response.json({data:[{id:'101',name:campaignName,account_id:scope.platformAccountId}]});
    if(edge==='66')return Response.json(source);
    if(edge==='22')return Response.json(source.adset);
    if(edge==='101')return Response.json({id:'101',name:campaignName,account_id:scope.platformAccountId,objective:'OUTCOME_LEADS',status:'PAUSED',special_ad_categories:[]});
    if(edge==='102')return Response.json({id:'102',name:adsetName,account_id:scope.platformAccountId,campaign_id:'101',daily_budget:'413',status:'PAUSED',regional_regulation_identities:source.adset.regional_regulation_identities});
    if(edge==='103')return Response.json({id:'103',name:adName,account_id:scope.platformAccountId,adset_id:'102',status:'PAUSED',creative:source.creative});
    throw new Error('unexpected read '+edge);
  });
  try{
    const meta=new Meta({META_ACCESS_TOKEN:'synthetic',META_API_VERSION:'v25.0'},scope,request),selected=(await meta.referenceAssets()).sources[0];
    const plan:MetaPlan={campaign_type:'meta_existing_ad',name:'Paused test',currency:'MYR',timezone:'Asia/Kuala_Lumpur',daily_budget:'4.13',source_ad_id:'66',source_campaign_id:'11',source_adset_id:'22',source_fingerprint:selected.source_fingerprint};
    const operation=crypto.randomUUID();
    expect(await meta.create(plan,crypto.randomUUID(),operation,store)).toEqual(['101','102','103']);
    expect(campaignPosts).toBe(1);
    expect((await store.providerStep(operation,'campaign'))?.provider_id).toBe('101');
  }finally{fixture.dispose();}
});

it('preserves the campaign receipt and stops after an uncertain ad set write',async()=>{
  const fixture=await database(),store=new Store(fixture.db);let campaignName='',adsetPosts=0,adPosts=0;
  const request=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const edge=new URL(String(input)).pathname.split('/').at(-1)!;
    if(init?.method==='POST'){
      const body=new URLSearchParams(String(init.body));
      if(body.get('execution_options')){
        if(body.get('daily_budget')==='1')return Response.json({error:{error_subcode:1885272,error_user_msg:'Your ad set budget must be more than MYR4.12 or your ads may not be delivered.'}},{status:400});
        return Response.json({success:true});
      }
      if(edge==='campaigns'){campaignName=body.get('name')!;return Response.json({id:'101'});}
      if(edge==='adsets'){adsetPosts++;throw new Error('connection lost after write');}
      adPosts++;return Response.json({id:'103'});
    }
    if(edge===`act_${scope.platformAccountId}`)return Response.json({account_id:scope.platformAccountId,currency:'MYR',timezone_name:'Asia/Kuala_Lumpur',account_status:1});
    if(edge==='ads')return Response.json({data:[{id:'66',account_id:scope.platformAccountId,status:'ACTIVE',created_time:source.created_time}]});
    if(edge==='adsets')return Response.json({data:[]});
    if(edge==='66')return Response.json(source);
    if(edge==='22')return Response.json(source.adset);
    if(edge==='101')return Response.json({id:'101',name:campaignName,account_id:scope.platformAccountId,objective:'OUTCOME_LEADS',status:'PAUSED',special_ad_categories:[]});
    throw new Error('unexpected read '+edge);
  });
  try{
    const meta=new Meta({META_ACCESS_TOKEN:'synthetic',META_API_VERSION:'v25.0'},scope,request),selected=(await meta.referenceAssets()).sources[0];
    const plan:MetaPlan={campaign_type:'meta_existing_ad',name:'Paused test',currency:'MYR',timezone:'Asia/Kuala_Lumpur',daily_budget:'4.13',source_ad_id:'66',source_campaign_id:'11',source_adset_id:'22',source_fingerprint:selected.source_fingerprint};
    const operation=crypto.randomUUID();
    await expect(meta.create(plan,crypto.randomUUID(),operation,store)).rejects.toThrow('meta_reconcile');
    expect((await store.providerStep(operation,'campaign'))?.provider_id).toBe('101');
    expect(await store.providerStep(operation,'adset')).toMatchObject({status:'started',provider_id:null});
    expect(adsetPosts).toBe(1);expect(adPosts).toBe(0);
  }finally{fixture.dispose();}
});
