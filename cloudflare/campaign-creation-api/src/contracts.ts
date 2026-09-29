import {z} from 'zod';
export const scopeSchema=z.object({subject:z.string().min(1).max(255),grantRevision:z.number().int().nonnegative(),accountPageId:z.string().uuid(),clientId:z.string().uuid(),platform:z.enum(['Google','Meta','TikTok']),platformAccountId:z.string().regex(/^\d{1,30}$/),connectionRevision:z.string().min(1).max(255),providerRevision:z.string().min(1).max(255),googleLoginCustomerId:z.string().regex(/^\d{10}$/).optional()}).strict().superRefine((value,ctx)=>{
 if(value.platform==='TikTok'&&value.googleLoginCustomerId||value.platform==='Google'&&value.platformAccountId.length!==10||value.platform==='Meta'&&(!/^\d{1,30}$/.test(value.platformAccountId)||value.googleLoginCustomerId))ctx.addIssue({code:'custom',message:'Account identifier does not match platform.'});
});
export type Scope=z.infer<typeof scopeSchema>;
const resource=(kind:string)=>z.string().regex(new RegExp('^customers/\\d{10}/'+kind+'/\\d{1,20}$'));
const url=z.url().max(512).refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password},'Use a verified HTTPS landing page');
const common={name:z.string().trim().min(1).max(160),currency:z.literal('MYR'),timezone:z.literal('Asia/Kuala_Lumpur'),daily_budget:z.string().regex(/^\d{1,6}(\.\d{1,2})?$/).refine(v=>Number(v)>0&&Number(v)<=100),final_url:url,locations:z.array(z.string().regex(/^geoTargetConstants\/\d+$/)).min(1).max(20),languages:z.array(z.string().regex(/^languageConstants\/\d+$/)).min(1).max(10),ad_group_name:z.string().trim().min(1).max(100)};
export const planSchema=z.discriminatedUnion('campaign_type',[
 z.object({...common,campaign_type:z.literal('search'),keywords:z.array(z.string().trim().min(1).max(80)).min(1).max(20),headlines:z.array(z.string().trim().min(1).max(30)).min(3).max(15),descriptions:z.array(z.string().trim().min(1).max(90)).min(2).max(4)}).strict(),
 z.object({...common,campaign_type:z.literal('demand_gen'),headlines:z.array(z.string().trim().min(1).max(40)).min(1).max(5),descriptions:z.array(z.string().trim().min(1).max(90)).min(1).max(5),business_name:z.string().trim().min(1).max(25),landscape_images:z.array(resource('assets')).min(1).max(5),square_images:z.array(resource('assets')).min(1).max(5),logos:z.array(resource('assets')).min(1).max(5),audience:resource('audiences')}).strict(),
]);
export type Plan=z.infer<typeof planSchema>;
export const metaPlanSchema=z.object({campaign_type:z.literal('meta_existing_ad'),name:z.string().trim().min(1).max(160),currency:z.string().regex(/^[A-Z]{3}$/),timezone:z.string().min(1).max(100).refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}}),daily_budget:z.string().regex(/^\d{1,3}(\.\d{1,2})?$/).refine(v=>Number(v)>0&&Number(v)<=100),source_ad_id:z.string().regex(/^\d{1,30}$/),source_campaign_id:z.string().regex(/^\d{1,30}$/),source_adset_id:z.string().regex(/^\d{1,30}$/),source_fingerprint:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict();
export type MetaPlan=z.infer<typeof metaPlanSchema>;
export const tiktokPlanSchema=z.object({campaign_type:z.literal('tiktok_existing_ad'),name:z.string().trim().min(1).max(100),
  currency:z.string().regex(/^[A-Z]{3}$/),timezone:z.string().min(1).max(100),
  daily_budget:z.string().regex(/^\d{1,5}(\.\d{1,2})?$/).refine(v=>Number(v)>0&&Number(v)<=10_000),
  source_ad_id:z.string().regex(/^\d{1,30}$/),source_campaign_id:z.string().regex(/^\d{1,30}$/),
  source_adgroup_id:z.string().regex(/^\d{1,30}$/),source_fingerprint:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict();
export type TikTokPlan=z.infer<typeof tiktokPlanSchema>;
export type AnyPlan=Plan|MetaPlan|TikTokPlan;
export const mappingDigest=(s:Scope)=>digest([s.accountPageId,s.clientId,s.platform,s.platformAccountId,s.googleLoginCustomerId??null]);
export const endpoints:Record<string,{tool:string;method:string}>={
 'templates':{tool:'campaign_templates_list',method:'GET'},'workflows':{tool:'campaign_workflows_list',method:'GET'},'workflows/status':{tool:'campaign_workflow_get',method:'GET'},'operations/status':{tool:'campaign_operation_get',method:'GET'},
 'drafts':{tool:'campaign_draft_save',method:'POST'},'validation':{tool:'campaign_draft_validate',method:'POST'},'actions/prepare':{tool:'campaign_action_prepare',method:'POST'},
 'approvals':{tool:'campaign_revision_approve',method:'POST'},'gates/1':{tool:'campaign_gate1_create',method:'POST'},'recoveries':{tool:'campaign_creation_resume',method:'POST'},'gates/2':{tool:'campaign_gate2_activate',method:'POST'},
};
export type Result={outcome:'success'|'partial'|'clarification_required'|'access_denied'|'conflict'|'locked'|'unavailable'|'unknown';workflow_ref:string|null;revision_ref:string|null;validation_issues:Array<{field:string;code:string;message:string}>;allowed_next_actions:string[];evidence:Array<{kind:string;reference:string;captured_at:string}>;correlation_id:string;caveats:string[];receipt_ref:string|null;challenge?:Record<string,unknown>;confirmation?:Record<string,unknown>;data?:Record<string,unknown>};
export const result=(outcome:Result['outcome'],extra:Partial<Result>={}):Result=>({outcome,workflow_ref:null,revision_ref:null,validation_issues:[],allowed_next_actions:[],evidence:[],correlation_id:crypto.randomUUID(),caveats:[],receipt_ref:null,...extra});
export async function digest(value:unknown){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))));let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export async function boundedJson(message:Request|Response,max=65536){const reader=message.body?.getReader();if(!reader)throw new Error('invalid_request');let size=0;const chunks:Uint8Array[]=[];try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>max)throw new Error('response_limit');chunks.push(p.value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}return JSON.parse(new TextDecoder().decode(bytes)) as Record<string,any>;}

