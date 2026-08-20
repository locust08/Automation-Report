ALTER TABLE report_job_items ADD COLUMN tiktok_account_id TEXT;
ALTER TABLE ad_accounts ADD COLUMN tiktok_account_id TEXT;

CREATE INDEX IF NOT EXISTS idx_report_job_items_tiktok_id
  ON report_job_items(tiktok_account_id);
CREATE INDEX IF NOT EXISTS idx_ad_accounts_tiktok_id
  ON ad_accounts(tiktok_account_id);
