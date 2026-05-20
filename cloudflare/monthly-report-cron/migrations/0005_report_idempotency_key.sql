ALTER TABLE report_job_items ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_report_job_items_completed_idempotency
  ON report_job_items(idempotency_key)
  WHERE idempotency_key IS NOT NULL AND status = 'completed';
