begin;

alter table public.ad_automation_search_term_analysis_runs
  add column if not exists last_checked_at timestamptz,
  add column if not exists source_fingerprint text,
  add column if not exists current_term_count integer not null default 0,
  add column if not exists reused_term_count integer not null default 0,
  add column if not exists new_term_count integer not null default 0,
  add column if not exists queued_new_term_count integer not null default 0,
  add column if not exists refresh_status text;

alter table public.ad_automation_search_term_decisions
  add column if not exists item_key text;

create index if not exists ad_search_decisions_item_key_idx
  on public.ad_automation_search_term_decisions(item_key, reviewed_at desc);

commit;
