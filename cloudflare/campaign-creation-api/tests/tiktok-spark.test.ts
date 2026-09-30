import {expect,it,vi} from 'vitest';
import {TikTok} from '../src/tiktok';
import type {Scope} from '../src/contracts';
const scope={subject:'ava',grantRevision:1,accountPageId:'service',clientId:'client',platform:'TikTok',platformAccountId:'7647057541075271700',connectionRevision:'test',providerRevision:'test'} as Scope;
it('does not infer absence from nonempty zero-page identity defaults',async()=>{
 const f=fixture(),fetcher=async(input:RequestInfo|URL,init?:RequestInit)=>String(input).includes('/identity/get/')?Response.json({code:0,data:{identity_list:[{identity_id:'unrelated',identity_type:'TT_USER'}],page_info:{page:0,page_size:0,total_number:0,total_page:0}}}):f.fetcher(input,init);
 await expect(new TikTok(f.env,scope,fetcher).referenceAssets('3')).rejects.toMatchObject({code:'tiktok_asset_coverage'});
 expect(f.writes).toEqual([]);
});
it.each([{identity_list:[],page_info:{total_page:''}},{identity_list:[],page_info:{total_page:2}},{identity_list:[{identity_id:'unrelated',identity_type:'TT_USER'}],page_info:{total_page:2}}])('does not skip a newer Spark source on contradictory or repeated identity pages',async(data)=>{
 const f=fixture(),fetcher=async(input:RequestInfo|URL,init?:RequestInit)=>String(input).includes('/identity/get/')?Response.json({code:0,data}):f.fetcher(input,init);
 await expect(new TikTok(f.env,scope,fetcher).referenceAssets('3')).rejects.toMatchObject({code:'tiktok_asset_coverage'});
 expect(f.writes).toEqual([]);
});
it.each([[3,2],[2,3]])('rejects changing identity totals as Spark absence proof: %j',async(first,second)=>{
 const f=fixture(),fetcher=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input)),page=Number(url.searchParams.get('page'));
  return url.pathname.includes('/identity/get/')?Response.json({code:0,data:{identity_list:[{identity_id:`unrelated-${page}`,identity_type:'TT_USER'}],page_info:{total_page:page===1?first:second}}}):f.fetcher(input,init);
 };
 await expect(new TikTok(f.env,scope,fetcher).referenceAssets('3')).rejects.toMatchObject({code:'tiktok_asset_coverage'});
 expect(f.writes).toEqual([]);
});
function fixture(){
 const ad:any={advertiser_id:scope.platformAccountId,ad_id:'3',adgroup_id:'2',ad_name:'Spark source',operation_status:'DISABLE',ad_format:'SINGLE_VIDEO',identity_type:'TT_USER',identity_id:'identity',tiktok_item_id:'7647120342162361620',video_id:'source-video',ad_text:'Existing post',call_to_action_id:'portfolio',landing_page_url:'https://example.com/'};
 const group:any={advertiser_id:scope.platformAccountId,adgroup_id:'2',campaign_id:'1',operation_status:'DISABLE',budget_mode:'BUDGET_MODE_DYNAMIC_DAILY_BUDGET',budget:56,schedule_type:'SCHEDULE_START_END',billing_event:'CPC',optimization_goal:'CLICK',pacing:'PACING_MODE_SMOOTH',promotion_type:'WEBSITE',location_ids:['MY']};
 const campaign:any={advertiser_id:scope.platformAccountId,campaign_id:'1',campaign_type:'REGULAR_CAMPAIGN',objective_type:'WEB_CONVERSIONS',budget_optimize_on:false};
 const identity:any={identity_id:'identity',identity_type:'TT_USER',available_status:'AVAILABLE',is_gpppa:false,can_pull_video:true};
 const post:any={item_id:ad.tiktok_item_id,item_type:'VIDEO',status:'ITEM_STATUS_HESITATE_RECOMMEND',text:'Existing post',video_info:{signature:'stable-content',width:720,height:1280,url:'https://example.com/signed-preview'}};
 const rows:any={ad:[ad],adgroup:[group],campaign:[campaign]},writes:any[]=[],steps=new Map();
 const store:any={beginProviderStep:async(_o:string,s:string)=>{const row=steps.get(s)??{provider_id:null,claimed:true};steps.set(s,row);return row;},confirmProviderStep:async(_o:string,s:string,id:string)=>steps.set(s,{provider_id:id,claimed:false}),providerStep:async(_o:string,s:string)=>steps.get(s),appendTikTokDiagnostic:vi.fn(async()=>{})};
 const env:any={TIKTOK_ACCESS_TOKEN:'synthetic',M04_TIKTOK_MIN_DAILY_BUDGET:'20.00',M04_TIKTOK_BUDGET_CURRENCY:'MYR',M04_TIKTOK_BUDGET_EVIDENCE:JSON.stringify({advertiser_id:scope.platformAccountId,currency:'MYR',minimum_daily_budget:'20.00',budget_mode:group.budget_mode,objective:campaign.objective_type,optimization_goal:group.optimization_goal,billing_event:group.billing_event,promotion_type:group.promotion_type})};
 const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input)),kind=url.pathname.split('/').at(-3)!;
  if(init?.method==='POST'){const body=JSON.parse(String(init.body));writes.push({kind,body});const id=String(10+writes.length);rows[kind].push(kind==='ad'?{...body.creatives[0],ad_id:id,adgroup_id:body.adgroup_id,advertiser_id:scope.platformAccountId,ad_text:post.text,video_id:null}:{...body,[`${kind}_id`]:id});return Response.json({code:0,data:kind==='ad'?{ad_ids:[id]}:{[`${kind}_id`]:id}});}
  const filter=JSON.parse(url.searchParams.get('filtering')??'{}');
  const data=url.pathname.includes('/advertiser/info/')?{list:[{advertiser_id:scope.platformAccountId,currency:'MYR',timezone:'Asia/Singapore',status:'STATUS_ENABLE'}]}:url.pathname.includes('/identity/info/')?{identity_info:identity}:url.pathname.includes('/identity/video/info/')?{video_detail:post}:url.pathname.includes('/identity/get/')?{identity_list:[identity],page_info:{total_page:1}}:url.pathname.includes('/file/video/ad/info/')?{list:[{video_id:ad.video_id}]}:{list:rows[kind].filter((r:any)=>!filter[`${kind}_ids`]||filter[`${kind}_ids`].includes(r[`${kind}_id`])),page_info:{total_page:1}};
  return Response.json({code:0,data});
 });
 return {ad,group,campaign,identity,post,env,fetcher,writes,rows,store,provider:new TikTok(env,scope,fetcher)};
}
it.each(['campaign','adgroup','ad'])('persists a recovered %s but stops subsequent writes after a lost response',async(lostKind)=>{
 const f=fixture(),fetcher=async(input:RequestInfo|URL,init?:RequestInit)=>{const response=await f.fetcher(input,init);if(init?.method==='POST'&&new URL(String(input)).pathname.includes(`/${lostKind}/create/`))throw new Error('lost response');return response;};
 const provider=new TikTok(f.env,scope,fetcher),source=(await provider.referenceAssets('3')).sources[0];
 const plan={campaign_type:'tiktok_existing_ad' as const,name:'Lost test',currency:'MYR',timezone:'Asia/Singapore',daily_budget:'20.00',source_ad_id:'3',source_adgroup_id:'2',source_campaign_id:'1',source_fingerprint:source.source_fingerprint};
 await expect(provider.create(plan,'wf','op',f.store)).rejects.toMatchObject({outcome:'unknown',code:'tiktok_incomplete'});
 const count=['campaign','adgroup','ad'].indexOf(lostKind)+1;
 expect(f.writes).toHaveLength(count);expect((await f.store.providerStep('op',lostKind==='adgroup'?'adset':lostKind)).provider_id).toBe(String(10+count));
 if(count<3)await expect(provider.readback(plan,'wf','op',f.store)).rejects.toMatchObject({outcome:'unknown'});
 else expect(await provider.readback(plan,'wf','op',f.store)).toMatchObject({status:'DISABLE'});
 expect(f.writes).toHaveLength(count);
});
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
it('normalizes documented manual group response defaults without enabling automation',async()=>{const f=fixture();Object.assign(f.group,{campaign_automation_type:'MANUAL',ios14_quota_type:'UNOCCUPIED',bid_display_mode:'CPMV',creative_material_mode:'CUSTOM'});expect((await f.provider.referenceAssets('3')).sources[0].resource_status).toBe('ready');f.group.creative_material_mode='DYNAMIC';expect((await f.provider.referenceAssets('3')).source_checks[0].issues).toContain('unsupported_campaign_automation');});
it('rejects expired authorization codes before creation',async()=>{const f=fixture();f.ad.identity_type=f.identity.identity_type='AUTH_CODE';f.post.auth_info={ad_auth_status:'AUTHORIZED',auth_start_time:'2024-01-01 00:00:00',auth_end_time:'2025-01-01 00:00:00'};expect((await f.provider.referenceAssets('3')).source_checks[0].issues).toContain('spark_authorization_expired');expect(f.writes).toEqual([]);});
it('identifies the exact failing authorization endpoint without exposing provider messages or tokens',async()=>{const f=fixture(),fetcher=async(input:RequestInfo|URL,init?:RequestInit)=>String(input).includes('/identity/video/info/')?Response.json({code:40000,message:'item_id unavailable secret synthetic'}):f.fetcher(input,init);await expect(new TikTok(f.env,scope,fetcher).referenceAssets('3')).rejects.toMatchObject({code:'tiktok_identity_video_info_40000_item_id'});});
it('uses documented v1.3 identity lists and finds an authorized identity beyond page one',async()=>{
 const f=fixture(),fetcher=async(input:RequestInfo|URL,init?:RequestInit)=>{const url=new URL(String(input));if(url.pathname.includes('/identity/get/'))return Response.json({code:0,data:{identity_list:url.searchParams.get('page')==='2'?[f.identity]:[],page_info:{total_page:2}}});if(url.pathname.includes('/identity/info/'))return Response.json({code:40000});return f.fetcher(input,init);};
 expect((await new TikTok(f.env,scope,fetcher).referenceAssets('3')).sources[0].resource_status).toBe('ready');
});
it('fails closed when current identity discovery is incomplete or the source identity is no longer linked',async()=>{
 for(const total of [11,1]){const f=fixture(),fetcher=async(input:RequestInfo|URL,init?:RequestInit)=>String(input).includes('/identity/get/')?Response.json({code:0,data:{identity_list:[],page_info:{total_page:total}}}):String(input).includes('/identity/info/')?Response.json({code:40000}):f.fetcher(input,init);const task=new TikTok(f.env,scope,fetcher).referenceAssets('3');if(total===11)await expect(task).rejects.toMatchObject({code:'tiktok_asset_coverage'});else expect((await task).source_checks[0].issues).toContain('spark_identity_not_linked');}
});
it('accepts exact positive identity authorization without inferring complete negative coverage from missing pagination',async()=>{
 for(const present of [true,false]){const f=fixture(),fetcher=async(input:RequestInfo|URL,init?:RequestInit)=>String(input).includes('/identity/get/')?Response.json({code:0,data:{identity_list:present?[f.identity]:[]}}):f.fetcher(input,init),task=new TikTok(f.env,scope,fetcher).referenceAssets('3');if(present)expect((await task).sources[0].resource_status).toBe('ready');else await expect(task).rejects.toMatchObject({code:'tiktok_asset_coverage_identity_pages_missing'});}
});
it('retains discovery progress at an unresolved identity with missing native pagination',async()=>{
 const f=fixture();f.rows.ad.unshift({...f.ad,ad_id:'4',ad_format:'SINGLE_IMAGE'});
 const fetcher=async(input:RequestInfo|URL,init?:RequestInit)=>String(input).includes('/identity/get/')?Response.json({code:0,data:{identity_list:[]}}):f.fetcher(input,init);
 const refs=await new TikTok(f.env,scope,fetcher).referenceAssets();expect(refs.discovery).toMatchObject({scanned:1,complete:false,unresolved_source_ad_id:'3',automatic_continuation_allowed:false});expect(refs.discovery.next_cursor).toBeTruthy();
});
it('diagnoses only the exact already-linked Business Center identity without substituting creative identity',async()=>{
 for(const id of ['identity','different']){const f=fixture();f.env.M04_TIKTOK_EXISTING_BC_ID='7179390283606507521';const fetcher=async(input:RequestInfo|URL,init?:RequestInit)=>{const url=new URL(String(input));return url.pathname.includes('/identity/get/')?Response.json({code:0,data:{identity_list:url.searchParams.get('identity_type')==='BC_AUTH_TT'?[{...f.identity,identity_id:id,identity_type:'BC_AUTH_TT',identity_authorized_bc_id:f.env.M04_TIKTOK_EXISTING_BC_ID}]:[]}}):f.fetcher(input,init);};await expect(new TikTok(f.env,scope,fetcher).referenceAssets('3')).rejects.toMatchObject({code:id==='identity'?'tiktok_spark_existing_bc_identity_requires_mapping':'tiktok_asset_coverage_identity_pages_missing'});expect(f.writes).toEqual([]);}
});
it('reconciles delayed visibility only for a persisted begun step without creating later objects',async()=>{
 const f=fixture(),source=(await f.provider.referenceAssets('3')).sources[0],plan={campaign_type:'tiktok_existing_ad' as const,name:'Spark test',currency:'MYR',timezone:'Asia/Singapore',daily_budget:'20.00',source_ad_id:'3',source_adgroup_id:'2',source_campaign_id:'1',source_fingerprint:source.source_fingerprint};
 const name='Spark test [wf]';f.rows.campaign.push({...f.campaign,campaign_id:'99',campaign_name:name});
 const stored:any={status:'started',provider_id:null,provider_name:name};const store:any={appendTikTokDiagnostic:vi.fn(async()=>{}),providerStep:async(_o:string,step:string)=>step==='campaign'?stored:null,confirmProviderStep:vi.fn(async(_o:string,_s:string,id:string)=>{stored.provider_id=id;stored.status='confirmed';})};
 await expect(f.provider.readback(plan,'wf','op',store)).rejects.toMatchObject({code:'tiktok_incomplete'});expect(store.confirmProviderStep).toHaveBeenCalledWith('op','campaign','99');expect(f.writes).toEqual([]);
});

