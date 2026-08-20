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

alter table public.ad_automation_report_users enable row level security;
revoke all on table public.ad_automation_report_users from anon, authenticated;
grant select, insert, update, delete on table public.ad_automation_report_users to service_role;
