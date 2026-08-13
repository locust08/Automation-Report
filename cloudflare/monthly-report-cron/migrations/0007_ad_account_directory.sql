CREATE TABLE IF NOT EXISTS ad_accounts (
  notion_page_id TEXT PRIMARY KEY,
  account_name TEXT NOT NULL,
  account_name_normalized TEXT NOT NULL,
  platform TEXT,
  google_account_id TEXT,
  meta_account_id TEXT,
  access_path TEXT,
  client_email TEXT,
  cc_email TEXT,
  monthly_email_enabled INTEGER NOT NULL DEFAULT 0,
  advanced_report_enabled INTEGER NOT NULL DEFAULT 0,
  client_relation_page_ids_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  notion_created_time TEXT,
  notion_last_edited_time TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ad_accounts_google_id ON ad_accounts(google_account_id);
CREATE INDEX IF NOT EXISTS idx_ad_accounts_meta_id ON ad_accounts(meta_account_id);
CREATE INDEX IF NOT EXISTS idx_ad_accounts_name ON ad_accounts(account_name_normalized);
CREATE INDEX IF NOT EXISTS idx_ad_accounts_active ON ad_accounts(active);

CREATE TABLE IF NOT EXISTS notion_sync_state (
  sync_key TEXT PRIMARY KEY,
  last_incremental_sync_at TEXT,
  last_full_sync_at TEXT,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_status TEXT NOT NULL DEFAULT 'never',
  last_error TEXT,
  rows_received INTEGER NOT NULL DEFAULT 0,
  rows_written INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notion_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  notion_page_id TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  status TEXT NOT NULL,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_notion_webhook_events_received_at
  ON notion_webhook_events(received_at);
