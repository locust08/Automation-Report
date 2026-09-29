import {expect,it,vi} from 'vitest';
import {TikTok} from '../src/tiktok';
import type {Scope} from '../src/contracts';

const scope:Scope={subject:'ava',grantRevision:7,accountPageId:'3e44fcc4-f701-8034-b219-c996dbdedbe6',
  clientId:'12345678-1234-4234-8234-123456789def',platform:'TikTok',platformAccountId:'7647057541075271700',
  connectionRevision:'m04-test',providerRevision:'tiktok-1'};
const ad={advertiser_id:scope.platformAccountId,ad_id:'3',adgroup_id:'2',ad_name:'Source',operation_status:'ENABLE',
  create_time:'2026-09-25 12:00:00',video_id:'4',identity_id:'5',identity_type:'CUSTOMIZED_USER',ad_format:'SINGLE_VIDEO',
  ad_text:'Source text',call_to_action:'LEARN_MORE',landing_page_url:'https://example.com/'};
const group={advertiser_id:scope.platformAccountId,adgroup_id:'2',campaign_id:'1',adgroup_name:'Source group',
  operation_status:'ENABLE',budget_mode:'BUDGET_MODE_DAY',budget:50,billing_event:'CPC',optimization_goal:'CLICK',
  pacing:'PACING_MODE_SMOOTH',schedule_type:'SCHEDULE_FROM_NOW',location_ids:['6252001']};
const campaign={advertiser_id:scope.platformAccountId,campaign_id:'1',campaign_name:'Source campaign',
  campaign_type:'REGULAR_CAMPAIGN',objective_type:'TRAFFIC',operation_status:'ENABLE',budget_optimize_on:false};
function fixture(options:{floor?:string;currency?:string;missingVideo?:boolean;videoId?:string;identityId?:string}={}){
  const fetcher=vi.fn(async(input:RequestInfo|URL)=>{
    const url=new URL(String(input)),kind=url.pathname.split('/').at(-3),filter=JSON.parse(url.searchParams.get('filtering')??'{}');
    const data=url.pathname.includes('/advertiser/info/')?{list:[{advertiser_id:scope.platformAccountId,currency:'MYR',timezone:'Asia/Kuala_Lumpur',status:'STATUS_ENABLE'}]}:
      url.pathname.includes('/identity/get/')?{list:[{identity_id:options.identityId??'5'}]}:
      url.pathname.includes('/file/video/ad/info/')?{list:options.missingVideo?[]:[{video_id:options.videoId??'4'}]}:
      {list:(kind==='ad'?[{...ad,video_id:options.videoId??'4',identity_id:options.identityId??'5'}]:kind==='adgroup'?[group]:[campaign]).filter(row=>{
        const ids=filter[`${kind}_ids`];return !ids||ids.includes((row as Record<string,unknown>)[`${kind}_id`]);
      }),page_info:{total_page:1}};
    return Response.json({code:0,data});
  });
  return {provider:new TikTok({TIKTOK_ACCESS_TOKEN:'synthetic',M04_TIKTOK_MIN_DAILY_BUDGET:options.floor,
    M04_TIKTOK_BUDGET_CURRENCY:options.currency},scope,fetcher),fetcher};
}

it('binds the newest same-account source and only displays an explicitly verified currency floor',async()=>{
  const {provider}=fixture({floor:'20.00',currency:'MYR'}),refs=await provider.referenceAssets();
  expect(refs.account).toMatchObject({currency:'MYR',timezone_name:'Asia/Kuala_Lumpur'});
  expect(refs.sources[0]).toMatchObject({source_ad_id:'3',source_adgroup_id:'2',source_campaign_id:'1',
    minimum_daily_budget:'20.00',resource_status:'ready'});
  expect(refs.sources[0].source_fingerprint).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const unverified=await fixture({floor:'20.00',currency:'USD'}).provider.referenceAssets();
  expect(unverified.sources[0].resource_status).toBe('budget_floor_unverified');
});

