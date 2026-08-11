create extension if not exists pgcrypto;

create table if not exists public.ads_change_sets (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  account_name text not null,
  platform text not null default 'google' check (platform in ('google', 'meta')),
  title text not null,
  reason text not null default '',
  status text not null default 'draft',
  created_by_id text,
  created_by_name text not null,
  baseline_captured_at timestamptz not null,
  version integer not null default 1,
  approved_at timestamptz,
  published_at timestamptz,
  verified_at timestamptz,
  cancelled_at timestamptz,
  reverts_change_set_id uuid references public.ads_change_sets(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ads_field_changes (
  id uuid primary key default gen_random_uuid(),
  change_set_id uuid not null references public.ads_change_sets(id) on delete cascade,
  entity_type text not null check (entity_type in ('campaign', 'ad_group', 'ad')),
  entity_id text not null,
  entity_name text not null,
  field_key text not null,
  field_label text not null,
  value_type text not null,
  baseline_value jsonb not null,
  proposed_value jsonb not null,
  latest_official_value jsonb,
  reviewed_official_value jsonb,
  published_value jsonb,
  verified_value jsonb,
  conflict_resolution text,
  validation_errors jsonb not null default '[]'::jsonb,
  publish_status text not null default 'pending',
  verification_status text not null default 'pending',
  platform_response jsonb,
  last_error_message text,
  publish_attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(change_set_id, entity_type, entity_id, field_key)
);

create table if not exists public.ads_change_approvals (
  id uuid primary key default gen_random_uuid(),
  change_set_id uuid not null references public.ads_change_sets(id) on delete cascade,
  decision text not null check (decision in ('approved', 'rejected', 'withdrawn')),
  approver_id text,
  approver_name text not null,
  comment text,
  change_set_version integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ads_change_events (
  id uuid primary key default gen_random_uuid(),
  change_set_id uuid not null references public.ads_change_sets(id) on delete cascade,
  field_change_id uuid references public.ads_field_changes(id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  actor_type text not null default 'user',
  actor_id text,
  actor_name text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ads_change_notifications (
  id uuid primary key default gen_random_uuid(),
  change_set_id uuid not null references public.ads_change_sets(id) on delete cascade,
  channel text not null default 'copy',
  message text not null,
  status text not null default 'draft',
  edited_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ads_change_sets_account_updated_idx on public.ads_change_sets(account_id, updated_at desc);
create index if not exists ads_field_changes_set_idx on public.ads_field_changes(change_set_id);
create index if not exists ads_change_events_set_idx on public.ads_change_events(change_set_id, created_at);

alter table public.ads_change_sets enable row level security;
alter table public.ads_field_changes enable row level security;
alter table public.ads_change_approvals enable row level security;
alter table public.ads_change_events enable row level security;
alter table public.ads_change_notifications enable row level security;

-- The application uses only the server-side service-role key. No anon policies are created.
