create table if not exists public.ad_automation_report_users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'viewer'
    check (role in ('admin', 'paid_media_specialist', 'campaign_optimizer', 'specialist', 'approver', 'team_lead', 'project_manager', 'viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ad_automation_report_users enable row level security;

revoke all on table public.ad_automation_report_users from anon, authenticated;
grant select, insert, update, delete on table public.ad_automation_report_users to service_role;
