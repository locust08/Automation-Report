CREATE TABLE IF NOT EXISTS ad_automation_content_suitability_snapshots (
  google_customer_id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  refreshed_at TEXT NOT NULL
);