it('stops for review if the newest source video cannot be reused',async()=>{
  await expect(fixture({floor:'20.00',currency:'MYR',missingVideo:true}).provider.referenceAssets()).rejects.toMatchObject({code:'tiktok_asset_review'});
});

it('rejects a stale source fingerprint or a changed budget before any write',async()=>{
  const {provider,fetcher}=fixture({floor:'20.00',currency:'MYR'}),source=(await provider.referenceAssets()).sources[0];
  const plan={campaign_type:'tiktok_existing_ad' as const,name:'Test',currency:'MYR',timezone:'Asia/Kuala_Lumpur',daily_budget:'20.00',
    source_ad_id:'3',source_adgroup_id:'2',source_campaign_id:'1',source_fingerprint:source.source_fingerprint};
  await expect(provider.validate({...plan,source_fingerprint:'x'.repeat(43)},'wf')).rejects.toMatchObject({code:'tiktok_source_or_budget_changed'});
  await expect(provider.validate({...plan,daily_budget:'21.00'},'wf')).rejects.toMatchObject({code:'tiktok_source_or_budget_changed'});
  expect((fetcher.mock.calls as unknown as [unknown,RequestInit?][]).every(([,init])=>init?.method!=='POST')).toBe(true);
});

it('creates all three native objects off and verifies their ownership, budget and creative',async()=>{
  const rows={ad:[{...ad}],adgroup:[{...group}],campaign:[{...campaign}]},writes:Array<{kind:string;body:any}>=[];
  const steps=new Map<string,{provider_id:string|null;claimed:boolean}>();
  const store={beginProviderStep:async(_operation:string,step:string)=>{const row=steps.get(step)??{provider_id:null,claimed:true};steps.set(step,row);return row;},
    confirmProviderStep:async(_operation:string,step:string,id:string)=>{steps.set(step,{provider_id:id,claimed:false});},
    providerStep:async(_operation:string,step:string)=>steps.get(step)};
  const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(String(input)),kind=url.pathname.split('/').at(-3) as 'ad'|'adgroup'|'campaign';
    if(init?.method==='POST'){
      const body=JSON.parse(String(init.body));writes.push({kind,body});
      const id=String(10+writes.length),key=`${kind}_id`;
      if(kind==='ad')rows.ad.push({...body.creatives[0],advertiser_id:scope.platformAccountId,adgroup_id:body.adgroup_id,ad_id:id});
      if(kind==='adgroup')rows.adgroup.push({...body,adgroup_id:id});
      if(kind==='campaign')rows.campaign.push({...body,campaign_id:id});
      return Response.json({code:0,data:kind==='ad'?{ad_ids:[id]}:{[key]:id}});
    }
    const filter=JSON.parse(url.searchParams.get('filtering')??'{}');
    const data=url.pathname.includes('/advertiser/info/')?{list:[{advertiser_id:scope.platformAccountId,currency:'MYR',timezone:'Asia/Kuala_Lumpur',status:'STATUS_ENABLE'}]}:
      url.pathname.includes('/identity/get/')?{list:[{identity_id:'5'}]}:
      url.pathname.includes('/file/video/ad/info/')?{list:[{video_id:'4'}]}:
      {list:rows[kind].filter(row=>!filter[`${kind}_ids`]||filter[`${kind}_ids`].includes((row as Record<string,unknown>)[`${kind}_id`])),page_info:{total_page:1}};
    return Response.json({code:0,data});
  });
  const provider=new TikTok({TIKTOK_ACCESS_TOKEN:'synthetic',M04_TIKTOK_MIN_DAILY_BUDGET:'20.00',M04_TIKTOK_BUDGET_CURRENCY:'MYR'},scope,fetcher);
  const source=(await provider.referenceAssets()).sources[0],plan={campaign_type:'tiktok_existing_ad' as const,name:'Test',currency:'MYR',
    timezone:'Asia/Kuala_Lumpur',daily_budget:'20.00',source_ad_id:'3',source_adgroup_id:'2',source_campaign_id:'1',source_fingerprint:source.source_fingerprint};
  expect(await provider.create(plan,'wf','operation',store as any)).toEqual(['11','12','13']);
  expect(writes.map(write=>write.kind)).toEqual(['campaign','adgroup','ad']);
  expect(writes[0].body.operation_status).toBe('DISABLE');
  expect(writes[1].body).toMatchObject({operation_status:'DISABLE',budget:20,budget_mode:'BUDGET_MODE_DAY',campaign_id:'11'});
  expect(writes[2].body.creatives[0]).toMatchObject({operation_status:'DISABLE',video_id:'4',identity_id:'5',landing_page_url:'https://example.com/'});
  expect(await provider.readback(plan,'wf','operation',store as any)).toMatchObject({campaign_id:'11',adgroup_id:'12',ad_id:'13',status:'DISABLE'});
});

