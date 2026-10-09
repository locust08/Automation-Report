import {expect,it} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
it('adds source and action data without changing historical unknown receipts or confirmed mappings',async()=>{
 const db=new DatabaseSync(':memory:');
 const migration=async(name:string)=>db.exec(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'));
 try{
  await migration('0001_paused_campaigns.sql');
  db.exec("INSERT INTO m04_workflows VALUES('legacy','actor','service','123',1,'connection','provider','scope','mapping','backend','{}','plan-hash','revision','source','unknown',0,1,1)");
  for(const file of ['0002_immutable_revisions.sql','0003_creation_outbox.sql','0004_provider_steps.sql','0005_tiktok_diagnostics.sql'])await migration(file);
  db.exec("INSERT INTO m04_operations VALUES('receipt','legacy','actor','service','request','unknown','{}',1,1,1)");
  db.exec("INSERT INTO m04_provider_steps(operation_id,step,provider_name,status,provider_id,created_at,updated_at) VALUES('receipt','campaign','legacy campaign','confirmed','101',1,1)");
  const rows=()=>({workflow:db.prepare('SELECT * FROM m04_workflows').all(),revisions:db.prepare('SELECT * FROM m04_revisions').all(),receipts:db.prepare('SELECT * FROM m04_operations').all()});
  const prior=rows();await migration('0006_sources_and_actions.sql');await migration('0007_curated_templates.sql');
  expect(rows()).toEqual(prior);
  expect(db.prepare('SELECT source_json,source_hash FROM m04_workflow_sources').get()).toMatchObject({source_json:'{"kind":"brief","historical":true}',source_hash:'plan-hash'});
  expect(db.prepare('SELECT provider_id,rejected FROM m04_provider_steps').get()).toMatchObject({provider_id:'101',rejected:0});
  expect(()=>db.exec("UPDATE m04_provider_steps SET provider_id=NULL")).toThrow('Preserve confirmed');
 }finally{db.close();}
});
