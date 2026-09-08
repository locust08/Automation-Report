alter table public.ad_automation_search_term_account_settings
  add column if not exists automatic_exclusion_enabled boolean not null default false;

-- The first automatic-exclusion prototype used this table name with a legacy,
-- analysis-run-based shape. Preserve that immutable audit before installing the
-- durable job/batch/row contract used by the current worker.
do $$
declare
  legacy_constraint record;
  legacy_constraint_number integer := 0;
begin
  if to_regclass('public.ad_automation_search_term_automatic_actions') is not null
    and not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'ad_automation_search_term_automatic_actions'
        and column_name = 'analysis_job_id'
    )
  then
    alter table public.ad_automation_search_term_automatic_actions
      rename to ad_automation_search_term_automatic_actions_legacy_20260818;

    for legacy_constraint in
      select conname
      from pg_constraint
      where conrelid = 'public.ad_automation_search_term_automatic_actions_legacy_20260818'::regclass
    loop
      legacy_constraint_number := legacy_constraint_number + 1;
      execute format(
        'alter table public.ad_automation_search_term_automatic_actions_legacy_20260818 rename constraint %I to %I',
        legacy_constraint.conname,
        'staa_legacy_20260818_' || legacy_constraint_number
      );
    end loop;
  end if;
end;
$$;

create table if not exists public.ad_automation_search_term_automatic_actions (
  id uuid primary key default gen_random_uuid(),
  google_customer_id text not null check (google_customer_id ~ '^[0-9]{10}$'),
  analysis_job_id uuid not null references public.ad_automation_search_term_analysis_jobs(id) on delete cascade,
  analysis_batch_id uuid not null references public.ad_automation_search_term_analysis_batches(id) on delete cascade,
  analysis_row_id bigint not null references public.ad_automation_search_term_analysis_rows(id) on delete cascade,
  stable_term_key text not null,
  search_term text not null,
  campaign_id text,
  campaign_name text not null,
  ad_group_id text not null,
  ad_group_name text not null,
  action text not null default 'negative exact' check (action = 'negative exact'),
  safety_score integer not null check (safety_score between 0 and 100),
  score_threshold integer not null check (score_threshold between 90 and 100),
  safety_snapshot jsonb not null,
  execution_mode text not null check (execution_mode in ('dry_run', 'live')),
  status text not null check (status in ('dry_run', 'pending', 'published', 'reconciled', 'skipped', 'failed')),
  claim_attempt integer not null default 1 check (claim_attempt > 0),
  claimed_at timestamptz not null default now(),
  google_resource_name text,
  error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_job_id, stable_term_key, action)
);

create index if not exists ad_automation_search_term_automatic_actions_account_idx
  on public.ad_automation_search_term_automatic_actions (google_customer_id, created_at desc);
create index if not exists ad_automation_search_term_automatic_actions_job_idx
  on public.ad_automation_search_term_automatic_actions (analysis_job_id, created_at);

alter table public.ad_automation_search_term_automatic_actions enable row level security;
revoke all on public.ad_automation_search_term_automatic_actions from public, anon, authenticated;
grant select, insert, update on public.ad_automation_search_term_automatic_actions to service_role;

create or replace function public.claim_automatic_search_term_actions(
  p_job_id uuid,
  p_batch_id uuid,
  p_customer_id text,
  p_mode text,
  p_candidates jsonb,
  p_run_cap integer default 25
) returns setof public.ad_automation_search_term_automatic_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate jsonb;
  existing public.ad_automation_search_term_automatic_actions%rowtype;
  claimed public.ad_automation_search_term_automatic_actions%rowtype;
  claimed_count integer;
