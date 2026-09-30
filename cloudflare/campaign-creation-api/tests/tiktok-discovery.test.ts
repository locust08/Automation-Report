import {expect,it,vi} from 'vitest';
import {TikTok} from '../src/tiktok';
import type {Scope} from '../src/contracts';
import {execute} from '../src/service';

const scope:Scope={subject:'ava',grantRevision:9,accountPageId:'3e44fcc4-f701-8034-b219-c996dbdedbe6',clientId:'12345678-1234-4234-8234-123456789def',platform:'TikTok',platformAccountId:'7647057541075271700',connectionRevision:'test',providerRevision:'test'};
function fixture(count=25){
 const ads=Array.from({length:count},(_,i)=>({advertiser_id:scope.platformAccountId,ad_id:String(1000000000000000-i),adgroup_id:'2',create_time:`2026-09-${String(30-Math.floor(i/10)).padStart(2,'0')} 12:00:00`,operation_status:'ENABLE',ad_format:'SINGLE_VIDEO',ad_text:'Source',identity_id:'identity',identity_type:'CUSTOMIZED_USER',call_to_action:'LEARN_MORE',...(i===count-1?{video_id:'video',landing_page_url:'https://example.com/'}:{})}));
 const fetcher=vi.fn(async(input:RequestInfo|URL)=>{
  const url=new URL(String(input)),filter=JSON.parse(url.searchParams.get('filtering')??'{}');
  const data=url.pathname.includes('/advertiser/info/')?{list:[{advertiser_id:scope.platformAccountId,currency:'MYR',timezone:'Asia/Singapore',status:'STATUS_ENABLE'}]}:
   url.pathname.includes('/ad/get/')?{list:ads.filter(ad=>!filter.ad_ids||filter.ad_ids.includes(ad.ad_id)),page_info:{total_page:1}}:
   url.pathname.includes('/adgroup/get/')?{list:[{advertiser_id:scope.platformAccountId,adgroup_id:'2',campaign_id:'1',budget_mode:'BUDGET_MODE_DAY',budget:100,schedule_type:'SCHEDULE_FROM_NOW',billing_event:'CPC',optimization_goal:'CLICK',pacing:'PACING_MODE_SMOOTH',location_ids:['MY']}],page_info:{total_page:1}}:
   url.pathname.includes('/campaign/get/')?{list:[{advertiser_id:scope.platformAccountId,campaign_id:'1',campaign_type:'REGULAR_CAMPAIGN',objective_type:'TRAFFIC',budget_optimize_on:false}],page_info:{total_page:1}}:
   url.pathname.includes('/identity/get/')?{list:[{identity_id:'identity'}]}:{list:[{video_id:'video'}]};
  return Response.json({code:0,data});
 });
 const env={TIKTOK_ACCESS_TOKEN:'synthetic-token',M04_TIKTOK_MIN_DAILY_BUDGET:'100.00',M04_TIKTOK_BUDGET_CURRENCY:'MYR'};
 return {ads,fetcher,env,provider:new TikTok(env,scope,fetcher)};
}
it('resumes beyond twenty rejected sources without declaring that discovery is complete',async()=>{
 const {provider,fetcher}=fixture();
 const first=await provider.referenceAssets(undefined,{limit:20});
 expect(first.sources).toEqual([]);
 expect(first.discovery).toMatchObject({complete:false,scanned:20,total:25});
 expect(first.discovery.next_cursor).toEqual(expect.any(String));
 const next=await provider.referenceAssets(undefined,{limit:20,cursor:first.discovery.next_cursor!});
 expect(next.sources[0]).toMatchObject({source_ad_id:'999999999999976',resource_status:'ready'});
 expect(next.discovery).toMatchObject({complete:true,scanned:25,total:25,next_cursor:null});
 expect(fetcher.mock.calls.every(([,init]:any)=>init?.method!=='POST')).toBe(true);
});
it('rejects modified, cross-account and expired cursors',async()=>{
 const {provider,env,fetcher}=fixture(),first=await provider.referenceAssets(undefined,{limit:1});
 await expect(provider.referenceAssets(undefined,{cursor:first.discovery.next_cursor!+'x'})).rejects.toMatchObject({code:'tiktok_discovery_cursor'});
 await expect(new TikTok(env,{...scope,platformAccountId:'7647057541075271701'},fetcher).referenceAssets(undefined,{cursor:first.discovery.next_cursor!})).rejects.toMatchObject({code:'tiktok_discovery_cursor'});
 vi.useFakeTimers();try{vi.setSystemTime(Date.now()+16*60_000);await expect(provider.referenceAssets(undefined,{cursor:first.discovery.next_cursor!})).rejects.toMatchObject({code:'tiktok_discovery_cursor'});}finally{vi.useRealTimers();}
});
it('rejects continuation when source catalog content changes',async()=>{
 const {provider,ads}=fixture(),first=await provider.referenceAssets(undefined,{limit:1});
 ads[0].ad_text='Changed';
 await expect(provider.referenceAssets(undefined,{cursor:first.discovery.next_cursor!})).rejects.toMatchObject({code:'tiktok_discovery_changed'});
});
it('reports unsupported creative format without inventing a video or website destination',async()=>{
 const {provider,ads}=fixture(1);ads[0].ad_format='CAROUSEL_ADS';
 const refs=await provider.referenceAssets();
 expect(refs.sources).toEqual([]);expect(refs.source_checks[0].issues).toContain('unsupported_ad_format');
});
it('continues past an inaccessible asset during discovery but refuses exact selection',async()=>{
 const f=fixture(2);Object.assign(f.ads[0],{video_id:'denied',landing_page_url:'https://example.com/'});
 const base=f.fetcher,fetcher=async(input:RequestInfo|URL)=>String(input).includes('/file/video/ad/info/')&&String(input).includes('denied')?Response.json({code:0,data:{list:[]}}):base(input);
 const provider=new TikTok(f.env,scope,fetcher),refs=await provider.referenceAssets();
 expect(refs.source_checks[0].issues).toContain('tiktok_asset_review');expect(refs.sources[0].source_ad_id).toBe('999999999999999');
 await expect(provider.referenceAssets('1000000000000000')).rejects.toMatchObject({code:'tiktok_asset_review'});
});
it('returns an actionable incomplete result through the shared backend without changing the CampaignResult',async()=>{
 const f=fixture();vi.stubGlobal('fetch',f.fetcher);
 try{
  const output=await execute({...f.env,DB:{} as D1Database} as any,scope,'campaign_templates_list',{service_id:scope.accountPageId,limit:20},'hash',{authorize:async()=>{},provider:()=>({} as any)});
  expect(output.outcome).toBe('clarification_required');expect(output.validation_issues[0].code).toBe('tiktok_discovery_incomplete');
  expect((output.data!.references as any).discovery.next_cursor).toEqual(expect.any(String));
 }finally{vi.unstubAllGlobals();}
});
it('does not infer an MYR budget minimum from the source budget or a mismatched currency',async()=>{
 const f=fixture(1),provider=new TikTok({...f.env,M04_TIKTOK_BUDGET_CURRENCY:'USD'},scope,f.fetcher);
 expect((await provider.referenceAssets()).sources[0]).toMatchObject({minimum_daily_budget:null,resource_status:'budget_floor_unverified'});
});
it('fails closed on cross-account source rows and rate limits without retrying',async()=>{
 const f=fixture(1);f.ads[0].advertiser_id='7647057541075271701';
 await expect(f.provider.referenceAssets()).rejects.toMatchObject({code:'tiktok_ownership'});
 const fetcher=vi.fn(async()=>Response.json({code:40100},{status:429}));
 await expect(new TikTok(f.env,scope,fetcher).referenceAssets()).rejects.toMatchObject({code:'tiktok_rate_limited'});
 expect(fetcher).toHaveBeenCalledTimes(1);
});


