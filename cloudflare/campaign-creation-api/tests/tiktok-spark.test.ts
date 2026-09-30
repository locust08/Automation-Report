import {expect,it,vi} from 'vitest';
import {TikTok} from '../src/tiktok';
import type {Scope} from '../src/contracts';
const scope={subject:'ava',grantRevision:1,accountPageId:'service',clientId:'client',platform:'TikTok',platformAccountId:'7647057541075271700',connectionRevision:'test',providerRevision:'test'} as Scope;
function fixture(){
 const ad:any={advertiser_id:scope.platformAccountId,ad_id:'3',adgroup_id:'2',ad_name:'Spark source',operation_status:'DISABLE',ad_format:'SINGLE_VIDEO',identity_type:'TT_USER',identity_id:'identity',tiktok_item_id:'7647120342162361620',video_id:'source-video',ad_text:'Existing post',call_to_action_id:'portfolio',landing_page_url:'https://example.com/'};
 const group:any={advertiser_id:scope.platformAccountId,adgroup_id:'2',campaign_id:'1',operation_status:'DISABLE',budget_mode:'BUDGET_MODE_DYNAMIC_DAILY_BUDGET',budget:56,schedule_type:'SCHEDULE_START_END',billing_event:'CPC',optimization_goal:'CLICK',pacing:'PACING_MODE_SMOOTH',promotion_type:'WEBSITE',location_ids:['MY']};
 const campaign:any={advertiser_id:scope.platformAccountId,campaign_id:'1',campaign_type:'REGULAR_CAMPAIGN',objective_type:'WEB_CONVERSIONS',budget_optimize_on:false};
 const identity:any={identity_id:'identity',identity_type:'TT_USER',available_status:'AVAILABLE',is_gpppa:false,can_pull_video:true};
 const post:any={item_id:ad.tiktok_item_id,item_type:'VIDEO',status:'ITEM_STATUS_HESITATE_RECOMMEND',text:'Existing post',video_info:{signature:'stable-content',width:720,height:1280,url:'https://example.com/signed-preview'}};
 const rows:any={ad:[ad],adgroup:[group],campaign:[campaign]},writes:any[]=[],steps=new Map();
 const store:any={beginProviderStep:async(_o:string,s:string)=>{const row=steps.get(s)??{provider_id:null,claimed:true};steps.set(s,row);return row;},confirmProviderStep:async(_o:string,s:string,id:string)=>steps.set(s,{provider_id:id,claimed:false}),providerStep:async(_o:string,s:string)=>steps.get(s)};
 const env:any={TIKTOK_ACCESS_TOKEN:'synthetic',M04_TIKTOK_MIN_DAILY_BUDGET:'20.00',M04_TIKTOK_BUDGET_CURRENCY:'MYR',M04_TIKTOK_BUDGET_EVIDENCE:JSON.stringify({advertiser_id:scope.platformAccountId,currency:'MYR',minimum_daily_budget:'20.00',budget_mode:group.budget_mode,objective:campaign.objective_type,optimization_goal:group.optimization_goal,billing_event:group.billing_event,promotion_type:group.promotion_type})};
 const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input)),kind=url.pathname.split('/').at(-3)!;
  if(init?.method==='POST'){const body=JSON.parse(String(init.body));writes.push({kind,body});const id=String(10+writes.length);rows[kind].push(kind==='ad'?{...body.creatives[0],ad_id:id,adgroup_id:body.adgroup_id,advertiser_id:scope.platformAccountId,ad_text:post.text,video_id:null}:{...body,[`${kind}_id`]:id});return Response.json({code:0,data:kind==='ad'?{ad_ids:[id]}:{[`${kind}_id`]:id}});}
  const filter=JSON.parse(url.searchParams.get('filtering')??'{}');
  const data=url.pathname.includes('/advertiser/info/')?{list:[{advertiser_id:scope.platformAccountId,currency:'MYR',timezone:'Asia/Singapore',status:'STATUS_ENABLE'}]}:url.pathname.includes('/identity/info/')?{identity_info:identity}:url.pathname.includes('/identity/video/info/')?{video_detail:post}:url.pathname.includes('/identity/get/')?{list:[identity]}:url.pathname.includes('/file/video/ad/info/')?{list:[{video_id:ad.video_id}]}:{list:rows[kind].filter((r:any)=>!filter[`${kind}_ids`]||filter[`${kind}_ids`].includes(r[`${kind}_id`])),page_info:{total_page:1}};
  return Response.json({code:0,data});
 });
 return {ad,group,campaign,identity,post,env,fetcher,writes,rows,store,provider:new TikTok(env,scope,fetcher)};
}
it('authorizes an existing Spark video post and binds stable post content while ignoring expiring preview URLs',async()=>{
 const f=fixture(),first=await f.provider.referenceAssets('3');expect(first.sources[0]).toMatchObject({resource_status:'ready',tiktok_item_id:f.ad.tiktok_item_id,identity_type:'TT_USER',budget_mode:f.group.budget_mode});
 f.post.video_info.url='https://example.com/new-preview';expect((await f.provider.referenceAssets('3')).sources[0].source_fingerprint).toBe(first.sources[0].source_fingerprint);
 f.post.text='Changed';expect((await f.provider.referenceAssets('3')).sources[0].source_fingerprint).not.toBe(first.sources[0].source_fingerprint);
});
it.each(['IS_PRIVATE_ACCOUNT','SCOPE_UNAVAILABLE','NO_VALID_BIND_ACCOUNT'])('rejects unavailable Spark identities: %s',async(status)=>{
 const f=fixture();f.identity.available_status=status;expect((await f.provider.referenceAssets('3')).source_checks[0].issues).toContain('spark_identity_unavailable');expect(f.writes).toEqual([]);
});
it.each(['STATUS_ONLY_FRIEND_SEE','ITEM_STATUS_ONLY_AUTHOR_SEE'])('rejects nonpublic posts: %s',async(status)=>{const f=fixture();f.post.status=status;expect((await f.provider.referenceAssets('3')).source_checks[0].issues).toContain('spark_post_unavailable');});
it('rejects post and identity mismatches, prohibited accounts and missing pull permission',async()=>{
 for(const mutation of [(f:ReturnType<typeof fixture>)=>f.post.item_id='wrong',(f:ReturnType<typeof fixture>)=>f.identity.identity_id='wrong',(f:ReturnType<typeof fixture>)=>f.identity.is_gpppa=true,(f:ReturnType<typeof fixture>)=>f.identity.can_pull_video=false]){const f=fixture();mutation(f);expect((await f.provider.referenceAssets('3')).sources).toEqual([]);}
});
it('keeps Spark budget unverified for missing or mismatched account/settings evidence',async()=>{
 for(const evidence of [undefined,JSON.stringify({advertiser_id:'another',currency:'MYR',minimum_daily_budget:'20.00'})]){const f=fixture();f.env.M04_TIKTOK_BUDGET_EVIDENCE=evidence;expect((await f.provider.referenceAssets('3')).sources[0].resource_status).toBe('budget_floor_unverified');}
});
it('creates a disabled Spark pull hierarchy without publishing video or text and verifies the post ID',async()=>{
 const f=fixture(),source=(await f.provider.referenceAssets('3')).sources[0],plan={campaign_type:'tiktok_existing_ad' as const,name:'Spark test',currency:'MYR',timezone:'Asia/Singapore',daily_budget:'20.00',source_ad_id:'3',source_adgroup_id:'2',source_campaign_id:'1',source_fingerprint:source.source_fingerprint};
 expect(await f.provider.create(plan,'wf','op',f.store)).toEqual(['11','12','13']);expect(f.writes.map(w=>w.kind)).toEqual(['campaign','adgroup','ad']);
 expect(f.writes[1].body).toMatchObject({budget_mode:f.group.budget_mode,budget:20,operation_status:'DISABLE',schedule_type:'SCHEDULE_FROM_NOW'});expect(f.writes[1].body.schedule_end_time).toBeUndefined();
 const creative=f.writes[2].body.creatives[0];expect(creative).toMatchObject({operation_status:'DISABLE',tiktok_item_id:f.ad.tiktok_item_id,identity_id:'identity',call_to_action_id:'portfolio'});for(const key of ['video_id','ad_text','image_ids','display_name','dark_post_status','item_duet_status','item_stitch_status'])expect(creative[key]).toBeUndefined();
 expect(await f.provider.readback(plan,'wf','op',f.store)).toMatchObject({status:'DISABLE',tiktok_item_id:f.ad.tiktok_item_id});f.rows.ad[1].tiktok_item_id='another';await expect(f.provider.readback(plan,'wf','op',f.store)).rejects.toMatchObject({code:'tiktok_ad_readback'});
});
it('refuses a receipt if the approved Spark source or authorization changes after creation',async()=>{
 const f=fixture(),source=(await f.provider.referenceAssets('3')).sources[0],plan={campaign_type:'tiktok_existing_ad' as const,name:'Spark test',currency:'MYR',timezone:'Asia/Singapore',daily_budget:'20.00',source_ad_id:'3',source_adgroup_id:'2',source_campaign_id:'1',source_fingerprint:source.source_fingerprint};
 await f.provider.create(plan,'wf','op',f.store);f.identity.can_pull_video=false;await expect(f.provider.readback(plan,'wf','op',f.store)).rejects.toMatchObject({code:'tiktok_source_changed'});expect(f.writes).toHaveLength(3);
});
it('preserves audience exclusions and refuses mismatched native targeting readback',async()=>{
 const f=fixture();Object.assign(f.group,{excluded_audience_ids:['exclude'],interest_category_ids:['interest'],languages:['en'],placements:['PLACEMENT_TIKTOK']});
 const source=(await f.provider.referenceAssets('3')).sources[0],plan={campaign_type:'tiktok_existing_ad' as const,name:'Spark test',currency:'MYR',timezone:'Asia/Singapore',daily_budget:'20.00',source_ad_id:'3',source_adgroup_id:'2',source_campaign_id:'1',source_fingerprint:source.source_fingerprint};
 await f.provider.create(plan,'wf','op',f.store);expect(f.writes[1].body.excluded_audience_ids).toEqual(['exclude']);f.rows.adgroup[1].excluded_audience_ids=[];
 await expect(f.provider.readback(plan,'wf','op',f.store)).rejects.toMatchObject({code:'tiktok_adgroup_readback'});
});
it('rejects populated unsupported source settings before creation',async()=>{const f=fixture();f.group.deep_funnel_optimization_status='ON';const refs=await f.provider.referenceAssets('3');expect(refs.source_checks[0].issues).toContain('unsupported_source_settings');expect(refs.source_diagnostics[0]).toMatchObject({unsupported_group_fields:['deep_funnel_optimization_status']});expect(f.writes).toEqual([]);});
it('rejects automated creative sources rather than dropping automation',async()=>{const f=fixture();f.group.is_aco=true;expect((await f.provider.referenceAssets('3')).source_checks[0].issues).toContain('unsupported_campaign_automation');expect(f.writes).toEqual([]);});
it('rejects expired authorization codes before creation',async()=>{const f=fixture();f.ad.identity_type=f.identity.identity_type='AUTH_CODE';f.post.auth_info={ad_auth_status:'AUTHORIZED',auth_start_time:'2024-01-01 00:00:00',auth_end_time:'2025-01-01 00:00:00'};expect((await f.provider.referenceAssets('3')).source_checks[0].issues).toContain('spark_authorization_expired');expect(f.writes).toEqual([]);});
