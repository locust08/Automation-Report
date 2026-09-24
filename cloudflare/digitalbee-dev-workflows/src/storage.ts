import {sha256} from './auth';
export class DevStorage{
  constructor(private readonly db:D1Database){}
  async audit(module:'m03'|'m04',action:string,subject:string,serviceId:string,requestHash:string,outcome:string,now=Date.now()){
    await this.db.prepare('INSERT INTO dev_workflow_audit(id,module,action,subject_hash,service_id,request_hash,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),module,action,await sha256(subject),serviceId,requestHash,outcome,now).run();
  }
  async cleanupReplay(now=Math.floor(Date.now()/1000)){return this.db.prepare('DELETE FROM dev_delegation_replay WHERE jti IN (SELECT jti FROM dev_delegation_replay WHERE expires_at<=? ORDER BY expires_at LIMIT 100)').bind(now).run();}
}
