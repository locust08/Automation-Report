ALTER TABLE dev_m03_drafts ADD COLUMN idempotency_key TEXT NOT NULL DEFAULT '';
ALTER TABLE dev_m03_revisions ADD COLUMN idempotency_key TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX dev_m03_drafts_idempotency ON dev_m03_drafts(subject_hash,service_id,idempotency_key);
CREATE UNIQUE INDEX dev_m03_revisions_idempotency ON dev_m03_revisions(draft_id,idempotency_key);
