-- Curated local-only prerequisite contract. This intentionally avoids the
-- repository's historical migration chain, which has known pre-M04 blockers.
create extension if not exists pgcrypto;
create schema if not exists ads_internal;

create table if not exists public.ad_automation_report_users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'viewer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Faithful M03 dependency of ads_get_campaign_launch_eligibility. Keeping this
-- in the curated pre-M04 fixture makes the permanent function lintable after
-- pgTAP transactions roll back.
create table if not exists public.ads_campaign_legacy_adoptions (
  id uuid primary key default gen_random_uuid(),
  project_key text not null default 'lt_paid_media' check (project_key = 'lt_paid_media'),
  account_id text not null,
  campaign_id text not null,
  campaign_name text not null,
  reason text not null check (btrim(reason) <> ''),
  evidence jsonb not null check (btrim(coalesce(evidence ->> 'summary', '')) <> ''),
  adopted_by_id text not null,
  adopted_by_name text not null,
  adopted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_id text,
  revoked_by_name text
);

create unique index if not exists ads_campaign_legacy_adoptions_active_unique
  on public.ads_campaign_legacy_adoptions(project_key, account_id, campaign_id)
  where revoked_at is null;

alter table public.ad_automation_report_users enable row level security;
revoke all on table public.ad_automation_report_users from anon, authenticated;
grant select, insert, update, delete on table public.ad_automation_report_users to service_role;

alter table public.ads_campaign_legacy_adoptions enable row level security;
revoke all on table public.ads_campaign_legacy_adoptions from anon, authenticated;
grant select, insert, update on table public.ads_campaign_legacy_adoptions to service_role;
