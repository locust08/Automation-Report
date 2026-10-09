import {digest,metaPlanSchema,planSchema,type Scope} from './contracts';
import type {Google} from './google';
import type {Meta} from './meta';
import type {Workflow} from './store';

export interface SourceFlags {M04_TEMPLATE_PLANNING_ENABLED?:string;M04_CLONE_PLANNING_ENABLED?:string}
interface Template {template_id:string;version:number;platform:string;campaign_type:string;defaults_json:string;required_overrides_json:string;content_hash:string;enabled:number}
export class Sources {
 constructor(private db:D1Database,private flags:SourceFlags){}
 async assertCurrent(w:Workflow,scope:Scope,google:Google,meta:Meta){
  const row=await this.db.withSession('first-primary').prepare('SELECT source_json FROM m04_workflow_sources WHERE revision_id=?').bind(w.revision_id).first<{source_json:string}>();
  if(!row)return; // Legacy revisions remain readable and use their original provider checks.
  const source=JSON.parse(row.source_json);
  if(source.kind==='template'){
   const t=await this.db.withSession('first-primary').prepare('SELECT t.*,a.enabled FROM m04_templates t JOIN m04_template_availability a USING(template_id) WHERE template_id=? AND platform=?').bind(source.template_id,scope.platform).first<Template>();
   if(this.flags.M04_TEMPLATE_PLANNING_ENABLED!=='true'||!t||t.enabled!==1||t.version!==source.version||t.content_hash!==source.hash)throw new Error('template_disabled');
  }
  if(source.kind==='campaign_clone'){
   if(this.flags.M04_CLONE_PLANNING_ENABLED!=='true'||source.source_service_id!==scope.accountPageId)throw new Error('clone_changed');
   const snapshot=scope.platform==='Google'?(await google.clonePlan(source.source_campaign_id)).snapshot:(await meta.referenceAssets(JSON.parse(w.plan_json).source_ad_id)).sources[0];
   if(await digest(sourceSnapshot(snapshot))!==source.source_hash)throw new Error('clone_changed');
  }
 }
 async catalog(scope:Scope){
  if(scope.platform==='TikTok')return [];
  const rows=(await this.db.withSession('first-primary').prepare('SELECT t.*,a.enabled FROM m04_templates t JOIN m04_template_availability a USING(template_id) WHERE t.platform=? ORDER BY t.template_id').bind(scope.platform).all<Template>()).results;
  return rows.map(t=>({template_id:t.template_id,version:t.version,hash:t.content_hash,campaign_type:t.campaign_type,
   required_overrides:JSON.parse(t.required_overrides_json),eligible:t.enabled===1&&this.flags.M04_TEMPLATE_PLANNING_ENABLED==='true',
   reason:t.enabled!==1?'template_disabled':this.flags.M04_TEMPLATE_PLANNING_ENABLED!=='true'?'planning_disabled':null}));
 }
 async normalize(scope:Scope,source:Record<string,any>,google:Google,meta:Meta){
  if(source.kind==='brief')return {fields:source.fields,provenance:{kind:'brief',input_hash:await digest(source.fields)}};
  if(scope.platform==='TikTok')throw new Error('unsupported_source');
  if(source.kind==='template'){
   if(this.flags.M04_TEMPLATE_PLANNING_ENABLED!=='true')throw new Error('planning_disabled');
   const t=await this.db.withSession('first-primary').prepare('SELECT t.*,a.enabled FROM m04_templates t JOIN m04_template_availability a USING(template_id) WHERE t.template_id=? AND t.platform=?').bind(source.template_id,scope.platform).first<Template>();
   if(!t||t.enabled!==1)throw new Error('template_disabled');
   const defaults=JSON.parse(t.defaults_json),required:string[]=JSON.parse(t.required_overrides_json);
   if(t.content_hash!==await digest({platform:t.platform,campaign_type:t.campaign_type,defaults,required_overrides:required}))throw new Error('template_corrupt');
   for(const field of required)if(source.overrides[field]===undefined)throw new Error('required_override:'+field);
   if('campaign_type' in source.overrides&&source.overrides.campaign_type!==t.campaign_type)throw new Error('unsupported_source');
   const fields={...defaults,...source.overrides};
   return {fields,provenance:{kind:'template',template_id:t.template_id,version:t.version,hash:t.content_hash,input_hash:await digest(source.overrides)}};
  }
  if(source.kind!=='campaign_clone'||this.flags.M04_CLONE_PLANNING_ENABLED!=='true')throw new Error('planning_disabled');
  if(source.source_service_id!==scope.accountPageId)throw new Error('cross_account_clone');
  if(!/^\d{1,30}$/.test(source.source_campaign_id))throw new Error('unsupported_source');
  let fields:Record<string,unknown>,snapshot:unknown;
  if(scope.platform==='Google'){
   const cloned=await google.clonePlan(source.source_campaign_id);fields=cloned.plan;snapshot=cloned.snapshot;
  }else{
   if(!/^\d{1,30}$/.test(String(source.overrides.source_ad_id??'')))throw new Error('required_override:source_ad_id');
   const references=await meta.referenceAssets(source.overrides.source_ad_id),ad=references.sources[0];
   if(!ad||ad.source_campaign_id!==source.source_campaign_id||ad.source_ad_id!==source.overrides.source_ad_id)throw new Error('clone_ownership');
   fields={campaign_type:'meta_existing_ad',currency:references.account.currency,timezone:references.account.timezone_name,daily_budget:ad.minimum_daily_budget,
    source_ad_id:ad.source_ad_id,source_adset_id:ad.source_adset_id,source_campaign_id:ad.source_campaign_id,source_fingerprint:ad.source_fingerprint};snapshot=ad;
  }
  const merged={...fields,...source.overrides};
  if(merged.campaign_type!==fields.campaign_type)throw new Error('unsupported_source');
  if(scope.platform==='Meta'&&['source_ad_id','source_adset_id','source_campaign_id','source_fingerprint'].some(key=>merged[key]!==fields[key]))throw new Error('clone_ownership');
  (scope.platform==='Google'?planSchema:metaPlanSchema).parse(merged);
  return {fields:merged,provenance:{kind:'campaign_clone',source_service_id:source.source_service_id,source_campaign_id:source.source_campaign_id,
   source_hash:await digest(sourceSnapshot(snapshot)),input_hash:await digest(source.overrides)}};
 }
}
function sourceSnapshot(snapshot:unknown){
 if(snapshot&&typeof snapshot==='object'&&!Array.isArray(snapshot)){const {verified_at,...rest}=snapshot as Record<string,unknown>;return rest;}
 return snapshot;
}
