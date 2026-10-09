-- Forward-only additions: preserve every historical workflow, receipt and provider mapping.
CREATE TABLE m04_templates (
 template_id TEXT PRIMARY KEY, version INTEGER NOT NULL CHECK(version>0), platform TEXT NOT NULL CHECK(platform IN ('Google','Meta')),
 campaign_type TEXT NOT NULL, defaults_json TEXT NOT NULL CHECK(json_valid(defaults_json)),
 required_overrides_json TEXT NOT NULL CHECK(json_valid(required_overrides_json)), content_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TRIGGER m04_template_no_update BEFORE UPDATE ON m04_templates BEGIN SELECT RAISE(ABORT,'Immutable template version'); END;
CREATE TRIGGER m04_template_no_delete BEFORE DELETE ON m04_templates BEGIN SELECT RAISE(ABORT,'Immutable template version'); END;
CREATE TABLE m04_template_availability (template_id TEXT PRIMARY KEY REFERENCES m04_templates(template_id), enabled INTEGER NOT NULL CHECK(enabled IN (0,1)));
CREATE TABLE m04_workflow_sources (
 revision_id TEXT PRIMARY KEY REFERENCES m04_revisions(revision_id), workflow_id TEXT NOT NULL REFERENCES m04_workflows(id),
 source_json TEXT NOT NULL CHECK(json_valid(source_json)), source_hash TEXT NOT NULL
);
INSERT INTO m04_workflow_sources SELECT revision_id,workflow_id,'{"kind":"brief","historical":true}',plan_hash FROM m04_revisions;
CREATE TRIGGER m04_source_no_update BEFORE UPDATE ON m04_workflow_sources BEGIN SELECT RAISE(ABORT,'Immutable source'); END;
CREATE TRIGGER m04_source_no_delete BEFORE DELETE ON m04_workflow_sources BEGIN SELECT RAISE(ABORT,'Immutable source'); END;
-- The original UNIQUE(workflow_id) Gate 1 ledger is intentionally retained for rollback.
-- Follow-up receipts share the workflow and refer to its original Gate 1 operation.
CREATE TABLE m04_followup_operations (
 id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES m04_workflows(id), revision_id TEXT NOT NULL REFERENCES m04_revisions(revision_id),
 subject TEXT NOT NULL, service_id TEXT NOT NULL, request_hash TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('resume','gate2')), parent_receipt TEXT NOT NULL REFERENCES m04_operations(id),
 schedule_json TEXT, refs_json TEXT NOT NULL CHECK(json_valid(refs_json)), confirmation_json TEXT NOT NULL CHECK(json_valid(confirmation_json)),
 status TEXT NOT NULL CHECK(status IN ('reserved','dispatched','verified','unknown','rejected')),
 result_json TEXT, scope_json TEXT NOT NULL, created_at INTEGER NOT NULL, dispatched_at INTEGER, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX m04_active_followup ON m04_followup_operations(workflow_id) WHERE status IN ('reserved','dispatched','unknown');
CREATE UNIQUE INDEX m04_one_scheduled_gate ON m04_followup_operations(workflow_id) WHERE action='gate2' AND status='verified';
CREATE TRIGGER m04_followup_immutable BEFORE UPDATE OF id,workflow_id,revision_id,subject,service_id,request_hash,action,parent_receipt,schedule_json,refs_json,confirmation_json,scope_json,created_at ON m04_followup_operations BEGIN SELECT RAISE(ABORT,'Immutable action receipt'); END;
CREATE TRIGGER m04_followup_no_delete BEFORE DELETE ON m04_followup_operations BEGIN SELECT RAISE(ABORT,'Preserve action receipt'); END;
CREATE TABLE m04_action_challenges (
 token_hash TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES m04_workflows(id), revision_id TEXT NOT NULL,
 subject TEXT NOT NULL, scope_hash TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('resume','gate2')),
 confirmation_hash TEXT NOT NULL, request_hash TEXT NOT NULL, parent_receipt TEXT NOT NULL,
 schedule_json TEXT, refs_json TEXT NOT NULL, confirmation_json TEXT NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0
);
CREATE TRIGGER m04_action_challenge_immutable BEFORE UPDATE OF token_hash,workflow_id,revision_id,subject,scope_hash,action,confirmation_hash,request_hash,parent_receipt,schedule_json,refs_json,confirmation_json,expires_at ON m04_action_challenges BEGIN SELECT RAISE(ABORT,'Immutable action challenge'); END;
ALTER TABLE m04_provider_steps ADD COLUMN rejected INTEGER NOT NULL DEFAULT 0 CHECK(rejected IN (0,1));
CREATE TRIGGER m04_confirmed_step_immutable BEFORE UPDATE ON m04_provider_steps WHEN OLD.status='confirmed' AND (NEW.status IS NOT OLD.status OR NEW.provider_id IS NOT OLD.provider_id OR NEW.rejected IS NOT OLD.rejected) BEGIN SELECT RAISE(ABORT,'Preserve confirmed provider step'); END;
CREATE TABLE m04_recovery_steps (
 receipt_id TEXT NOT NULL REFERENCES m04_followup_operations(id), parent_receipt TEXT NOT NULL, step TEXT NOT NULL,
 consumed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(receipt_id,step)
);
CREATE TABLE m04_gate2_steps (
 receipt_id TEXT NOT NULL REFERENCES m04_followup_operations(id), step TEXT NOT NULL, provider_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('started','confirmed')), PRIMARY KEY(receipt_id,step)
);
