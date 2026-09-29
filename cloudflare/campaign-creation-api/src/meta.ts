import {boundedJson,digest,type Scope,type MetaPlan} from './contracts';
import {ProviderError} from './google';
import {Store} from './store';

// Preview URLs are signed afresh by Meta. The image hash, video ID and creative ID
// bind the asset; a generated thumbnail URL is not a change to the approved creative.
function stableStory(story:Record<string,any>){
  const value=structuredClone(story);
  if(value?.video_data?.image_hash&&value.video_data.video_id)delete value.video_data.image_url;
  return value;
}
function ordered(value:any):any{return Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;}
const storyDigest=(story:Record<string,any>)=>digest(ordered(stableStory(story)));
const sourceDigest=(ad:Record<string,any>)=>digest(ordered({...ad,creative:{...ad.creative,object_story_spec:stableStory(ad.creative.object_story_spec)}}));

export interface MetaCredentials {META_ACCESS_TOKEN?:string;META_API_VERSION?:string}
export const metaProviderName=(plan:MetaPlan,workflowId:string)=>`${plan.name.slice(0,100)} [${workflowId}]`;
export class Meta {
  private deadline=Date.now()+25_000;
  private snapshot:Record<string,any>|undefined;
  private checked:{key:string;at:number;payload:Record<string,any>}|undefined;
  private currency='MYR';
  private signal(){const remaining=this.deadline-Date.now();if(remaining<=0)throw new ProviderError('unavailable','meta_deadline');return AbortSignal.timeout(Math.min(10_000,remaining));}
  constructor(private env:MetaCredentials,private scope:Scope,private fetcher:typeof fetch=(input,init)=>fetch(input,init)){}
  private async get(path:string,params:Record<string,string>={}){
    if(this.scope.platform!=='Meta'||!this.env.META_ACCESS_TOKEN||!/^v\d+\.0$/.test(this.env.META_API_VERSION??''))throw new ProviderError('unavailable','meta_connection');
    const url=new URL(`https://graph.facebook.com/${this.env.META_API_VERSION}/${path}`);
    for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
    let response:Response;
    try{response=await this.fetcher(url,{headers:{Authorization:`Bearer ${this.env.META_ACCESS_TOKEN}`},redirect:'manual',signal:this.signal()});}
    catch{throw new ProviderError('unavailable','meta_response');}
    const body=await boundedJson(response,262_144);
    if(!response.ok||body.error)throw new ProviderError('unavailable',response.status===429||[4,17,32,613,80004].includes(Number(body.error?.code))?'meta_rate_limited':'meta_response');
    return body;
  }
  private async post(path:string,values:Record<string,string>,validateOnly=false){
    if(this.scope.platform!=='Meta'||!this.env.META_ACCESS_TOKEN||!/^v\d+\.0$/.test(this.env.META_API_VERSION??''))throw new ProviderError('unavailable','meta_connection');
    const body=new URLSearchParams(values);
    if(validateOnly)body.set('execution_options',JSON.stringify(['validate_only']));
    let response:Response;
    try{response=await this.fetcher(`https://graph.facebook.com/${this.env.META_API_VERSION}/${path}`,{method:'POST',headers:{Authorization:`Bearer ${this.env.META_ACCESS_TOKEN}`,'Content-Type':'application/x-www-form-urlencoded'},body,redirect:'manual',signal:this.signal()});}
    catch{throw new ProviderError(validateOnly?'unavailable':'unknown','meta_response');}
    let payload:Record<string,any>;
    try{payload=await boundedJson(response,262_144);}catch{throw new ProviderError(validateOnly?'unavailable':'unknown','meta_response');}
    if(!response.ok||payload.error){
      if(response.status===429||[4,17,32,613,80004].includes(Number(payload.error?.code)))throw new ProviderError(validateOnly?'unavailable':'unknown','meta_rate_limited');
      const floor=payload.error?.error_subcode===1885272&&String(payload.error?.error_user_msg??'').match(new RegExp('more than '+this.currency+'\\s*([0-9]+(?:\\.[0-9]{2})?)','i'));
      const code=floor?`meta_budget_floor_${floor[1]}`:payload.error?.error_subcode?`meta_${payload.error.error_subcode}`:'meta_rejected';
      throw new ProviderError(validateOnly?'unavailable':'rejected',code);
    }
    if(validateOnly){if(payload.success!==true||payload.id)throw new ProviderError('unavailable','meta_validate_only');}
    else if(!/^\d+$/.test(String(payload.id??'')))throw new ProviderError('unknown','meta_response');
    return payload;
  }
  private destination(ad:Record<string,any>){
    const story=ad.creative?.object_story_spec,form=story?.link_data?.call_to_action?.value?.lead_gen_form_id??story?.video_data?.call_to_action?.value?.lead_gen_form_id;
    if(ad.campaign?.objective==='OUTCOME_LEADS'&&ad.adset?.destination_type==='ON_AD'&&
      String(ad.adset?.promoted_object?.page_id)===String(story?.page_id)&&/^\d{1,30}$/.test(String(form??'')))
      return {kind:'instant_form' as const,page_id:String(story.page_id),form_id:String(form)};
    try{const url=new URL(story?.link_data?.link);if(url.protocol==='https:'&&!url.username&&!url.password)return {kind:'website' as const,url:url.href};}catch{}
    return null;
  }
  async referenceAssets(selectedAdId?:string){
    this.deadline=Date.now()+25_000;this.snapshot=undefined;
    const id=this.scope.platformAccountId;
    const account=await this.get(`act_${id}`,{fields:'account_id,currency,timezone_name,account_status'});
    if(account.account_id!==id||!/^[A-Z]{3}$/.test(String(account.currency))||!account.timezone_name||account.account_status!==1)throw new ProviderError('unavailable','meta_account_configuration');
    try{new Intl.DateTimeFormat('en',{timeZone:account.timezone_name});}catch{throw new ProviderError('unavailable','meta_account_timezone');}
    this.currency=account.currency;
    if(!['MYR','USD','EUR','GBP','SGD','AUD','CAD','NZD','HKD'].includes(this.currency))throw new ProviderError('unavailable','meta_currency_units_unsupported');
    const candidates:any[]=[];
    let after:string|undefined;
    if(selectedAdId){if(!/^\d{1,30}$/.test(selectedAdId))throw new ProviderError('unavailable','meta_source_changed');candidates.push({id:selectedAdId});}
    for(let pageNumber=0;!selectedAdId&&pageNumber<4;pageNumber++){
      const page=await this.get(`act_${id}/ads`,{fields:'id,account_id,status,created_time',limit:'500',...(after?{after}:{})});
      if(!Array.isArray(page.data)||page.data.length>500)throw new ProviderError('unavailable','meta_source_coverage');
      candidates.push(...page.data.filter((ad:any)=>/^\d+$/.test(String(ad.id))&&ad.account_id===id&&['ACTIVE','PAUSED'].includes(ad.status)&&typeof ad.created_time==='string'));
      if(!page.paging?.next){after=undefined;break;}
      const cursor=page.paging?.cursors?.after;
      if(typeof cursor!=='string'||!cursor||cursor===after)throw new ProviderError('unavailable','meta_source_coverage');
      after=cursor;
    }
    if(after)throw new ProviderError('unavailable','meta_source_coverage');
    candidates.sort((a:any,b:any)=>String(b.created_time).localeCompare(String(a.created_time))||String(b.id).localeCompare(String(a.id)));
    const fields='id,account_id,name,status,created_time,campaign{id,account_id,objective,special_ad_categories},adset{id,account_id,campaign_id,daily_budget,billing_event,optimization_goal,targeting,bid_strategy,promoted_object,attribution_spec,destination_type,regional_regulation_identities},creative{id,account_id,object_story_spec}';
    const sources=[];
    for(const candidate of candidates.slice(0,20)){
      const ad=await this.get(String(candidate.id),{fields}),destination=this.destination(ad);
      if(ad.id!==candidate.id||ad.account_id!==id||!['ACTIVE','PAUSED'].includes(ad.status)||
        ad.campaign?.account_id!==id||!['OUTCOME_TRAFFIC','OUTCOME_LEADS'].includes(ad.campaign?.objective)||
        !Array.isArray(ad.campaign?.special_ad_categories)||ad.campaign.special_ad_categories.length!==0||
        ad.adset?.account_id!==id||ad.adset?.campaign_id!==ad.campaign.id||!/^\d+$/.test(String(ad.adset?.daily_budget))||Number(ad.adset.daily_budget)<=0||
        ad.creative?.account_id!==id||!/^\d+$/.test(String(ad.creative.id))||!ad.creative?.object_story_spec?.page_id||
        !destination||
        ad.campaign.objective==='OUTCOME_LEADS'&&!ad.adset.promoted_object)continue;
      if(!ad.adset.regional_regulation_identities?.universal_beneficiary||!ad.adset.regional_regulation_identities?.universal_payer)continue;
      if(destination.kind==='instant_form'){
        const form=await this.get(destination.form_id,{fields:'id,page_id,status'});
        if(String(form.id)!==destination.form_id||String(form.page_id)!==destination.page_id||form.status!=='ACTIVE')throw new ProviderError('unavailable','meta_form_unavailable');
      }
      const minimum_daily_budget=await this.minimumBudget(ad.adset,String(ad.campaign.id));
      this.snapshot=structuredClone(ad);
      sources.push({source_ad_id:String(ad.id),source_adset_id:String(ad.adset.id),source_campaign_id:String(ad.campaign.id),objective:ad.campaign.objective,
        daily_budget:(Number(ad.adset.daily_budget)/100).toFixed(2),source_fingerprint:await sourceDigest(ad),creative_id:String(ad.creative.id),final_url:destination.kind==='website'?destination.url:null,destination,
        regional_regulation_identities:ad.adset.regional_regulation_identities,minimum_daily_budget});
      break;
    }
    return {account:{account_id:id,currency:account.currency,timezone_name:account.timezone_name},sources};
  }
  async validate(plan:MetaPlan,_workflowId:string){
    this.checked=undefined;
    const references=await this.referenceAssets(plan.source_ad_id),source=references.sources[0];
    if(!source||source.source_ad_id!==plan.source_ad_id||source.source_campaign_id!==plan.source_campaign_id||
      source.source_adset_id!==plan.source_adset_id||source.source_fingerprint!==plan.source_fingerprint||
      plan.currency!==references.account.currency||plan.timezone!==references.account.timezone_name||plan.daily_budget!==source.minimum_daily_budget)
      throw new ProviderError('unavailable','meta_source_changed');
    const adset=this.snapshot?.adset;
    if(!adset)throw new ProviderError('unavailable','meta_source_changed');
    if(adset.id!==plan.source_adset_id||adset.account_id!==this.scope.platformAccountId||adset.campaign_id!==plan.source_campaign_id||
      !adset.targeting||!adset.regional_regulation_identities?.universal_beneficiary||!adset.regional_regulation_identities?.universal_payer)
      throw new ProviderError('unavailable','meta_source_changed');
    const cents=Math.round(Number(plan.daily_budget)*100);
    if(!Number.isSafeInteger(cents)||cents<=0)throw new ProviderError('unavailable','meta_budget');
    await this.post(`act_${this.scope.platformAccountId}/campaigns`,{name:'M04 validate only',objective:source.objective,
      special_ad_categories:'[]',is_adset_budget_sharing_enabled:'false',status:'PAUSED'},true);
    await this.post(`act_${this.scope.platformAccountId}/adsets`,this.adsetFields(adset,plan.source_campaign_id,cents,'M04 validate only'),true);
    await this.post(`act_${this.scope.platformAccountId}/ads`,{name:'M04 validate only',adset_id:plan.source_adset_id,
      creative:JSON.stringify({creative_id:source.creative_id}),status:'PAUSED'},true);
    const payload={source,adset,creative:this.snapshot!.creative};
    this.checked={key:await digest({plan,workflowId:_workflowId}),at:Date.now(),payload:structuredClone(payload)};
    return payload;
  }
  private adsetFields(adset:Record<string,any>,campaignId:string,cents:number,name:string){
    const fields:Record<string,string>={name,campaign_id:campaignId,daily_budget:String(cents),status:'PAUSED',
      billing_event:adset.billing_event,optimization_goal:adset.optimization_goal,bid_strategy:adset.bid_strategy,
      targeting:JSON.stringify(adset.targeting),regional_regulation_identities:JSON.stringify(adset.regional_regulation_identities)};
    for(const key of ['destination_type','promoted_object','attribution_spec'] as const)if(adset[key]!=null)
      fields[key]=typeof adset[key]==='string'?adset[key]:JSON.stringify(adset[key]);
    return fields;
  }
  private async minimumBudget(adset:Record<string,any>,campaignId:string){
    let minimumCents=1;
    try{await this.post(`act_${this.scope.platformAccountId}/adsets`,this.adsetFields(adset,campaignId,1,'M04 minimum budget validation'),true);}
    catch(error){
      const match=error instanceof ProviderError&&error.code.match(/^meta_budget_floor_(\d+(?:\.\d{2})?)$/);
      if(!match)throw error;
      minimumCents=Math.round(Number(match[1])*100)+1;
      if(!Number.isSafeInteger(minimumCents)||minimumCents>10_000)throw new ProviderError('unavailable','meta_budget_floor');
      await this.post(`act_${this.scope.platformAccountId}/adsets`,this.adsetFields(adset,campaignId,minimumCents,'M04 minimum budget validation'),true);
    }
    return (minimumCents/100).toFixed(2);
  }
  private names(plan:MetaPlan,workflowId:string){
    const base=metaProviderName(plan,workflowId);
    return {campaign:base,adset:`${base} ad set`,ad:`${base} ad`};
  }
  private async reconcile(store:Store,operationId:string,step:'campaign'|'adset'|'ad',name:string){
    const edge=step==='campaign'?'campaigns':step==='adset'?'adsets':'ads';
    let after:string|undefined;const matches:string[]=[];
    for(let pageNumber=0;pageNumber<4;pageNumber++){
      const page=await this.get(`act_${this.scope.platformAccountId}/${edge}`,{fields:'id,name,account_id',limit:'500',...(after?{after}:{})});
      if(!Array.isArray(page.data)||page.data.length>500)throw new ProviderError('unknown','meta_reconcile');
      matches.push(...page.data.filter((row:any)=>row.name===name&&row.account_id===this.scope.platformAccountId&&/^\d+$/.test(String(row.id))).map((row:any)=>String(row.id)));
      if(!page.paging?.next){after=undefined;break;}
      const cursor=page.paging?.cursors?.after;
      if(typeof cursor!=='string'||!cursor||cursor===after)throw new ProviderError('unknown','meta_reconcile');
      after=cursor;
    }
    if(after||matches.length!==1)throw new ProviderError('unknown','meta_reconcile');
    await store.confirmProviderStep(operationId,step,matches[0]);
    return matches[0];
  }
  private async createStep(store:Store,operationId:string,step:'campaign'|'adset'|'ad',name:string,values:Record<string,string>){
    const row=await store.beginProviderStep(operationId,step,name);
    if(row.provider_id)return row.provider_id;
    if(!row.claimed)return this.reconcile(store,operationId,step,name);
    const edge=step==='campaign'?'campaigns':step==='adset'?'adsets':'ads';
    let id:string;
    try{id=String((await this.post(`act_${this.scope.platformAccountId}/${edge}`,values)).id);}
    catch(error){
      if(error instanceof ProviderError&&error.outcome==='unknown')return this.reconcile(store,operationId,step,name);
      throw error;
    }
    await store.confirmProviderStep(operationId,step,id);
    return id;
  }
  async create(plan:MetaPlan,workflowId:string,operationId:string,store:Store){
    const key=await digest({plan,workflowId});
    if(!this.checked||this.checked.key!==key||Date.now()-this.checked.at>25_000)await this.validate(plan,workflowId);
    const payload=this.checked!.payload;this.checked=undefined;
    // Queue preflight already validated this exact payload; writes get a separate bounded budget.
    this.deadline=Date.now()+90_000;
    const {source,adset,creative}=payload,names=this.names(plan,workflowId),cents=Math.round(Number(plan.daily_budget)*100);
    const campaignId=await this.createStep(store,operationId,'campaign',names.campaign,{name:names.campaign,objective:source.objective,
      special_ad_categories:'[]',is_adset_budget_sharing_enabled:'false',status:'PAUSED'});
    await this.checkCampaign(campaignId,names.campaign,source.objective);
    const adsetId=await this.createStep(store,operationId,'adset',names.adset,this.adsetFields(adset,campaignId,cents,names.adset));
    await this.checkAdset(adsetId,names.adset,campaignId,cents,adset.regional_regulation_identities);
    const adId=await this.createStep(store,operationId,'ad',names.ad,{name:names.ad,adset_id:adsetId,
      creative:JSON.stringify({creative_id:source.creative_id}),status:'PAUSED'});
    await this.checkAd(adId,names.ad,adsetId,source.creative_id,creative.object_story_spec);
    return [campaignId,adsetId,adId];
  }
  private async checkCampaign(id:string,name:string,objective:string){
    const row=await this.get(id,{fields:'id,name,account_id,objective,status,special_ad_categories'});
    if(row.id!==id||row.name!==name||row.account_id!==this.scope.platformAccountId||row.objective!==objective||
      row.status!=='PAUSED'||!Array.isArray(row.special_ad_categories)||row.special_ad_categories.length)
      throw new ProviderError('unknown','meta_campaign_readback');
  }
  private async checkAdset(id:string,name:string,campaignId:string,cents:number,identities:Record<string,any>){
    const row=await this.get(id,{fields:'id,name,account_id,campaign_id,daily_budget,status,regional_regulation_identities'});
    if(row.id!==id||row.name!==name||row.account_id!==this.scope.platformAccountId||row.campaign_id!==campaignId||
      Number(row.daily_budget)!==cents||row.status!=='PAUSED'||
      row.regional_regulation_identities?.universal_beneficiary!==identities.universal_beneficiary||
      row.regional_regulation_identities?.universal_payer!==identities.universal_payer)
      throw new ProviderError('unknown','meta_adset_readback');
  }
  private async checkAd(id:string,name:string,adsetId:string,creativeId:string,story:Record<string,any>){
    const row=await this.get(id,{fields:'id,name,account_id,adset_id,status,creative{id,object_story_spec}'});
    if(row.id!==id||row.name!==name||row.account_id!==this.scope.platformAccountId||row.adset_id!==adsetId||
      row.status!=='PAUSED'||row.creative?.id!==creativeId||!row.creative?.object_story_spec?.page_id||
      await storyDigest(row.creative.object_story_spec)!==await storyDigest(story))
      throw new ProviderError('unknown','meta_ad_readback');
  }
  async readback(plan:MetaPlan,workflowId:string,operationId:string,store:Store){
    this.deadline=Date.now()+30_000;
    const names=this.names(plan,workflowId),campaign=await store.providerStep(operationId,'campaign'),adset=await store.providerStep(operationId,'adset'),ad=await store.providerStep(operationId,'ad');
    if(!campaign?.provider_id||!adset?.provider_id||!ad?.provider_id)throw new ProviderError('unknown','meta_incomplete');
    const source=await this.get(plan.source_ad_id,{fields:'id,account_id,creative{id,account_id,object_story_spec},campaign{id,objective},adset{id,regional_regulation_identities}'});
    if(source.account_id!==this.scope.platformAccountId||source.campaign?.id!==plan.source_campaign_id||source.adset?.id!==plan.source_adset_id||
      source.creative?.account_id!==this.scope.platformAccountId)throw new ProviderError('unknown','meta_source_changed');
    await this.checkCampaign(campaign.provider_id,names.campaign,source.campaign.objective);
    await this.checkAdset(adset.provider_id,names.adset,campaign.provider_id,Math.round(Number(plan.daily_budget)*100),source.adset.regional_regulation_identities);
    await this.checkAd(ad.provider_id,names.ad,adset.provider_id,source.creative.id,source.creative.object_story_spec);
    return {platform:'Meta',account_id:this.scope.platformAccountId,campaign_id:campaign.provider_id,adset_id:adset.provider_id,ad_id:ad.provider_id,
      status:'PAUSED',daily_budget:plan.daily_budget,currency:plan.currency,source_ad_id:plan.source_ad_id,creative_id:source.creative.id};
  }
}
