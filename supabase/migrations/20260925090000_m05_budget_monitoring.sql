-- M05 owns platform spend evidence. No billing plan or Notion relation is rewritten.
create table public.m05_ads_accounts (
  id bigint generated always as identity primary key,
  notion_account_id uuid not null unique,
  m04_ad_account_id bigint not null unique references public.m04_ads_ad_accounts(id) on delete restrict,
  client_id uuid not null,
  platform text not null check (platform in ('google','meta','tiktok')),
  provider_account_id text not null check (provider_account_id ~ '^\d{1,30}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  timezone text not null,
  google_access_mode text check (google_access_mode in ('direct','manager')),
  google_login_customer_id text check (google_login_customer_id ~ '^\d{10}$'),
  mapping_verified_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  check ((platform = 'google' and google_access_mode = 'direct' and google_login_customer_id is null)
    or (platform = 'google' and google_access_mode = 'manager' and google_login_customer_id is not null)
    or (platform <> 'google' and google_access_mode is null and google_login_customer_id is null)),
  unique (platform,provider_account_id)
);

create table public.m05_ads_allocations (
  id uuid primary key default gen_random_uuid(),
  account_id bigint not null references public.m05_ads_accounts(id) on delete restrict,
  notion_cycle_id uuid not null,
  plan_reference text not null check (length(plan_reference) between 1 and 500),
  start_date date not null,
  end_date date not null,
  approved_amount numeric(20,6) not null check (approved_amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  approved_by uuid not null,
  approved_at timestamptz not null,
  source_revision text not null,
  created_at timestamptz not null default clock_timestamp(),
  check (end_date >= start_date),
  unique (account_id,notion_cycle_id,source_revision)
);

create table public.m05_ads_daily_spend (
  account_id bigint not null references public.m05_ads_accounts(id) on delete restrict,
  spend_date date not null,
  amount numeric(20,6) not null check (amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  provider_snapshot_id text not null,
  provider_captured_at timestamptz not null,
  ingested_at timestamptz not null default clock_timestamp(),
  primary key (account_id,spend_date)
);

create table public.m05_ads_missing_days (
  account_id bigint not null references public.m05_ads_accounts(id) on delete restrict,
  spend_date date not null,
  provider_snapshot_id text not null,
  provider_captured_at timestamptz not null,
  primary key (account_id,spend_date)
);

create table public.m05_ads_capture_jobs (
  job_key text primary key check (length(job_key) between 1 and 200),
  account_id bigint not null references public.m05_ads_accounts(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  provider_snapshot_id text not null,
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{32}$'),
  captured_at timestamptz not null,
  missing_days jsonb not null check (jsonb_typeof(missing_days)='array'),
  observed_days integer not null check (observed_days >= 0),
  created_at timestamptz not null default clock_timestamp(),
  check (end_date >= start_date)
);

create table public.m05_ads_monitor_runs (
  slot_key text not null check (length(slot_key) between 1 and 100),
  account_id bigint not null references public.m05_ads_accounts(id) on delete restrict,
  status text not null check (status in ('completed','failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  observed_days integer not null default 0 check (observed_days >= 0),
  missing_days integer not null default 0 check (missing_days >= 0),
  error_code text,
  first_attempt_at timestamptz not null default clock_timestamp(),
  latest_attempt_at timestamptz not null default clock_timestamp(),
  primary key (slot_key,account_id)
);

create table public.m05_ads_campaign_handoffs (
  m04_handoff_id bigint primary key references public.m04_ads_campaign_monitoring_handoffs(id) on delete restrict,
  account_id bigint not null references public.m05_ads_accounts(id) on delete restrict,
  provider_campaign_id text not null,
  m04_revision_hash text not null check (m04_revision_hash ~ '^[a-f0-9]{64}$'),
  m04_verified_at timestamptz not null,
  accepted_at timestamptz not null default clock_timestamp(),
  unique (account_id,provider_campaign_id)
);

create table public.m05_ads_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id bigint not null references public.m05_ads_accounts(id) on delete restrict,
  allocation_id uuid references public.m05_ads_allocations(id) on delete restrict,
  month_start date not null check (extract(day from month_start)=1),
  revision integer not null check (revision>0),
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  captured_at timestamptz not null,
  cutoff date not null,
  daily_evidence jsonb not null check (jsonb_typeof(daily_evidence)='array'),
  missing_days jsonb not null check (jsonb_typeof(missing_days)='array'),
  coverage_complete boolean not null,
  calculation_version text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (account_id,month_start,revision),
  unique (account_id,month_start,evidence_hash)
);

create table public.m05_ads_alerts (
  id uuid primary key default gen_random_uuid(),
  account_id bigint not null references public.m05_ads_accounts(id) on delete restrict,
  allocation_id uuid references public.m05_ads_allocations(id) on delete restrict,
  alert_kind text not null,
  evidence_revision text not null,
  dedupe_key text not null unique,
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  evidence jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);

create table public.m05_ads_recommendations (
  id uuid primary key default gen_random_uuid(),
  account_id bigint not null references public.m05_ads_accounts(id) on delete restrict,
  allocation_id uuid references public.m05_ads_allocations(id) on delete restrict,
  evidence_revision text not null,
  dedupe_key text not null unique,
  confidence text not null check (confidence in ('low','medium','high')),
  rationale jsonb not null,
  status text not null default 'proposed' check (status in ('proposed','accepted','rejected','expired')),
  created_at timestamptz not null default clock_timestamp(),
  unique (account_id,allocation_id,evidence_revision)
);

create table public.m05_ads_decisions (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.m05_ads_recommendations(id) on delete restrict,
  actor_id uuid not null,
  decision text not null check (decision in ('accepted','rejected')),
  reason text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (recommendation_id)
);

create table public.m05_ads_followups (
  id uuid primary key default gen_random_uuid(),
  m03_request_id uuid not null,
  account_id bigint not null references public.m05_ads_accounts(id) on delete restrict,
  window_days smallint not null check (window_days in (7,14)),
  due_date date not null,
  evidence jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (m03_request_id,window_days)
);

create table public.m05_ads_audit (
  id bigint generated always as identity primary key,
  actor_id uuid,
  account_id bigint references public.m05_ads_accounts(id) on delete restrict,
  action text not null,
  evidence_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

do $$
declare relation_name text;
begin
  foreach relation_name in array array[
    'm05_ads_accounts','m05_ads_allocations','m05_ads_daily_spend','m05_ads_missing_days','m05_ads_capture_jobs','m05_ads_monitor_runs','m05_ads_campaign_handoffs',
    'm05_ads_snapshots','m05_ads_alerts','m05_ads_recommendations','m05_ads_decisions',
    'm05_ads_followups','m05_ads_audit'
  ] loop
    execute format('alter table public.%I enable row level security',relation_name);
    execute format('revoke all on public.%I from anon, authenticated',relation_name);
    execute format('grant select, insert on public.%I to service_role',relation_name);
  end loop;
end $$;
grant update on public.m05_ads_accounts,
  public.m05_ads_daily_spend, public.m05_ads_missing_days, public.m05_ads_alerts,
  public.m05_ads_recommendations, public.m05_ads_followups to service_role;
grant delete on public.m05_ads_daily_spend, public.m05_ads_missing_days to service_role;
revoke all on sequence public.m05_ads_accounts_id_seq from anon, authenticated;
revoke all on sequence public.m05_ads_audit_id_seq from anon, authenticated;
grant usage, select on sequence public.m05_ads_accounts_id_seq to service_role;
grant usage, select on sequence public.m05_ads_audit_id_seq to service_role;

create or replace function public.m05_ads_record_daily_capture(
  p_job_key text, p_account_id bigint, p_start_date date, p_end_date date,
  p_currency text, p_snapshot_id text, p_captured_at timestamptz,
  p_daily jsonb, p_missing_days jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  account_row public.m05_ads_accounts%rowtype;
  existing_row public.m05_ads_capture_jobs%rowtype;
  spend_row jsonb;
  spend_day date;
  spend_amount numeric(20,6);
  seen_days date[] := array[]::date[];
  seen_missing date[] := array[]::date[];
  missing_day date;
  submitted_hash text;
begin
  if p_job_key is null or length(p_job_key) not between 1 and 200
    or p_snapshot_id is null or btrim(p_snapshot_id) = ''
    or p_captured_at is null or p_captured_at > clock_timestamp()
    or p_start_date is null or p_end_date is null or p_end_date < p_start_date
    or p_end_date - p_start_date > 30
    or jsonb_typeof(p_daily) <> 'array' or jsonb_typeof(p_missing_days) <> 'array' then
    raise exception 'Invalid M05 capture evidence';
  end if;
  select * into account_row from public.m05_ads_accounts where id = p_account_id for update;
  if not found or account_row.currency <> p_currency then raise exception 'M05 account mapping or currency mismatch'; end if;
  if p_end_date >= (clock_timestamp() at time zone account_row.timezone)::date then
    raise exception 'M05 capture cannot label an incomplete day as actual spend';
  end if;
  submitted_hash := md5(jsonb_build_object('account',p_account_id,'start',p_start_date,
    'end',p_end_date,'currency',p_currency,'snapshot',p_snapshot_id,'captured',p_captured_at,
    'daily',p_daily,'missing',p_missing_days)::text);
  select * into existing_row from public.m05_ads_capture_jobs where job_key = p_job_key;
  if found then
    if existing_row.account_id <> p_account_id or existing_row.start_date <> p_start_date
      or existing_row.end_date <> p_end_date or existing_row.provider_snapshot_id <> p_snapshot_id
      or existing_row.evidence_hash <> submitted_hash then
      raise exception 'M05 capture key reused for different evidence';
    end if;
    return jsonb_build_object('status','already_recorded','job_key',p_job_key);
  end if;
  for spend_row in select value from jsonb_array_elements(p_daily) loop
    if jsonb_typeof(spend_row) <> 'object' or spend_row->>'date' is null or spend_row->>'amount' is null then
      raise exception 'Invalid M05 daily row';
    end if;
    spend_day := (spend_row->>'date')::date;
    spend_amount := (spend_row->>'amount')::numeric(20,6);
    if spend_day < p_start_date or spend_day > p_end_date or spend_day = any(seen_days)
      or spend_amount < 0 then raise exception 'Invalid or repeated M05 daily spend'; end if;
    seen_days := array_append(seen_days,spend_day);
  end loop;
  for spend_row in select value from jsonb_array_elements(p_missing_days) loop
    if jsonb_typeof(spend_row) <> 'string' then raise exception 'Invalid M05 missing day'; end if;
    missing_day := trim(both '"' from spend_row::text)::date;
    if missing_day < p_start_date or missing_day > p_end_date
      or missing_day = any(seen_days) or missing_day = any(seen_missing) then
      raise exception 'M05 missing day conflicts with observed spend';
    end if;
    seen_missing := array_append(seen_missing,missing_day);
  end loop;
  if cardinality(seen_days) + jsonb_array_length(p_missing_days) <> p_end_date - p_start_date + 1 then
    raise exception 'M05 capture coverage does not describe every requested day';
  end if;
  insert into public.m05_ads_capture_jobs(job_key,account_id,start_date,end_date,
    provider_snapshot_id,evidence_hash,captured_at,missing_days,observed_days)
  values(p_job_key,p_account_id,p_start_date,p_end_date,p_snapshot_id,submitted_hash,p_captured_at,
    p_missing_days,cardinality(seen_days));
  foreach missing_day in array seen_missing loop
    insert into public.m05_ads_missing_days(account_id,spend_date,provider_snapshot_id,provider_captured_at)
    values(p_account_id,missing_day,p_snapshot_id,p_captured_at)
    on conflict(account_id,spend_date) do update set
      provider_snapshot_id=excluded.provider_snapshot_id,
      provider_captured_at=excluded.provider_captured_at
    where public.m05_ads_missing_days.provider_captured_at <= excluded.provider_captured_at;
    delete from public.m05_ads_daily_spend where account_id=p_account_id and spend_date=missing_day
      and provider_captured_at <= p_captured_at;
  end loop;
  for spend_row in select value from jsonb_array_elements(p_daily) loop
    delete from public.m05_ads_missing_days where account_id=p_account_id
      and spend_date=(spend_row->>'date')::date and provider_captured_at <= p_captured_at;
    if exists(select 1 from public.m05_ads_missing_days where account_id=p_account_id
      and spend_date=(spend_row->>'date')::date and provider_captured_at > p_captured_at) then
      continue;
    end if;
    insert into public.m05_ads_daily_spend(account_id,spend_date,amount,currency,provider_snapshot_id,provider_captured_at)
    values(p_account_id,(spend_row->>'date')::date,(spend_row->>'amount')::numeric(20,6),
      p_currency,p_snapshot_id,p_captured_at)
    on conflict(account_id,spend_date) do update set
      amount=excluded.amount,currency=excluded.currency,
      provider_snapshot_id=excluded.provider_snapshot_id,
      provider_captured_at=excluded.provider_captured_at,
      ingested_at=clock_timestamp()
    where public.m05_ads_daily_spend.provider_captured_at <= excluded.provider_captured_at;
  end loop;
  insert into public.m05_ads_audit(account_id,action,evidence_ref,metadata)
  values(p_account_id,'daily_capture',p_snapshot_id,
    jsonb_build_object('job_key',p_job_key,'observed_days',cardinality(seen_days),
      'missing_days',jsonb_array_length(p_missing_days)));
  return jsonb_build_object('status','recorded','job_key',p_job_key);
end $$;
revoke all on function public.m05_ads_record_daily_capture(text,bigint,date,date,text,text,timestamptz,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.m05_ads_record_daily_capture(text,bigint,date,date,text,text,timestamptz,jsonb,jsonb) to service_role;

create or replace function public.m05_ads_capture_month_snapshot(
  p_account_id bigint, p_month_start date, p_allocation_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  account_row public.m05_ads_accounts%rowtype;
  month_cutoff date;
  daily jsonb;
  missing jsonb;
  fingerprint text;
  existing_row public.m05_ads_snapshots%rowtype;
  new_revision integer;
  captured timestamptz := clock_timestamp();
begin
  if p_month_start is null or extract(day from p_month_start) <> 1 then
    raise exception 'Invalid M05 snapshot month';
  end if;
  select * into account_row from public.m05_ads_accounts where id=p_account_id for update;
  if not found then raise exception 'Unknown M05 account'; end if;
  month_cutoff := least((p_month_start + interval '1 month' - interval '1 day')::date,
    (captured at time zone account_row.timezone)::date - 1);
  if month_cutoff < p_month_start then raise exception 'M05 snapshot month is incomplete'; end if;
  if p_allocation_id is not null and not exists(select 1 from public.m05_ads_allocations
    where id=p_allocation_id and account_id=p_account_id and currency=account_row.currency
    and start_date <= p_month_start and end_date >= month_cutoff) then
    raise exception 'M05 snapshot allocation mismatch';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('date',spend_date,'amount',amount)
    order by spend_date),'[]'::jsonb) into daily from public.m05_ads_daily_spend
    where account_id=p_account_id and spend_date between p_month_start and month_cutoff
    and currency=account_row.currency;
  select coalesce(jsonb_agg(to_jsonb(day::date) order by day),'[]'::jsonb) into missing
    from generate_series(p_month_start,month_cutoff,interval '1 day') as day
    where not exists(select 1 from public.m05_ads_daily_spend
      where account_id=p_account_id and spend_date=day::date and currency=account_row.currency);
  fingerprint := encode(sha256(convert_to(jsonb_build_object('account',p_account_id,
    'month',p_month_start,'allocation',p_allocation_id,'cutoff',month_cutoff,
    'capture_day',(captured at time zone account_row.timezone)::date,
    'daily',daily,'missing',missing,'version','m05-month-v1')::text,'UTF8')),'hex');
  select * into existing_row from public.m05_ads_snapshots
    where account_id=p_account_id and month_start=p_month_start and evidence_hash=fingerprint;
  if found then return jsonb_build_object('status','already_recorded','id',existing_row.id,
    'revision',existing_row.revision,'complete',existing_row.coverage_complete); end if;
  select coalesce(max(revision),0)+1 into new_revision from public.m05_ads_snapshots
    where account_id=p_account_id and month_start=p_month_start;
  insert into public.m05_ads_snapshots(account_id,allocation_id,month_start,revision,evidence_hash,
    captured_at,cutoff,daily_evidence,missing_days,coverage_complete,calculation_version)
  values(p_account_id,p_allocation_id,p_month_start,new_revision,fingerprint,captured,
    month_cutoff,daily,missing,jsonb_array_length(missing)=0,'m05-month-v1')
  returning * into existing_row;
  insert into public.m05_ads_audit(account_id,action,evidence_ref,metadata)
  values(p_account_id,'month_snapshot',existing_row.id::text,
    jsonb_build_object('month',p_month_start,'revision',new_revision,
      'missing_days',jsonb_array_length(missing)));
  return jsonb_build_object('status','recorded','id',existing_row.id,
    'revision',new_revision,'complete',existing_row.coverage_complete);
end $$;
revoke all on function public.m05_ads_capture_month_snapshot(bigint,date,uuid) from public,anon,authenticated;
grant execute on function public.m05_ads_capture_month_snapshot(bigint,date,uuid) to service_role;

create or replace function public.m05_ads_accept_verified_handoff(p_handoff_id bigint)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  source_row public.m04_ads_campaign_monitoring_handoffs%rowtype;
  account_row public.m05_ads_accounts%rowtype;
  existing_row public.m05_ads_campaign_handoffs%rowtype;
begin
  select * into source_row from public.m04_ads_campaign_monitoring_handoffs where id=p_handoff_id;
  if not found or source_row.verified_at is null or source_row.verified_at > clock_timestamp()
    or source_row.final_readback_evidence is null
    or jsonb_typeof(source_row.final_readback_evidence) <> 'object'
    or source_row.final_readback_evidence = '{}'::jsonb then
    raise exception 'M04 verified handoff evidence is unavailable';
  end if;
  select * into account_row from public.m05_ads_accounts where m04_ad_account_id=source_row.ad_account_id for update;
  if not found or account_row.client_id <> source_row.client_id
    or account_row.platform <> source_row.platform
    or account_row.provider_account_id <> source_row.provider_account_id
    or account_row.currency <> source_row.currency
    or source_row.provider_campaign_id is null or btrim(source_row.provider_campaign_id) = '' then
    raise exception 'M04 handoff does not match the verified M05 account';
  end if;
  select * into existing_row from public.m05_ads_campaign_handoffs where m04_handoff_id=p_handoff_id;
  if found then
    if existing_row.account_id <> account_row.id
      or existing_row.provider_campaign_id <> source_row.provider_campaign_id
      or existing_row.m04_revision_hash <> source_row.revision_hash
      or existing_row.m04_verified_at <> source_row.verified_at then
      raise exception 'M04 handoff changed after M05 acceptance';
    end if;
    return jsonb_build_object('status','already_accepted','handoff_id',p_handoff_id);
  end if;
  insert into public.m05_ads_campaign_handoffs(m04_handoff_id,account_id,provider_campaign_id,
    m04_revision_hash,m04_verified_at)
  values(p_handoff_id,account_row.id,source_row.provider_campaign_id,
    source_row.revision_hash,source_row.verified_at);
  insert into public.m05_ads_audit(account_id,action,evidence_ref,metadata)
  values(account_row.id,'m04_handoff_accepted',p_handoff_id::text,
    jsonb_build_object('provider_campaign_id',source_row.provider_campaign_id,
      'm04_revision_hash',source_row.revision_hash));
  return jsonb_build_object('status','accepted','handoff_id',p_handoff_id);
end $$;
revoke all on function public.m05_ads_accept_verified_handoff(bigint) from public,anon,authenticated;
grant execute on function public.m05_ads_accept_verified_handoff(bigint) to service_role;

create or replace function public.m05_ads_record_monitor_run(
  p_slot_key text, p_account_id bigint, p_status text,
  p_observed_days integer, p_missing_days integer, p_error_code text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare run_row public.m05_ads_monitor_runs%rowtype;
begin
  if p_slot_key is null or length(p_slot_key) not between 1 and 100
    or p_status not in ('completed','failed') or p_observed_days < 0 or p_missing_days < 0
    or (p_status='completed' and p_error_code is not null)
    or (p_status='failed' and (p_error_code is null or length(p_error_code) > 100)) then
    raise exception 'Invalid M05 monitor result';
  end if;
  insert into public.m05_ads_monitor_runs(slot_key,account_id,status,observed_days,missing_days,error_code)
  values(p_slot_key,p_account_id,p_status,p_observed_days,p_missing_days,p_error_code)
  on conflict(slot_key,account_id) do update set
    status=excluded.status,attempt_count=public.m05_ads_monitor_runs.attempt_count+1,
    observed_days=excluded.observed_days,missing_days=excluded.missing_days,
    error_code=excluded.error_code,latest_attempt_at=clock_timestamp()
  returning * into run_row;
  insert into public.m05_ads_audit(account_id,action,evidence_ref,metadata)
  values(p_account_id,'monitor_run',p_slot_key,
    jsonb_build_object('status',p_status,'attempt',run_row.attempt_count,
      'observed_days',p_observed_days,'missing_days',p_missing_days,'error_code',p_error_code));
  return jsonb_build_object('status',run_row.status,'attempt_count',run_row.attempt_count);
end $$;
revoke all on function public.m05_ads_record_monitor_run(text,bigint,text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.m05_ads_record_monitor_run(text,bigint,text,integer,integer,text) to service_role;
