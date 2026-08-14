begin;

create table if not exists public.ad_automation_search_term_account_settings (
  google_customer_id text primary key,
  schedule_frequency text not null default 'monthly' check (schedule_frequency in ('manual','weekly','biweekly','monthly')),
  auto_safe_score_threshold integer not null default 90 check (auto_safe_score_threshold between 90 and 100),
  review_score_threshold integer not null default 60 check (review_score_threshold between 0 and 99),
  high_spend_threshold numeric(14,2) not null default 500 check (high_spend_threshold >= 0),
  minimum_clicks_threshold integer not null default 5 check (minimum_clicks_threshold >= 0),
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (review_score_threshold < auto_safe_score_threshold)
);

create table if not exists public.ad_automation_content_suitability_snapshots (
  google_customer_id text primary key,
  customer_name text not null,
  payload_json jsonb not null,
  refreshed_at timestamptz not null
);

alter table public.ad_automation_search_term_account_settings enable row level security;
alter table public.ad_automation_content_suitability_snapshots enable row level security;
revoke all on public.ad_automation_search_term_account_settings, public.ad_automation_content_suitability_snapshots from anon, authenticated;

commit;
