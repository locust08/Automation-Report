begin;

alter table public.ad_automation_search_term_recommendations
  add column if not exists source_run_id text,
  add column if not exists google_customer_id text not null default '',
  add column if not exists customer_name text,
  add column if not exists campaign_id text,
  add column if not exists campaign_name text not null default '',
  add column if not exists ad_group_id text,
  add column if not exists ad_group_name text not null default '',
  add column if not exists search_term text not null default '',
  add column if not exists triggering_keyword text,
  add column if not exists match_type text,
  add column if not exists destination_url text,
  add column if not exists impressions bigint not null default 0,
  add column if not exists clicks bigint not null default 0,
  add column if not exists spend numeric(14, 2) not null default 0,
  add column if not exists conversions numeric(14, 2) not null default 0,
  add column if not exists qualified_leads integer,
  add column if not exists spam_leads integer,
  add column if not exists invalid_leads integer,
  add column if not exists client_complaints integer,
  add column if not exists classification text not null default 'unclear',
  add column if not exists mismatch_category text,
  add column if not exists ai_reason text,
  add column if not exists proposed_action text not null default 'special review needed',
  add column if not exists safety_score integer not null default 0,
  add column if not exists safety_band text not null default 'no-automatic-action',
  add column if not exists score_breakdown jsonb not null default '[]'::jsonb,
  add column if not exists hard_gate_failures jsonb not null default '[]'::jsonb,
  add column if not exists existing_negative boolean not null default false,
  add column if not exists previous_decision text,
  add column if not exists review_status text not null default 'pending',
  add column if not exists current_decision text,
  add column if not exists assigned_reviewer_user_id text,
  add column if not exists last_reviewed_by_user_id text,
  add column if not exists first_detected_at timestamptz not null default now(),
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.ad_automation_search_term_reviews
  add column if not exists recommendation_id bigint,
  add column if not exists reviewer_user_id text not null default '',
  add column if not exists reviewer_email text not null default '',
  add column if not exists reviewer_role text not null default 'pms',
  add column if not exists action text not null default 'start_review',
  add column if not exists comment text,
  add column if not exists previous_status text,
  add column if not exists resulting_status text not null default 'in_review',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.ad_automation_search_term_recommendations
  alter column google_customer_id drop default,
  alter column campaign_name drop default,
  alter column ad_group_name drop default,
  alter column search_term drop default;

alter table public.ad_automation_search_term_reviews
  alter column recommendation_id set not null,
  alter column reviewer_user_id drop default,
  alter column reviewer_email drop default;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ad_search_terms_safety_score_check') then
    alter table public.ad_automation_search_term_recommendations add constraint ad_search_terms_safety_score_check check (safety_score between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ad_search_terms_action_check') then
    alter table public.ad_automation_search_term_recommendations add constraint ad_search_terms_action_check check (proposed_action in ('negative exact', 'negative phrase', 'add exact', 'special review needed', 'no action'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ad_search_terms_band_check') then
    alter table public.ad_automation_search_term_recommendations add constraint ad_search_terms_band_check check (safety_band in ('auto-safe', 'review-recommended', 'no-automatic-action'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ad_search_terms_review_status_check') then
    alter table public.ad_automation_search_term_recommendations add constraint ad_search_terms_review_status_check check (review_status in ('pending', 'in_review', 'kept', 'excluded', 'rejected', 'kiv', 'feedback_requested', 'ready_for_approval'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ad_search_terms_decision_check') then
    alter table public.ad_automation_search_term_recommendations add constraint ad_search_terms_decision_check check (current_decision is null or current_decision in ('keep', 'exclude', 'reject', 'kiv', 'request_pm_feedback', 'request_client_feedback', 'submit_for_approval'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ad_search_term_reviews_action_check') then
    alter table public.ad_automation_search_term_reviews add constraint ad_search_term_reviews_action_check check (action in ('start_review', 'keep', 'exclude', 'reject', 'mark_kiv', 'request_pm_feedback', 'request_client_feedback', 'submit_for_approval', 'reopen'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ad_search_term_reviews_recommendation_fk') then
    alter table public.ad_automation_search_term_reviews add constraint ad_search_term_reviews_recommendation_fk foreign key (recommendation_id) references public.ad_automation_search_term_recommendations(id) on delete cascade;
  end if;
end $$;

create index if not exists ad_search_terms_account_status_idx on public.ad_automation_search_term_recommendations (google_customer_id, review_status);
create index if not exists ad_search_terms_reviewer_status_idx on public.ad_automation_search_term_recommendations (assigned_reviewer_user_id, review_status);
create index if not exists ad_search_terms_score_idx on public.ad_automation_search_term_recommendations (safety_score desc);
create index if not exists ad_search_term_reviews_recommendation_idx on public.ad_automation_search_term_reviews (recommendation_id, created_at desc);
create index if not exists ad_search_term_reviews_reviewer_idx on public.ad_automation_search_term_reviews (reviewer_user_id, created_at desc);

alter table public.ad_automation_search_term_recommendations enable row level security;
alter table public.ad_automation_search_term_reviews enable row level security;

commit;
