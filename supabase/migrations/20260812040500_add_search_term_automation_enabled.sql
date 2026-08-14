alter table public.ad_automation_search_term_account_settings
  add column if not exists automation_enabled boolean not null default false;

update public.ad_automation_search_term_account_settings
set next_run_at = null
where automation_enabled = false;
