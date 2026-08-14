create table if not exists public.ad_automation_report_users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'specialist'
    check (role in ('pms', 'co', 'specialist', 'approver', 'tl', 'pm', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ad_automation_report_users enable row level security;

comment on table public.ad_automation_report_users is
  'Application roles and active status for internal Ads Reporting Dashboard users. Authentication credentials remain in Supabase Auth.';
