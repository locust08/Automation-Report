import {expect,it,vi} from 'vitest';
import {Meta} from '../src/meta';
import type {Scope} from '../src/contracts';

const scope:Scope={subject:'ava',grantRevision:7,accountPageId:'2de4fcc4-f701-80ad-aab2-c4ae709c7f9e',clientId:'12345678-1234-4234-8234-123456789def',platform:'Meta',platformAccountId:'321606578570386',connectionRevision:'m04-test',providerRevision:'meta-1'};
const source=(id:string,created:string)=>({id,account_id:scope.platformAccountId,name:'Existing ad',status:'ACTIVE',created_time:created,campaign:{id:'11',account_id:scope.platformAccountId,objective:'OUTCOME_TRAFFIC',special_ad_categories:[]},adset:{id:'22',account_id:scope.platformAccountId,campaign_id:'11',daily_budget:'1000',billing_event:'IMPRESSIONS',optimization_goal:'LINK_CLICKS',targeting:{geo_locations:{countries:['MY']}},bid_strategy:'LOWEST_COST_WITHOUT_CAP',regional_regulation_identities:{universal_beneficiary:'77',universal_payer:'77'}},creative:{id:'33',account_id:scope.platformAccountId,object_story_spec:{page_id:'44',link_data:{link:'https://example.com/'}}}});

it('selects the newest eligible same-account Meta ad and exposes a bound source fingerprint',async()=>{
  const request=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(String(input));
    if(init?.method==='POST'){
      const budget=new URLSearchParams(String(init.body)).get('daily_budget');
      if(budget==='1')return Response.json({error:{error_subcode:1885272,error_user_msg:'Your ad set budget must be more than MYR4.12 or your ads may not be delivered.'}},{status:400});
      return Response.json({success:true});
    }
    if(url.pathname.endsWith('/act_'+scope.platformAccountId))return Response.json({account_id:scope.platformAccountId,currency:'MYR',timezone_name:'Asia/Kuala_Lumpur',account_status:1});
    if(url.pathname.endsWith('/ads'))return Response.json({data:[{id:'55',account_id:scope.platformAccountId,status:'ACTIVE',created_time:'2026-09-01T00:00:00+0000'},{id:'66',account_id:scope.platformAccountId,status:'ACTIVE',created_time:'2026-09-20T00:00:00+0000'}]});
    if(url.pathname.endsWith('/66'))return Response.json(source('66','2026-09-20T00:00:00+0000'));
    throw new Error('unexpected read');
  });
  const meta=new Meta({META_ACCESS_TOKEN:'synthetic',META_API_VERSION:'v25.0'},scope,request);
  const references=await meta.referenceAssets();
  expect(references.account).toMatchObject({currency:'MYR',timezone_name:'Asia/Kuala_Lumpur'});
  expect(references.sources).toMatchObject([{source_ad_id:'66',source_adset_id:'22',source_campaign_id:'11',objective:'OUTCOME_TRAFFIC',daily_budget:'10.00'}]);
  expect(references.sources[0].source_fingerprint).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(references.sources[0].regional_regulation_identities).toEqual({universal_beneficiary:'77',universal_payer:'77'});
  expect(references.sources[0].minimum_daily_budget).toBe('4.13');
  expect(request).toHaveBeenCalledTimes(5);
});

it('validates campaign, ad set and reused creative without creation and carries the verified identities',async()=>{
  const requests:Array<{url:string;body:URLSearchParams}>=[];
  const request=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(String(input));
    if(init?.method==='POST'){
      const body=new URLSearchParams(String(init.body));requests.push({url:url.pathname,body});
      if(body.get('daily_budget')==='1')return Response.json({error:{error_subcode:1885272,error_user_msg:'Your ad set budget must be more than MYR4.12 or your ads may not be delivered.'}},{status:400});
      return Response.json({success:true});
    }
    if(url.pathname.endsWith('/act_'+scope.platformAccountId))return Response.json({account_id:scope.platformAccountId,currency:'MYR',timezone_name:'Asia/Kuala_Lumpur',account_status:1});
    if(url.pathname.endsWith('/ads'))return Response.json({data:[{id:'66',account_id:scope.platformAccountId,status:'ACTIVE',created_time:'2026-09-20T00:00:00+0000'}]});
    if(url.pathname.endsWith('/66'))return Response.json(source('66','2026-09-20T00:00:00+0000'));
    if(url.pathname.endsWith('/22'))return Response.json({...source('66','2026-09-20T00:00:00+0000').adset,targeting:{geo_locations:{countries:['US']}}});
    throw new Error('unexpected read');
  });
  const meta=new Meta({META_ACCESS_TOKEN:'synthetic',META_API_VERSION:'v25.0'},scope,request);
  const selected=(await meta.referenceAssets()).sources[0];
  await meta.validate({campaign_type:'meta_existing_ad',name:'Test',currency:'MYR',timezone:'Asia/Kuala_Lumpur',daily_budget:'4.13',
    source_ad_id:'66',source_campaign_id:'11',source_adset_id:'22',source_fingerprint:selected.source_fingerprint},'workflow');
  expect(requests.filter(value=>value.body.get('name')==='M04 validate only').map(value=>value.url.split('/').at(-1))).toEqual(['campaigns','adsets','ads']);
  expect(requests.every(value=>value.body.get('execution_options')==='["validate_only"]')).toBe(true);
  expect(requests.at(-2)!.body.get('daily_budget')).toBe('413');
  expect(JSON.parse(requests.at(-2)!.body.get('targeting')!)).toEqual({geo_locations:{countries:['MY']}});
  expect(JSON.parse(requests.at(-2)!.body.get('regional_regulation_identities')!)).toEqual({universal_beneficiary:'77',universal_payer:'77'});
  expect(requests.at(-1)!.body.get('status')).toBe('PAUSED');
});

