CREATE TABLE IF NOT EXISTS meta_import_jobs (
  id TEXT PRIMARY KEY,
  original_filename TEXT NOT NULL,
  account_id TEXT NOT NULL,
  imported_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  completed_at TEXT,
  reporting_start TEXT,
  reporting_end TEXT,
  reporting_level TEXT NOT NULL,
  total_rows INTEGER NOT NULL,
  created_rows INTEGER NOT NULL,
  updated_rows INTEGER NOT NULL,
  skipped_rows INTEGER NOT NULL,
  failed_rows INTEGER NOT NULL,
  status TEXT NOT NULL,
  error_summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_meta_import_jobs_account_uploaded
  ON meta_import_jobs(account_id, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS meta_import_rows (
  unique_key TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  reporting_level TEXT NOT NULL,
  campaign_id TEXT,
  adset_id TEXT,
  ad_id TEXT,
  reporting_start TEXT NOT NULL,
  reporting_end TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'meta_csv',
  row_json TEXT NOT NULL,
  import_job_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (import_job_id) REFERENCES meta_import_jobs(id)
);

CREATE INDEX IF NOT EXISTS idx_meta_import_rows_account_dates
  ON meta_import_rows(account_id, reporting_start, reporting_end);

CREATE INDEX IF NOT EXISTS idx_meta_import_rows_campaign
  ON meta_import_rows(account_id, campaign_id);