begin
  if p_customer_id !~ '^[0-9]{10}$' then raise exception 'AUTOMATIC_ACTION_CUSTOMER_INVALID'; end if;
  if p_mode not in ('dry_run', 'live') then raise exception 'AUTOMATIC_ACTION_MODE_INVALID'; end if;
  -- The shared setting is authoritative, including calls from older workers.
  select search_term_exclusion_cap into p_run_cap
  from public.ads_dashboard_automation_settings where id = 'global' for share;
  if p_run_cap is null then raise exception 'AUTOMATIC_ACTION_SETTINGS_UNAVAILABLE'; end if;
  if jsonb_typeof(p_candidates) <> 'array' then raise exception 'AUTOMATIC_ACTION_CANDIDATES_INVALID'; end if;
  if not exists (
    select 1 from public.ad_automation_search_term_analysis_jobs job
    join public.ad_automation_search_term_analysis_batches batch on batch.job_id = job.id
    where job.id = p_job_id and batch.id = p_batch_id and job.google_customer_id = p_customer_id
  ) then raise exception 'AUTOMATIC_ACTION_JOB_INVALID'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_job_id::text, 0));
  select count(*) into claimed_count
  from public.ad_automation_search_term_automatic_actions
  where analysis_job_id = p_job_id;

  for candidate in select value from jsonb_array_elements(p_candidates)
  loop
    select * into existing
    from public.ad_automation_search_term_automatic_actions
    where analysis_job_id = p_job_id
      and stable_term_key = candidate->>'stableTermKey'
      and action = 'negative exact'
    for update;

    if found then
      if existing.status = 'pending' and existing.claimed_at <= now() - interval '15 minutes' then
        update public.ad_automation_search_term_automatic_actions
        set claimed_at = now(), claim_attempt = claim_attempt + 1, updated_at = now()
        where id = existing.id returning * into claimed;
        return next claimed;
      end if;
      continue;
    end if;

    if p_run_cap > 0 and claimed_count >= p_run_cap then continue; end if;
    if coalesce(candidate->>'adGroupId', '') !~ '^[0-9]+$' then continue; end if;
    if coalesce(candidate->>'analysisRowId', '') !~ '^[0-9]+$' then continue; end if;

    insert into public.ad_automation_search_term_automatic_actions (
      google_customer_id, analysis_job_id, analysis_batch_id, analysis_row_id,
      stable_term_key, search_term, campaign_id, campaign_name, ad_group_id, ad_group_name,
      safety_score, score_threshold, safety_snapshot, execution_mode, status,
      completed_at
    ) values (
      p_customer_id, p_job_id, p_batch_id, (candidate->>'analysisRowId')::bigint,
      candidate->>'stableTermKey', candidate->>'searchTerm', candidate->>'campaignId',
      candidate->>'campaign', candidate->>'adGroupId', candidate->>'adGroup',
      (candidate->>'safetyScore')::integer, (candidate->>'scoreThreshold')::integer,
      candidate->'safetySnapshot', p_mode, case when p_mode = 'dry_run' then 'dry_run' else 'pending' end,
      case when p_mode = 'dry_run' then now() else null end
    ) returning * into claimed;
    claimed_count := claimed_count + 1;
    return next claimed;
  end loop;
end;
$$;

revoke all on function public.claim_automatic_search_term_actions(uuid, uuid, text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.claim_automatic_search_term_actions(uuid, uuid, text, text, jsonb, integer) to service_role;

create or replace function public.protect_automatic_search_term_action_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'AUTOMATIC_ACTION_AUDIT_IMMUTABLE'; end if;
  if new.google_customer_id <> old.google_customer_id
    or new.analysis_job_id <> old.analysis_job_id
    or new.analysis_batch_id <> old.analysis_batch_id
    or new.analysis_row_id <> old.analysis_row_id
    or new.stable_term_key <> old.stable_term_key
    or new.search_term <> old.search_term
    or new.campaign_id is distinct from old.campaign_id
    or new.campaign_name <> old.campaign_name
    or new.ad_group_id <> old.ad_group_id
    or new.ad_group_name <> old.ad_group_name
    or new.action <> old.action
    or new.safety_score <> old.safety_score
    or new.score_threshold <> old.score_threshold
    or new.safety_snapshot <> old.safety_snapshot
    or new.execution_mode <> old.execution_mode
  then raise exception 'AUTOMATIC_ACTION_AUDIT_IDENTITY_IMMUTABLE'; end if;
  return new;
end;
$$;

drop trigger if exists automatic_search_term_action_audit_immutable on public.ad_automation_search_term_automatic_actions;
create trigger automatic_search_term_action_audit_immutable
before update or delete on public.ad_automation_search_term_automatic_actions
for each row execute function public.protect_automatic_search_term_action_audit();
