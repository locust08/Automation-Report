CREATE TABLE m04_revisions (
 revision_id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES m04_workflows(id),
 revision_number INTEGER NOT NULL, plan_json TEXT NOT NULL, plan_hash TEXT NOT NULL,
 save_key TEXT NOT NULL, created_at INTEGER NOT NULL,
 UNIQUE(workflow_id, revision_number), UNIQUE(workflow_id, save_key)
);
INSERT INTO m04_revisions(revision_id,workflow_id,revision_number,plan_json,plan_hash,save_key,created_at)
 SELECT revision_id,id,1,plan_json,plan_hash,source_key,created_at FROM m04_workflows;
CREATE TRIGGER m04_revisions_no_update BEFORE UPDATE ON m04_revisions BEGIN SELECT RAISE(ABORT,'Immutable M04 revision'); END;
CREATE TRIGGER m04_revisions_no_delete BEFORE DELETE ON m04_revisions BEGIN SELECT RAISE(ABORT,'Immutable M04 revision'); END;
DROP TRIGGER m04_immutable_plan;
CREATE TRIGGER m04_immutable_scope BEFORE UPDATE OF subject,service_id,account_id,permission_revision,connection_revision,provider_revision,scope_hash,mapping_hash,backend_revision,source_key,created_at ON m04_workflows BEGIN SELECT RAISE(ABORT,'Immutable M04 scope'); END;
CREATE TRIGGER m04_revision_pointer BEFORE UPDATE OF plan_json,plan_hash,revision_id ON m04_workflows
 WHEN NEW.revision_id=OLD.revision_id OR NEW.status<>'draft' OR OLD.status NOT IN ('draft','validated','approved') OR NEW.version<>OLD.version+1 OR
 NOT EXISTS(SELECT 1 FROM m04_revisions newer JOIN m04_revisions prior ON prior.revision_id=OLD.revision_id WHERE newer.revision_id=NEW.revision_id AND newer.workflow_id=OLD.id AND newer.revision_number=prior.revision_number+1 AND newer.plan_json=NEW.plan_json AND newer.plan_hash=NEW.plan_hash)
 BEGIN SELECT RAISE(ABORT,'Immutable M04 revision pointer'); END;