function mappedFixture(){
 const f=fixture(),mapping={advertiser_id:scope.platformAccountId,source_ad_id:f.ad.ad_id,source_identity_id:f.ad.identity_id,tiktok_item_id:f.ad.tiktok_item_id,identity_id:'authorized-bc-identity',identity_authorized_bc_id:'7179390283606507521'};
 f.env.M04_TIKTOK_SPARK_IDENTITY_MAPPINGS=JSON.stringify([mapping]);
 Object.assign(f.identity,{identity_id:mapping.identity_id,identity_type:'BC_AUTH_TT',identity_authorized_bc_id:mapping.identity_authorized_bc_id});
 const fetcher=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.pathname.includes('/identity/get/')&&url.searchParams.get('identity_type')==='TT_USER')return Response.json({code:0,data:{identity_list:[],page_info:{}}});
  if(url.pathname.includes('/identity/video/info/')&&(url.searchParams.get('identity_id')!==mapping.identity_id||url.searchParams.get('identity_type')!=='BC_AUTH_TT'||url.searchParams.get('identity_authorized_bc_id')!==mapping.identity_authorized_bc_id))return Response.json({code:40000});
  return f.fetcher(input,init);
 };
 return {...f,mapping,provider:new TikTok(f.env,scope,fetcher)};
}
it('binds an explicit exact-post BC mapping to live identity and post proof and keeps the original source intact',async()=>{
 const f=mappedFixture(),original=structuredClone(f.ad),refs=await f.provider.referenceAssets('3');
 expect(refs.sources[0]).toMatchObject({resource_status:'ready',identity_id:f.mapping.identity_id,identity_type:'BC_AUTH_TT',identity_authorized_bc_id:f.mapping.identity_authorized_bc_id,source_identity_id:'identity',source_identity_type:'TT_USER'});
 expect(f.ad).toEqual(original);expect(f.writes).toEqual([]);
 f.post.video_info.signature='changed';expect((await f.provider.referenceAssets('3')).sources[0].source_fingerprint).not.toBe(refs.sources[0].source_fingerprint);
});
it.each(['advertiser_id','source_ad_id','source_identity_id','tiktok_item_id'])('never applies a BC mapping to a different %s',async(key)=>{
 const f=mappedFixture();f.env.M04_TIKTOK_SPARK_IDENTITY_MAPPINGS=JSON.stringify([{...f.mapping,[key]:'999'}]);
 await expect(f.provider.referenceAssets('3')).rejects.toMatchObject({code:'tiktok_asset_coverage_identity_pages_missing'});expect(f.writes).toEqual([]);
});
it('rejects mapped identity permission or exact post failure before writing',async()=>{
 for(const mutate of [(f:ReturnType<typeof mappedFixture>)=>f.identity.can_pull_video=false,(f:ReturnType<typeof mappedFixture>)=>f.post.item_id='other']){
  const f=mappedFixture();mutate(f);expect((await f.provider.referenceAssets('3')).sources).toEqual([]);expect(f.writes).toEqual([]);
 }
});
it('accepts native empty carousel defaults on a signed VIDEO post but rejects populated or unknown carousel content',async()=>{
 const f=mappedFixture();f.post.carousel_info={image_info:[],music_info:{}};
 expect((await f.provider.referenceAssets('3')).sources[0].resource_status).toBe('ready');
 for(const carousel of [{image_info:[{image_id:'photo'}],music_info:{}},{image_info:[],music_info:{music_id:'music'}},{image_info:[],music_info:{},other:'unknown'}]){
  f.post.carousel_info=carousel;expect((await f.provider.referenceAssets('3')).source_checks[0].issues).toContain('spark_post_unavailable');
 }
 expect(f.writes).toEqual([]);
});
it('creates and reads back the exact authorized mapped Spark identity without editing the source',async()=>{
 const f=mappedFixture(),original=structuredClone(f.ad),source=(await f.provider.referenceAssets('3')).sources[0];
 const plan={campaign_type:'tiktok_existing_ad' as const,name:'Mapped Spark test',currency:'MYR',timezone:'Asia/Singapore',daily_budget:'20.00',source_ad_id:'3',source_adgroup_id:'2',source_campaign_id:'1',source_fingerprint:source.source_fingerprint};
 await f.provider.create(plan,'wf','op',f.store);
 expect(f.writes[2].body.creatives[0]).toMatchObject({identity_id:f.mapping.identity_id,identity_type:'BC_AUTH_TT',identity_authorized_bc_id:f.mapping.identity_authorized_bc_id,tiktok_item_id:f.ad.tiktok_item_id,operation_status:'DISABLE'});
 expect(f.writes[2].body.creatives[0]).not.toHaveProperty('ad_text');expect(f.ad).toEqual(original);
 expect(await f.provider.readback(plan,'wf','op',f.store)).toMatchObject({identity_id:f.mapping.identity_id,identity_type:'BC_AUTH_TT',identity_authorized_bc_id:f.mapping.identity_authorized_bc_id,source_identity_id:'identity'});
 f.env.M04_TIKTOK_SPARK_IDENTITY_MAPPINGS=JSON.stringify([{...f.mapping,identity_id:'different'}]);
 await expect(f.provider.validate(plan,'wf')).rejects.toBeDefined();expect(f.writes).toHaveLength(3);
});