it('reconciles an uncertain TikTok write by exact-name readback without a second create call',async()=>{
  let writes=0;
  const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    if(init?.method==='POST'){writes++;throw new Error('timeout after provider acceptance');}
    return Response.json({code:0,data:{list:[{advertiser_id:scope.platformAccountId,campaign_id:'77',campaign_name:'Exact name'}],page_info:{total_page:1}}});
  });
  const store={beginProviderStep:async()=>({provider_id:null,claimed:true}),confirmProviderStep:vi.fn(async()=>{})};
  const provider=new TikTok({TIKTOK_ACCESS_TOKEN:'synthetic'},scope,fetcher);
  expect(await (provider as any).createStep(store,'operation','campaign','Exact name',{advertiser_id:scope.platformAccountId,
    campaign_name:'Exact name',operation_status:'DISABLE'})).toBe('77');
  expect(writes).toBe(1);
  expect(store.confirmProviderStep).toHaveBeenCalledWith('operation','campaign','77');
});


it('verifies provider-authorized opaque video and identity IDs',async()=>{
 const {provider}=fixture({floor:'20.00',currency:'MYR',videoId:'v10044g50000abc_DEF-123',identityId:'8dacaf47-4321-4123-9234-123456789abc'});
 const refs=await provider.referenceAssets();
 expect(refs.sources[0]).toMatchObject({video_id:'v10044g50000abc_DEF-123',identity_id:'8dacaf47-4321-4123-9234-123456789abc',resource_status:'ready'});
});
it('does not mark a zero configured budget floor ready',async()=>{
 expect((await fixture({floor:'0',currency:'MYR'}).provider.referenceAssets()).sources[0].resource_status).toBe('budget_floor_unverified');
});


it('uses the fingerprinted source payload without substituting later targeting or copy',async()=>{
 const original=fixture({floor:'20.00',currency:'MYR'}).fetcher;let groupReads=0,adReads=0;
 const fetcher=vi.fn(async(input:RequestInfo|URL)=>{
  const url=String(input),response=await original(input),body=await response.json() as any;
  if(url.includes('/ad/get/')&&++adReads>1)body.data.list[0].ad_text='UNAPPROVED';
  if(url.includes('/adgroup/get/')&&++groupReads>1)body.data.list[0].location_ids=['US'];
  return Response.json(body);
 });
 const refs=await fixture({floor:'20.00',currency:'MYR'}).provider.referenceAssets();
 const provider=new TikTok({TIKTOK_ACCESS_TOKEN:'synthetic',M04_TIKTOK_MIN_DAILY_BUDGET:'20.00',M04_TIKTOK_BUDGET_CURRENCY:'MYR'},scope,fetcher);
 const validated=await provider.validate({campaign_type:'tiktok_existing_ad',name:'Test',currency:'MYR',timezone:'Asia/Kuala_Lumpur',daily_budget:'20.00',source_ad_id:'3',source_adgroup_id:'2',source_campaign_id:'1',source_fingerprint:refs.sources[0].source_fingerprint},'wf');
 expect(validated.ad.ad_text).toBe('Source text');expect(validated.group.location_ids).toEqual(['6252001']);
 expect(adReads).toBe(1);expect(groupReads).toBe(1);
});
