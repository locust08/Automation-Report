-- Personal preferences only; existing auth tables and roles stay unchanged.
create table public.ads_reporting_user_preferences (
  user_id uuid primary key references public.ads_reporting_auth(user_id) on delete cascade,
  overall boolean not null default true,
  campaign boolean not null default true,
  advanced boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.ads_reporting_user_preferences enable row level security;
-- Reporting uses its own session cookies; the authenticated API enforces ownership.
revoke all on table public.ads_reporting_user_preferences from public, anon, authenticated;
grant select, insert, update on table public.ads_reporting_user_preferences to service_role;
