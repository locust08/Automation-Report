import {digest,metaPlanSchema,planSchema,result,type Scope} from './contracts';
import {Store,type Workflow} from './store';
import {ActionStore} from './action-store';
import {ProviderError} from './google';
import type {Meta} from './meta';
import type {Provider} from './service';

interface Observation {
 id:string;workflow_id:string;revision_id:string;subject:string;service_id:string;scope_hash:string;backend_revision:string;plan_hash:string;
 parent_receipt:string;request_hash:string;status:'passed'|'failed'|'unknown';evidence_json:string;captured_at:number;expires_at:number;
}
export class WorkflowQA {
 private db:D1DatabaseSession;
 constructor(private binding:D1Database,private scope:Scope){this.db=binding.withSession('first-primary');}
 async get(id:string){return this.db.prepare('SELECT * FROM m04_workflow_qa WHERE id=? AND subject=? AND service_id=?').bind(id,this.scope.subject,this.scope.accountPageId).first<Observation>();}
 async latest(w:Workflow){
  return this.db.prepare('SELECT * FROM m04_workflow_qa WHERE workflow_id=? AND revision_id=? AND plan_hash=? AND scope_hash=? AND backend_revision=? ORDER BY captured_at DESC,rowid DESC LIMIT 1')
   .bind(w.id,w.revision_id,w.plan_hash,await digest(this.scope),w.backend_revision).first<Observation>();
 }
 detail(row:Observation){
  const current=row.expires_at>Date.now();
  return {receipt_ref:row.id,status:row.status,qa_status:current?(row.status==='unknown'?'pending':row.status):'pending',
   captured_at:new Date(row.captured_at).toISOString(),expires_at:new Date(row.expires_at).toISOString(),fresh:current,
   revision_id:row.revision_id,revision_hash:row.plan_hash,parent_receipt:row.parent_receipt,...JSON.parse(row.evidence_json),provider_action:false};
 }
 response(row:Observation){return result('success',{workflow_ref:row.workflow_id,revision_ref:row.revision_id,receipt_ref:row.id,
  allowed_next_actions:['campaign_workflow_get','campaign_operation_get'],data:{...this.detail(row),qa:this.detail(row)},
  caveats:['QA is a dated paused-object snapshot; it does not authorize activation or scheduling.']});}
 async run(w:Workflow,input:Record<string,any>,requestHash:string,store:Store,google:Provider,meta:Meta,check:()=>Promise<unknown>,sourceCheck:()=>Promise<unknown>){
  if(this.scope.platform==='TikTok')return result('unavailable',{workflow_ref:w.id,revision_ref:w.revision_id,caveats:['Standalone QA supports Google and Meta only.']});
  const previous=await this.get(input.idempotency_key);
  if(previous){
   if(previous.workflow_id!==w.id||previous.revision_id!==w.revision_id||previous.request_hash!==requestHash||previous.scope_hash!==await digest(this.scope)||previous.backend_revision!==w.backend_revision)throw new Error('idempotency_conflict');
   await check();return this.response(previous);
  }
  // QA IDs cannot be confused with creation or follow-up receipt IDs.
  if(await store.operation(input.idempotency_key,this.scope)||await new ActionStore(this.binding).get(input.idempotency_key,this.scope))throw new Error('idempotency_conflict');
  const parent=await store.operationForWorkflow(w.id,this.scope),receipts=await new ActionStore(this.binding).list(w);
  if(!parent||!(parent.status==='verified'||receipts.some(r=>r.action==='resume'&&r.status==='verified'))||
   receipts.some(r=>['reserved','dispatched','unknown'].includes(r.status)||r.action==='gate2'&&r.status==='verified'))throw new Error('conflict');
  let status:Observation['status']='passed',evidence:Record<string,unknown>;
  try{
   await sourceCheck();
   const snapshot:Record<string,any>|null=this.scope.platform==='Meta'?await meta.qa(metaPlanSchema.parse(JSON.parse(w.plan_json)),w.id,parent.id,store,{readOnly:true})
    :google.qa?await google.qa(planSchema.parse(JSON.parse(w.plan_json)),w.id,{readOnly:true}):null;
   if(!snapshot)throw new Error('qa_unavailable');
   // Retain bounded evidence, not raw targeting, creative or provider responses.
   evidence={checks:['paused_hierarchy','account_and_parent_relationships','daily_budget','plan_configuration','source_configuration','provider_issues',...(this.scope.platform==='Meta'&&JSON.parse(w.plan_json).start_at?['approved_future_start']:[])],
    ...(this.scope.platform==='Meta'&&JSON.parse(w.plan_json).start_at?{start_at:JSON.parse(w.plan_json).start_at,observed_start_time:snapshot.start_time}:{}),
    provider_objects:this.scope.platform==='Meta'?[{kind:'campaign',id:snapshot.campaign_id,status:'PAUSED'},{kind:'adset',id:snapshot.adset_id,status:'PAUSED'},{kind:'ad',id:snapshot.ad_id,status:'PAUSED'}]
     :[{kind:'campaign',id:snapshot.campaign.resourceName,status:'PAUSED'},{kind:'ad_group',id:snapshot.ad_group.resourceName,status:'PAUSED'},{kind:'ad',id:snapshot.ad.resourceName,status:'PAUSED'}],
    daily_budget:JSON.parse(w.plan_json).daily_budget,currency:JSON.parse(w.plan_json).currency,snapshot_hash:await digest(snapshot)};
  }catch(error){
   const code=error instanceof ProviderError?error.code:'qa_unavailable';
   // Only explicit QA mismatches/issues establish failure; transport/readback errors remain unknown.
   status=['meta_qa_mismatch','meta_qa_issues','google_qa_policy'].includes(code)?'failed':'unknown';
   evidence={issue:{code:/^[a-zA-Z0-9_]{1,100}$/.test(code)?code:'qa_unavailable'},checks:[],no_automatic_retry:true};
  }
  await check();
  const now=Date.now(),scopeHash=await digest(this.scope),guard=crypto.randomUUID();
  const row:Observation={id:input.idempotency_key,workflow_id:w.id,revision_id:w.revision_id,subject:w.subject,service_id:w.service_id,
   scope_hash:scopeHash,backend_revision:w.backend_revision,plan_hash:w.plan_hash,parent_receipt:parent.id,request_hash:requestHash,status,evidence_json:JSON.stringify(evidence),captured_at:now,expires_at:now+15*60_000};
  // All-or-nothing evidence + audit, guarded against revision and action races. Never update workflow/provider status.
  await this.db.batch([
   this.db.prepare("INSERT INTO m04_guard(id,valid) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM m04_workflows WHERE id=? AND version=? AND revision_id=? AND scope_hash=? AND plan_hash=?) AND NOT EXISTS(SELECT 1 FROM m04_followup_operations WHERE workflow_id=? AND (status IN ('reserved','dispatched','unknown') OR (action='gate2' AND status='verified'))) AND NOT EXISTS(SELECT 1 FROM m04_action_challenges WHERE workflow_id=? AND action='gate2' AND used=0 AND expires_at>?) THEN 1 ELSE 0 END)")
    .bind(guard,w.id,w.version,w.revision_id,scopeHash,w.plan_hash,w.id,w.id,now),
   this.db.prepare('INSERT INTO m04_workflow_qa VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...Object.values(row)),
   this.db.prepare("INSERT INTO m04_audit(id,workflow_id,subject,action,outcome,at) VALUES(?,?,?,'workflow_qa',?,?)").bind(crypto.randomUUID(),w.id,w.subject,status,now),
   this.db.prepare('DELETE FROM m04_guard WHERE id=?').bind(guard),
  ]);
  return this.response(row);
 }
}
