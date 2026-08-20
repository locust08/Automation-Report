CREATE TABLE IF NOT EXISTS tiktok_insights_cache (
  cache_key TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  advertiser_id TEXT NOT NULL,
  report_period TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tiktok_insights_cache_expires_at
  ON tiktok_insights_cache (expires_at);
