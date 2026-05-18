CREATE TABLE IF NOT EXISTS advanced_report_cache (
  cache_key TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  account_id TEXT NOT NULL,
  country TEXT NOT NULL,
  report_period TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_advanced_report_cache_account_period
  ON advanced_report_cache(account_id, country, report_period);