it('revalidates selected source directly in account currency without rescanning ads',async()=>{
 const paths:string[]=[];
 const request=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input));paths.push(url.pathname);
  if(init?.method==='POST')return Response.json({success:true});
  if(url.pathname.endsWith('/act_'+scope.platformAccountId))return Response.json({account_id:scope.platformAccountId,currency:'USD',timezone_name:'America/New_York',account_status:1});
  if(url.pathname.endsWith('/66'))return Response.json(source('66','2026-09-20T00:00:00+0000'));
  throw new Error('unexpected scan');
 };
 const refs=await new Meta({META_ACCESS_TOKEN:'synthetic',META_API_VERSION:'v25.0'},scope,request).referenceAssets('66');
 expect(refs.account.currency).toBe('USD');expect(refs.sources[0].source_ad_id).toBe('66');
 expect(paths.some(path=>path.endsWith('/ads'))).toBe(false);
});
it('reports rate limiting without retrying the provider',async()=>{
 const request=vi.fn(async()=>Response.json({error:{code:4}},{status:429}));
 await expect(new Meta({META_ACCESS_TOKEN:'synthetic',META_API_VERSION:'v25.0'},scope,request).referenceAssets()).rejects.toMatchObject({code:'meta_rate_limited'});
 expect(request).toHaveBeenCalledTimes(1);
});

it('fails closed for an unverified Meta currency unit scale',async()=>{
 const request=vi.fn(async()=>Response.json({account_id:scope.platformAccountId,currency:'JPY',timezone_name:'Asia/Tokyo',account_status:1}));
 await expect(new Meta({META_ACCESS_TOKEN:'synthetic',META_API_VERSION:'v25.0'},scope,request).referenceAssets()).rejects.toMatchObject({code:'meta_currency_units_unsupported'});
 expect(request).toHaveBeenCalledTimes(1);
});

it.each(['link_data','video_data'])('verifies native Meta lead-form destinations in %s without treating the placeholder as a website',async(kind)=>{
 const ad=source('66','2026-09-20T00:00:00+0000') as any;
 ad.campaign.objective='OUTCOME_LEADS';ad.adset.destination_type='ON_AD';ad.adset.promoted_object={page_id:'44'};
 ad.creative.object_story_spec={page_id:'44',[kind]:{...(kind==='link_data'?{link:'http://fb.me/'}:{video_id:'77'}),call_to_action:{type:'SIGN_UP',value:{lead_gen_form_id:'88'}}}};
 let foreign=false,reads=0,thumbnailHash='a'.repeat(32);
 const fetcher=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const edge=new URL(String(input)).pathname.split('/').at(-1);
  if(init?.method==='POST')return Response.json({success:true});
  if(edge===`act_${scope.platformAccountId}`)return Response.json({account_id:scope.platformAccountId,currency:'MYR',timezone_name:'Asia/Kuala_Lumpur',account_status:1});
  if(edge==='66'){if(kind==='video_data')Object.assign(ad.creative.object_story_spec.video_data,{image_hash:thumbnailHash,image_url:'https://www.facebook.com/ads/image/?d='+ ++reads});return Response.json(ad);}
  if(edge==='88')return Response.json({id:'88',page_id:foreign?'99':'44',status:'ACTIVE'});
  throw new Error('unexpected request');
 };
 const provider=new Meta({META_ACCESS_TOKEN:'synthetic',META_API_VERSION:'v25.0'},scope,fetcher);
 const first=(await provider.referenceAssets('66')).sources[0];
 expect(first).toMatchObject({final_url:null,destination:{kind:'instant_form',page_id:'44',form_id:'88'}});
 expect((await provider.referenceAssets('66')).sources[0].source_fingerprint).toBe(first.source_fingerprint);
 if(kind==='video_data'){thumbnailHash='b'.repeat(32);expect((await provider.referenceAssets('66')).sources[0].source_fingerprint).not.toBe(first.source_fingerprint);}
 foreign=true;await expect(provider.referenceAssets('66')).rejects.toMatchObject({code:'meta_form_unavailable'});
});
