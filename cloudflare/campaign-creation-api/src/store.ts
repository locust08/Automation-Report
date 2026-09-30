import {digest,mappingDigest, type Scope, type AnyPlan} from './contracts';
import {tikTokDiagnosticSchema,type TikTokDiagnostic} from './tiktok-diagnostics';
export interface Workflow {id: string; subject: string; service_id: string; account_id: string; permission_revision: number; connection_revision: string; provider_revision: string; scope_hash: string; mapping_hash:string; backend_revision:string; plan_json: string; plan_hash: string; revision_id: string; source_key: string; status: string; version: number; created_at: number; updated_at: number}
export interface Operation {id: string; workflow_id: string; subject: string; service_id: string; request_hash: string; status: string; result_json: string | null; created_at: number; dispatched_at: number | null; updated_at: number}
export interface Revision {revision_id:string;workflow_id:string;revision_number:number;plan_json:string;plan_hash:string;save_key:string;created_at:number}
export interface ProviderStep {status:'started'|'confirmed';provider_id:string|null;provider_name:string}
export class Store {
  constructor(private db: D1Database) {}
  async appendTikTokDiagnostic(operationId:string,value:TikTokDiagnostic){
    const d=tikTokDiagnosticSchema.parse(value),db=this.primary();
    await db.batch([
      db.prepare('INSERT INTO m04_tiktok_diagnostics(operation_id,step,phase,diagnostic_json) VALUES(?,?,?,?)').bind(operationId,d.step,d.phase,JSON.stringify(d)),
      db.prepare("DELETE FROM m04_tiktok_diagnostics WHERE operation_id=? AND step=? AND phase='reconciliation' AND sequence NOT IN (SELECT sequence FROM m04_tiktok_diagnostics WHERE operation_id=? AND step=? AND phase='reconciliation' ORDER BY sequence DESC LIMIT 10)").bind(operationId,d.step,operationId,d.step),
    ]);
  }
  async tikTokDiagnostics(operationId:string,scope:Scope){
    const rows=await this.primary().prepare('SELECT d.diagnostic_json FROM m04_tiktok_diagnostics d JOIN m04_operations o ON o.id=d.operation_id JOIN m04_workflows w ON w.id=o.workflow_id WHERE o.id=? AND o.subject=? AND o.service_id=? AND w.account_id=? ORDER BY d.sequence')
      .bind(operationId,scope.subject,scope.accountPageId,scope.platformAccountId).all<{diagnostic_json:string}>();
    return rows.results.map(row=>tikTokDiagnosticSchema.parse(JSON.parse(row.diagnostic_json)));
  }
  private primary() {return this.db.withSession('first-primary');}
  private auditStatement(db: D1DatabaseSession, w: Pick<Workflow, 'id' | 'subject'>, action: string, outcome: string) {
    return db.prepare('INSERT INTO m04_audit(id,workflow_id,subject,action,outcome,at) VALUES(?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), w.id, w.subject, action, outcome, Date.now());
  }
  async workflow(id: string, s: Scope) {return this.primary().prepare('SELECT * FROM m04_workflows WHERE id=? AND subject=? AND service_id=?').bind(id, s.subject, s.accountPageId).first<Workflow>();}
  async workflows(s:Scope,backendRevision:string,limit:number){
    return (await this.primary().prepare('SELECT * FROM m04_workflows WHERE subject=? AND service_id=? AND scope_hash=? AND backend_revision=? ORDER BY updated_at DESC,id DESC LIMIT ?')
      .bind(s.subject,s.accountPageId,await digest(s),backendRevision,limit).all<Workflow>()).results;
  }
  async source(id: string, s: Scope) {return this.primary().prepare('SELECT * FROM m04_workflows WHERE source_key=? AND subject=? AND service_id=?').bind(id, s.subject, s.accountPageId).first<Workflow>();}
  async revisions(id:string){return (await this.primary().prepare('SELECT revision_id,revision_number,plan_hash,plan_json,created_at FROM m04_revisions WHERE workflow_id=? ORDER BY revision_number').bind(id).all<Revision>()).results;}
  async providerStep(operationId:string,step:'campaign'|'adset'|'ad'){
    return this.primary().prepare('SELECT status,provider_id,provider_name FROM m04_provider_steps WHERE operation_id=? AND step=?').bind(operationId,step).first<ProviderStep>();
  }
  async providerSteps(operationId:string){
    return (await this.primary().prepare('SELECT step,status,provider_id,provider_name FROM m04_provider_steps WHERE operation_id=? ORDER BY created_at,step').bind(operationId).all<ProviderStep&{step:string}>()).results;
  }
  async beginProviderStep(operationId:string,step:'campaign'|'adset'|'ad',providerName:string){
    const now=Date.now();
    const inserted=await this.primary().prepare("INSERT INTO m04_provider_steps(operation_id,step,provider_name,status,created_at,updated_at) VALUES(?,?,?,'started',?,?) ON CONFLICT(operation_id,step) DO NOTHING")
      .bind(operationId,step,providerName,now,now).run();
    const row=await this.providerStep(operationId,step);
    if(!row||row.provider_name!==providerName)throw new Error('provider_step_conflict');
    return {status:row.status,provider_id:row.provider_id,claimed:inserted.meta.changes===1};
  }
  async confirmProviderStep(operationId:string,step:'campaign'|'adset'|'ad',providerId:string){
    if(!/^\d+$/.test(providerId))throw new Error('provider_step_conflict');
    await this.primary().prepare("UPDATE m04_provider_steps SET status='confirmed',provider_id=?,updated_at=? WHERE operation_id=? AND step=? AND (provider_id IS NULL OR provider_id=?)")
      .bind(providerId,Date.now(),operationId,step,providerId).run();
    const row=await this.providerStep(operationId,step);
    if(!row||row.status!=='confirmed'||row.provider_id!==providerId)throw new Error('provider_step_conflict');
  }
  async saveRevision(w:Workflow,s:Scope,p:AnyPlan,key:string,expectedRevision:string){
    const db=this.primary(),planHash=await digest(p),scopeHash=await digest(s);
    if(w.scope_hash!==scopeHash||w.account_id!==s.platformAccountId||w.permission_revision!==s.grantRevision||w.connection_revision!==s.connectionRevision||w.provider_revision!==s.providerRevision)throw new Error('stale_revision');
    const previous=await db.prepare('SELECT * FROM m04_revisions WHERE workflow_id=? AND save_key=?').bind(w.id,key).first<Revision>();
    if(previous){if(previous.plan_hash!==planHash||previous.revision_id!==w.revision_id)throw new Error('idempotency_conflict');return w;}
    if(w.revision_id!==expectedRevision||!['draft','validated','approved'].includes(w.status))throw new Error('stale_revision');
    const current=await db.prepare('SELECT revision_number FROM m04_revisions WHERE revision_id=? AND workflow_id=?').bind(w.revision_id,w.id).first<Revision>();
    if(!current)throw new Error('stale_revision');
    const now=Date.now(),revision=crypto.randomUUID(),guard=crypto.randomUUID();
    try{await db.batch([
      db.prepare("INSERT INTO m04_guard(id,valid) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM m04_workflows WHERE id=? AND version=? AND revision_id=? AND status IN ('draft','validated','approved')) AND NOT EXISTS(SELECT 1 FROM m04_operations WHERE workflow_id=?) THEN 1 ELSE 0 END)").bind(guard,w.id,w.version,expectedRevision,w.id),
      db.prepare('INSERT INTO m04_revisions(revision_id,workflow_id,revision_number,plan_json,plan_hash,save_key,created_at) VALUES(?,?,?,?,?,?,?)').bind(revision,w.id,current.revision_number+1,JSON.stringify(p),planHash,key,now),
      db.prepare("UPDATE m04_workflows SET plan_json=?,plan_hash=?,revision_id=?,status='draft',version=version+1,updated_at=? WHERE id=?").bind(JSON.stringify(p),planHash,revision,now,w.id),
      db.prepare('UPDATE m04_challenges SET used=1 WHERE workflow_id=?').bind(w.id),
      this.auditStatement(db,w,'save_revision','success'),db.prepare('DELETE FROM m04_guard WHERE id=?').bind(guard),
    ]);}catch{throw new Error('conflict');}
    const updated=await this.workflow(w.id,s);
    if(!updated||updated.revision_id!==revision||updated.plan_hash!==planHash)throw new Error('conflict');
    return updated;
  }
  async save(s: Scope, p: AnyPlan, key: string, backendRevision:string) {
    const existing = await this.source(key, s), planHash = await digest(p), scopeHash=await digest(s);
    if (existing) {if (existing.plan_hash !== planHash||existing.scope_hash!==scopeHash||existing.backend_revision!==backendRevision) throw new Error('idempotency_conflict'); return existing;}
    const now = Date.now(), id = crypto.randomUUID(), revision = crypto.randomUUID(), db = this.primary();
    await db.batch([
      db.prepare("INSERT INTO m04_workflows(id,subject,service_id,account_id,permission_revision,connection_revision,provider_revision,scope_hash,mapping_hash,backend_revision,plan_json,plan_hash,revision_id,source_key,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?) ON CONFLICT(subject,service_id,source_key) DO NOTHING")
        .bind(id, s.subject, s.accountPageId, s.platformAccountId, s.grantRevision, s.connectionRevision, s.providerRevision, scopeHash,await mappingDigest(s), backendRevision, JSON.stringify(p), planHash, revision, key, now, now),
      db.prepare('INSERT INTO m04_revisions(revision_id,workflow_id,revision_number,plan_json,plan_hash,save_key,created_at) SELECT ?,id,1,?,?,?,? FROM m04_workflows WHERE id=?').bind(revision,JSON.stringify(p),planHash,key,now,id),
      db.prepare("INSERT INTO m04_audit(id,workflow_id,subject,action,outcome,at) SELECT ?,id,subject,'save','success',? FROM m04_workflows WHERE id=?").bind(crypto.randomUUID(), now, id),
    ]);
    const row = await this.source(key, s);
    if (!row || row.plan_hash !== planHash||row.scope_hash!==scopeHash||row.backend_revision!==backendRevision) throw new Error('idempotency_conflict');
    return row;
  }
  async status(w: Workflow, status: string) {
    const db = this.primary(), guard = crypto.randomUUID();
    await db.batch([
      db.prepare('INSERT INTO m04_guard(id,valid) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM m04_workflows WHERE id=? AND version=? AND status=?) THEN 1 ELSE 0 END)').bind(guard, w.id, w.version, w.status),
      db.prepare('UPDATE m04_workflows SET status=?,version=version+1,updated_at=? WHERE id=?').bind(status, Date.now(), w.id),
      this.auditStatement(db, w, 'validate', status), db.prepare('DELETE FROM m04_guard WHERE id=?').bind(guard),
    ]);
    w.version++; w.status = status;
  }
  async prepare(w: Workflow, action: string, confirmationHash: string, requestHash: string) {
    const token = crypto.randomUUID() + crypto.randomUUID(), expires = Date.now() + 300000;
    await this.primary().prepare('INSERT INTO m04_challenges(id,workflow_id,subject,action,token_hash,confirmation_hash,request_hash,expires_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), w.id, w.subject, action, await digest(token), confirmationHash, requestHash, expires).run();
    return {token, expires_at: new Date(expires).toISOString(), action, request_hash: requestHash, confirmation_hash: confirmationHash};
  }
  async approve(w: Workflow, input: Record<string, any>) {
    const db = this.primary(), tokenHash = await digest(input.challenge), now = Date.now(), guard = crypto.randomUUID();
    try {
      await db.batch([
        db.prepare("INSERT INTO m04_guard(id,valid) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM m04_workflows WHERE id=? AND version=? AND status='validated') AND EXISTS(SELECT 1 FROM m04_challenges WHERE workflow_id=? AND subject=? AND action='approve' AND token_hash=? AND confirmation_hash=? AND expires_at>? AND used=0) THEN 1 ELSE 0 END)")
          .bind(guard, w.id, w.version, w.id, w.subject, tokenHash, input.confirmation_hash, now),
        db.prepare("UPDATE m04_workflows SET status='approved',version=version+1,updated_at=? WHERE id=?").bind(now, w.id),
        db.prepare('UPDATE m04_challenges SET used=1 WHERE workflow_id=? AND token_hash=?').bind(w.id, tokenHash),
        this.auditStatement(db, w, 'approve', 'success'), db.prepare('DELETE FROM m04_guard WHERE id=?').bind(guard),
      ]);
    } catch {throw new Error('conflict');}
  }
  async operation(id: string, s: Scope) {return this.primary().prepare('SELECT * FROM m04_operations WHERE id=? AND subject=? AND service_id=?').bind(id, s.subject, s.accountPageId).first<Operation>();}
  async operationForWorkflow(id:string,s:Scope){return this.primary().prepare('SELECT * FROM m04_operations WHERE workflow_id=? AND subject=? AND service_id=?').bind(id,s.subject,s.accountPageId).first<Operation>();}
  async reserve(w: Workflow, input: Record<string, any>, requestHash: string, scope:Scope) {
    const db = this.primary(), now = Date.now(), tokenHash = await digest(input.challenge), guard = crypto.randomUUID();
    try {
      await db.batch([
        db.prepare("INSERT INTO m04_guard(id,valid) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM m04_workflows WHERE id=? AND version=? AND status='approved') AND EXISTS(SELECT 1 FROM m04_challenges WHERE workflow_id=? AND subject=? AND action='gate1' AND token_hash=? AND confirmation_hash=? AND expires_at>? AND used=0) THEN 1 ELSE 0 END)")
          .bind(guard, w.id, w.version, w.id, w.subject, tokenHash, input.confirmation_hash, now),
        db.prepare("INSERT INTO m04_operations(id,workflow_id,subject,service_id,request_hash,status,created_at,updated_at) VALUES(?,?,?,?,?,'reserved',?,?)")
          .bind(input.idempotency_key, w.id, w.subject, w.service_id, requestHash, now, now),
        db.prepare('INSERT INTO m04_creation_outbox(operation_id,scope_json,created_at) VALUES(?,?,?)').bind(input.idempotency_key,JSON.stringify(scope),now),
        db.prepare('UPDATE m04_challenges SET used=1 WHERE workflow_id=? AND token_hash=?').bind(w.id, tokenHash),
        db.prepare("UPDATE m04_workflows SET status='creating',version=version+1,updated_at=? WHERE id=?").bind(now, w.id),
        this.auditStatement(db, w, 'gate1', 'reserved'), db.prepare('DELETE FROM m04_guard WHERE id=?').bind(guard),
      ]);
    } catch {throw new Error('conflict');}
  }
  async outbox(id:string){return this.primary().prepare('SELECT operation_id,scope_json,enqueued_at FROM m04_creation_outbox WHERE operation_id=?').bind(id).first<{operation_id:string;scope_json:string;enqueued_at:number|null}>();}
  async pendingOutbox(now=Date.now()){return (await this.primary().prepare("SELECT b.operation_id FROM m04_creation_outbox b JOIN m04_operations o ON o.id=b.operation_id WHERE o.status='reserved' AND (b.enqueued_at IS NULL OR b.enqueued_at<?) ORDER BY b.created_at LIMIT 50").bind(now-60000).all<{operation_id:string}>()).results;}
  async markEnqueued(id:string){await this.primary().prepare('UPDATE m04_creation_outbox SET enqueued_at=? WHERE operation_id=?').bind(Date.now(),id).run();}
  async rejectReserved(w:Workflow,id:string,reason:string,preflight?:ReturnType<typeof import('./preflight').preflightObservation>){const db=this.primary(),guard=crypto.randomUUID();await db.batch([
    db.prepare("INSERT INTO m04_guard(id,valid) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM m04_operations WHERE id=? AND workflow_id=? AND status='reserved') THEN 1 ELSE 0 END)").bind(guard,id,w.id),
    db.prepare("UPDATE m04_operations SET status='rejected',result_json=?,updated_at=? WHERE id=?").bind(JSON.stringify({provider_action:false,reason,...(preflight?{preflight}:{})}),Date.now(),id),
    db.prepare("UPDATE m04_workflows SET status='rejected',version=version+1,updated_at=? WHERE id=?").bind(Date.now(),w.id),
    this.auditStatement(db,w,'gate1','rejected'),db.prepare('DELETE FROM m04_guard WHERE id=?').bind(guard),
  ]);}
  async dispatched(id: string) {
    const db = this.primary(), guard = crypto.randomUUID(), now = Date.now();
    await db.batch([
      db.prepare("INSERT INTO m04_guard(id,valid) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM m04_operations WHERE id=? AND status='reserved') THEN 1 ELSE 0 END)").bind(guard, id),
      db.prepare("UPDATE m04_operations SET status='dispatched',dispatched_at=?,updated_at=? WHERE id=?").bind(now, now, id),
      db.prepare("INSERT INTO m04_audit(id,workflow_id,subject,action,outcome,at) SELECT ?,workflow_id,subject,'gate1','dispatched',? FROM m04_operations WHERE id=?").bind(crypto.randomUUID(), now, id),
      db.prepare('DELETE FROM m04_guard WHERE id=?').bind(guard),
    ]);
  }
  async finish(w: Workflow, id: string, status: 'verified' | 'unknown' | 'rejected', data: unknown) {
    const db = this.primary(), guard = crypto.randomUUID();
    await db.batch([
      db.prepare("INSERT INTO m04_guard(id,valid) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM m04_operations WHERE id=? AND workflow_id=? AND status IN ('dispatched','unknown')) THEN 1 ELSE 0 END)").bind(guard, id, w.id),
      db.prepare('UPDATE m04_operations SET status=?,result_json=?,updated_at=? WHERE id=? AND workflow_id=?').bind(status, JSON.stringify(data), Date.now(), id, w.id),
      db.prepare('UPDATE m04_workflows SET status=?,version=version+1,updated_at=? WHERE id=?').bind(status, Date.now(), w.id),
      this.auditStatement(db, w, 'gate1', status), db.prepare('DELETE FROM m04_guard WHERE id=?').bind(guard),
    ]);
  }
}
