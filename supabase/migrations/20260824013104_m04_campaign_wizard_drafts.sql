create table public.m04_ads_campaign_wizard_drafts (
  owner_id uuid primary key,
  platform text not null constraint m04_acwd_platform check (platform in ('google', 'meta', 'tiktok')),
  current_step smallint not null default 0 constraint m04_acwd_current_step check (current_step between 0 and 4),
  highest_reached_step smallint not null default 0 constraint m04_acwd_highest_step check (highest_reached_step between 0 and 4),
  form_data jsonb not null default '{}'::jsonb constraint m04_acwd_form_object check (jsonb_typeof(form_data) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint m04_acwd_progress check (current_step <= highest_reached_step)
);

alter table public.m04_ads_campaign_wizard_drafts enable row level security;

revoke all on table public.m04_ads_campaign_wizard_drafts from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.m04_ads_campaign_wizard_drafts to service_role;

comment on table public.m04_ads_campaign_wizard_drafts is
  'One server-managed incomplete campaign wizard per approved CRM08 administrator. Never treated as a validated campaign revision.';
