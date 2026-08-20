-- M01 stores review operations; M03 remains the only owner of live ad mutations.
alter table public.ads_change_sets
  add column if not exists source_module text,
  add column if not exists source_reference text,
  add column if not exists idempotency_key text;

create unique index if not exists ads_change_sets_idempotency_key_idx
  on public.ads_change_sets (idempotency_key)
  where idempotency_key is not null;

alter table public.ads_field_changes
  add column if not exists source_recommendation_id uuid,
  drop constraint if exists ads_field_changes_entity_type_check;

alter table public.ads_field_changes
  add constraint ads_field_changes_entity_type_check check (
    entity_type in (
      'campaign', 'ad_group', 'ad',
      'campaign_negative_keyword', 'ad_group_negative_keyword',
      'campaign_placement_exclusion'
    )
  );

create table if not exists public.traffic_quality_account_policies (
  account_id text primary key,
  spend_threshold numeric(16, 2) not null default 100 check (spend_threshold > 0),
  clicks_threshold integer not null default 25 check (clicks_threshold > 0),
  invalid_leads_threshold integer not null default 2 check (invalid_leads_threshold > 0),
  complaints_threshold integer not null default 1 check (complaints_threshold > 0),
  recency_days integer not null default 7 check (recency_days > 0),
  cross_campaign_threshold integer not null default 2 check (cross_campaign_threshold > 0),
  cross_client_threshold integer not null default 2 check (cross_client_threshold > 0),
  immediate_score integer not null default 80 check (immediate_score between 0 and 100),
  weekly_score integer not null default 60 check (weekly_score between 0 and 100),
  biweekly_score integer not null default 40 check (biweekly_score between 0 and 100),
  updated_by_id text,
  updated_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (immediate_score > weekly_score and weekly_score > biweekly_score)
);

create table if not exists public.traffic_quality_recommendations (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  account_name text not null,
  source_kind text not null check (source_kind in ('search_term', 'placement', 'url', 'account', 'other')),
  source_item_key text not null,
  item_value text not null,
  item_type text,
  campaign_id text,
  campaign_name text,
  ad_group_id text,
  ad_group_name text,
  source_snapshot jsonb not null,
  classification text not null check (classification in (
    'Highly relevant', 'Relevant', 'Low intent', 'Research intent',
    'Job-seeking intent', 'Free or cheap intent', 'Wrong service',
    'Wrong location', 'Competitor-related', 'Existing customer support query',
    'Spam or suspicious', 'Unclear or human review required'
  )),
  recommended_action text not null check (recommended_action in ('keep', 'exclude', 'review')),
  recommended_negative_match_type text check (recommended_negative_match_type in ('exact', 'phrase', 'broad')),
  ai_confidence numeric(5, 2) not null check (ai_confidence between 0 and 100),
  explanation text not null,
  client_confirmation_required boolean not null default false,
  priority_score integer not null check (priority_score between 0 and 100),
  priority text not null check (priority in ('critical', 'high', 'medium', 'normal', 'kiv')),
  review_cadence text not null check (review_cadence in ('immediate', 'weekly', 'biweekly', 'monthly', 'manual')),
  priority_breakdown jsonb not null default '[]'::jsonb,
  current_status text not null default 'pending_review' check (current_status in (
    'pending_review', 'kept', 'excluded', 'rejected', 'kiv',
    'awaiting_pm_feedback', 'awaiting_client_feedback', 'handed_off_to_m03'
  )),
  m03_change_set_id uuid references public.ads_change_sets(id) on delete set null,
  first_detected_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  handed_off_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, source_kind, source_item_key),
  check (recommended_action <> 'exclude' or recommended_negative_match_type is not null)
);

