import {digest,result,planSchema,metaPlanSchema,scopeSchema,type Scope,type Result} from './contracts';
import {Google,ProviderError} from './google';
import {Meta} from './meta';
import {Store,type Workflow} from './store';
import {ActionStore,type Action,type ActionReceipt} from './action-store';
import type {Environment,Dependencies,Provider} from './service';
import {Sources} from './sources';

export function actionAllowed(env:Environment,scope:Scope,action:Action){
 if(env.M04_ENABLED!=='true'||scope.platform==='TikTok'||action==='resume'&&scope.platform!=='Meta')return false;
 if((action==='gate2'?env.M04_GATE2_ENABLED:env.M04_RECOVERY_ENABLED)!=='true')return false;
 try{const list:unknown=JSON.parse((action==='gate2'?env.M04_GATE2_ALLOWLIST:env.M04_RECOVERY_ALLOWLIST)??'[]');
  return Array.isArray(list)&&list.some(row=>row&&Object.keys(row).sort().join(',')==='account_id,platform,service_id,subject'&&row.platform===scope.platform&&row.account_id===scope.platformAccountId&&row.service_id===scope.accountPageId&&row.subject===scope.subject);
 }catch{return false;}
}
export function scheduleFor(scope:Scope,plan:{timezone:string},input:any,now=Date.now()){
 if(!input||input.mode!=='scheduled'||input.timezone!==plan.timezone||!Number.isFinite(Date.parse(input.scheduled_at))||Date.parse(input.scheduled_at)<now+72*3600000)throw new Error('invalid_schedule');
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:input.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(input.scheduled_at));
 if(scope.platform==='Google'){
  // Google schedules at account-local midnight. Reject a time it cannot represent.
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:input.timezone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(input.scheduled_at));
  if(parts!=='00:00:00'||Date.parse(input.scheduled_at)%1000!==0)throw new Error('google_schedule_midnight_required');
 }
 return {mode:'scheduled' as const,scheduled_at:new Date(input.scheduled_at).toISOString(),timezone:input.timezone,date};
}
export function stable(value:any):any{
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).filter(key=>!['verified_at','provider_action','provider_resources'].includes(key)).sort().map(key=>[key,stable(value[key])]));
 return value;
}
export class Actions {
 private store:Store;private ledger:ActionStore;
 constructor(private env:Environment,private scope:Scope,private google:Provider,private meta:Meta,private check:(tool:string)=>Promise<unknown>){this.store=new Store(env.DB);this.ledger=new ActionStore(env.DB);}
 async state(w:Workflow){
  const parent=await this.store.operationForWorkflow(w.id,this.scope),receipts=await this.ledger.list(w);
  if(this.scope.platform==='Meta'&&parent?.dispatched_at&&parent.status==='unknown')await this.meta.reconcileSteps(metaPlanSchema.parse(JSON.parse(w.plan_json)),w.id,parent.id,this.store);
  const steps=parent?await this.store.providerSteps(parent.id):[];
  const recoverable=parent&&parent.dispatched_at&&['unknown','rejected'].includes(parent.status)&&!steps.some(s=>s.status==='started'&&!s.rejected)?
   ['campaign','adset','ad'].filter(step=>!steps.some(s=>s.step===step&&s.status==='confirmed')).map(step=>`${parent.id}:${step}`):[];
  const recovered=receipts.some(r=>r.action==='resume'&&r.status==='verified');
  return {parent,receipts,creation_verified:parent?.status==='verified'||recovered,qa_status:receipts.some(r=>r.action==='gate2'&&r.status==='verified')?'passed':'pending',provider_objects:steps.map(s=>({kind:s.step,id:s.provider_id,status:s.status})),recoverable_step_refs:this.scope.platform==='Meta'?recoverable:[],
   gate2_schedule:receipts.find(r=>r.action==='gate2')?.schedule_json??null};
 }
 private async qa(w:Workflow,parent:string){
  if(this.scope.platform==='Meta')return this.meta.qa(metaPlanSchema.parse(JSON.parse(w.plan_json)),w.id,parent,this.store);
  if(!this.google.qa)throw new Error('qa_unavailable');
  return this.google.qa(planSchema.parse(JSON.parse(w.plan_json)),w.id);
 }
 async prepare(w:Workflow,action:Action,input:Record<string,any>,requestHash:string):Promise<Result>{
  if(!actionAllowed(this.env,this.scope,action))return result('locked');
  const state=await this.state(w),parent=state.parent;
  if(!parent||state.receipts.some(r=>['reserved','dispatched','unknown'].includes(r.status)||r.action==='gate2'&&r.status==='verified'))throw new Error('conflict');
  const plan=JSON.parse(w.plan_json),refs=action==='resume'?state.recoverable_step_refs:[];
  if(action==='resume'&&(!refs.length||state.creation_verified))throw new Error('conflict');
  if(action==='gate2'&&!state.creation_verified)throw new Error('qa_required');
  const schedule=action==='gate2'?scheduleFor(this.scope,plan,input.schedule):null;
  const snapshot=action==='gate2'?await this.qa(w,parent.id):{steps:await this.store.providerSteps(parent.id)};
  await this.check(`campaign_action_prepare_${action}`);
  const data=snapshot as Record<string,any>;
  const objects=action==='gate2'?(this.scope.platform==='Meta'?[{kind:'campaign',id:data.campaign_id,status:'PAUSED'},{kind:'adset',id:data.adset_id,status:'PAUSED'},{kind:'ad',id:data.ad_id,status:'PAUSED'}]:[{kind:'campaign',id:data.campaign.resourceName,status:'PAUSED'},{kind:'ad_group',id:data.ad_group.resourceName,status:'PAUSED'},{kind:'ad',id:data.ad.resourceName,status:'PAUSED'}]):state.provider_objects.filter(o=>o.id).map(o=>({...o,id:o.id!}));
  const providerObjects=objects.map(o=>({...o,platform:this.scope.platform,name:o.kind==='campaign'?plan.name:plan.ad_group_name??`${plan.name} ${o.kind}`,status:action==='gate2'?'PAUSED':o.status}));
  const display={action,stage:action==='gate2'?'activate_or_schedule':'resume_creation',revision_hash:w.plan_hash,
   draft:{name:plan.name,platform:this.scope.platform,account:{service_id:this.scope.accountPageId,label:this.scope.platformAccountId},objective:plan.campaign_type,
    budget:{amount:Number(plan.daily_budget),currency:plan.currency,period:'daily'},schedule:{mode:schedule?'scheduled':'draft',start_at:schedule?.scheduled_at??null,end_at:null,timezone:plan.timezone},
    targeting_summary:JSON.stringify(plan.locations??{source_ad_id:plan.source_ad_id}),creative_summary:JSON.stringify(plan.headlines??{source_ad_id:plan.source_ad_id}),validation_status:'ready',warnings:[]},
   provider_objects:providerObjects,qa_status:action==='gate2'?'passed':'pending',consequences:action==='gate2'?['Enable the exact hierarchy with this future schedule. No immediate delivery is authorized. Pause separately through M03 before the scheduled start.']:['Create only the displayed missing or explicitly rejected Meta steps. Confirmed objects are preserved.']};
  const publicSchedule=schedule?{mode:schedule.mode,scheduled_at:schedule.scheduled_at,timezone:schedule.timezone}:null;
  const challenge=await this.ledger.prepare(w,this.scope,action,parent.id,publicSchedule,refs,stable(snapshot),display,requestHash);
  return result('success',{workflow_ref:w.id,revision_ref:w.revision_id,receipt_ref:parent.id,challenge,confirmation:{...display,confirmation_hash:challenge.confirmation_hash,expires_at:challenge.expires_at},data:{recoverable_step_refs:refs,official_readback:snapshot,schedule:publicSchedule}});
 }
 async reserve(w:Workflow,action:Action,input:Record<string,any>,requestHash:string){
  if(!actionAllowed(this.env,this.scope,action))return result('locked');
  const previous=await this.ledger.get(input.idempotency_key,this.scope);
  if(previous){if(previous.workflow_id!==w.id||previous.action!==action||previous.request_hash!==requestHash)throw new Error('idempotency_conflict');return this.read(previous,w);}
  if(await this.store.operation(input.idempotency_key,this.scope))throw new Error('idempotency_conflict');
  if(action==='gate2'){const schedule=scheduleFor(this.scope,JSON.parse(w.plan_json),input.schedule);input={...input,schedule:{mode:schedule.mode,scheduled_at:schedule.scheduled_at,timezone:schedule.timezone}};}
  if(!this.env.CREATION_QUEUE)throw new Error('unavailable');
  await this.ledger.reserve(w,this.scope,action,input,requestHash);
  try{await this.env.CREATION_QUEUE.send({operationId:input.idempotency_key});}catch{/* The scheduled sweep publishes reserved action receipts. */}
  return result('success',{workflow_ref:w.id,revision_ref:w.revision_id,receipt_ref:input.idempotency_key,allowed_next_actions:['campaign_operation_get'],data:{status:'reserved',action,provider_action:false}});
 }
 async read(r:ActionReceipt,w:Workflow){
  if(['dispatched','unknown'].includes(r.status)){
   try{const readback=await this.reconcile(r,w);await this.check('campaign_operation_get');await this.ledger.finish(r,'verified',readback);r={...r,status:'verified',result_json:JSON.stringify(readback)};}catch{
    if(r.action==='resume'&&r.status==='unknown'){
     const steps=await this.store.providerSteps(r.parent_receipt);
     // The dispatch has ended. Confirmed intents and never-dispatched missing
     // steps can be shown in a fresh confirmation; unresolved intents cannot.
     if(steps.length>0&&!steps.some(s=>s.status==='started'&&!s.rejected)&&steps.filter(s=>s.status==='confirmed').length<3){
      await this.check('campaign_operation_get');const data={reason:'incomplete_confirmed_steps',provider_action:false};
      await this.ledger.finish(r,'rejected',data);r={...r,status:'rejected',result_json:JSON.stringify(data)};
     }
    }
   }
  }
  const state=await this.state(w),detail=r.result_json?JSON.parse(r.result_json):null;
  const objects=r.status==='verified'&&r.action==='gate2'?(this.scope.platform==='Meta'?[{kind:'campaign',id:detail.campaign.id,status:detail.campaign.status},{kind:'adset',id:detail.adset.id,status:detail.adset.status},{kind:'ad',id:detail.ad.id,status:detail.ad.status}]:[{kind:'campaign',id:detail.campaign.resourceName,status:detail.campaign.status},{kind:'ad_group',id:detail.ad_group.resourceName,status:detail.ad_group.status},{kind:'ad',id:detail.ad.resourceName,status:detail.ad.status}]):state.provider_objects;
  return result(r.status==='verified'?'success':r.status==='rejected'?'unavailable':'unknown',{workflow_ref:w.id,revision_ref:r.revision_id,receipt_ref:r.id,data:{status:r.status,action:r.action,parent_receipt:r.parent_receipt,qa_status:state.qa_status,provider_objects:objects,recoverable_step_refs:state.recoverable_step_refs,schedule:r.schedule_json?JSON.parse(r.schedule_json):null,official_readback:r.status==='verified'?detail:null,operation_detail:detail,provider_action:false}});
 }
 private async reconcile(r:ActionReceipt,w:Workflow){
  const snapshot=JSON.parse(r.confirmation_json).snapshot;
  if(r.action==='resume')return this.meta.readback(metaPlanSchema.parse(JSON.parse(w.plan_json)),w.id,r.parent_receipt,this.store);
  const schedule=scheduleFor(this.scope,JSON.parse(w.plan_json),JSON.parse(r.schedule_json!),0);
  const data=this.scope.platform==='Meta'?await this.meta.readScheduled(snapshot,schedule.scheduled_at):await this.google.readback(planSchema.parse(JSON.parse(w.plan_json)),w.id,{scheduledDate:schedule.date});
  if(this.scope.platform==='Google'){
   const normalized=structuredClone(data) as Record<string,any>;
   if(snapshot.conversion_configuration)normalized.conversion_configuration=await (this.google as Google).conversionConfiguration(String(normalized.campaign.id));
   delete normalized.campaign.startDateTime;delete normalized.campaign.startDate;normalized.campaign.status='PAUSED';normalized.ad_group.status='PAUSED';normalized.ad.status='PAUSED';
   for(const row of normalized.targeting)if(['KEYWORD','LOCATION','LANGUAGE','AUDIENCE'].includes(row.adGroupCriterion.type))row.adGroupCriterion.status='PAUSED';
   if(await digest(stable(normalized))!==await digest(stable(snapshot)))throw new Error('qa_readback_mismatch');
  }
  return data;
 }
 async process(r:ActionReceipt,w:Workflow){
  if(['verified','rejected'].includes(r.status))return;
  if(['dispatched','unknown'].includes(r.status)){await this.read(r,w);return;}
  const tool=r.action==='gate2'?'campaign_gate2_activate':'campaign_creation_resume';
  try{
   if(!actionAllowed(this.env,this.scope,r.action)||w.revision_id!==r.revision_id)throw new Error('stale_revision');
   await this.check(tool);
   await new Sources(this.env.DB,this.env).assertCurrent(w,this.scope,new Google(this.env,this.scope),this.meta);
   if(r.action==='gate2'){
    scheduleFor(this.scope,JSON.parse(w.plan_json),JSON.parse(r.schedule_json!));
    const qa=await this.qa(w,r.parent_receipt);
    if(await digest(stable(qa))!==await digest(JSON.parse(r.confirmation_json).snapshot))throw new Error('qa_readback_mismatch');
   }else{
    const state=await this.state(w);
    if(JSON.stringify(state.recoverable_step_refs)!==r.refs_json)throw new Error('recovery_changed');
    await this.meta.validate(metaPlanSchema.parse(JSON.parse(w.plan_json)),w.id);
   }
   await this.check(tool);
  }catch(error){await this.ledger.finish(r,'rejected',{reason:error instanceof Error?error.message:'preflight_failed',provider_action:false});return;}
  try{await this.ledger.dispatch(r);}catch{return;}
  try{
   if(r.action==='resume')await this.meta.create(metaPlanSchema.parse(JSON.parse(w.plan_json)),w.id,r.parent_receipt,new Store(this.env.DB,r.id));
   else{
    const snapshot=JSON.parse(r.confirmation_json).snapshot,schedule=scheduleFor(this.scope,JSON.parse(w.plan_json),JSON.parse(r.schedule_json!));
    if(this.scope.platform==='Meta')await this.meta.schedule(snapshot,schedule.scheduled_at,r.id,this.ledger,()=>this.check(tool));
    else{if(!this.google.schedule)throw new Error('unavailable');await this.google.schedule(snapshot,schedule.date);}
   }
   const readback=await this.reconcile(r,w);await this.check(tool);await this.ledger.finish(r,'verified',readback);
  }catch(error){
   const steps=r.action==='resume'?await this.store.providerSteps(r.parent_receipt):[];
   const rejected=r.action==='resume'&&error instanceof ProviderError&&error.outcome==='rejected'&&!steps.some(s=>s.status==='started'&&!s.rejected);
   await this.ledger.finish(r,rejected?'rejected':'unknown',{provider_action:rejected?'rejected':'unknown'});
   if(!rejected)await this.read({...r,status:'unknown'},w);
  }
 }
}
