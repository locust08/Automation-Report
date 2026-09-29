CREATE TABLE m04_workflows (
 id TEXT PRIMARY KEY, subject TEXT NOT NULL, service_id TEXT NOT NULL, account_id TEXT NOT NULL,
 permission_revision INTEGER NOT NULL, connection_revision TEXT NOT NULL, provider_revision TEXT NOT NULL, scope_hash TEXT NOT NULL, mapping_hash TEXT NOT NULL, backend_revision TEXT NOT NULL,
 plan_json TEXT NOT NULL, plan_hash TEXT NOT NULL, revision_id TEXT NOT NULL, source_key TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('draft','validated','approved','creating','verified','unknown','rejected')),
 version INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(subject,service_id,source_key)
);
CREATE TRIGGER m04_immutable_plan BEFORE UPDATE OF subject,service_id,account_id,permission_revision,connection_revision,provider_revision,scope_hash,mapping_hash,backend_revision,plan_json,plan_hash,revision_id,source_key,created_at ON m04_workflows BEGIN SELECT RAISE(ABORT,'Immutable M04 revision'); END;
CREATE TABLE m04_challenges (
 id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES m04_workflows(id), subject TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('approve','gate1')), token_hash TEXT NOT NULL UNIQUE,
 confirmation_hash TEXT NOT NULL, request_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE m04_operations (
 id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL UNIQUE REFERENCES m04_workflows(id), subject TEXT NOT NULL,
 service_id TEXT NOT NULL, request_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('reserved','dispatched','verified','unknown','rejected')),
 result_json TEXT, created_at INTEGER NOT NULL, dispatched_at INTEGER, updated_at INTEGER NOT NULL,
 UNIQUE(subject,service_id,id)
);
CREATE TRIGGER m04_immutable_operation BEFORE UPDATE OF workflow_id,subject,service_id,request_hash,created_at ON m04_operations BEGIN SELECT RAISE(ABORT,'Immutable M04 operation'); END;
CREATE TABLE m04_audit (id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, subject TEXT NOT NULL, action TEXT NOT NULL, outcome TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TRIGGER m04_audit_no_update BEFORE UPDATE ON m04_audit BEGIN SELECT RAISE(ABORT,'Immutable M04 audit'); END;
CREATE TRIGGER m04_audit_no_delete BEFORE DELETE ON m04_audit BEGIN SELECT RAISE(ABORT,'Immutable M04 audit'); END;
CREATE TRIGGER m04_immutable_challenge BEFORE UPDATE OF workflow_id,subject,action,token_hash,confirmation_hash,request_hash,expires_at ON m04_challenges BEGIN SELECT RAISE(ABORT,'Immutable M04 challenge'); END;
CREATE TABLE m04_guard (id TEXT PRIMARY KEY,valid INTEGER NOT NULL CHECK(valid=1));
