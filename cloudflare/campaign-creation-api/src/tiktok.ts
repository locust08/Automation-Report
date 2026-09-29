import {boundedJson,digest,type Scope,type TikTokPlan} from './contracts';
import {ProviderError} from './google';
import {Store} from './store';

export interface TikTokCredentials {TIKTOK_ACCESS_TOKEN?:string;M04_TIKTOK_MIN_DAILY_BUDGET?:string;M04_TIKTOK_BUDGET_CURRENCY?:string}
export const tiktokProviderName=(plan:TikTokPlan,workflowId:string)=>`${plan.name.slice(0,80)} [${workflowId}]`;
type Kind='campaign'|'adgroup'|'ad';
const creativeKeys=['ad_format','ad_text','video_id','identity_id','identity_type','landing_page_url','call_to_action','display_name','identity_authorized_bc_id','tiktok_item_id'] as const;
const groupKeys=['billing_event','optimization_goal','pacing','promotion_type','placement_type','placements','location_ids','age_groups','gender','languages','bid_type','bid_price','pixel_id','schedule_type','schedule_start_time','schedule_end_time'] as const;
const opaqueId=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(value);

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
      const data=await this.request(`${kind}/get`,{advertiser_id:this.scope.platformAccountId,page:String(page),page_size:'100',filtering:JSON.stringify(filter)});
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
  async referenceAssets(selectedAdId?:string){
    this.deadline=Date.now()+25_000;this.snapshot=undefined;
    const account=await this.request('advertiser/info',{advertiser_ids:JSON.stringify([this.scope.platformAccountId]),
      fields:JSON.stringify(['advertiser_id','name','currency','timezone','status'])});
    if(!Array.isArray(account?.list)||account.list.length!==1||String(account.list[0].advertiser_id)!==this.scope.platformAccountId||
      !/^[A-Z]{3}$/.test(String(account.list[0].currency??''))||!account.list[0].timezone||!['STATUS_ENABLE','ENABLE','STATUS_ACTIVE'].includes(String(account.list[0].status)))
      throw new ProviderError('unavailable','tiktok_account_configuration');
    try{new Intl.DateTimeFormat('en',{timeZone:account.list[0].timezone});}catch{throw new ProviderError('unavailable','tiktok_account_timezone');}
    const ads=selectedAdId?[await this.one('ad',selectedAdId)]:await this.list('ad');
    ads.sort((a,b)=>String(b.create_time??'').localeCompare(String(a.create_time??''))||String(b.ad_id??'').localeCompare(String(a.ad_id??'')));
    const sources=[];const source_checks:Array<{source_ad_id:string;issues:string[]}>=[];
    for(const ad of ads.slice(0,20)){
      const issues:string[]=[];
      if(!/^\d+$/.test(String(ad.ad_id??''))||!/^\d+$/.test(String(ad.adgroup_id??'')))issues.push('invalid_resource_id');
      if(!['ENABLE','DISABLE'].includes(String(ad.operation_status)))issues.push('unsupported_ad_status');
      if(!opaqueId(ad.video_id))issues.push('missing_video_id');
      if(!opaqueId(ad.identity_id))issues.push('missing_identity_id');
      if(ad.tiktok_item_id)issues.push('spark_ad_requires_review');
      if(!/^https:\/\//.test(String(ad.landing_page_url??'')))issues.push('missing_https_destination');
      if(issues.length){source_checks.push({source_ad_id:String(ad.ad_id),issues});continue;}
      const group=await this.one('adgroup',String(ad.adgroup_id));
      const campaign=await this.one('campaign',String(group.campaign_id));
      if(group.budget_mode!=='BUDGET_MODE_DAY'||Number(group.budget)<=0)issues.push('daily_adgroup_budget_required');
      if(group.schedule_type!=='SCHEDULE_FROM_NOW')issues.push('unsupported_source_schedule');
      if(campaign.campaign_type!=='REGULAR_CAMPAIGN'||campaign.budget_optimize_on===true||group.is_smart_plus||campaign.is_smart_plus)issues.push('unsupported_campaign_automation');
      if(!group.billing_event||!group.optimization_goal||!group.pacing||!campaign.objective_type)issues.push('incomplete_optimization_settings');
      if(!Array.isArray(group.location_ids)||!group.location_ids.length)issues.push('missing_location_targeting');
      if(!ad.ad_text||!ad.call_to_action||!ad.identity_type||!ad.ad_format)issues.push('incomplete_creative_settings');
      if(issues.length){source_checks.push({source_ad_id:String(ad.ad_id),issues});continue;}
      const identity=await this.request('identity/get',{advertiser_id:this.scope.platformAccountId,identity_type:String(ad.identity_type),...(ad.identity_authorized_bc_id?{identity_authorized_bc_id:String(ad.identity_authorized_bc_id)}:{}),page:'1',page_size:'100'});
      const videos=await this.request('file/video/ad/info',{advertiser_id:this.scope.platformAccountId,video_ids:JSON.stringify([ad.video_id])});
      if(!Array.isArray(identity?.list)||!identity.list.some((row:any)=>String(row.identity_id)===String(ad.identity_id))||
        !Array.isArray(videos?.list)||!videos.list.some((row:any)=>String(row.video_id)===String(ad.video_id)))
        throw new ProviderError('unavailable','tiktok_asset_review');
      const min=this.env.M04_TIKTOK_BUDGET_CURRENCY===account.list[0].currency&&/^\d{1,5}(\.\d{1,2})?$/.test(this.env.M04_TIKTOK_MIN_DAILY_BUDGET??'')&&Number(this.env.M04_TIKTOK_MIN_DAILY_BUDGET)>0&&Number(this.env.M04_TIKTOK_MIN_DAILY_BUDGET)<=10_000
        ?this.env.M04_TIKTOK_MIN_DAILY_BUDGET!:null;
      this.snapshot=structuredClone({ad,group,campaign});
      sources.push({source_ad_id:String(ad.ad_id),source_adgroup_id:String(group.adgroup_id),source_campaign_id:String(campaign.campaign_id),
        objective:campaign.objective_type,source_fingerprint:await digest({ad,group,campaign}),video_id:String(ad.video_id),identity_id:String(ad.identity_id),
        final_url:String(ad.landing_page_url),minimum_daily_budget:min,resource_status:min?'ready':'budget_floor_unverified'});
      break;
    }
    return {account:{account_id:this.scope.platformAccountId,currency:account.list[0].currency,timezone_name:account.list[0].timezone,
      account_status:account.list[0].status},sources,source_checks};
  }
  async validate(plan:TikTokPlan,_workflowId:string){
    this.checked=undefined;
    const refs=await this.referenceAssets(plan.source_ad_id),source=refs.sources[0];
    if(!source||source.resource_status!=='ready'||source.source_ad_id!==plan.source_ad_id||source.source_adgroup_id!==plan.source_adgroup_id||
      source.source_campaign_id!==plan.source_campaign_id||source.source_fingerprint!==plan.source_fingerprint||
      source.minimum_daily_budget!==plan.daily_budget||refs.account.currency!==plan.currency||refs.account.timezone_name!==plan.timezone)
      throw new ProviderError('unavailable','tiktok_source_or_budget_changed');
    if(!this.snapshot)throw new ProviderError('unavailable','tiktok_source_changed');
    const {ad,group,campaign}=this.snapshot;
    if(String(ad.adgroup_id)!==plan.source_adgroup_id||String(group.campaign_id)!==plan.source_campaign_id||String(ad.video_id)!==source.video_id||
      String(ad.identity_id)!==source.identity_id||String(ad.landing_page_url)!==source.final_url)
      throw new ProviderError('unavailable','tiktok_source_changed');
    const payload={source,ad,group,campaign};
    this.checked={key:await digest({plan,workflowId:_workflowId}),at:Date.now(),payload:structuredClone(payload)};
    return payload;
  }
  private names(plan:TikTokPlan,workflowId:string){const campaign=tiktokProviderName(plan,workflowId);return {campaign,adgroup:`${campaign} ad group`,ad:`${campaign} ad`};}
  private startTime(timezone:string){
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',
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
    for(const key of groupKeys)if(group[key]!=null)groupBody[key]=group[key];
    // TikTok requires a current start timestamp even for an off ad group. There is no activation path.
    groupBody.schedule_start_time=this.startTime(plan.timezone);
    delete groupBody.schedule_end_time;
    const adgroupId=await this.createStep(store,operationId,'adset',names.adgroup,groupBody);
    await this.checkAdgroup(adgroupId,names.adgroup,campaignId,Number(plan.daily_budget),group);
    const creative:Record<string,unknown>={ad_name:names.ad,operation_status:'DISABLE'};
    for(const key of creativeKeys)if(ad[key]!=null)creative[key]=ad[key];
    const adId=await this.createStep(store,operationId,'ad',names.ad,{advertiser_id:account,adgroup_id:adgroupId,creatives:[creative]});
    await this.checkAd(adId,names.ad,adgroupId,{...source,ad_text:ad.ad_text,call_to_action:ad.call_to_action,identity_type:ad.identity_type});
    return [campaignId,adgroupId,adId];
  }
  private async checkCampaign(id:string,name:string,objective:string){
    const row=await this.one('campaign',id);
    if(row.campaign_name!==name||row.operation_status!=='DISABLE'||row.objective_type!==objective||row.campaign_type!=='REGULAR_CAMPAIGN')
      throw new ProviderError('unknown','tiktok_campaign_readback');
  }
  private async checkAdgroup(id:string,name:string,campaignId:string,budget:number,source:Record<string,any>){
    const row=await this.one('adgroup',id);
    if(row.adgroup_name!==name||String(row.campaign_id)!==campaignId||row.operation_status!=='DISABLE'||row.budget_mode!=='BUDGET_MODE_DAY'||Number(row.budget)!==budget||
      row.optimization_goal!==source.optimization_goal||JSON.stringify(row.location_ids)!==JSON.stringify(source.location_ids)||
      JSON.stringify(row.age_groups??[])!==JSON.stringify(source.age_groups??[])||row.gender!==source.gender)
      throw new ProviderError('unknown','tiktok_adgroup_readback');
  }
  private async checkAd(id:string,name:string,groupId:string,source:Record<string,any>){
    const row=await this.one('ad',id);
    if(row.ad_name!==name||String(row.adgroup_id)!==groupId||row.operation_status!=='DISABLE'||String(row.video_id)!==source.video_id||
      String(row.identity_id)!==source.identity_id||String(row.landing_page_url)!==source.final_url||
      String(row.ad_text)!==String(source.ad_text)||String(row.call_to_action)!==String(source.call_to_action)||
      String(row.identity_type)!==String(source.identity_type))
      throw new ProviderError('unknown','tiktok_ad_readback');
  }
  async readback(plan:TikTokPlan,workflowId:string,operationId:string,store:Store){
    this.deadline=Date.now()+30_000;
    const names=this.names(plan,workflowId),campaign=await store.providerStep(operationId,'campaign'),adgroup=await store.providerStep(operationId,'adset'),ad=await store.providerStep(operationId,'ad');
    if(!campaign?.provider_id||!adgroup?.provider_id||!ad?.provider_id)throw new ProviderError('unknown','tiktok_incomplete');
    const source=await this.one('ad',plan.source_ad_id);
    if(String(source.adgroup_id)!==plan.source_adgroup_id)throw new ProviderError('unknown','tiktok_source_changed');
    await this.checkCampaign(campaign.provider_id,names.campaign,(await this.one('campaign',plan.source_campaign_id)).objective_type);
    await this.checkAdgroup(adgroup.provider_id,names.adgroup,campaign.provider_id,Number(plan.daily_budget),await this.one('adgroup',plan.source_adgroup_id));
    await this.checkAd(ad.provider_id,names.ad,adgroup.provider_id,{video_id:String(source.video_id),identity_id:String(source.identity_id),final_url:String(source.landing_page_url),
      ad_text:String(source.ad_text),call_to_action:String(source.call_to_action),identity_type:String(source.identity_type)});
    return {platform:'TikTok',account_id:this.scope.platformAccountId,campaign_id:campaign.provider_id,adgroup_id:adgroup.provider_id,
      ad_id:ad.provider_id,status:'DISABLE',daily_budget:plan.daily_budget,currency:plan.currency,source_ad_id:plan.source_ad_id};
  }
}
