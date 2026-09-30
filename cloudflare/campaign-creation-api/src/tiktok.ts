import {boundedJson,digest,type Scope,type TikTokPlan} from './contracts';
import {ProviderError} from './google';
import {Store} from './store';
import {SignJWT,jwtVerify} from 'jose';

export interface TikTokCredentials {TIKTOK_ACCESS_TOKEN?:string;M04_TIKTOK_MIN_DAILY_BUDGET?:string;M04_TIKTOK_BUDGET_CURRENCY?:string;M04_TIKTOK_BUDGET_EVIDENCE?:string}
export interface TikTokDiscoveryOptions {limit?:number;cursor?:string}
export const tiktokProviderName=(plan:TikTokPlan,workflowId:string)=>`${plan.name.slice(0,80)} [${workflowId}]`;
type Kind='campaign'|'adgroup'|'ad';
const creativeKeys=['ad_format','ad_text','video_id','identity_id','identity_type','landing_page_url','call_to_action','call_to_action_id','display_name','identity_authorized_bc_id','tiktok_item_id'] as const;
const sparkKeys=['ad_format','identity_id','identity_type','identity_authorized_bc_id','tiktok_item_id','landing_page_url','call_to_action','call_to_action_id'] as const;
const sparkPost=(ad:Record<string,any>)=>typeof ad.tiktok_item_id==='string'&&/^[1-9]\d{0,29}$/.test(ad.tiktok_item_id);
const inactive=(value:unknown)=>value==null||value===false||value===0||['','0','OFF','UNSET','NONE','DISABLE','DISABLED'].includes(String(value))||Array.isArray(value)&&value.length===0;
const groupMetadata=['advertiser_id','campaign_id','campaign_name','adgroup_id','adgroup_name','operation_status','secondary_status','create_time','modify_time','is_aco','is_new_structure','is_smart_plus','budget','budget_mode','schedule_type','schedule_start_time','schedule_end_time'];
const unsupportedGroupSettings=(group:Record<string,any>)=>Object.keys(group).filter(key=>!groupMetadata.includes(key)&&!(groupKeys as readonly string[]).includes(key)&&!inactive(group[key]));
function httpsDestination(value:unknown){try{const url=new URL(String(value));return url.protocol==='https:'&&!!url.hostname&&!url.username&&!url.password;}catch{return false;}}
// Documented classic adgroup/create fields. Preserve targeting, exclusions and
// optimization rather than accepting a source then silently dropping its settings.
const groupKeys=['billing_event','optimization_goal','pacing','promotion_type','placement_type','placements','location_ids','age_groups','gender','languages','bid_type','bid_price','conversion_bid_price','pixel_id','optimization_event','custom_conversion_id','promotion_website_type',
  'tiktok_subplacements','search_result_enabled','comment_disabled','video_download_disabled','share_disabled','blocked_pangle_app_ids','saved_audience_id','auto_targeting_enabled','zipcode_ids','spending_power','household_income','audience_ids','smart_audience_enabled','excluded_audience_ids','interest_category_ids','interest_keyword_ids','purchase_intention_keyword_ids','actions','smart_interest_behavior_enabled','included_pangle_audience_package_ids','excluded_pangle_audience_package_ids','operating_systems','min_android_version','ios14_targeting','min_ios_version','device_model_ids','network_types','carrier_ids','isp_ids','device_price_ranges','targeting_expansion','audience_type','audience_rule','contextual_tag_ids','brand_safety_type','brand_safety_partner','category_exclusion_ids','vertical_sensitivity_id','dayparting','click_attribution_window','engaged_view_attribution_window','view_attribution_window','attribution_event_count','statistic_type','is_hfss','is_lhf_compliance'] as const;
const opaqueId=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(value);
// Provider JSON object order is not a source revision. Preserve every value and
// array order while making source and catalog fingerprints deterministic.
function canonical(value:any):any{return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;}

