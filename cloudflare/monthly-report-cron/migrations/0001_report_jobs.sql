CREATE TABLE IF NOT EXISTS report_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  report_month_key TEXT NOT NULL,
  report_month_label TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  total_items INTEGER NOT NULL DEFAULT 0,
  send_email INTEGER NOT NULL DEFAULT 1,
  test_mode INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS report_job_items (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  status TEXT NOT NULL,
  client_name TEXT NOT NULL,
  platform TEXT,
  google_account_id TEXT,
  meta_account_id TEXT,
  recipient_email TEXT,
  cc_email TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT,
  report_url TEXT,
  resend_email_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES report_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_report_job_items_job_id ON report_job_items(job_id);
CREATE INDEX IF NOT EXISTS idx_report_job_items_status ON report_job_items(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_report_job_items_r2_key ON report_job_items(r2_key) WHERE r2_key IS NOT NULL;