it('retains completed progress and the unresolved candidate when provider reads exhaust the deadline',async()=>{
 const f=fixture(2);let now=Date.now();const clock=vi.spyOn(Date,'now').mockImplementation(()=>now);
 const fetcher=async(input:RequestInfo|URL)=>{const result=await f.fetcher(input);if(/adgroup\/get|campaign\/get|identity\/get/.test(String(input)))now+=9_000;return result;};
 try{const refs=await new TikTok(f.env,scope,fetcher).referenceAssets();expect(refs.discovery).toMatchObject({complete:false,scanned:1,unresolved_source_ad_id:f.ads[1].ad_id});expect(refs.discovery.next_cursor).toEqual(expect.any(String));expect(refs.source_checks.at(-1)?.issues).toContain('tiktok_deadline');}finally{clock.mockRestore();}
});
it.each([{},{list:[],page_info:{total_page:2}},{list:[],page_info:{total_page:null}},{list:[],page_info:{total_page:-1}},{list:[],page_info:{total_page:''}},{list:[],page_info:{total_page:false}}])('does not classify malformed or incomplete identities as no eligible source',async(data)=>{
 const f=fixture(1),fetcher=async(input:RequestInfo|URL)=>String(input).includes('/identity/get/')?Response.json({code:0,data}):f.fetcher(input);
 const refs=await new TikTok(f.env,scope,fetcher).referenceAssets();expect(refs.discovery.complete).toBe(false);expect(refs.discovery.scanned).toBe(0);expect(refs.discovery.unresolved_source_ad_id).toBe(f.ads[0].ad_id);expect(refs.source_checks[0].issues).toContain('tiktok_asset_coverage');
});

it('binds continuation to documented source values rather than JSON object key order',async()=>{
 const f=fixture(2),first=await f.provider.referenceAssets(undefined,{limit:1});
 const fetcher=async(input:RequestInfo|URL)=>{const response=await f.fetcher(input),body=await response.json() as any;if(String(input).includes('/ad/get/'))body.data.list=body.data.list.map((ad:any)=>Object.fromEntries(Object.entries(ad).reverse()));return Response.json(body);};
 await expect(new TikTok(f.env,scope,fetcher).referenceAssets(undefined,{cursor:first.discovery.next_cursor!})).resolves.toMatchObject({discovery:{complete:true},sources:[{source_ad_id:f.ads[1].ad_id}]});
});

it('exposes only bounded native identity types and numeric Spark reference diagnostics',async()=>{
 const f=fixture(1);Object.assign(f.ads[0],{tiktok_item_id:'0'});let refs=await f.provider.referenceAssets();expect(refs.source_diagnostics[0]).toMatchObject({identity_type:'CUSTOMIZED_USER',tiktok_item_id:'0'});
 Object.assign(f.ads[0],{identity_type:f.env.TIKTOK_ACCESS_TOKEN,tiktok_item_id:f.env.TIKTOK_ACCESS_TOKEN});refs=await f.provider.referenceAssets();expect(refs.source_diagnostics[0]).toMatchObject({identity_type:null,tiktok_item_id:null});expect(JSON.stringify(refs.source_diagnostics)).not.toContain(f.env.TIKTOK_ACCESS_TOKEN);
});