export class TikTok {
  private deadline=Date.now()+25_000;
  private snapshot:Record<string,any>|undefined;
  private checked:{key:string;at:number;payload:Record<string,any>}|undefined;
  constructor(private env:TikTokCredentials,private scope:Scope,private fetcher:typeof fetch=(input,init)=>fetch(input,init)){}
  private async request(path:string,params:Record<string,string>|Record<string,unknown>,write=false){
    if(this.scope.platform!=='TikTok'||!this.env.TIKTOK_ACCESS_TOKEN)throw new ProviderError('unavailable','tiktok_connection');
    const url=new URL(`https://business-api.tiktok.com/open_api/v1.3/${path}/`);
    if(!write)for(const [key,value] of Object.entries(params))url.searchParams.set(key,String(value));
    const remaining=this.deadline-Date.now();if(remaining<=0)throw new ProviderError('unavailable','tiktok_deadline');
    let response:Response;
    try{response=await this.fetcher(url,{method:write?'POST':'GET',headers:{'Access-Token':this.env.TIKTOK_ACCESS_TOKEN,...(write?{'Content-Type':'application/json'}:{})},
      ...(write?{body:JSON.stringify(params)}:{}),redirect:'manual',signal:AbortSignal.timeout(Math.min(10_000,remaining))});}
    catch{throw new ProviderError(write?'unknown':'unavailable','tiktok_response');}
    let value:Record<string,any>;
    try{value=await boundedJson(response,262_144);}catch{throw new ProviderError(write?'unknown':'unavailable','tiktok_response');}
    if(!response.ok||value.code!==0)throw new ProviderError(write?'unknown':'unavailable',response.status===429||[40100,40101,40102].includes(Number(value.code))?'tiktok_rate_limited':`tiktok_${Number(value.code)||'response'}`);
    return value.data as Record<string,any>;
  }
  private async list(kind:Kind,filter:Record<string,unknown>={}){
    const rows:Record<string,any>[]=[];let total=1;
    for(let page=1;page<=10;page++){
      const data=await this.request(`${kind}/get`,{advertiser_id:this.scope.platformAccountId,page:String(page),page_size:'100',filtering:JSON.stringify(filter),...(kind==='ad'?{fields:JSON.stringify(['advertiser_id','ad_id','adgroup_id','ad_name','operation_status','create_time','is_aco',...creativeKeys])}:{})});
      if(!Array.isArray(data?.list)||data.list.length>100||!Number.isSafeInteger(Number(data.page_info?.total_page)))throw new ProviderError('unavailable','tiktok_coverage');
      total=Number(data.page_info.total_page);
      if(total>10||total<0||page>Math.max(total,1))throw new ProviderError('unavailable','tiktok_coverage');
      for(const row of data.list){if(String(row.advertiser_id)!==this.scope.platformAccountId)throw new ProviderError('unavailable','tiktok_ownership');rows.push(row);}
      if(page>=total)break;
    }
    return rows;
  }
  private async one(kind:Kind,id:string){
    const rows=await this.list(kind,{[`${kind}_ids`]:[id]});
    if(rows.length!==1||String(rows[0][`${kind}_id`])!==id)throw new ProviderError('unavailable','tiktok_readback');
    return rows[0];
  }
  private async cursorKey(){return new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`tiktok-discovery-v1:${this.env.TIKTOK_ACCESS_TOKEN}`)));}
  private async readCursor(cursor:string){
    try{
      const {payload}=await jwtVerify(cursor,await this.cursorKey(),{algorithms:['HS256'],issuer:'m04-tiktok-discovery',audience:await digest(this.scope),requiredClaims:['exp','iat'],maxTokenAge:'15m'});
      if(!Number.isSafeInteger(payload.offset)||Number(payload.offset)<0||typeof payload.catalog!=='string')throw new Error();
      return {offset:Number(payload.offset),catalog:payload.catalog};
    }catch{throw new ProviderError('unavailable','tiktok_discovery_cursor');}
  }
  private async authorizeSpark(ad:Record<string,any>){
    const params={advertiser_id:this.scope.platformAccountId,identity_id:String(ad.identity_id),identity_type:String(ad.identity_type),...(ad.identity_authorized_bc_id?{identity_authorized_bc_id:String(ad.identity_authorized_bc_id)}:{})};
    const identity=(await this.request('identity/info',params))?.identity_info;
    if(!identity||String(identity.identity_id)!==ad.identity_id||identity.identity_type!==ad.identity_type||identity.is_gpppa!==false||
      (ad.identity_type!=='AUTH_CODE'&&(identity.available_status!=='AVAILABLE'||identity.can_pull_video!==true)))return {issue:'spark_identity_unavailable'};
    const post=(await this.request('identity/video/info',{...params,item_id:String(ad.tiktok_item_id)}))?.video_detail;
    if(!post||String(post.item_id)!==ad.tiktok_item_id||post.status!=='ITEM_STATUS_HESITATE_RECOMMEND'||
      (post.item_type!=null&&post.item_type!=='VIDEO')||!post.video_info||post.carousel_info||typeof post.text!=='string'||
      typeof post.video_info.signature!=='string'||!post.video_info.signature)return {issue:'spark_post_unavailable'};
    let auth:Record<string,unknown>|undefined;
    if(ad.identity_type==='AUTH_CODE'){
      const info=post.auth_info;
      const utc=(value:unknown)=>typeof value==='string'?Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value)?value.replace(' ','T')+'Z':value):NaN;
      const start=utc(info?.auth_start_time),end=utc(info?.auth_end_time);
      if(info?.ad_auth_status!=='AUTHORIZED'||!Number.isFinite(start)||!Number.isFinite(end)||start>Date.now()||end<=Date.now())return {issue:'spark_authorization_expired'};
      auth={ad_auth_status:info.ad_auth_status,auth_start_time:info.auth_start_time,auth_end_time:info.auth_end_time};
    }
    // Signed preview URLs rotate. Bind only documented authorization and stable content.
    return {authorization:{identity_id:identity.identity_id,identity_type:identity.identity_type,available_status:identity.available_status,
      is_gpppa:identity.is_gpppa,can_pull_video:identity.can_pull_video,item_id:post.item_id,status:post.status,text:post.text,
      signature:post.video_info.signature,...(auth?{auth_info:auth}:{})}};
  }
  async referenceAssets(selectedAdId?:string,options:TikTokDiscoveryOptions={}){
    this.deadline=Date.now()+25_000;this.snapshot=undefined;
    if(selectedAdId&&options.cursor)throw new ProviderError('unavailable','tiktok_discovery_cursor');
    const continuation=options.cursor?await this.readCursor(options.cursor):undefined;
    const limit=options.limit??20;if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw new ProviderError('unavailable','tiktok_discovery_cursor');
    const account=await this.request('advertiser/info',{advertiser_ids:JSON.stringify([this.scope.platformAccountId]),
      fields:JSON.stringify(['advertiser_id','name','currency','timezone','status'])});
    if(!Array.isArray(account?.list)||account.list.length!==1||String(account.list[0].advertiser_id)!==this.scope.platformAccountId||
      !/^[A-Z]{3}$/.test(String(account.list[0].currency??''))||!account.list[0].timezone||!['STATUS_ENABLE','ENABLE','STATUS_ACTIVE'].includes(String(account.list[0].status)))
      throw new ProviderError('unavailable','tiktok_account_configuration');
    try{new Intl.DateTimeFormat('en',{timeZone:account.list[0].timezone});}catch{throw new ProviderError('unavailable','tiktok_account_timezone');}
    const ads=selectedAdId?[await this.one('ad',selectedAdId)]:await this.list('ad');
    ads.sort((a,b)=>String(b.create_time??'').localeCompare(String(a.create_time??''))||String(b.ad_id??'').padStart(30,'0').localeCompare(String(a.ad_id??'').padStart(30,'0')));
    const catalog=await digest(canonical(ads)),offset=continuation?.offset??0;
    if(continuation&&(continuation.catalog!==catalog||offset>=ads.length))throw new ProviderError('unavailable','tiktok_discovery_changed');
    const sources=[];const source_checks:Array<{source_ad_id:string;issues:string[]}>=[];
    const source_diagnostics:Array<{source_ad_id:string;name:string;ad_format:string;identity_type:string|null;tiktok_item_id:string|null;returned_creative_fields:string[];unsupported_group_fields?:string[]}>=[];
    let scanned=offset;let unresolved_source_ad_id:string|null=null;
    for(const ad of ads.slice(offset,offset+limit)){
      // Stop between candidates while retaining enough time to sign a continuation.
      if(!selectedAdId&&scanned>offset&&Date.now()>this.deadline-8_000)break;
      scanned++;
      source_diagnostics.push({source_ad_id:String(ad.ad_id),name:String(ad.ad_name??'').slice(0,200),ad_format:String(ad.ad_format??'').slice(0,100),identity_type:['CUSTOMIZED_USER','AUTH_CODE','TT_USER','BC_AUTH_TT'].includes(ad.identity_type)?ad.identity_type:null,tiktok_item_id:/^\d{1,30}$/.test(String(ad.tiktok_item_id??''))?String(ad.tiktok_item_id):null,returned_creative_fields:creativeKeys.filter(key=>ad[key]!=null)});
      const issues:string[]=[];
      const spark=sparkPost(ad);
      if(!/^\d+$/.test(String(ad.ad_id??''))||!/^\d+$/.test(String(ad.adgroup_id??'')))issues.push('invalid_resource_id');
      if(!['ENABLE','DISABLE'].includes(String(ad.operation_status)))issues.push('unsupported_ad_status');
      if(ad.ad_format!=='SINGLE_VIDEO')issues.push('unsupported_ad_format');
      if(!spark&&!opaqueId(ad.video_id))issues.push('missing_video_id');
      if(!opaqueId(ad.identity_id))issues.push('missing_identity_id');
      if(spark&&!['TT_USER','BC_AUTH_TT','AUTH_CODE'].includes(ad.identity_type))issues.push('spark_ad_requires_review');
      if(!spark&&ad.tiktok_item_id!=null&&!['','0'].includes(String(ad.tiktok_item_id)))issues.push('invalid_spark_post_id');
      if(spark&&ad.identity_type==='BC_AUTH_TT'&&!/^\d+$/.test(String(ad.identity_authorized_bc_id??'')))issues.push('missing_authorized_business_center');
      if(!httpsDestination(ad.landing_page_url))issues.push('missing_https_destination');
      if(issues.length){source_checks.push({source_ad_id:String(ad.ad_id),issues});continue;}
      try{
      const group=await this.one('adgroup',String(ad.adgroup_id));
      const campaign=await this.one('campaign',String(group.campaign_id));
      if(!['BUDGET_MODE_DAY','BUDGET_MODE_DYNAMIC_DAILY_BUDGET'].includes(group.budget_mode)||Number(group.budget)<=0)issues.push('daily_adgroup_budget_required');
      if(!['SCHEDULE_FROM_NOW','SCHEDULE_START_END'].includes(group.schedule_type))issues.push('unsupported_source_schedule');
      if(campaign.campaign_type!=='REGULAR_CAMPAIGN'||campaign.budget_optimize_on===true||group.is_smart_plus||campaign.is_smart_plus||group.is_aco===true||ad.is_aco===true)issues.push('unsupported_campaign_automation');
      if(!group.billing_event||!group.optimization_goal||!group.pacing||!campaign.objective_type)issues.push('incomplete_optimization_settings');
      if(!Array.isArray(group.location_ids)||!group.location_ids.length)issues.push('missing_location_targeting');
      const unsupported=unsupportedGroupSettings(group);
      if(unsupported.length){issues.push('unsupported_source_settings');source_diagnostics.at(-1)!.unsupported_group_fields=unsupported.filter(key=>/^[a-z][a-z0-9_]{0,99}$/.test(key)).slice(0,100);}
      if((!spark&&!ad.ad_text)||(!ad.call_to_action&&!opaqueId(ad.call_to_action_id))||!ad.identity_type||!ad.ad_format)issues.push('incomplete_creative_settings');
      if(issues.length){source_checks.push({source_ad_id:String(ad.ad_id),issues});continue;}
      let sparkAuthorization:Record<string,any>|undefined;
      if(spark){
        const authorized=await this.authorizeSpark(ad);
        if(authorized.issue){source_checks.push({source_ad_id:String(ad.ad_id),issues:[authorized.issue]});continue;}
        sparkAuthorization=authorized.authorization;
      }else{
      const identity=await this.request('identity/get',{advertiser_id:this.scope.platformAccountId,identity_type:String(ad.identity_type),...(ad.identity_authorized_bc_id?{identity_authorized_bc_id:String(ad.identity_authorized_bc_id)}:{}),page:'1',page_size:'100'});
      const videos=await this.request('file/video/ad/info',{advertiser_id:this.scope.platformAccountId,video_ids:JSON.stringify([ad.video_id])});
      const identityFound=Array.isArray(identity?.list)&&identity.list.some((row:any)=>String(row.identity_id)===String(ad.identity_id));
      const pages=identity?.page_info?.total_page;
      const negativeIdentityComplete=(typeof pages==='number'&&Number.isSafeInteger(pages)&&pages>=0&&pages<=1)||(typeof pages==='string'&&/^[01]$/.test(pages));
      if(!Array.isArray(identity?.list)||!Array.isArray(videos?.list)||(!identityFound&&!negativeIdentityComplete))
        throw new ProviderError('unavailable','tiktok_asset_coverage');
      if(!identityFound||!videos.list.some((row:any)=>String(row.video_id)===String(ad.video_id))){
        if(selectedAdId)throw new ProviderError('unavailable','tiktok_asset_review');
        source_checks.push({source_ad_id:String(ad.ad_id),issues:['tiktok_asset_review']});continue;
      }
      }
      let evidence:any;try{evidence=JSON.parse(this.env.M04_TIKTOK_BUDGET_EVIDENCE??'null');}catch{}
      const evidenceMatches=evidence?.advertiser_id===this.scope.platformAccountId&&evidence.currency===account.list[0].currency&&
        evidence.minimum_daily_budget===this.env.M04_TIKTOK_MIN_DAILY_BUDGET&&evidence.budget_mode===group.budget_mode&&evidence.objective===campaign.objective_type&&
        evidence.optimization_goal===group.optimization_goal&&evidence.billing_event===group.billing_event&&evidence.promotion_type===group.promotion_type;
      const min=(!spark||evidenceMatches)&&this.env.M04_TIKTOK_BUDGET_CURRENCY===account.list[0].currency&&/^\d{1,5}(\.\d{1,2})?$/.test(this.env.M04_TIKTOK_MIN_DAILY_BUDGET??'')&&Number(this.env.M04_TIKTOK_MIN_DAILY_BUDGET)>0&&Number(this.env.M04_TIKTOK_MIN_DAILY_BUDGET)<=10_000
        ?this.env.M04_TIKTOK_MIN_DAILY_BUDGET!:null;
      this.snapshot=structuredClone({ad,group,campaign,...(sparkAuthorization?{sparkAuthorization}:{})});
      sources.push({source_ad_id:String(ad.ad_id),source_adgroup_id:String(group.adgroup_id),source_campaign_id:String(campaign.campaign_id),
        objective:campaign.objective_type,budget_mode:group.budget_mode,budget_settings:{promotion_type:group.promotion_type,billing_event:group.billing_event,optimization_goal:group.optimization_goal},source_fingerprint:await digest(canonical(this.snapshot)),video_id:ad.video_id==null?null:String(ad.video_id),identity_id:String(ad.identity_id),identity_type:ad.identity_type,
        ...(spark?{tiktok_item_id:String(ad.tiktok_item_id),creative_mode:'existing_spark_post'}:{creative_mode:'existing_video'}),
        final_url:String(ad.landing_page_url),minimum_daily_budget:min,resource_status:min?'ready':'budget_floor_unverified'});
      break;
      }catch(error){
        if(selectedAdId||!(error instanceof ProviderError)||!['tiktok_deadline','tiktok_response','tiktok_asset_coverage'].includes(error.code))throw error;
        // Preserve only definitively checked candidates. Do not skip the unresolved
        // newer source or automatically loop a continuation that made no progress.
        scanned--;unresolved_source_ad_id=String(ad.ad_id);
        source_checks.push({source_ad_id:String(ad.ad_id),issues:[error.code]});break;
      }
    }
    const complete=!!selectedAdId||sources.length>0||scanned===ads.length;
    const next_cursor=complete?null:await new SignJWT({offset:scanned,catalog}).setProtectedHeader({alg:'HS256',typ:'JWT'}).setIssuer('m04-tiktok-discovery').setAudience(await digest(this.scope)).setIssuedAt().setExpirationTime('15m').sign(await this.cursorKey());
    return {account:{account_id:this.scope.platformAccountId,currency:account.list[0].currency,timezone_name:account.list[0].timezone,
      account_status:account.list[0].status},sources,source_checks,source_diagnostics,discovery:{complete,scanned,total:ads.length,next_cursor,unresolved_source_ad_id,automatic_continuation_allowed:!unresolved_source_ad_id}};
  }
  async validate(plan:TikTokPlan,_workflowId:string){
    this.checked=undefined;
    const refs=await this.referenceAssets(plan.source_ad_id),source=refs.sources[0];
    if(!source||source.resource_status!=='ready'||source.source_ad_id!==plan.source_ad_id||source.source_adgroup_id!==plan.source_adgroup_id||
      source.source_campaign_id!==plan.source_campaign_id||source.source_fingerprint!==plan.source_fingerprint||
      source.minimum_daily_budget!==plan.daily_budget||refs.account.currency!==plan.currency||refs.account.timezone_name!==plan.timezone)
      throw new ProviderError('unavailable','tiktok_source_or_budget_changed');
    if(!this.snapshot)throw new ProviderError('unavailable','tiktok_source_changed');
    const {ad,group,campaign,sparkAuthorization}=this.snapshot;
    if(String(ad.adgroup_id)!==plan.source_adgroup_id||String(group.campaign_id)!==plan.source_campaign_id||(!sparkPost(ad)&&String(ad.video_id)!==source.video_id)||
      String(ad.identity_id)!==source.identity_id||String(ad.landing_page_url)!==source.final_url)
      throw new ProviderError('unavailable','tiktok_source_changed');
    const payload={source,ad,group,campaign,sparkAuthorization};
    this.checked={key:await digest({plan,workflowId:_workflowId}),at:Date.now(),payload:structuredClone(payload)};
    return payload;
  }
  private names(plan:TikTokPlan,workflowId:string){const campaign=tiktokProviderName(plan,workflowId);return {campaign,adgroup:`${campaign} ad group`,ad:`${campaign} ad`};}
  private startTime(_timezone:string){
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(Date.now()+15*60_000);
    const value=(kind:string)=>parts.find(part=>part.type===kind)?.value??'';
    return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}:${value('second')}`;
  }
  private async reconcile(store:Store,operationId:string,step:'campaign'|'adset'|'ad',name:string){
    const kind:Kind=step==='adset'?'adgroup':step;
    const rows=(await this.list(kind)).filter(row=>row[`${kind}_name`]===name);
    if(rows.length!==1||!/^\d+$/.test(String(rows[0][`${kind}_id`]??'')))throw new ProviderError('unknown','tiktok_reconcile');
    const id=String(rows[0][`${kind}_id`]);await store.confirmProviderStep(operationId,step,id);return id;
  }
  private async createStep(store:Store,operationId:string,step:'campaign'|'adset'|'ad',name:string,body:Record<string,unknown>){
    const row=await store.beginProviderStep(operationId,step,name);if(row.provider_id)return row.provider_id;
    if(!row.claimed)return this.reconcile(store,operationId,step,name);
    const kind:Kind=step==='adset'?'adgroup':step;
    let id:string;
    try{const data=await this.request(`${kind}/create`,kind==='ad'?body:{...body,request_id:`${operationId}-${step}`},true);id=String(data?.[`${kind}_id`]??data?.ad_ids?.[0]??'');}
    catch(error){if(error instanceof ProviderError&&error.outcome==='unknown')return this.reconcile(store,operationId,step,name);throw error;}
    if(!/^\d+$/.test(id))return this.reconcile(store,operationId,step,name);
    await store.confirmProviderStep(operationId,step,id);return id;
  }
  async create(plan:TikTokPlan,workflowId:string,operationId:string,store:Store){
    const key=await digest({plan,workflowId});
    if(!this.checked||this.checked.key!==key||Date.now()-this.checked.at>25_000)await this.validate(plan,workflowId);
    const payload=this.checked!.payload;this.checked=undefined;
    // Queue preflight already validated this exact payload; writes get a separate bounded budget.
    this.deadline=Date.now()+90_000;
    const {source,ad,group,campaign}=payload,names=this.names(plan,workflowId),account=this.scope.platformAccountId;
    const campaignId=await this.createStep(store,operationId,'campaign',names.campaign,{advertiser_id:account,campaign_name:names.campaign,
      campaign_type:'REGULAR_CAMPAIGN',objective_type:campaign.objective_type,budget_mode:'BUDGET_MODE_INFINITE',budget_optimize_on:false,operation_status:'DISABLE'});
    await this.checkCampaign(campaignId,names.campaign,campaign.objective_type);
    const groupBody:Record<string,unknown>={advertiser_id:account,campaign_id:campaignId,adgroup_name:names.adgroup,budget_mode:'BUDGET_MODE_DAY',
      budget:Number(plan.daily_budget),operation_status:'DISABLE'};
    groupBody.budget_mode=group.budget_mode;
    for(const key of groupKeys)if(group[key]!=null)groupBody[key]=group[key];
    if(!['CONVERT','VALUE'].includes(String(group.optimization_goal))){delete groupBody.pixel_id;delete groupBody.optimization_event;}
    // TikTok requires a current start timestamp even for an off ad group. There is no activation path.
    groupBody.schedule_start_time=this.startTime(plan.timezone);
    groupBody.schedule_type='SCHEDULE_FROM_NOW';
    delete groupBody.schedule_end_time;
    const adgroupId=await this.createStep(store,operationId,'adset',names.adgroup,groupBody);
    await this.checkAdgroup(adgroupId,names.adgroup,campaignId,Number(plan.daily_budget),group);
    const creative:Record<string,unknown>={ad_name:names.ad,operation_status:'DISABLE'};
    for(const key of sparkPost(ad)?sparkKeys:creativeKeys)if(ad[key]!=null)creative[key]=ad[key];
    const adId=await this.createStep(store,operationId,'ad',names.ad,{advertiser_id:account,adgroup_id:adgroupId,creatives:[creative]});
    await this.checkAd(adId,names.ad,adgroupId,{...ad,video_id:source.video_id,final_url:source.final_url,ad_text:payload.sparkAuthorization?.text??ad.ad_text});
    return [campaignId,adgroupId,adId];
  }
  private async checkCampaign(id:string,name:string,objective:string){
    const row=await this.one('campaign',id);
    if(row.campaign_name!==name||row.operation_status!=='DISABLE'||row.objective_type!==objective||row.campaign_type!=='REGULAR_CAMPAIGN')
      throw new ProviderError('unknown','tiktok_campaign_readback');
  }
  private async checkAdgroup(id:string,name:string,campaignId:string,budget:number,source:Record<string,any>){
    const row=await this.one('adgroup',id);
    const mismatch=groupKeys.some(key=>source[key]!=null&&
      !(key==='pixel_id'||key==='optimization_event')&&JSON.stringify(canonical(row[key]))!==JSON.stringify(canonical(source[key])))||
      ['CONVERT','VALUE'].includes(source.optimization_goal)&&['pixel_id','optimization_event'].some(key=>source[key]!=null&&String(row[key])!==String(source[key]));
    if(row.adgroup_name!==name||String(row.campaign_id)!==campaignId||row.operation_status!=='DISABLE'||row.budget_mode!==source.budget_mode||Number(row.budget)!==budget||
      mismatch||row.schedule_type!=='SCHEDULE_FROM_NOW'||
      row.optimization_goal!==source.optimization_goal||JSON.stringify(row.location_ids)!==JSON.stringify(source.location_ids)||
      JSON.stringify(row.age_groups??[])!==JSON.stringify(source.age_groups??[])||row.gender!==source.gender)
      throw new ProviderError('unknown','tiktok_adgroup_readback');
  }
  private async checkAd(id:string,name:string,groupId:string,source:Record<string,any>){
    const row=await this.one('ad',id);
    if(row.ad_name!==name||String(row.adgroup_id)!==groupId||row.operation_status!=='DISABLE'||
      (sparkPost(source)?String(row.tiktok_item_id)!==source.tiktok_item_id:String(row.video_id)!==source.video_id)||
      String(row.identity_id)!==source.identity_id||String(row.landing_page_url)!==source.final_url||
      String(row.ad_text)!==String(source.ad_text)||String(row.call_to_action)!==String(source.call_to_action)||
      String(row.call_to_action_id??'')!==String(source.call_to_action_id??'')||String(row.identity_authorized_bc_id??'')!==String(source.identity_authorized_bc_id??'')||String(row.identity_type)!==String(source.identity_type))
      throw new ProviderError('unknown','tiktok_ad_readback');
  }
  async readback(plan:TikTokPlan,workflowId:string,operationId:string,store:Store){
    this.deadline=Date.now()+30_000;
    const names=this.names(plan,workflowId),campaign=await store.providerStep(operationId,'campaign'),adgroup=await store.providerStep(operationId,'adset'),ad=await store.providerStep(operationId,'ad');
    if(!campaign?.provider_id||!adgroup?.provider_id||!ad?.provider_id)throw new ProviderError('unknown','tiktok_incomplete');
    const source=await this.one('ad',plan.source_ad_id);
    if(String(source.adgroup_id)!==plan.source_adgroup_id)throw new ProviderError('unknown','tiktok_source_changed');
    const sourceGroup=await this.one('adgroup',plan.source_adgroup_id),sourceCampaign=await this.one('campaign',plan.source_campaign_id);
    const authorized=sparkPost(source)?await this.authorizeSpark(source):undefined;
    if(authorized?.issue||String(sourceGroup.campaign_id)!==plan.source_campaign_id||await digest(canonical({ad:source,group:sourceGroup,campaign:sourceCampaign,...(authorized?{sparkAuthorization:authorized.authorization}:{})}))!==plan.source_fingerprint)
      throw new ProviderError('unknown','tiktok_source_changed');
    await this.checkCampaign(campaign.provider_id,names.campaign,sourceCampaign.objective_type);
    await this.checkAdgroup(adgroup.provider_id,names.adgroup,campaign.provider_id,Number(plan.daily_budget),sourceGroup);
    await this.checkAd(ad.provider_id,names.ad,adgroup.provider_id,{...source,video_id:String(source.video_id),final_url:String(source.landing_page_url),ad_text:authorized?.authorization?.text??source.ad_text});
    return {platform:'TikTok',account_id:this.scope.platformAccountId,campaign_id:campaign.provider_id,adgroup_id:adgroup.provider_id,
      ad_id:ad.provider_id,status:'DISABLE',daily_budget:plan.daily_budget,currency:plan.currency,source_ad_id:plan.source_ad_id,source_fingerprint:plan.source_fingerprint,...(sparkPost(source)?{tiktok_item_id:source.tiktok_item_id,identity_type:source.identity_type,identity_id:source.identity_id}:{})};
  }
}