create table if not exists public.traffic_quality_decision_events (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.traffic_quality_recommendations(id) on delete restrict,
  account_id text not null,
  action text not null check (action in (
    'keep', 'exclude', 'reject', 'kiv', 'request_pm_feedback',
    'request_client_feedback', 'add_agency_risk'
  )),
  comment text,
  actor_id text not null,
  actor_email text not null,
  actor_role text not null,
  recommendation_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.traffic_quality_agency_placement_risks (
  id uuid primary key default gen_random_uuid(),
  placement_key text not null,
  placement_type text not null,
  reason text not null,
  source_recommendation_id uuid references public.traffic_quality_recommendations(id) on delete set null,
  authorised_by_id text not null,
  authorised_by_email text not null,
  authorised_by_role text not null check (authorised_by_role in ('tl', 'approver', 'admin')),
  status text not null default 'active' check (status in ('active', 'retired')),
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  unique (placement_key, placement_type)
);

create table if not exists public.traffic_quality_reports (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  m03_change_set_id uuid not null references public.ads_change_sets(id) on delete restrict,
  status text not null default 'generated' check (status in ('generated', 'notified', 'failed')),
  report_snapshot jsonb not null,
  pdf_storage_path text,
  generated_by_id text not null,
  generated_by_email text not null,
  generated_at timestamptz not null default now(),
  notified_at timestamptz,
  last_error_message text,
  unique (m03_change_set_id)
);

create index if not exists traffic_quality_recommendations_account_status_idx
  on public.traffic_quality_recommendations (account_id, current_status, priority_score desc);
create index if not exists traffic_quality_recommendations_m03_idx
  on public.traffic_quality_recommendations (m03_change_set_id)
  where m03_change_set_id is not null;
create index if not exists traffic_quality_decision_events_recommendation_idx
  on public.traffic_quality_decision_events (recommendation_id, created_at desc);
create index if not exists traffic_quality_decision_events_account_idx
  on public.traffic_quality_decision_events (account_id, created_at desc);
create index if not exists traffic_quality_reports_account_idx
  on public.traffic_quality_reports (account_id, generated_at desc);

create or replace function public.create_traffic_quality_m03_draft(
  p_account_id text,
  p_account_name text,
  p_recommendation_ids uuid[],
  p_idempotency_key text,
  p_actor_id text,
  p_actor_name text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  change_set_id uuid;
  selected_count integer;
begin
  select id into change_set_id
  from public.ads_change_sets
  where idempotency_key = p_idempotency_key;
  if change_set_id is not null then
    return change_set_id;
  end if;

  select count(*) into selected_count
  from public.traffic_quality_recommendations
  where id = any(p_recommendation_ids)
    and account_id = p_account_id
    and current_status = 'excluded';

  if selected_count <> cardinality(p_recommendation_ids) then
    raise exception 'all recommendations must be selected exclusions from the same account';
  end if;

  insert into public.ads_change_sets (
    account_id, account_name, platform, title, reason, status,
    created_by_id, created_by_name, baseline_captured_at,
    source_module, source_reference, idempotency_key
  ) values (
    p_account_id, p_account_name, 'google', 'M01 traffic-quality exclusions',
    'Human-reviewed traffic-quality exclusions handed off by M01.', 'draft',
    p_actor_id, p_actor_name, now(), 'M01',
    array_to_string(p_recommendation_ids, ','), p_idempotency_key
  ) returning id into change_set_id;

  insert into public.ads_field_changes (
    change_set_id, entity_type, entity_id, entity_name, field_key, field_label,
    value_type, baseline_value, proposed_value, source_recommendation_id
  )
  select
    change_set_id,
    case
      when recommendation.source_kind = 'search_term' and recommendation.ad_group_id is not null then 'ad_group_negative_keyword'
      when recommendation.source_kind = 'search_term' then 'campaign_negative_keyword'
      else 'campaign_placement_exclusion'
    end,
    coalesce(recommendation.ad_group_id, recommendation.campaign_id, recommendation.source_item_key),
    coalesce(recommendation.ad_group_name, recommendation.campaign_name, recommendation.item_value),
    case
      when recommendation.source_kind = 'search_term' and recommendation.ad_group_id is not null then 'ad_group_criterion.negative_keyword'
      when recommendation.source_kind = 'search_term' then 'campaign_criterion.negative_keyword'
      else 'campaign_criterion.placement_exclusion'
    end,
    case when recommendation.source_kind = 'search_term' then 'Negative keyword' else 'Placement exclusion' end,
    case when recommendation.source_kind = 'search_term' then 'negative_keyword' else 'placement_exclusion' end,
    jsonb_build_object('exists', false),
    case
      when recommendation.source_kind = 'search_term' then jsonb_build_object(
        'text', recommendation.item_value,
        'matchType', upper(recommendation.recommended_negative_match_type),
        'negative', true,
        'campaignId', recommendation.campaign_id,
        'adGroupId', recommendation.ad_group_id
      )
      else jsonb_build_object(
        'placement', recommendation.item_value,
        'placementType', recommendation.item_type,
        'negative', true,
        'campaignId', recommendation.campaign_id
      )
    end,
    recommendation.id
  from public.traffic_quality_recommendations recommendation
  where recommendation.id = any(p_recommendation_ids);

  update public.traffic_quality_recommendations
  set current_status = 'handed_off_to_m03', m03_change_set_id = change_set_id,
      handed_off_at = now(), updated_at = now()
  where id = any(p_recommendation_ids);

  insert into public.ads_change_events (
    change_set_id, event_type, actor_id, actor_name, message, metadata
  ) values (
    change_set_id, 'm01_handoff_created', p_actor_id, p_actor_name,
    'M01 created an immutable traffic-quality exclusion draft for M03.',
    jsonb_build_object('sourceModule', 'M01', 'recommendationIds', p_recommendation_ids)
  );

  return change_set_id;
end;
$$;

revoke all on function public.create_traffic_quality_m03_draft(text, text, uuid[], text, text, text) from public, anon, authenticated;
grant execute on function public.create_traffic_quality_m03_draft(text, text, uuid[], text, text, text) to service_role;

create or replace function public.prevent_traffic_quality_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'traffic quality decision events are immutable';
end;
$$;

drop trigger if exists traffic_quality_decision_events_immutable on public.traffic_quality_decision_events;
create trigger traffic_quality_decision_events_immutable
before update or delete on public.traffic_quality_decision_events
for each row execute function public.prevent_traffic_quality_event_mutation();

revoke all on function public.prevent_traffic_quality_event_mutation() from public, anon, authenticated;

alter table public.traffic_quality_account_policies enable row level security;
alter table public.traffic_quality_recommendations enable row level security;
alter table public.traffic_quality_decision_events enable row level security;
alter table public.traffic_quality_agency_placement_risks enable row level security;
alter table public.traffic_quality_reports enable row level security;

revoke all on table
  public.traffic_quality_account_policies,
  public.traffic_quality_recommendations,
  public.traffic_quality_decision_events,
  public.traffic_quality_agency_placement_risks,
  public.traffic_quality_reports
from anon, authenticated;

grant select, insert, update on table
  public.traffic_quality_account_policies,
  public.traffic_quality_recommendations,
  public.traffic_quality_agency_placement_risks,
  public.traffic_quality_reports
to service_role;
grant select, insert on table public.traffic_quality_decision_events to service_role;

grant select, insert, update on table public.ads_change_sets, public.ads_field_changes, public.ads_change_approvals, public.ads_change_events, public.ads_change_notifications to service_role;
