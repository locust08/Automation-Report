create extension if not exists pgcrypto;

create table if not exists public.ad_automation_search_term_schedules (
  id uuid primary key default gen_random_uuid(),
  google_customer_id text not null unique check (google_customer_id ~ '^\d{10}$'),
  account_name text not null,
  enabled boolean not null default true,
  schedule_type text not null default 'monthly' check (schedule_type in ('monthly', 'once')),
  run_day smallint check (run_day between 1 and 28),
  scheduled_date date,
  run_time time not null default '09:00',
  timezone text not null default 'Asia/Kuala_Lumpur' check (timezone = 'Asia/Kuala_Lumpur'),
  period_mode text not null default 'rolling' check (period_mode in ('rolling', 'fixed')),
  rolling_days smallint check (rolling_days between 1 and 365),
  period_start_date date,
  period_end_date date,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_status text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((schedule_type = 'monthly' and run_day is not null and scheduled_date is null) or (schedule_type = 'once' and scheduled_date is not null)),
  check ((period_mode = 'rolling' and rolling_days is not null) or (period_mode = 'fixed' and period_start_date is not null and period_end_date is not null and period_start_date <= period_end_date))
);

create table if not exists public.ad_automation_search_term_schedule_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.ad_automation_search_term_schedules(id) on delete cascade,
  google_customer_id text not null,
  run_key text not null unique,
  scheduled_for timestamptz not null,
  malaysia_run_date date not null,
  status text not null default 'claimed' check (status in ('claimed', 'dispatched', 'running', 'completed', 'failed')),
  dispatch_id text,
  attempt_count integer not null default 1,
  terms_processed integer not null default 0,
  batches_completed integer not null default 0,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ad_automation_search_term_schedules_due_idx
  on public.ad_automation_search_term_schedules (next_run_at) where enabled;
create index if not exists ad_automation_search_term_schedule_runs_date_idx
  on public.ad_automation_search_term_schedule_runs (malaysia_run_date, status);

grant select, insert, update, delete on public.ad_automation_search_term_schedules to service_role;
grant select, insert, update, delete on public.ad_automation_search_term_schedule_runs to service_role;

create or replace function public.enforce_search_term_schedule_daily_capacity()
returns trigger language plpgsql as $$
declare
  target_day integer;
  scheduled_count integer;
begin
  if not new.enabled then return new; end if;
  target_day := case when new.schedule_type = 'monthly' then new.run_day else extract(day from new.scheduled_date)::integer end;
  perform pg_advisory_xact_lock(9042026, target_day);
  select count(*) into scheduled_count
  from public.ad_automation_search_term_schedules schedule
  where schedule.enabled
    and schedule.id <> new.id
    and (case when schedule.schedule_type = 'monthly' then schedule.run_day else extract(day from schedule.scheduled_date)::integer end) = target_day;
  if scheduled_count >= 4 then
    raise exception 'A maximum of four enabled accounts can be scheduled on the same Malaysia calendar day.';
  end if;
  return new;
end;
$$;

drop trigger if exists search_term_schedule_daily_capacity on public.ad_automation_search_term_schedules;
create trigger search_term_schedule_daily_capacity
before insert or update on public.ad_automation_search_term_schedules
for each row execute function public.enforce_search_term_schedule_daily_capacity();
