create table public.m04_ads_campaign_edit_drafts (
  owner_id uuid not null,
  plan_id bigint not null references public.m04_ads_campaign_plans(id) on delete cascade,
  base_revision_id bigint not null references public.m04_ads_campaign_plan_revisions(id) on delete cascade,
  base_lock_version bigint not null constraint m04_aced_lock check (base_lock_version >= 0),
  platform text not null constraint m04_aced_platform check (platform in ('google', 'meta', 'tiktok')),
  current_step smallint not null default 0 constraint m04_aced_current_step check (current_step between 0 and 4),
  highest_reached_step smallint not null default 0 constraint m04_aced_highest_step check (highest_reached_step between 0 and 4),
  form_data jsonb not null default '{}'::jsonb constraint m04_aced_form_object check (jsonb_typeof(form_data) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (owner_id, plan_id),
  constraint m04_aced_progress check (current_step <= highest_reached_step)
);

create index m04_aced_plan_idx on public.m04_ads_campaign_edit_drafts(plan_id);

alter table public.m04_ads_campaign_edit_drafts enable row level security;

revoke all on table public.m04_ads_campaign_edit_drafts from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.m04_ads_campaign_edit_drafts to service_role;

comment on table public.m04_ads_campaign_edit_drafts is
  'Server-managed incomplete campaign edits. Never treated as validated campaign revisions.';
