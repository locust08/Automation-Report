-- Independent QA observations. Never changes creation, recovery or scheduling receipts.
CREATE TABLE m04_workflow_qa (
 id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES m04_workflows(id),
 revision_id TEXT NOT NULL REFERENCES m04_revisions(revision_id), subject TEXT NOT NULL, service_id TEXT NOT NULL,
 scope_hash TEXT NOT NULL, backend_revision TEXT NOT NULL, plan_hash TEXT NOT NULL,
 parent_receipt TEXT NOT NULL REFERENCES m04_operations(id), request_hash TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('passed','failed','unknown')),
 evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)), captured_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX m04_qa_latest ON m04_workflow_qa(workflow_id,captured_at DESC);
CREATE TRIGGER m04_qa_no_update BEFORE UPDATE ON m04_workflow_qa BEGIN SELECT RAISE(ABORT,'Immutable QA observation'); END;
CREATE TRIGGER m04_qa_no_delete BEFORE DELETE ON m04_workflow_qa BEGIN SELECT RAISE(ABORT,'Preserve QA observation'); END;
