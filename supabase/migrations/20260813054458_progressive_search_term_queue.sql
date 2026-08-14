create extension if not exists pgcrypto;

create table if not exists public.ad_automation_search_term_daily_slots (
  id uuid primary key default gen_random_uuid(),
  malaysia_run_date date not null,
  google_customer_id text not null check (google_customer_id ~ '^\d{10}$'),
  account_name text not null default '',
  source text not null check (source in ('manual', 'scheduled')),
  fulfillment_source text check (fulfillment_source in ('manual', 'scheduled')),
  status text not null check (status in ('reserved', 'claiming', 'used')),
  schedule_run_id uuid references public.ad_automation_search_term_schedule_runs(id) on delete set null,
  claimed_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (malaysia_run_date, google_customer_id)
);

create table if not exists public.ad_automation_search_term_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  google_customer_id text not null check (google_customer_id ~ '^\d{10}$'),
  account_name text not null default '',
  malaysia_run_date date not null,
  source text not null check (source in ('manual', 'scheduled')),
  status text not null default 'queued' check (status in ('queued', 'fetching', 'running', 'needs_retry', 'stopping', 'stopped', 'completed', 'failed')),
  stage text not null default 'Queued',
  reporting_start_date date,
  reporting_end_date date,
  r2_object_key text,
  snapshot_expires_at timestamptz,
  total_terms integer not null default 0 check (total_terms between 0 and 2500),
  planned_runs smallint not null default 0 check (planned_runs between 0 and 10),
  current_run smallint not null default 0 check (current_run between 0 and 10),
  completed_runs smallint not null default 0 check (completed_runs between 0 and 10),
  terms_processed integer not null default 0 check (terms_processed between 0 and 2500),
  retry_count integer not null default 0,
  cancellation_requested boolean not null default false,
  last_worker_ping_at timestamptz,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ad_automation_search_term_analysis_batches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ad_automation_search_term_analysis_jobs(id) on delete cascade,
  run_number smallint not null check (run_number between 1 and 10),
  term_offset integer not null check (term_offset between 0 and 2499),
  term_count smallint not null check (term_count between 1 and 250),
  status text not null default 'queued' check (status in ('queued', 'running', 'retrying', 'needs_retry', 'completed', 'stopped')),
  attempt_count smallint not null default 0,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, run_number)
);

create index if not exists ad_automation_search_term_daily_slots_date_idx
  on public.ad_automation_search_term_daily_slots (malaysia_run_date, status);
create index if not exists ad_automation_search_term_analysis_jobs_account_idx
  on public.ad_automation_search_term_analysis_jobs (google_customer_id, created_at desc);
create index if not exists ad_automation_search_term_analysis_jobs_active_idx
  on public.ad_automation_search_term_analysis_jobs (created_at) where status in ('queued', 'fetching', 'running', 'stopping');
create index if not exists ad_automation_search_term_analysis_batches_job_idx
  on public.ad_automation_search_term_analysis_batches (job_id, run_number);

alter table public.ad_automation_search_term_daily_slots enable row level security;
alter table public.ad_automation_search_term_analysis_jobs enable row level security;
alter table public.ad_automation_search_term_analysis_batches enable row level security;

grant select, insert, update, delete on public.ad_automation_search_term_daily_slots to service_role;
grant select, insert, update, delete on public.ad_automation_search_term_analysis_jobs to service_role;
grant select, insert, update, delete on public.ad_automation_search_term_analysis_batches to service_role;

create or replace function public.claim_search_term_daily_slot(
  requested_date date,
  requested_customer_id text,
  requested_account_name text,
  requested_source text,
  requested_schedule_run_id uuid default null
) returns public.ad_automation_search_term_daily_slots
language plpgsql
security invoker
set search_path = public
as $$
declare
  existing_slot public.ad_automation_search_term_daily_slots;
  allocated_count integer;
begin
  if requested_customer_id !~ '^\d{10}$' then raise exception 'A valid Google Ads customer ID is required.'; end if;
  if requested_source not in ('manual', 'scheduled') then raise exception 'Invalid analysis source.'; end if;
  perform pg_advisory_xact_lock(9042027, (requested_date - date '2000-01-01')::integer);

  select * into existing_slot from public.ad_automation_search_term_daily_slots
    where malaysia_run_date = requested_date and google_customer_id = requested_customer_id;
  if found then
    if existing_slot.status = 'reserved' then
      update public.ad_automation_search_term_daily_slots
        set status = 'claiming', fulfillment_source = requested_source, schedule_run_id = coalesce(requested_schedule_run_id, schedule_run_id), claimed_at = now(), updated_at = now()
        where id = existing_slot.id returning * into existing_slot;
    end if;
    return existing_slot;
  end if;

  select count(*) into allocated_count from public.ad_automation_search_term_daily_slots
    where malaysia_run_date = requested_date;
  if allocated_count >= 4 then raise exception 'SEARCH_TERM_DAILY_CAPACITY_REACHED'; end if;

  insert into public.ad_automation_search_term_daily_slots
    (malaysia_run_date, google_customer_id, account_name, source, fulfillment_source, status, schedule_run_id, claimed_at)
  values
    (requested_date, requested_customer_id, coalesce(requested_account_name, ''), requested_source, case when requested_source = 'manual' then 'manual' else null end,
     case when requested_source = 'scheduled' then 'reserved' else 'claiming' end,
     requested_schedule_run_id, case when requested_source = 'manual' then now() else null end)
  returning * into existing_slot;
  return existing_slot;
end;
$$;

revoke all on function public.claim_search_term_daily_slot(date,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.claim_search_term_daily_slot(date,text,text,text,uuid) to service_role;
