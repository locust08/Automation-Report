import {digest,type Scope} from './contracts';
import type {Workflow} from './store';
export type Action='resume'|'gate2';
export interface ActionReceipt {id:string;workflow_id:string;revision_id:string;subject:string;service_id:string;request_hash:string;action:Action;parent_receipt:string;schedule_json:string|null;refs_json:string;confirmation_json:string;scope_json:string;status:string;result_json:string|null;created_at:number;dispatched_at:number|null;updated_at:number}
export class ActionStore {
 constructor(private db:D1Database){}
 private primary(){return this.db.withSession('first-primary');}
 async get(id:string,s:Scope){return this.primary().prepare('SELECT * FROM m04_followup_operations WHERE id=? AND subject=? AND service_id=?').bind(id,s.subject,s.accountPageId).first<ActionReceipt>();}
 async list(w:Workflow){return (await this.primary().prepare('SELECT * FROM m04_followup_operations WHERE workflow_id=? ORDER BY created_at,id').bind(w.id).all<ActionReceipt>()).results;}
 async prepare(w:Workflow,s:Scope,action:Action,parent:string,schedule:unknown,refs:string[],snapshot:unknown,display:unknown,requestHash:string){
  const token=crypto.randomUUID()+crypto.randomUUID(),expires=Date.now()+300000;
  const confirmation={snapshot,display},confirmationHash=await digest({scope:s,workflow:w.id,revision:w.revision_id,action,parent,schedule,refs,confirmation});
  await this.primary().prepare('INSERT INTO m04_action_challenges VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0)')
   .bind(await digest(token),w.id,w.revision_id,w.subject,await digest(s),action,confirmationHash,requestHash,parent,schedule?JSON.stringify(schedule):null,JSON.stringify(refs),JSON.stringify(confirmation),expires).run();
  return {token,expires_at:new Date(expires).toISOString(),action,request_hash:requestHash,confirmation_hash:confirmationHash};
 }
 async reserve(w:Workflow,s:Scope,action:Action,input:Record<string,any>,requestHash:string){
  const db=this.primary(),tokenHash=await digest(input.challenge),scopeHash=await digest(s),now=Date.now(),guard=crypto.randomUUID();
  const c=await db.prepare('SELECT * FROM m04_action_challenges WHERE token_hash=?').bind(tokenHash).first<{parent_receipt:string;schedule_json:string|null;refs_json:string}>();
  if(!c||c.schedule_json!==(input.schedule?JSON.stringify(input.schedule):null)||action==='resume'&&JSON.stringify(input.operation_refs)!==c.refs_json)throw new Error('conflict');
  await db.batch([
   db.prepare("INSERT INTO m04_guard VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM m04_workflows WHERE id=? AND version=? AND revision_id=?) AND NOT EXISTS(SELECT 1 FROM m04_operations WHERE id=?) AND EXISTS(SELECT 1 FROM m04_action_challenges WHERE token_hash=? AND workflow_id=? AND revision_id=? AND subject=? AND scope_hash=? AND action=? AND confirmation_hash=? AND used=0 AND expires_at>?) THEN 1 ELSE 0 END)").bind(guard,w.id,w.version,w.revision_id,input.idempotency_key,tokenHash,w.id,w.revision_id,s.subject,scopeHash,action,input.confirmation_hash,now),
   db.prepare("INSERT INTO m04_followup_operations(id,workflow_id,revision_id,subject,service_id,request_hash,action,parent_receipt,schedule_json,refs_json,confirmation_json,status,scope_json,created_at,updated_at) SELECT ?,workflow_id,revision_id,subject,?,?,action,parent_receipt,schedule_json,refs_json,confirmation_json,'reserved',?,?,? FROM m04_action_challenges WHERE token_hash=?")
    .bind(input.idempotency_key,s.accountPageId,requestHash,JSON.stringify(s),now,now,tokenHash),
   db.prepare('INSERT INTO m04_recovery_steps SELECT ?,parent_receipt,value,0 FROM m04_action_challenges,json_each(refs_json) WHERE token_hash=? AND action=\'resume\'').bind(input.idempotency_key,tokenHash),
   db.prepare('UPDATE m04_action_challenges SET used=1 WHERE token_hash=?').bind(tokenHash),
   db.prepare('INSERT INTO m04_audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),w.id,w.subject,action,'reserved',now),
   db.prepare('DELETE FROM m04_guard WHERE id=?').bind(guard),
  ]);
 }
 async pending(){return (await this.primary().prepare("SELECT id FROM m04_followup_operations WHERE status='reserved' ORDER BY created_at LIMIT 50").all<{id:string}>()).results;}
 async dispatch(r:ActionReceipt){
  const db=this.primary(),guard=crypto.randomUUID();
  await db.batch([
   db.prepare("INSERT INTO m04_guard VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM m04_followup_operations WHERE id=? AND status='reserved') THEN 1 ELSE 0 END)").bind(guard,r.id),
   db.prepare("UPDATE m04_followup_operations SET status='dispatched',dispatched_at=?,updated_at=? WHERE id=?").bind(Date.now(),Date.now(),r.id),
   db.prepare('DELETE FROM m04_guard WHERE id=?').bind(guard),
  ]);
 }
 async finish(r:ActionReceipt,status:'verified'|'unknown'|'rejected',data:unknown){
  const db=this.primary();
  await db.batch([
   db.prepare("UPDATE m04_followup_operations SET status=?,result_json=?,updated_at=? WHERE id=? AND status IN ('reserved','dispatched','unknown')").bind(status,JSON.stringify(data),Date.now(),r.id),
   db.prepare('INSERT INTO m04_audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),r.workflow_id,r.subject,r.action,status,Date.now()),
  ]);
 }
 async claimStep(receipt:string,step:string,providerId:string){
  const row=await this.primary().prepare("INSERT INTO m04_gate2_steps VALUES(?,?,?,'started') ON CONFLICT(receipt_id,step) DO NOTHING").bind(receipt,step,providerId).run();
  const saved=await this.primary().prepare('SELECT provider_id FROM m04_gate2_steps WHERE receipt_id=? AND step=?').bind(receipt,step).first<{provider_id:string}>();
  if(saved?.provider_id!==providerId)throw new Error('conflict');
  return row.meta.changes===1;
 }
 async confirmStep(receipt:string,step:string){await this.primary().prepare("UPDATE m04_gate2_steps SET status='confirmed' WHERE receipt_id=? AND step=?").bind(receipt,step).run();}
}
