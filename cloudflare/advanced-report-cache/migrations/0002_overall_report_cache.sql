CREATE TABLE IF NOT EXISTS overall_report_cache (
  cache_key TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  account_id TEXT NOT NULL,
  meta_account_id TEXT,
  google_account_id TEXT,
  report_period TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  generated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_overall_report_cache_account_period
  ON overall_report_cache(account_id, report_period);

CREATE INDEX IF NOT EXISTS idx_overall_report_cache_expires_at
  ON overall_report_cache(expires_at);
