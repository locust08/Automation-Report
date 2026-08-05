pragma foreign_keys = on;
pragma journal_mode = wal;

create table if not exists ad_automation_search_terms (
  id integer primary key autoincrement,
  created_at text not null default (datetime('now')),
  source_run_id text,
  google_customer_id text not null,
  customer_name text,
  campaign_id text,
  campaign_name text not null,
  ad_group_id text,
  ad_group_name text not null,
  search_term text not null,
  triggering_keyword text,
  match_type text,
  destination_url text,
  impressions integer not null default 0 check (impressions >= 0),
  clicks integer not null default 0 check (clicks >= 0),
  spend real not null default 0 check (spend >= 0),
  conversions real not null default 0 check (conversions >= 0),
  qualified_leads integer,
  spam_leads integer,
  invalid_leads integer,
  client_complaints integer,
  first_detected_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists ad_automation_search_term_recommendations (
  id integer primary key autoincrement,
  created_at text not null default (datetime('now')),
  search_term_id integer not null unique
    references ad_automation_search_terms(id) on delete cascade,
  classification text not null default 'unclear',
  mismatch_category text,
  ai_reason text,
  proposed_action text not null
    check (proposed_action in ('negative exact', 'negative phrase', 'add exact', 'special review needed')),
  safety_score integer not null default 0 check (safety_score between 0 and 100),
  safety_band text not null default 'no-automatic-action'
    check (safety_band in ('auto-safe', 'review-recommended', 'no-automatic-action')),
  score_breakdown text not null default '[]' check (json_valid(score_breakdown)),
  hard_gate_failures text not null default '[]' check (json_valid(hard_gate_failures)),
  existing_negative integer not null default 0 check (existing_negative in (0, 1)),
  previous_decision text,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'in_review', 'kept', 'excluded', 'rejected', 'kiv', 'feedback_requested', 'ready_for_approval')),
  current_decision text
    check (current_decision is null or current_decision in ('keep', 'exclude', 'reject', 'kiv', 'request_pm_feedback', 'request_client_feedback', 'submit_for_approval')),
  assigned_reviewer_user_id text,
  last_reviewed_by_user_id text,
  last_reviewed_at text,
  updated_at text not null default (datetime('now'))
);

create table if not exists ad_automation_search_term_reviews (
  id integer primary key autoincrement,
  created_at text not null default (datetime('now')),
  recommendation_id integer not null
    references ad_automation_search_term_recommendations(id) on delete cascade,
  reviewer_user_id text not null,
  reviewer_email text not null,
  reviewer_role text not null default 'pms',
  action text not null default 'start_review'
    check (action in ('start_review', 'keep', 'exclude', 'reject', 'mark_kiv', 'request_pm_feedback', 'request_client_feedback', 'submit_for_approval', 'reopen')),
  comment text,
  previous_status text,
  resulting_status text not null default 'in_review',
  metadata text not null default '{}' check (json_valid(metadata))
);

create unique index if not exists ad_search_terms_identity_idx
  on ad_automation_search_terms (google_customer_id, campaign_name, ad_group_name, search_term);
create index if not exists ad_search_terms_account_idx
  on ad_automation_search_terms (google_customer_id, campaign_name, ad_group_name);
create index if not exists ad_search_term_recommendations_status_idx
  on ad_automation_search_term_recommendations (review_status, safety_score desc);
create index if not exists ad_search_term_recommendations_reviewer_idx
  on ad_automation_search_term_recommendations (assigned_reviewer_user_id, review_status);
create index if not exists ad_search_term_reviews_recommendation_idx
  on ad_automation_search_term_reviews (recommendation_id, created_at desc);
create index if not exists ad_search_term_reviews_reviewer_idx
  on ad_automation_search_term_reviews (reviewer_user_id, created_at desc);
