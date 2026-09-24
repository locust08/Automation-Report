ALTER TABLE dev_m04_drafts ADD COLUMN idempotency_key TEXT NOT NULL DEFAULT '';
ALTER TABLE dev_m04_revisions ADD COLUMN idempotency_key TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX dev_m04_drafts_idempotency ON dev_m04_drafts(subject_hash,service_id,idempotency_key);
CREATE UNIQUE INDEX dev_m04_revisions_idempotency ON dev_m04_revisions(draft_id,idempotency_key);
