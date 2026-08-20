CREATE TABLE IF NOT EXISTS ad_automation_placements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  source_resource_name TEXT NOT NULL,
  source_view TEXT NOT NULL DEFAULT 'performance_max_placement_view',
  placement TEXT NOT NULL,
  display_name TEXT NOT NULL,
  placement_type TEXT NOT NULL,
  target_url TEXT,
  campaign_name TEXT NOT NULL,
  ad_group_name TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  spend REAL NOT NULL DEFAULT 0,
  conversions REAL NOT NULL DEFAULT 0,
  video_views INTEGER NOT NULL DEFAULT 0,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  refreshed_at TEXT NOT NULL,
  UNIQUE(google_customer_id, source_resource_name, start_date, end_date)
);

CREATE TABLE IF NOT EXISTS ad_automation_placement_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  placement_id INTEGER NOT NULL UNIQUE REFERENCES ad_automation_placements(id) ON DELETE CASCADE,
  classification TEXT NOT NULL,
  recommended_action TEXT NOT NULL CHECK(recommended_action IN ('exclude','keep','kiv')),
  confidence INTEGER NOT NULL CHECK(confidence BETWEEN 0 AND 100),
  reason TEXT NOT NULL,
  confirmation_required INTEGER NOT NULL DEFAULT 0,
  ai_status TEXT NOT NULL CHECK(ai_status IN ('generated','rules_fallback','not_required')),
  review_status TEXT NOT NULL DEFAULT 'pending_optimizer',
  current_decision TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ad_automation_placement_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recommendation_id INTEGER NOT NULL REFERENCES ad_automation_placement_recommendations(id) ON DELETE CASCADE,
  reviewer_user_id TEXT NOT NULL,
  reviewer_email TEXT NOT NULL,
  reviewer_role TEXT NOT NULL,
  action TEXT NOT NULL,
  previous_status TEXT,
  resulting_status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS placement_recommendation_status_idx
ON ad_automation_placement_recommendations(review_status);

CREATE INDEX IF NOT EXISTS placement_review_recommendation_idx
ON ad_automation_placement_reviews(recommendation_id);

CREATE TABLE IF NOT EXISTS ad_automation_content_suitability_snapshots (
  google_customer_id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  refreshed_at TEXT NOT NULL
);

-- Legacy compatibility tables used by Team Lead monitoring. New exclusion
-- drafts and verified reports are owned by the shared Supabase M03 workflow.
CREATE TABLE IF NOT EXISTS ad_automation_placement_change_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_customer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready_for_publishing'
    CHECK(status IN ('ready_for_publishing','publishing','published','failed','cancelled')),
  approved_by_email TEXT NOT NULL,
  approved_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ad_automation_placement_pm_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
