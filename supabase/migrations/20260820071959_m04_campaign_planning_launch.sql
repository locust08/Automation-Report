-- M04 campaign planning and two-gate launch persistence contract.
create extension if not exists pgcrypto;
create schema if not exists ads_internal;

create table public.ads_ad_accounts (
  id bigint generated always as identity primary key,
  client_id uuid not null,
  platform text not null constraint aac_platform check (platform in ('google', 'meta', 'tiktok')),
  provider_account_id text not null constraint aac_provider_id check (btrim(provider_account_id) <> ''),
  account_name text not null constraint aac_name check (btrim(account_name) <> ''),
  currency text not null constraint aac_currency check (currency ~ '^[A-Z]{3}$'),
  timezone text not null constraint aac_timezone check (btrim(timezone) <> ''),
  access_status text not null default 'unverified' constraint aac_access check (access_status in ('unverified', 'verified', 'unavailable', 'revoked')),
  access_evidence jsonb not null default '{}'::jsonb,
  access_verified_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint aac_platform_provider_uk unique (platform, provider_account_id)
);

create table public.ads_budget_packages (
  id bigint generated always as identity primary key,
  client_id uuid not null,
  package_key text not null constraint abp_key check (btrim(package_key) <> ''),
  package_name text not null constraint abp_name check (btrim(package_name) <> ''),
  currency text not null constraint abp_currency check (currency ~ '^[A-Z]{3}$'),
  start_date date not null,
  end_date date not null,
  envelope_amount numeric(20,6) not null constraint abp_envelope check (envelope_amount > 0),
  committed_amount numeric(20,6) not null default 0,
  status text not null default 'active' constraint abp_status check (status in ('draft', 'active', 'closed', 'cancelled')),
  lock_version bigint not null default 0 constraint abp_lock check (lock_version >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint abp_client_key_uk unique (client_id, package_key),
  constraint abp_dates check (end_date >= start_date),
  constraint abp_amounts check (committed_amount >= 0 and committed_amount <= envelope_amount)
);

create table public.ads_campaign_plans (
  id bigint generated always as identity primary key,
  client_id uuid not null,
  budget_package_id bigint not null constraint acp_budget_package_fk references public.ads_budget_packages(id) on delete restrict,
  ad_account_id bigint not null constraint acp_ad_account_fk references public.ads_ad_accounts(id) on delete restrict,
  platform text not null constraint acp_platform check (platform in ('google', 'meta', 'tiktok')),
  active_revision_id bigint,
  approved_revision_id bigint,
  approved_revision_hash text,
  reserved_revision_id bigint,
  reserved_budget numeric(20,6) not null default 0 constraint acp_reserved check (reserved_budget >= 0),
  status text not null default 'draft' constraint acp_status check (status in ('draft', 'awaiting_approval', 'approved', 'launch_in_progress', 'launched', 'cancelled')),
  created_by_id uuid not null,
  created_by_name text not null constraint acp_creator check (btrim(created_by_name) <> ''),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  lock_version bigint not null default 0 constraint acp_lock check (lock_version >= 0)
);
create index acp_package_idx on public.ads_campaign_plans(budget_package_id);
create index acp_account_idx on public.ads_campaign_plans(ad_account_id);

create table public.ads_campaign_plan_revisions (
  id bigint generated always as identity primary key,
  plan_id bigint not null constraint acpr_plan_fk references public.ads_campaign_plans(id) on delete restrict,
  revision_number integer not null constraint acpr_number check (revision_number > 0),
  client_id uuid not null,
  ad_account_id bigint not null constraint acpr_account_fk references public.ads_ad_accounts(id) on delete restrict,
  budget_package_id bigint not null constraint acpr_package_fk references public.ads_budget_packages(id) on delete restrict,
  platform text not null constraint acpr_platform check (platform in ('google', 'meta', 'tiktok')),
  provider_account_id text not null constraint acpr_provider_account check (btrim(provider_account_id) <> ''),
  currency text not null constraint acpr_currency check (currency ~ '^[A-Z]{3}$'),
  timezone text not null constraint acpr_timezone check (btrim(timezone) <> ''),
  start_date date not null,
  end_date date not null,
  allocated_budget numeric(20,6) not null constraint acpr_allocated check (allocated_budget > 0),
  increment_amount numeric(20,6) not null constraint acpr_increment check (increment_amount >= 0),
  daily_budget numeric(20,6) not null constraint acpr_daily check (daily_budget > 0),
  projected_total numeric(20,6) not null constraint acpr_projected check (projected_total > 0),
  objective text not null constraint acpr_objective check (btrim(objective) <> ''),
  destination text not null constraint acpr_destination check (btrim(destination) <> ''),
  plan_payload jsonb not null,
  canonical_json text not null,
  payload_hash text not null constraint acpr_hash check (payload_hash ~ '^[a-f0-9]{64}$'),
  created_by_id uuid not null,
  created_by_name text not null constraint acpr_creator check (btrim(created_by_name) <> ''),
  created_at timestamptz not null default clock_timestamp(),
  constraint acpr_plan_number_uk unique (plan_id, revision_number),
  constraint acpr_dates check (end_date >= start_date),
  constraint acpr_payload_match check (canonical_json::jsonb = plan_payload)
);
create index acpr_plan_idx on public.ads_campaign_plan_revisions(plan_id, created_at desc);
create index acpr_account_idx on public.ads_campaign_plan_revisions(ad_account_id);
create index acpr_package_idx on public.ads_campaign_plan_revisions(budget_package_id);

alter table public.ads_campaign_plans
  add constraint acp_active_revision_fk foreign key (active_revision_id) references public.ads_campaign_plan_revisions(id) on delete restrict,
  add constraint acp_approved_revision_fk foreign key (approved_revision_id) references public.ads_campaign_plan_revisions(id) on delete restrict,
  add constraint acp_reserved_revision_fk foreign key (reserved_revision_id) references public.ads_campaign_plan_revisions(id) on delete restrict;
create index acp_active_revision_idx on public.ads_campaign_plans(active_revision_id);
create index acp_approved_revision_idx on public.ads_campaign_plans(approved_revision_id);
create index acp_reserved_revision_idx on public.ads_campaign_plans(reserved_revision_id);

create table public.ads_campaign_approvals (
  id bigint generated always as identity primary key,
  plan_id bigint not null constraint aca_plan_fk references public.ads_campaign_plans(id) on delete restrict,
  revision_id bigint not null constraint aca_revision_fk references public.ads_campaign_plan_revisions(id) on delete restrict,
  revision_hash text not null constraint aca_hash check (revision_hash ~ '^[a-f0-9]{64}$'),
  decision text not null constraint aca_decision check (decision in ('approved', 'rejected', 'cancelled')),
  expires_at timestamptz not null,
  request_idempotency_key text not null constraint aca_request_key check (btrim(request_idempotency_key) <> ''),
  comment text,
  superseded_approval_id bigint constraint aca_superseded_fk references public.ads_campaign_approvals(id) on delete restrict,
  approved_by_id uuid not null,
  approved_by_name text not null constraint aca_approver check (btrim(approved_by_name) <> ''),
  trusted_ip inet,
  trusted_user_agent text,
  created_at timestamptz not null default clock_timestamp(),
  constraint aca_request_uk unique (plan_id, request_idempotency_key)
);
create index aca_plan_idx on public.ads_campaign_approvals(plan_id, created_at desc);
create index aca_revision_idx on public.ads_campaign_approvals(revision_id);
create index aca_superseded_idx on public.ads_campaign_approvals(superseded_approval_id);

create table public.ads_campaign_builds (
  id bigint generated always as identity primary key,
  plan_id bigint not null constraint acb_plan_fk references public.ads_campaign_plans(id) on delete restrict,
  revision_id bigint not null constraint acb_revision_fk references public.ads_campaign_plan_revisions(id) on delete restrict,
  revision_hash text not null constraint acb_hash check (revision_hash ~ '^[a-f0-9]{64}$'),
  approval_id bigint not null constraint acb_approval_fk references public.ads_campaign_approvals(id) on delete restrict,
  budget_package_id bigint not null constraint acb_package_fk references public.ads_budget_packages(id) on delete restrict,
  ad_account_id bigint not null constraint acb_account_fk references public.ads_ad_accounts(id) on delete restrict,
  platform text not null constraint acb_platform check (platform in ('google', 'meta', 'tiktok')),
  status text not null default 'pending_gate_1' constraint acb_status check (status in ('pending_gate_1', 'gate_1_in_progress', 'gate_1_failed', 'qa_failed', 'reconciliation_required', 'ready_to_deliver', 'gate_2_in_progress', 'gate_2_failed', 'delivery_unverified', 'verified', 'handoff_complete', 'cancelled')),
  gate_1_started_at timestamptz,
  gate_1_completed_at timestamptz,
  gate_2_started_at timestamptz,
  gate_2_completed_at timestamptz,
  delivery_started_at timestamptz,
  delivered_at timestamptz,
  verified_at timestamptz,
  final_readback_evidence jsonb not null default '{}'::jsonb,
  lock_version bigint not null default 0 constraint acb_lock check (lock_version >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint acb_plan_revision_uk unique (plan_id, revision_id)
);
create index acb_plan_idx on public.ads_campaign_builds(plan_id);
create index acb_revision_idx on public.ads_campaign_builds(revision_id);
create index acb_approval_idx on public.ads_campaign_builds(approval_id);
create index acb_package_idx on public.ads_campaign_builds(budget_package_id);
create index acb_account_idx on public.ads_campaign_builds(ad_account_id);

create table public.ads_campaign_build_resources (
  id bigint generated always as identity primary key,
  build_id bigint not null constraint acbr_build_fk references public.ads_campaign_builds(id) on delete restrict,
  logical_resource_key text not null constraint acbr_logical_key check (btrim(logical_resource_key) <> ''),
  resource_type text not null constraint acbr_type check (btrim(resource_type) <> ''),
  provider_resource_id text,
  provider_parent_resource_id text,
  provider_response jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint acbr_build_key_uk unique (build_id, logical_resource_key)
);
create index acbr_build_idx on public.ads_campaign_build_resources(build_id);

create table public.ads_campaign_gate_attempts (
  id bigint generated always as identity primary key,
  build_id bigint not null constraint acga_build_fk references public.ads_campaign_builds(id) on delete restrict,
  gate smallint not null constraint acga_gate check (gate in (1, 2)),
  action text not null constraint acga_action check (action in ('create', 'deliver', 'retry', 'reconcile')),
  claim_token uuid not null default gen_random_uuid(),
  request_idempotency_key text not null constraint acga_request_key check (btrim(request_idempotency_key) <> ''),
  retry_parent_attempt_id bigint constraint acga_retry_parent_fk references public.ads_campaign_gate_attempts(id) on delete restrict,
  attempt_number integer not null constraint acga_number check (attempt_number > 0),
  revision_id bigint not null constraint acga_revision_fk references public.ads_campaign_plan_revisions(id) on delete restrict,
  revision_hash text not null constraint acga_hash check (revision_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'claimed' constraint acga_status check (status in ('claimed', 'released', 'succeeded', 'failed', 'expired', 'reconciliation_required')),
  intent jsonb not null default '{}'::jsonb,
  claimed_at timestamptz not null default clock_timestamp(),
  claim_expires_at timestamptz not null,
  released_at timestamptz,
  actor_id uuid not null,
  actor_name text not null constraint acga_actor check (btrim(actor_name) <> ''),
  trusted_ip inet,
  trusted_user_agent text,
  provider_outcome text,
  outcome jsonb not null default '{}'::jsonb,
  error_details jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint acga_build_request_uk unique (build_id, request_idempotency_key),
  constraint acga_claim_expiry check (claim_expires_at > claimed_at)
);
create index acga_build_idx on public.ads_campaign_gate_attempts(build_id);
create index acga_retry_parent_idx on public.ads_campaign_gate_attempts(retry_parent_attempt_id);
create index acga_revision_idx on public.ads_campaign_gate_attempts(revision_id);
create unique index acga_build_gate_active_idx on public.ads_campaign_gate_attempts(build_id, gate)
  where released_at is null and status = 'claimed';

create table public.ads_campaign_qa_results (
  id bigint generated always as identity primary key,
  attempt_id bigint not null constraint acqr_attempt_fk references public.ads_campaign_gate_attempts(id) on delete restrict,
  build_resource_id bigint constraint acqr_resource_fk references public.ads_campaign_build_resources(id) on delete restrict,
  phase text not null constraint acqr_phase check (phase in ('gate_1', 'gate_2', 'reconciliation')),
  field_path text not null constraint acqr_path check (btrim(field_path) <> ''),
  required boolean not null default true,
  expected_value jsonb,
  observed_value jsonb,
  result text not null constraint acqr_result check (result in ('match', 'mismatch', 'missing', 'unexpected', 'error')),
  mismatch_code text,
  mismatch_detail text,
  readback_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index acqr_attempt_idx on public.ads_campaign_qa_results(attempt_id);
create index acqr_resource_idx on public.ads_campaign_qa_results(build_resource_id);

create table public.ads_campaign_audit_events (
  id bigint generated always as identity primary key,
  plan_id bigint constraint acaud_plan_fk references public.ads_campaign_plans(id) on delete restrict,
  revision_id bigint constraint acaud_revision_fk references public.ads_campaign_plan_revisions(id) on delete restrict,
  build_id bigint constraint acaud_build_fk references public.ads_campaign_builds(id) on delete restrict,
  attempt_id bigint constraint acaud_attempt_fk references public.ads_campaign_gate_attempts(id) on delete restrict,
  event_type text not null constraint acaud_event check (btrim(event_type) <> ''),
  from_status text,
  to_status text,
  actor_id uuid,
  actor_name text,
  trusted_ip inet,
  trusted_user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  constraint acaud_subject check (plan_id is not null or revision_id is not null or build_id is not null or attempt_id is not null)
);
create index acaud_plan_idx on public.ads_campaign_audit_events(plan_id, created_at desc);
create index acaud_revision_idx on public.ads_campaign_audit_events(revision_id, created_at desc);
create index acaud_build_idx on public.ads_campaign_audit_events(build_id, created_at desc);
create index acaud_attempt_idx on public.ads_campaign_audit_events(attempt_id, created_at desc);

create table public.ads_campaign_monitoring_handoffs (
  id bigint generated always as identity primary key,
  build_id bigint not null constraint acmh_build_fk references public.ads_campaign_builds(id) on delete restrict,
  client_id uuid not null,
  platform text not null constraint acmh_platform check (platform in ('google', 'meta', 'tiktok')),
  ad_account_id bigint not null constraint acmh_account_fk references public.ads_ad_accounts(id) on delete restrict,
  provider_account_id text not null constraint acmh_provider_account check (btrim(provider_account_id) <> ''),
  revision_id bigint not null constraint acmh_revision_fk references public.ads_campaign_plan_revisions(id) on delete restrict,
  revision_hash text not null constraint acmh_hash check (revision_hash ~ '^[a-f0-9]{64}$'),
  provider_campaign_id text not null constraint acmh_campaign check (btrim(provider_campaign_id) <> ''),
  provider_child_ids jsonb not null default '[]'::jsonb,
  start_date date not null,
  end_date date not null,
  currency text not null constraint acmh_currency check (currency ~ '^[A-Z]{3}$'),
  allocated_budget numeric(20,6) not null constraint acmh_budget check (allocated_budget > 0),
  final_readback_evidence jsonb not null,
  verified_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint acmh_build_uk unique (build_id),
  constraint acmh_dates check (end_date >= start_date)
);
create unique index acmh_build_uidx on public.ads_campaign_monitoring_handoffs(build_id);
create index acmh_revision_idx on public.ads_campaign_monitoring_handoffs(revision_id);
create index acmh_account_idx on public.ads_campaign_monitoring_handoffs(ad_account_id);

create or replace function ads_internal.is_approved_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as auth_user
    join public.ad_automation_report_users as operator on operator.id = auth_user.id
    where auth_user.id = (select auth.uid())
      and operator.is_active
      and auth_user.email_confirmed_at is not null
      and auth_user.email = lower(auth_user.email)
      and auth_user.email ~ '^[^@]+@(locus-t\.com\.my|digitalbee\.ai)$'
  );
$$;

create or replace function ads_internal.reject_m04_row_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'M04 evidence rows are append-only' using errcode = '55000';
end;
$$;

create or replace function ads_internal.is_nonempty_json_object(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is not null
    and pg_catalog.jsonb_typeof(p_value) = 'object'
    and p_value <> '{}'::jsonb;
$$;

create or replace function ads_internal.protect_campaign_build_resource()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Campaign build resources cannot be deleted' using errcode = '55000';
  end if;

  if tg_op = 'INSERT' then
    if new.verified_at is not null
      and coalesce(pg_catalog.current_setting('ads_internal.gate_2_finalizer', true), '') <> 'on' then
      raise exception 'Campaign resource verification requires Gate 2 finalizer context' using errcode = '55000';
    end if;
    return new;
  end if;

  if new.build_id is distinct from old.build_id
    or new.logical_resource_key is distinct from old.logical_resource_key
    or new.resource_type is distinct from old.resource_type then
    raise exception 'Campaign resource logical identity is immutable' using errcode = '55000';
  end if;

  if old.provider_resource_id is not null
    and new.provider_resource_id is distinct from old.provider_resource_id then
    raise exception 'A non-null provider resource ID is immutable' using errcode = '55000';
  end if;

  if old.provider_parent_resource_id is not null
    and new.provider_parent_resource_id is distinct from old.provider_parent_resource_id then
    raise exception 'A non-null provider parent resource ID is immutable' using errcode = '55000';
  end if;

  if old.verified_at is not null
    and new.verified_at is distinct from old.verified_at then
    raise exception 'A verified campaign resource cannot regress' using errcode = '55000';
  end if;

  if old.verified_at is null and new.verified_at is not null
    and coalesce(pg_catalog.current_setting('ads_internal.gate_2_finalizer', true), '') <> 'on' then
    raise exception 'Campaign resource verification requires Gate 2 finalizer context' using errcode = '55000';
  end if;

  return new;
end;
$$;

create or replace function ads_internal.resolve_m04_actor(p_actor_id uuid)
returns table(actor_name text, actor_email text, actor_role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select
    coalesce(nullif(pg_catalog.btrim(operator.full_name), ''), auth_user.email),
    auth_user.email::text,
    operator.role
  from auth.users as auth_user
  join public.ad_automation_report_users as operator on operator.id = auth_user.id
  where auth_user.id = p_actor_id
    and operator.is_active
    and auth_user.email_confirmed_at is not null
    and auth_user.email = pg_catalog.lower(auth_user.email)
    and auth_user.email ~ '^[^@]+@(locus-t\.com\.my|digitalbee\.ai)$';

  if not found then
    raise exception 'Actor is not an active approved operator' using errcode = '42501';
  end if;
end;
$$;

create or replace function ads_internal.append_campaign_audit(
  p_plan_id bigint,
  p_revision_id bigint,
  p_build_id bigint,
  p_attempt_id bigint,
  p_event_type text,
  p_from_status text,
  p_to_status text,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text,
  p_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_name text;
  v_actor_email text;
  v_actor_role text;
begin
  select actor.actor_name, actor.actor_email, actor.actor_role
  into strict v_actor_name, v_actor_email, v_actor_role
  from ads_internal.resolve_m04_actor(p_actor_id) as actor;

  insert into public.ads_campaign_audit_events (
    plan_id, revision_id, build_id, attempt_id, event_type, from_status, to_status,
    actor_id, actor_name, trusted_ip, trusted_user_agent, metadata, created_at
  ) values (
    p_plan_id, p_revision_id, p_build_id, p_attempt_id, p_event_type, p_from_status, p_to_status,
    p_actor_id, v_actor_name, p_trusted_ip, p_trusted_user_agent,
    coalesce(p_metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
      'actor_email', v_actor_email,
      'actor_role', v_actor_role
    ),
    pg_catalog.clock_timestamp()
  );
end;
$$;

create or replace function public.ads_create_campaign_plan_revision(
  p_plan_id bigint,
  p_expected_plan_lock_version bigint,
  p_revision_payload jsonb,
  p_canonical_json text,
  p_expected_payload_hash text,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
)
returns public.ads_campaign_plan_revisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_campaign_plans%rowtype;
  v_account public.ads_ad_accounts%rowtype;
  v_package public.ads_budget_packages%rowtype;
  v_revision public.ads_campaign_plan_revisions%rowtype;
  v_actor_name text;
  v_actor_email text;
  v_actor_role text;
  v_payload_hash text;
  v_revision_number integer;
  v_start_date date;
  v_end_date date;
  v_allocated_budget numeric(20,6);
  v_increment_amount numeric(20,6);
  v_daily_budget numeric(20,6);
  v_projected_total numeric(20,6);
  v_objective text;
  v_destination text;
begin
  select actor.actor_name, actor.actor_email, actor.actor_role
  into strict v_actor_name, v_actor_email, v_actor_role
  from ads_internal.resolve_m04_actor(p_actor_id) as actor;

  select plan.*
  into v_plan
  from public.ads_campaign_plans as plan
  where plan.id = p_plan_id
  for update;

  if not found then
    raise exception 'Campaign plan was not found' using errcode = 'P0002';
  end if;

  if v_plan.lock_version is distinct from p_expected_plan_lock_version then
    raise exception 'Campaign plan lock version is stale' using errcode = '40001';
  end if;

  if v_plan.status <> 'draft' then
    raise exception 'Campaign plan is not editable' using errcode = '55000';
  end if;

  if p_revision_payload is null or p_canonical_json is null or p_canonical_json::jsonb <> p_revision_payload then
    raise exception 'Canonical JSON does not match the revision payload' using errcode = '22023';
  end if;

  v_payload_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_canonical_json, 'UTF8'), 'sha256'),
    'hex'
  );

  if p_expected_payload_hash is null or v_payload_hash <> p_expected_payload_hash then
    raise exception 'Revision payload hash does not match canonical JSON' using errcode = '22023';
  end if;

  select account.*
  into v_account
  from public.ads_ad_accounts as account
  where account.id = v_plan.ad_account_id;

  select package.*
  into v_package
  from public.ads_budget_packages as package
  where package.id = v_plan.budget_package_id;

  if v_account.client_id <> v_plan.client_id
    or v_package.client_id <> v_plan.client_id
    or v_account.platform <> v_plan.platform then
    raise exception 'Plan, account, and budget package ownership must match' using errcode = '22023';
  end if;

  if not v_account.is_active
    or v_account.access_status <> 'verified'
    or v_account.access_verified_at is null then
    raise exception 'A verified active ad account is required' using errcode = '55000';
  end if;

  if v_package.status <> 'active' then
    raise exception 'An active budget package is required' using errcode = '55000';
  end if;

  if v_account.currency <> v_package.currency then
    raise exception 'Plan account and budget package currencies must match' using errcode = '22023';
  end if;

  v_start_date := (p_revision_payload ->> 'start_date')::date;
  v_end_date := (p_revision_payload ->> 'end_date')::date;
  v_allocated_budget := (p_revision_payload ->> 'allocated_budget')::numeric(20,6);
  v_increment_amount := (p_revision_payload ->> 'increment_amount')::numeric(20,6);
  v_daily_budget := (p_revision_payload ->> 'daily_budget')::numeric(20,6);
  v_projected_total := (p_revision_payload ->> 'projected_total')::numeric(20,6);
  v_objective := p_revision_payload ->> 'objective';
  v_destination := p_revision_payload ->> 'destination';

  if v_start_date is null or v_end_date is null
    or v_start_date < v_package.start_date
    or v_end_date > v_package.end_date
    or v_end_date < v_start_date then
    raise exception 'Revision dates must fall within the budget package flight' using errcode = '22023';
  end if;

  if v_allocated_budget is null or v_allocated_budget <= 0
    or v_increment_amount is null or v_increment_amount < 0
    or v_daily_budget is null or v_daily_budget <= 0
    or v_projected_total is null or v_projected_total <= 0
    or pg_catalog.btrim(coalesce(v_objective, '')) = ''
    or pg_catalog.btrim(coalesce(v_destination, '')) = '' then
    raise exception 'Revision payload contains invalid planning values' using errcode = '22023';
  end if;

  select coalesce(pg_catalog.max(revision.revision_number), 0) + 1
  into v_revision_number
  from public.ads_campaign_plan_revisions as revision
  where revision.plan_id = v_plan.id;

  insert into public.ads_campaign_plan_revisions (
    plan_id, revision_number, client_id, ad_account_id, budget_package_id,
    platform, provider_account_id, currency, timezone, start_date, end_date,
    allocated_budget, increment_amount, daily_budget, projected_total,
    objective, destination, plan_payload, canonical_json, payload_hash,
    created_by_id, created_by_name, created_at
  ) values (
    v_plan.id, v_revision_number, v_plan.client_id, v_account.id, v_package.id,
    v_account.platform, v_account.provider_account_id, v_account.currency, v_account.timezone,
    v_start_date, v_end_date, v_allocated_budget, v_increment_amount, v_daily_budget,
    v_projected_total, v_objective, v_destination, p_revision_payload,
    p_canonical_json, v_payload_hash, p_actor_id, v_actor_name, pg_catalog.clock_timestamp()
  )
  returning * into v_revision;

  update public.ads_campaign_plans
  set active_revision_id = v_revision.id,
      approved_revision_id = null,
      approved_revision_hash = null,
      status = 'draft',
      updated_at = pg_catalog.clock_timestamp(),
      lock_version = lock_version + 1
  where id = v_plan.id;

  perform ads_internal.append_campaign_audit(
    v_plan.id, v_revision.id, null, null,
    'campaign_plan_revision_created', v_plan.status, 'draft',
    p_actor_id, p_trusted_ip, p_trusted_user_agent,
    pg_catalog.jsonb_build_object(
      'revision_number', v_revision.revision_number,
      'payload_hash', v_revision.payload_hash,
      'superseded_revision_id', v_plan.active_revision_id
    )
  );

  return v_revision;
end;
$$;

create or replace function public.ads_reserve_campaign_budget(
  p_plan_id bigint,
  p_revision_id bigint,
  p_expected_revision_hash text,
  p_expected_plan_lock_version bigint,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
)
returns public.ads_campaign_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_campaign_plans%rowtype;
  v_revision public.ads_campaign_plan_revisions%rowtype;
  v_account public.ads_ad_accounts%rowtype;
  v_package public.ads_budget_packages%rowtype;
  v_actor_name text;
  v_actor_email text;
  v_actor_role text;
  v_delta numeric(20,6);
  v_from_status text;
begin
  select actor.actor_name, actor.actor_email, actor.actor_role
  into strict v_actor_name, v_actor_email, v_actor_role
  from ads_internal.resolve_m04_actor(p_actor_id) as actor;

  select plan.*
  into v_plan
  from public.ads_campaign_plans as plan
  where plan.id = p_plan_id
  for update;

  if not found then
    raise exception 'Campaign plan was not found' using errcode = 'P0002';
  end if;

  if p_expected_plan_lock_version is null then
    raise exception 'Campaign plan lock version is stale' using errcode = '40001';
  end if;

  v_from_status := v_plan.status;

  select revision.*
  into v_revision
  from public.ads_campaign_plan_revisions as revision
  where revision.id = p_revision_id
    and revision.plan_id = v_plan.id;

  if not found then
    raise exception 'Campaign plan revision was not found' using errcode = 'P0002';
  end if;

  if v_revision.payload_hash is distinct from p_expected_revision_hash then
    raise exception 'Campaign plan revision hash does not match' using errcode = '22023';
  end if;

  if v_plan.active_revision_id = v_revision.id
    and v_plan.reserved_revision_id = v_revision.id
    and v_plan.reserved_budget = v_revision.allocated_budget then
    return v_plan;
  end if;

  if v_plan.lock_version is distinct from p_expected_plan_lock_version then
    raise exception 'Campaign plan lock version is stale' using errcode = '40001';
  end if;

  if v_plan.status not in ('draft', 'awaiting_approval') then
    raise exception 'Campaign plan is not eligible for budget reservation' using errcode = '55000';
  end if;

  if v_plan.active_revision_id is distinct from v_revision.id then
    raise exception 'Only the active campaign plan revision can reserve budget' using errcode = '55000';
  end if;

  select package.*
  into v_package
  from public.ads_budget_packages as package
  where package.id = v_plan.budget_package_id
  for update;

  select account.*
  into v_account
  from public.ads_ad_accounts as account
  where account.id = v_plan.ad_account_id;

  if v_revision.client_id <> v_plan.client_id
    or v_revision.client_id <> v_package.client_id
    or v_revision.client_id <> v_account.client_id
    or v_revision.budget_package_id <> v_plan.budget_package_id
    or v_revision.ad_account_id <> v_plan.ad_account_id
    or v_revision.platform <> v_plan.platform
    or v_revision.platform <> v_account.platform
    or v_revision.provider_account_id <> v_account.provider_account_id then
    raise exception 'Revision, plan, account, and budget package ownership must match' using errcode = '22023';
  end if;

  if v_revision.currency <> v_package.currency
    or v_revision.currency <> v_account.currency then
    raise exception 'Reservation account, package, and revision currency must match' using errcode = '22023';
  end if;

  if v_revision.start_date < v_package.start_date
    or v_revision.end_date > v_package.end_date then
    raise exception 'Revision dates must fall within the budget package flight' using errcode = '22023';
  end if;

  if v_package.status <> 'active' then
    raise exception 'An active budget package is required' using errcode = '55000';
  end if;

  if not v_account.is_active
    or v_account.access_status <> 'verified'
    or v_account.access_verified_at is null then
    raise exception 'A verified active ad account is required' using errcode = '55000';
  end if;

  v_delta := v_revision.allocated_budget - v_plan.reserved_budget;

  update public.ads_budget_packages
  set committed_amount = committed_amount + v_delta,
      lock_version = lock_version + 1,
      updated_at = pg_catalog.clock_timestamp()
  where id = v_package.id
    and committed_amount + v_delta between 0 and envelope_amount
  returning * into v_package;

  if not found then
    raise exception 'Budget package does not have enough available allocation' using errcode = '23514';
  end if;

  update public.ads_campaign_plans
  set reserved_revision_id = v_revision.id,
      reserved_budget = v_revision.allocated_budget,
      approved_revision_id = null,
      approved_revision_hash = null,
      status = 'awaiting_approval',
      updated_at = pg_catalog.clock_timestamp(),
      lock_version = lock_version + 1
  where id = v_plan.id
  returning * into v_plan;

  perform ads_internal.append_campaign_audit(
    v_plan.id, v_revision.id, null, null,
    'campaign_budget_reserved', v_from_status, 'awaiting_approval',
    p_actor_id, p_trusted_ip, p_trusted_user_agent,
    pg_catalog.jsonb_build_object(
      'payload_hash', v_revision.payload_hash,
      'reservation_delta', v_delta,
      'reserved_budget', v_revision.allocated_budget,
      'budget_package_id', v_package.id
    )
  );

  return v_plan;
end;
$$;

create or replace function public.ads_release_campaign_budget(
  p_plan_id bigint,
  p_expected_plan_lock_version bigint,
  p_reason text,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
)
returns public.ads_campaign_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_campaign_plans%rowtype;
  v_package public.ads_budget_packages%rowtype;
  v_actor_name text;
  v_actor_email text;
  v_actor_role text;
  v_from_status text;
  v_to_status text;
  v_released_revision_id bigint;
  v_released_budget numeric(20,6);
begin
  select actor.actor_name, actor.actor_email, actor.actor_role
  into strict v_actor_name, v_actor_email, v_actor_role
  from ads_internal.resolve_m04_actor(p_actor_id) as actor;

  select plan.*
  into v_plan
  from public.ads_campaign_plans as plan
  where plan.id = p_plan_id
  for update;

  if not found then
    raise exception 'Campaign plan was not found' using errcode = 'P0002';
  end if;

  if v_plan.lock_version is distinct from p_expected_plan_lock_version then
    raise exception 'Campaign plan lock version is stale' using errcode = '40001';
  end if;

  if v_plan.status in ('launch_in_progress', 'launched') then
    raise exception 'Campaign budget cannot be released after launch has started' using errcode = '55000';
  end if;

  if v_plan.status = 'approved' then
    raise exception 'Approved campaign plans must cancel their pending build before budget release' using errcode = '55000';
  end if;

  if pg_catalog.btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A budget release reason is required' using errcode = '22023';
  end if;

  if v_plan.reserved_revision_id is null and v_plan.reserved_budget = 0 then
    return v_plan;
  end if;

  v_from_status := v_plan.status;
  v_to_status := case when v_plan.status = 'cancelled' then 'cancelled' else 'draft' end;
  v_released_revision_id := v_plan.reserved_revision_id;
  v_released_budget := v_plan.reserved_budget;

  select package.*
  into v_package
  from public.ads_budget_packages as package
  where package.id = v_plan.budget_package_id
  for update;

  update public.ads_budget_packages
  set committed_amount = committed_amount - v_released_budget,
      lock_version = lock_version + 1,
      updated_at = pg_catalog.clock_timestamp()
  where id = v_package.id
    and committed_amount - v_released_budget between 0 and envelope_amount
  returning * into v_package;

  if not found then
    raise exception 'Campaign plan reservation is inconsistent with package allocation' using errcode = '23514';
  end if;

  update public.ads_campaign_plans
  set reserved_revision_id = null,
      reserved_budget = 0,
      approved_revision_id = null,
      approved_revision_hash = null,
      status = v_to_status,
      updated_at = pg_catalog.clock_timestamp(),
      lock_version = lock_version + 1
  where id = v_plan.id
  returning * into v_plan;

  perform ads_internal.append_campaign_audit(
    v_plan.id, v_released_revision_id, null, null,
    'campaign_budget_released', v_from_status, v_to_status,
    p_actor_id, p_trusted_ip, p_trusted_user_agent,
    pg_catalog.jsonb_build_object(
      'reason', p_reason,
      'released_budget', v_released_budget,
      'budget_package_id', v_package.id
    )
  );

  return v_plan;
end;
$$;

create or replace function public.ads_approve_campaign_plan_revision(
  p_plan_id bigint,
  p_revision_id bigint,
  p_expected_revision_hash text,
  p_expected_plan_lock_version bigint,
  p_approval_expires_at timestamptz,
  p_request_idempotency_key text,
  p_comment text,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
)
returns public.ads_campaign_builds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_campaign_plans%rowtype;
  v_revision public.ads_campaign_plan_revisions%rowtype;
  v_account public.ads_ad_accounts%rowtype;
  v_package public.ads_budget_packages%rowtype;
  v_approval public.ads_campaign_approvals%rowtype;
  v_existing_approval public.ads_campaign_approvals%rowtype;
  v_build public.ads_campaign_builds%rowtype;
  v_actor_name text;
  v_actor_email text;
  v_actor_role text;
  v_superseded_approval_id bigint;
begin
  select actor.actor_name, actor.actor_email, actor.actor_role
  into strict v_actor_name, v_actor_email, v_actor_role
  from ads_internal.resolve_m04_actor(p_actor_id) as actor;

  if pg_catalog.btrim(coalesce(p_request_idempotency_key, '')) = '' then
    raise exception 'Approval idempotency key is required' using errcode = '22023';
  end if;

  select plan.*
  into v_plan
  from public.ads_campaign_plans as plan
  where plan.id = p_plan_id
  for update;

  if not found then
    raise exception 'Campaign plan was not found' using errcode = 'P0002';
  end if;

  if p_expected_plan_lock_version is null then
    raise exception 'Campaign plan lock version is stale' using errcode = '40001';
  end if;

  select approval.*
  into v_existing_approval
  from public.ads_campaign_approvals as approval
  where approval.plan_id = v_plan.id
    and approval.request_idempotency_key = p_request_idempotency_key;

  if found then
    if v_existing_approval.revision_id is distinct from p_revision_id
      or v_existing_approval.revision_hash is distinct from p_expected_revision_hash then
      raise exception 'Approval idempotency key conflicts with an existing request' using errcode = '22023';
    end if;

    select build.*
    into strict v_build
    from public.ads_campaign_builds as build
    where build.approval_id = v_existing_approval.id;

    return v_build;
  end if;

  if v_plan.lock_version is distinct from p_expected_plan_lock_version then
    raise exception 'Campaign plan lock version is stale' using errcode = '40001';
  end if;

  if p_approval_expires_at is null or p_approval_expires_at <= pg_catalog.clock_timestamp() then
    raise exception 'Approval expiry must be in the future' using errcode = '22023';
  end if;

  if v_plan.status <> 'awaiting_approval' then
    raise exception 'Campaign plan must be awaiting approval' using errcode = '55000';
  end if;

  if v_plan.active_revision_id is distinct from p_revision_id
    or v_plan.reserved_revision_id is distinct from p_revision_id then
    raise exception 'Approval requires the active reserved revision' using errcode = '55000';
  end if;

  select revision.*
  into v_revision
  from public.ads_campaign_plan_revisions as revision
  where revision.id = p_revision_id
    and revision.plan_id = v_plan.id;

  if not found then
    raise exception 'Campaign plan revision was not found' using errcode = 'P0002';
  end if;

  if v_revision.payload_hash is distinct from p_expected_revision_hash then
    raise exception 'Campaign plan revision hash does not match' using errcode = '22023';
  end if;

  if v_plan.reserved_budget <> v_revision.allocated_budget then
    raise exception 'Approval requires the exact reserved revision budget' using errcode = '55000';
  end if;

  select package.*
  into v_package
  from public.ads_budget_packages as package
  where package.id = v_plan.budget_package_id
  for update;

  select account.*
  into v_account
  from public.ads_ad_accounts as account
  where account.id = v_plan.ad_account_id;

  if not v_account.is_active
    or v_account.access_status <> 'verified'
    or v_account.access_verified_at is null then
    raise exception 'A verified active ad account is required for approval' using errcode = '55000';
  end if;

  if v_package.status <> 'active' then
    raise exception 'An active budget package is required for approval' using errcode = '55000';
  end if;

  if v_revision.client_id <> v_plan.client_id
    or v_revision.client_id <> v_package.client_id
    or v_revision.client_id <> v_account.client_id
    or v_revision.budget_package_id <> v_package.id
    or v_revision.ad_account_id <> v_account.id
    or v_revision.platform <> v_plan.platform
    or v_revision.platform <> v_account.platform
    or v_revision.provider_account_id <> v_account.provider_account_id then
    raise exception 'Approval plan, revision, account, and package ownership must match' using errcode = '22023';
  end if;

  if v_revision.currency <> v_package.currency
    or v_revision.currency <> v_account.currency then
    raise exception 'Approval account, package, and revision currency must match' using errcode = '22023';
  end if;

  if v_revision.start_date < v_package.start_date
    or v_revision.end_date > v_package.end_date then
    raise exception 'Revision dates must fall within the budget package flight' using errcode = '22023';
  end if;

  select approval.id
  into v_superseded_approval_id
  from public.ads_campaign_approvals as approval
  where approval.plan_id = v_plan.id
  order by approval.created_at desc, approval.id desc
  limit 1;

  insert into public.ads_campaign_approvals (
    plan_id, revision_id, revision_hash, decision, expires_at,
    request_idempotency_key, comment, superseded_approval_id,
    approved_by_id, approved_by_name, trusted_ip, trusted_user_agent, created_at
  ) values (
    v_plan.id, v_revision.id, v_revision.payload_hash, 'approved', p_approval_expires_at,
    p_request_idempotency_key, p_comment, v_superseded_approval_id,
    p_actor_id, v_actor_name, p_trusted_ip, p_trusted_user_agent, pg_catalog.clock_timestamp()
  )
  returning * into v_approval;

  insert into public.ads_campaign_builds (
    plan_id, revision_id, revision_hash, approval_id, budget_package_id,
    ad_account_id, platform, status, created_at, updated_at
  ) values (
    v_plan.id, v_revision.id, v_revision.payload_hash, v_approval.id, v_package.id,
    v_account.id, v_account.platform, 'pending_gate_1',
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  )
  returning * into v_build;

  update public.ads_campaign_plans
  set approved_revision_id = v_revision.id,
      approved_revision_hash = v_revision.payload_hash,
      status = 'approved',
      updated_at = pg_catalog.clock_timestamp(),
      lock_version = lock_version + 1
  where id = v_plan.id;

  perform ads_internal.append_campaign_audit(
    v_plan.id, v_revision.id, v_build.id, null,
    'campaign_plan_revision_approved', v_plan.status, 'approved',
    p_actor_id, p_trusted_ip, p_trusted_user_agent,
    pg_catalog.jsonb_build_object(
      'approval_id', v_approval.id,
      'approval_expires_at', v_approval.expires_at,
      'build_id', v_build.id,
      'payload_hash', v_revision.payload_hash,
      'request_idempotency_key', p_request_idempotency_key,
      'superseded_approval_id', v_superseded_approval_id
    )
  );

  return v_build;
end;
$$;

create or replace function public.ads_transition_campaign_plan(
  p_plan_id bigint,
  p_expected_lock_version bigint,
  p_expected_from_status text,
  p_to_status text,
  p_reason text,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
)
returns public.ads_campaign_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_campaign_plans%rowtype;
  v_actor_name text;
  v_actor_email text;
  v_actor_role text;
begin
  select actor.actor_name, actor.actor_email, actor.actor_role
  into strict v_actor_name, v_actor_email, v_actor_role
  from ads_internal.resolve_m04_actor(p_actor_id) as actor;

  select plan.*
  into v_plan
  from public.ads_campaign_plans as plan
  where plan.id = p_plan_id
  for update;

  if not found then
    raise exception 'Campaign plan was not found' using errcode = 'P0002';
  end if;

  if v_plan.lock_version is distinct from p_expected_lock_version then
    raise exception 'Campaign plan lock version is stale' using errcode = '40001';
  end if;

  if v_plan.status is distinct from p_expected_from_status then
    raise exception 'Campaign plan status does not match expected state' using errcode = '40001';
  end if;

  if pg_catalog.btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A campaign plan transition reason is required' using errcode = '22023';
  end if;

  if not (
    (v_plan.status = 'draft' and p_to_status in ('awaiting_approval', 'cancelled'))
    or (v_plan.status = 'awaiting_approval' and p_to_status in ('draft', 'cancelled'))
    or (v_plan.status = 'approved' and p_to_status in ('draft', 'cancelled'))
  ) then
    raise exception 'Requested campaign plan transition is not allowed' using errcode = '55000';
  end if;

  update public.ads_campaign_plans
  set status = p_to_status,
      approved_revision_id = case when p_to_status in ('draft', 'cancelled') then null else approved_revision_id end,
      approved_revision_hash = case when p_to_status in ('draft', 'cancelled') then null else approved_revision_hash end,
      updated_at = pg_catalog.clock_timestamp(),
      lock_version = lock_version + 1
  where id = v_plan.id
  returning * into v_plan;

  perform ads_internal.append_campaign_audit(
    v_plan.id, v_plan.active_revision_id, null, null,
    'campaign_plan_transitioned', p_expected_from_status, p_to_status,
    p_actor_id, p_trusted_ip, p_trusted_user_agent,
    pg_catalog.jsonb_build_object('reason', p_reason)
  );

  return v_plan;
end;
$$;

create or replace function ads_internal.assert_campaign_build_immutable_launch_snapshot(
  p_build public.ads_campaign_builds,
  p_plan public.ads_campaign_plans
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot_is_current boolean;
  v_package public.ads_budget_packages%rowtype;
  v_account public.ads_ad_accounts%rowtype;
begin
  -- The caller already holds build then plan. Lock mutable roots in the one
  -- global order before comparing them with the immutable revision snapshot.
  select package.* into v_package
  from public.ads_budget_packages as package
  where package.id = p_build.budget_package_id
  for update;

  select account.* into v_account
  from public.ads_ad_accounts as account
  where account.id = p_build.ad_account_id
  for update;

  select coalesce((
    select
      p_build.plan_id is not distinct from p_plan.id
      and p_build.revision_id is not distinct from revision.id
      and p_build.revision_hash is not distinct from revision.payload_hash
      and revision.plan_id is not distinct from p_plan.id
      and p_build.ad_account_id is not distinct from p_plan.ad_account_id
      and p_build.ad_account_id is not distinct from revision.ad_account_id
      and p_build.ad_account_id is not distinct from v_account.id
      and p_build.budget_package_id is not distinct from p_plan.budget_package_id
      and p_build.budget_package_id is not distinct from revision.budget_package_id
      and p_build.budget_package_id is not distinct from v_package.id
      and p_build.platform is not distinct from p_plan.platform
      and p_build.platform is not distinct from revision.platform
      and p_build.platform is not distinct from v_account.platform
      and p_plan.client_id is not distinct from revision.client_id
      and p_plan.client_id is not distinct from v_account.client_id
      and p_plan.client_id is not distinct from v_package.client_id
      and revision.provider_account_id is not distinct from v_account.provider_account_id
      and revision.currency is not distinct from v_account.currency
      and revision.currency is not distinct from v_package.currency
      and revision.timezone is not distinct from v_account.timezone
      and v_account.is_active is not distinct from true
      and v_account.access_status is not distinct from 'verified'
      and v_account.access_verified_at is not null
      and v_package.status is not distinct from 'active'
      and (revision.start_date >= v_package.start_date) is true
      and (revision.end_date <= v_package.end_date) is true
      and p_plan.reserved_revision_id is not distinct from revision.id
      and p_plan.reserved_budget is not distinct from revision.allocated_budget
      and (v_package.committed_amount >= p_plan.reserved_budget) is true
    from public.ads_campaign_plan_revisions as revision
    where revision.id = p_build.revision_id
  ), false)
  into v_snapshot_is_current;

  if v_snapshot_is_current is distinct from true then
    raise exception 'Campaign build immutable launch snapshot is no longer current'
      using errcode = '55000';
  end if;
end;
$$;

revoke all on function ads_internal.assert_campaign_build_immutable_launch_snapshot(
  public.ads_campaign_builds, public.ads_campaign_plans
) from public, anon, authenticated, service_role;

create or replace function ads_internal.assert_campaign_gate_2_manifest(
  p_build public.ads_campaign_builds,
  p_action text,
  p_intent jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery_mode text;
  v_latest_delivery_intent jsonb;
begin
  if (p_intent ->> 'schema') is distinct from 'm04.gate2.v1'
    or (p_intent ->> 'platform') is distinct from p_build.platform
    or pg_catalog.jsonb_typeof(p_intent -> 'delivery') is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_intent -> 'resources') is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_intent -> 'resources') = 0 then
    raise exception 'Gate 2 intent must satisfy m04.gate2.v1' using errcode = '22023';
  end if;

  v_delivery_mode := p_intent #>> '{delivery,mode}';
  if v_delivery_mode is null or v_delivery_mode not in ('activate_now', 'schedule') then
    raise exception 'Gate 2 intent must satisfy m04.gate2.v1' using errcode = '22023';
  end if;

  if v_delivery_mode = 'schedule' then
    if pg_catalog.btrim(coalesce(p_intent #>> '{delivery,scheduled_at}', '')) = ''
      or (p_intent #>> '{delivery,scheduled_at}') !~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' then
      raise exception 'Gate 2 intent must satisfy m04.gate2.v1' using errcode = '22023';
    end if;
    begin
      perform (p_intent #>> '{delivery,scheduled_at}')::timestamptz;
    exception when others then
      raise exception 'Gate 2 intent must satisfy m04.gate2.v1' using errcode = '22023';
    end;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as item(value)
    where pg_catalog.jsonb_typeof(item.value) is distinct from 'object'
      or pg_catalog.btrim(coalesce(item.value ->> 'logical_resource_key', '')) = ''
      or pg_catalog.btrim(coalesce(item.value ->> 'resource_type', '')) = ''
      or pg_catalog.jsonb_typeof(item.value -> 'required_fields') is distinct from 'object'
      or item.value -> 'required_fields' = '{}'::jsonb
      or not (item.value -> 'required_fields' ? 'delivery.status')
  ) or (
    select pg_catalog.count(*) is distinct from
      pg_catalog.count(distinct (item.value ->> 'logical_resource_key'))
    from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as item(value)
  ) or (
    select pg_catalog.count(*) is distinct from
      pg_catalog.count(distinct (
        item.value ->> 'logical_resource_key',
        item.value ->> 'resource_type'
      ))
    from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as item(value)
  ) then
    raise exception 'Gate 2 intent must satisfy m04.gate2.v1' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as item(value)
    where not exists (
      select 1
      from public.ads_campaign_build_resources as resource
      where resource.build_id = p_build.id
        and resource.logical_resource_key = item.value ->> 'logical_resource_key'
        and resource.resource_type = item.value ->> 'resource_type'
    )
  ) or exists (
    select 1
    from public.ads_campaign_build_resources as resource
    where resource.build_id = p_build.id
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as item(value)
        where item.value ->> 'logical_resource_key' = resource.logical_resource_key
          and item.value ->> 'resource_type' = resource.resource_type
      )
  ) then
    raise exception 'Gate 2 intent must satisfy m04.gate2.v1' using errcode = '22023';
  end if;

  if p_action = 'reconcile' then
    select attempt.intent
    into v_latest_delivery_intent
    from public.ads_campaign_gate_attempts as attempt
    where attempt.build_id = p_build.id
      and attempt.gate = 2
      and attempt.action = 'deliver'
    order by attempt.attempt_number desc, attempt.id desc
    limit 1;

    if not found or v_latest_delivery_intent is distinct from p_intent then
      raise exception 'Gate 2 reconciliation manifest must match the latest delivery intent'
        using errcode = '22023';
    end if;
  end if;
end;
$$;

revoke all on function ads_internal.assert_campaign_gate_2_manifest(
  public.ads_campaign_builds, text, jsonb
) from public, anon, authenticated, service_role;

create or replace function ads_internal.acquire_campaign_gate_claim_hardened(
  p_build_id bigint,
  p_gate smallint,
  p_action text,
  p_request_idempotency_key text,
  p_expected_revision_id bigint,
  p_expected_revision_hash text,
  p_claim_ttl_seconds integer,
  p_intent jsonb,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
)
returns public.ads_campaign_gate_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_build public.ads_campaign_builds%rowtype;
  v_plan public.ads_campaign_plans%rowtype;
  v_approval public.ads_campaign_approvals%rowtype;
  v_attempt public.ads_campaign_gate_attempts%rowtype;
  v_actor_name text;
  v_actor_email text;
  v_actor_role text;
  v_attempt_number integer;
  v_expired_count integer := 0;
  v_expired_gate smallint;
  v_expired_action text;
  v_latest_mutation_intent jsonb;
  v_from_status text;
  v_plan_update_count integer;
  v_now timestamptz;
begin
  select actor.actor_name, actor.actor_email, actor.actor_role
  into strict v_actor_name, v_actor_email, v_actor_role
  from ads_internal.resolve_m04_actor(p_actor_id) as actor;
  if p_gate not in (1, 2) then
    raise exception 'Campaign gate must be 1 or 2' using errcode = '22023';
  end if;
  if pg_catalog.btrim(coalesce(p_request_idempotency_key, '')) = '' then
    raise exception 'Gate claim idempotency key is required' using errcode = '22023';
  end if;
  if p_claim_ttl_seconds is null or p_claim_ttl_seconds < 1 or p_claim_ttl_seconds > 3600 then
    raise exception 'Gate claim TTL must be between 1 and 3600 seconds' using errcode = '22023';
  end if;
  if p_intent is null or pg_catalog.jsonb_typeof(p_intent) <> 'object' then
    raise exception 'Gate claim intent must be a JSON object' using errcode = '22023';
  end if;
  if (p_gate = 1 and p_action not in ('create', 'reconcile'))
    or (p_gate = 2 and p_action not in ('deliver', 'reconcile')) then
    raise exception 'Gate action does not match the selected gate' using errcode = '22023';
  end if;

  select build.* into v_build
  from public.ads_campaign_builds as build where build.id = p_build_id for update;
  if not found then
    raise exception 'Campaign build was not found' using errcode = 'P0002';
  end if;

  -- Exact immutable identity precedes revision, approval-expiry, and state checks.
  select attempt.* into v_attempt
  from public.ads_campaign_gate_attempts as attempt
  where attempt.build_id = v_build.id
    and attempt.request_idempotency_key = p_request_idempotency_key;
  if found then
    if v_attempt.gate is distinct from p_gate
      or v_attempt.action is distinct from p_action
      or v_attempt.revision_id is distinct from p_expected_revision_id
      or v_attempt.revision_hash is distinct from p_expected_revision_hash
      or v_attempt.intent is distinct from p_intent
      or v_attempt.actor_id is distinct from p_actor_id then
      raise exception 'Gate claim idempotency key conflicts with an existing request' using errcode = '22023';
    end if;
    return v_attempt;
  end if;

  select plan.* into strict v_plan
  from public.ads_campaign_plans as plan where plan.id = v_build.plan_id for update;
  if p_expected_revision_id is distinct from v_build.revision_id
    or p_expected_revision_hash is distinct from v_build.revision_hash then
    raise exception 'Campaign build revision lock does not match' using errcode = '40001';
  end if;
  perform ads_internal.assert_campaign_build_immutable_launch_snapshot(v_build, v_plan);
  v_now := pg_catalog.clock_timestamp();
  if (v_build.status = 'pending_gate_1' and v_plan.status <> 'approved')
    or (v_build.status <> 'pending_gate_1' and v_plan.status <> 'launch_in_progress') then
    raise exception 'Campaign plan and build launch states do not match' using errcode = '40001';
  end if;
  select approval.* into strict v_approval
  from public.ads_campaign_approvals as approval where approval.id = v_build.approval_id;
  if v_approval.decision is distinct from 'approved'
    or v_approval.expires_at <= v_now
    or v_approval.plan_id is distinct from v_build.plan_id
    or v_approval.revision_id is distinct from v_build.revision_id
    or v_approval.revision_hash is distinct from v_build.revision_hash
    or v_plan.approved_revision_id is distinct from v_build.revision_id
    or v_plan.approved_revision_hash is distinct from v_build.revision_hash
    or v_plan.active_revision_id is distinct from v_build.revision_id then
    raise exception 'Campaign build approval is no longer current and unexpired' using errcode = '55000';
  end if;
  select attempt.gate, attempt.action
  into v_expired_gate, v_expired_action
  from public.ads_campaign_gate_attempts as attempt
  where attempt.build_id = v_build.id and attempt.status = 'claimed'
    and attempt.released_at is null
    and attempt.claim_expires_at <= v_now
  order by attempt.id limit 1;
  update public.ads_campaign_gate_attempts
  set status = 'expired', released_at = v_now,
      updated_at = v_now
  where build_id = v_build.id and status = 'claimed' and released_at is null
    and claim_expires_at <= v_now;
  get diagnostics v_expired_count = row_count;
  if v_expired_count > 0 then
    update public.ads_campaign_builds
    set status = case when v_expired_gate = 1 then 'reconciliation_required' else 'delivery_unverified' end,
        updated_at = pg_catalog.clock_timestamp(), lock_version = lock_version + 1
    where id = v_build.id returning * into v_build;
    if v_expired_gate = 1 and v_expired_action in ('create', 'retry')
      and not (p_gate = 1 and p_action = 'reconcile') then
      raise exception 'Expired Gate 1 mutation requires reconciliation before another mutation' using errcode = '55000';
    elsif v_expired_gate = 2 and v_expired_action = 'deliver'
      and not (p_gate = 2 and p_action = 'reconcile') then
      raise exception 'Expired Gate 2 delivery requires reconciliation before another delivery' using errcode = '55000';
    end if;
  end if;
  if exists (
    select 1 from public.ads_campaign_gate_attempts as attempt
    where attempt.build_id = v_build.id and attempt.status = 'claimed'
      and attempt.released_at is null
  ) then
    raise exception 'A different active gate claim already exists' using errcode = '55P03';
  end if;

  if v_build.status in ('gate_1_failed', 'qa_failed') and p_gate <> 1 then
    raise exception 'Failed Gate 1 states require Gate 1 reconciliation' using errcode = '55000';
  end if;
  if v_build.status = 'gate_2_failed' and p_gate <> 2 then
    raise exception 'Failed Gate 2 state requires Gate 2 reconciliation' using errcode = '55000';
  end if;
  if p_gate = 1 then
    if p_action = 'create' and v_build.status in ('gate_1_failed', 'qa_failed') then
      raise exception 'Failed Gate 1 states require reconciliation before mutation' using errcode = '55000';
    elsif p_action = 'create' and v_build.status <> 'pending_gate_1' then
      raise exception 'Gate 1 create requires a pending build or an expired claim' using errcode = '55000';
    elsif p_action = 'reconcile'
      and v_build.status not in ('reconciliation_required', 'gate_1_failed', 'qa_failed') then
      raise exception 'Reconciliation requires a build awaiting reconciliation' using errcode = '55000';
    end if;
    if not (p_intent ? 'resources')
      or pg_catalog.jsonb_typeof(p_intent -> 'resources') <> 'array'
      or pg_catalog.jsonb_array_length(p_intent -> 'resources') = 0 then
      raise exception 'Gate 1 intent must declare logical resources' using errcode = '22023';
    end if;
    if exists (
      select 1 from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as item(value)
      where pg_catalog.btrim(coalesce(item.value ->> 'logical_resource_key', '')) = ''
        or pg_catalog.btrim(coalesce(item.value ->> 'resource_type', '')) = ''
    ) or (
      select pg_catalog.count(*) <> pg_catalog.count(distinct item.value ->> 'logical_resource_key')
      from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as item(value)
    ) then
      raise exception 'Gate 1 logical resource intents must be complete and unique' using errcode = '22023';
    end if;
    if exists (
      select 1 from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as item(value)
      join public.ads_campaign_build_resources as resource
        on resource.build_id = v_build.id
       and resource.logical_resource_key = item.value ->> 'logical_resource_key'
      where resource.resource_type <> item.value ->> 'resource_type'
    ) then
      raise exception 'Logical resource type conflicts with persisted intent' using errcode = '22023';
    end if;
    if p_action = 'reconcile' then
      select attempt.intent into v_latest_mutation_intent
      from public.ads_campaign_gate_attempts as attempt
      where attempt.build_id = v_build.id and attempt.gate = 1
        and attempt.action in ('create', 'retry')
        and attempt.revision_id = v_build.revision_id
        and attempt.revision_hash = v_build.revision_hash
      order by attempt.attempt_number desc, attempt.id desc limit 1;
      if not found then
        raise exception 'Gate 1 reconciliation requires a prior mutation intent' using errcode = '55000';
      end if;
      if exists (
        select 1 from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as proposed(value)
        where not exists (
          select 1 from pg_catalog.jsonb_array_elements(v_latest_mutation_intent -> 'resources') as prior(value)
          where prior.value ->> 'logical_resource_key' = proposed.value ->> 'logical_resource_key'
            and prior.value ->> 'resource_type' = proposed.value ->> 'resource_type'
        )
      ) or exists (
        select 1 from pg_catalog.jsonb_array_elements(v_latest_mutation_intent -> 'resources') as prior(value)
        where not exists (
          select 1 from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as proposed(value)
          where proposed.value ->> 'logical_resource_key' = prior.value ->> 'logical_resource_key'
            and proposed.value ->> 'resource_type' = prior.value ->> 'resource_type'
        )
      ) then
        raise exception 'Gate 1 reconciliation intent must match the latest mutation intent' using errcode = '22023';
      end if;
    end if;
  else
    if p_action = 'deliver' and v_build.status = 'gate_2_failed' then
      raise exception 'Failed Gate 2 state requires reconciliation before delivery' using errcode = '55000';
    elsif p_action = 'deliver' and v_build.status <> 'ready_to_deliver' then
      raise exception 'Gate 2 requires a build ready to deliver' using errcode = '55000';
    elsif p_action = 'reconcile'
      and v_build.status not in ('delivery_unverified', 'gate_2_failed') then
      raise exception 'Gate 2 reconciliation requires unverified delivery' using errcode = '55000';
    end if;
    perform ads_internal.assert_campaign_gate_2_manifest(v_build, p_action, p_intent);
  end if;

  select coalesce(pg_catalog.max(attempt.attempt_number), 0) + 1
  into v_attempt_number from public.ads_campaign_gate_attempts as attempt
  where attempt.build_id = v_build.id;
  insert into public.ads_campaign_gate_attempts (
    build_id, gate, action, request_idempotency_key, attempt_number,
    revision_id, revision_hash, status, intent, claimed_at, claim_expires_at,
    actor_id, actor_name, trusted_ip, trusted_user_agent
  ) values (
    v_build.id, p_gate, p_action, p_request_idempotency_key, v_attempt_number,
    v_build.revision_id, v_build.revision_hash, 'claimed', p_intent, v_now,
    v_now + pg_catalog.make_interval(secs => p_claim_ttl_seconds),
    p_actor_id, v_actor_name, p_trusted_ip, p_trusted_user_agent
  ) returning * into v_attempt;
  if p_gate = 1 then
    insert into public.ads_campaign_build_resources (build_id, logical_resource_key, resource_type)
    select v_build.id, item.value ->> 'logical_resource_key', item.value ->> 'resource_type'
    from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as item(value)
    on conflict (build_id, logical_resource_key) do nothing;
  end if;
  v_from_status := v_build.status;
  update public.ads_campaign_builds
  set status = case when p_gate = 1 then 'gate_1_in_progress' else 'gate_2_in_progress' end,
      gate_1_started_at = case when p_gate = 1 then coalesce(gate_1_started_at, pg_catalog.clock_timestamp()) else gate_1_started_at end,
      gate_2_started_at = case when p_gate = 2 then coalesce(gate_2_started_at, pg_catalog.clock_timestamp()) else gate_2_started_at end,
      delivery_started_at = case when p_gate = 2 then coalesce(delivery_started_at, pg_catalog.clock_timestamp()) else delivery_started_at end,
      updated_at = pg_catalog.clock_timestamp(), lock_version = lock_version + 1
  where id = v_build.id and status = v_from_status returning * into v_build;
  if not found then
    raise exception 'Campaign build state changed while claim was acquired' using errcode = '40001';
  end if;
  if p_gate = 1 and v_plan.status = 'approved' then
    update public.ads_campaign_plans
    set status = 'launch_in_progress', updated_at = pg_catalog.clock_timestamp(),
        lock_version = lock_version + 1
    where id = v_plan.id and status = 'approved'
      and active_revision_id = v_build.revision_id
      and approved_revision_id = v_build.revision_id
      and approved_revision_hash = v_build.revision_hash;
    get diagnostics v_plan_update_count = row_count;
    if v_plan_update_count <> 1 then
      raise exception 'Campaign plan changed while Gate 1 claim was acquired' using errcode = '40001';
    end if;
  end if;
  perform ads_internal.append_campaign_audit(
    v_build.plan_id, v_build.revision_id, v_build.id, v_attempt.id,
    'campaign_gate_claim_acquired', v_from_status, v_build.status,
    p_actor_id, p_trusted_ip, p_trusted_user_agent,
    pg_catalog.jsonb_build_object(
      'gate', p_gate, 'action', p_action,
      'request_idempotency_key', p_request_idempotency_key,
      'claim_expires_at', v_attempt.claim_expires_at
    )
  );
  return v_attempt;
end;
$$;

create or replace function ads_internal.acquire_campaign_retry_claim_hardened(
  p_build_id bigint,
  p_prior_attempt_id bigint,
  p_request_idempotency_key text,
  p_expected_revision_hash text,
  p_claim_ttl_seconds integer,
  p_intent jsonb,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
)
returns public.ads_campaign_gate_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_build public.ads_campaign_builds%rowtype;
  v_plan public.ads_campaign_plans%rowtype;
  v_approval public.ads_campaign_approvals%rowtype;
  v_parent public.ads_campaign_gate_attempts%rowtype;
  v_attempt public.ads_campaign_gate_attempts%rowtype;
  v_actor_name text;
  v_actor_email text;
  v_actor_role text;
  v_attempt_number integer;
  v_from_status text;
  v_expired_gate smallint;
  v_expired_action text;
  v_expired_count integer;
  v_now timestamptz;
begin
  select actor.actor_name, actor.actor_email, actor.actor_role
  into strict v_actor_name, v_actor_email, v_actor_role
  from ads_internal.resolve_m04_actor(p_actor_id) as actor;
  if pg_catalog.btrim(coalesce(p_request_idempotency_key, '')) = '' then
    raise exception 'Retry claim idempotency key is required' using errcode = '22023';
  end if;
  if p_claim_ttl_seconds is null or p_claim_ttl_seconds < 1 or p_claim_ttl_seconds > 3600 then
    raise exception 'Gate claim TTL must be between 1 and 3600 seconds' using errcode = '22023';
  end if;
  if p_intent is null or pg_catalog.jsonb_typeof(p_intent) <> 'object'
    or pg_catalog.jsonb_typeof(p_intent -> 'resources') <> 'array'
    or pg_catalog.jsonb_array_length(p_intent -> 'resources') = 0 then
    raise exception 'Retry intent must declare logical resources' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as item(value)
    where pg_catalog.btrim(coalesce(item.value ->> 'logical_resource_key', '')) = ''
      or pg_catalog.btrim(coalesce(item.value ->> 'resource_type', '')) = ''
  ) or (
    select pg_catalog.count(*) <> pg_catalog.count(distinct item.value ->> 'logical_resource_key')
    from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as item(value)
  ) then
    raise exception 'Retry logical resource intents must be complete and unique' using errcode = '22023';
  end if;

  select build.* into v_build
  from public.ads_campaign_builds as build where build.id = p_build_id for update;
  if not found then
    raise exception 'Campaign build was not found' using errcode = 'P0002';
  end if;
  select attempt.* into v_attempt
  from public.ads_campaign_gate_attempts as attempt
  where attempt.build_id = v_build.id
    and attempt.request_idempotency_key = p_request_idempotency_key;
  if found then
    if v_attempt.action <> 'retry'
      or v_attempt.retry_parent_attempt_id is distinct from p_prior_attempt_id
      or v_attempt.revision_hash is distinct from p_expected_revision_hash
      or v_attempt.intent is distinct from p_intent
      or v_attempt.actor_id is distinct from p_actor_id then
      raise exception 'Retry claim idempotency key conflicts with an existing request' using errcode = '22023';
    end if;
    return v_attempt;
  end if;

  select plan.* into strict v_plan
  from public.ads_campaign_plans as plan where plan.id = v_build.plan_id for update;
  if p_expected_revision_hash is distinct from v_build.revision_hash then
    raise exception 'Campaign build revision lock does not match' using errcode = '40001';
  end if;
  perform ads_internal.assert_campaign_build_immutable_launch_snapshot(v_build, v_plan);
  v_now := pg_catalog.clock_timestamp();
  select approval.* into strict v_approval
  from public.ads_campaign_approvals as approval where approval.id = v_build.approval_id;
  if v_approval.plan_id is distinct from v_build.plan_id
    or v_approval.revision_id is distinct from v_build.revision_id
    or v_approval.revision_hash is distinct from v_build.revision_hash then
    raise exception 'Campaign build approval revision lock does not match the build' using errcode = '55000';
  end if;
  if v_approval.decision is distinct from 'approved' or v_approval.expires_at <= v_now
    or v_plan.status <> 'launch_in_progress'
    or v_plan.approved_revision_id is distinct from v_build.revision_id
    or v_plan.approved_revision_hash is distinct from v_build.revision_hash
    or v_plan.active_revision_id is distinct from v_build.revision_id then
    raise exception 'Campaign build approval is no longer current and unexpired' using errcode = '55000';
  end if;

  select attempt.gate, attempt.action into v_expired_gate, v_expired_action
  from public.ads_campaign_gate_attempts as attempt
  where attempt.build_id = v_build.id and attempt.status = 'claimed'
    and attempt.released_at is null and attempt.claim_expires_at <= v_now
  order by attempt.id limit 1;
  update public.ads_campaign_gate_attempts
  set status = 'expired', released_at = v_now,
      updated_at = v_now
  where build_id = v_build.id and status = 'claimed' and released_at is null
    and claim_expires_at <= v_now;
  get diagnostics v_expired_count = row_count;
  if v_expired_count > 0 then
    update public.ads_campaign_builds
    set status = case when v_expired_gate = 1 then 'reconciliation_required' else 'delivery_unverified' end,
        updated_at = pg_catalog.clock_timestamp(), lock_version = lock_version + 1
    where id = v_build.id returning * into v_build;
    if v_expired_gate = 1 and v_expired_action in ('create', 'retry') then
      raise exception 'Expired Gate 1 mutation requires reconciliation before another mutation' using errcode = '55000';
    else
      raise exception 'Expired claim must be reconciled before mutation retry' using errcode = '55000';
    end if;
  end if;
  if exists (
    select 1 from public.ads_campaign_gate_attempts as attempt
    where attempt.build_id = v_build.id and attempt.status = 'claimed'
      and attempt.released_at is null
  ) then
    raise exception 'A different active gate claim already exists' using errcode = '55P03';
  end if;
  if v_build.status <> 'gate_1_failed' then
    raise exception 'Mutation retry requires a Gate 1 failed build' using errcode = '55000';
  end if;
  select attempt.* into v_parent
  from public.ads_campaign_gate_attempts as attempt where attempt.id = p_prior_attempt_id;
  if not found then
    raise exception 'Retry parent attempt was not found' using errcode = 'P0002';
  end if;
  if v_parent.build_id <> v_build.id then
    raise exception 'Retry parent does not belong to the selected build' using errcode = '22023';
  end if;
  if v_parent.gate <> 1 or v_parent.action not in ('create', 'retry')
    or v_parent.status not in ('failed', 'reconciliation_required', 'expired')
    or v_parent.revision_id <> v_build.revision_id
    or v_parent.revision_hash <> v_build.revision_hash then
    raise exception 'Retry parent is not an eligible Gate 1 mutation attempt' using errcode = '55000';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as retry_item(value)
    where not exists (
      select 1 from pg_catalog.jsonb_array_elements(v_parent.intent -> 'resources') as parent_item(value)
      where parent_item.value ->> 'logical_resource_key' = retry_item.value ->> 'logical_resource_key'
        and parent_item.value ->> 'resource_type' = retry_item.value ->> 'resource_type'
    )
  ) then
    raise exception 'Retry resources must be a key/type subset of the parent mutation intent' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as item(value)
    where (
      select mutation.id
      from public.ads_campaign_gate_attempts as mutation
      where mutation.build_id = v_build.id and mutation.gate = 1
        and mutation.action in ('create', 'retry')
        and mutation.revision_id is not distinct from v_build.revision_id
        and mutation.revision_hash is not distinct from v_build.revision_hash
        and exists (
          select 1
          from pg_catalog.jsonb_array_elements(mutation.intent -> 'resources') as mutation_item(value)
          where mutation_item.value ->> 'logical_resource_key' = item.value ->> 'logical_resource_key'
            and mutation_item.value ->> 'resource_type' = item.value ->> 'resource_type'
        )
      order by mutation.attempt_number desc, mutation.id desc
      limit 1
    ) is distinct from v_parent.id
  ) then
    raise exception 'Retry parent must be the latest mutation for every selected resource' using errcode = '55000';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as item(value)
    left join public.ads_campaign_build_resources as resource
      on resource.build_id = v_build.id
     and resource.logical_resource_key = item.value ->> 'logical_resource_key'
    where resource.id is null
      or resource.resource_type is distinct from item.value ->> 'resource_type'
      or resource.provider_resource_id is not null
      or (
        select evidence_attempt.status = 'succeeded'
          and exists (
            select 1 from public.ads_campaign_qa_results as qa
            where qa.attempt_id = evidence_attempt.id
              and qa.build_resource_id = resource.id
              and qa.phase = 'reconciliation' and qa.required
              and qa.result = 'missing'
              and ads_internal.is_nonempty_json_object(qa.readback_evidence)
          )
          and not exists (
            select 1
            from (
              select distinct on (qa.field_path)
                qa.field_path, qa.result, qa.readback_evidence
              from public.ads_campaign_qa_results as qa
              where qa.attempt_id = evidence_attempt.id
                and qa.build_resource_id = resource.id
                and qa.phase = 'reconciliation' and qa.required
              order by qa.field_path, qa.id desc
            ) as field_qa
            where field_qa.result <> 'missing'
              or not ads_internal.is_nonempty_json_object(field_qa.readback_evidence)
          )
        from public.ads_campaign_gate_attempts as evidence_attempt
        where evidence_attempt.build_id = v_build.id and evidence_attempt.gate = 1
          and evidence_attempt.action = 'reconcile'
          and evidence_attempt.attempt_number > v_parent.attempt_number
          and exists (
            select 1 from pg_catalog.jsonb_array_elements(evidence_attempt.intent -> 'resources') as evidence_item(value)
            where evidence_item.value ->> 'logical_resource_key' = item.value ->> 'logical_resource_key'
              and evidence_item.value ->> 'resource_type' = item.value ->> 'resource_type'
          )
        order by evidence_attempt.attempt_number desc, evidence_attempt.id desc limit 1
      ) is distinct from true
  ) then
    raise exception 'Mutation retry requires every selected resource to be proven missing by newer reconciliation readback' using errcode = '55000';
  end if;

  select coalesce(pg_catalog.max(attempt.attempt_number), 0) + 1 into v_attempt_number
  from public.ads_campaign_gate_attempts as attempt where attempt.build_id = v_build.id;
  insert into public.ads_campaign_gate_attempts (
    build_id, gate, action, request_idempotency_key, retry_parent_attempt_id,
    attempt_number, revision_id, revision_hash, status, intent,
    claimed_at, claim_expires_at, actor_id, actor_name, trusted_ip, trusted_user_agent
  ) values (
    v_build.id, 1, 'retry', p_request_idempotency_key, v_parent.id,
    v_attempt_number, v_build.revision_id, v_build.revision_hash, 'claimed', p_intent,
    v_now, v_now + pg_catalog.make_interval(secs => p_claim_ttl_seconds),
    p_actor_id, v_actor_name, p_trusted_ip, p_trusted_user_agent
  ) returning * into v_attempt;
  v_from_status := v_build.status;
  update public.ads_campaign_builds
  set status = 'gate_1_in_progress',
      gate_1_started_at = coalesce(gate_1_started_at, pg_catalog.clock_timestamp()),
      updated_at = pg_catalog.clock_timestamp(), lock_version = lock_version + 1
  where id = v_build.id and status = 'gate_1_failed' returning * into v_build;
  if not found then
    raise exception 'Campaign build state changed while retry was acquired' using errcode = '40001';
  end if;
  perform ads_internal.append_campaign_audit(
    v_build.plan_id, v_build.revision_id, v_build.id, v_attempt.id,
    'campaign_gate_retry_claim_acquired', v_from_status, v_build.status,
    p_actor_id, p_trusted_ip, p_trusted_user_agent,
    pg_catalog.jsonb_build_object(
      'retry_parent_attempt_id', v_parent.id,
      'request_idempotency_key', p_request_idempotency_key,
      'claim_expires_at', v_attempt.claim_expires_at
    )
  );
  return v_attempt;
end;
$$;

create or replace function public.ads_acquire_campaign_gate_claim(
  p_build_id bigint,
  p_gate smallint,
  p_action text,
  p_request_idempotency_key text,
  p_expected_revision_id bigint,
  p_expected_revision_hash text,
  p_claim_ttl_seconds integer,
  p_intent jsonb,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
)
returns public.ads_campaign_gate_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_build public.ads_campaign_builds%rowtype;
  v_plan public.ads_campaign_plans%rowtype;
  v_approval public.ads_campaign_approvals%rowtype;
  v_attempt public.ads_campaign_gate_attempts%rowtype;
  v_actor_name text;
  v_actor_email text;
  v_actor_role text;
  v_attempt_number integer;
  v_expired_count integer;
  v_expired_gate_1_mutation boolean := false;
  v_expired_gate_2_delivery boolean := false;
  v_latest_mutation_intent jsonb;
  v_from_status text;
begin
  select actor.actor_name, actor.actor_email, actor.actor_role
  into strict v_actor_name, v_actor_email, v_actor_role
  from ads_internal.resolve_m04_actor(p_actor_id) as actor;

  if p_gate not in (1, 2) then
    raise exception 'Campaign gate must be 1 or 2' using errcode = '22023';
  end if;
  if pg_catalog.btrim(coalesce(p_request_idempotency_key, '')) = '' then
    raise exception 'Gate claim idempotency key is required' using errcode = '22023';
  end if;
  if p_claim_ttl_seconds is null or p_claim_ttl_seconds < 1 or p_claim_ttl_seconds > 3600 then
    raise exception 'Gate claim TTL must be between 1 and 3600 seconds' using errcode = '22023';
  end if;
  if p_intent is null or pg_catalog.jsonb_typeof(p_intent) <> 'object' then
    raise exception 'Gate claim intent must be a JSON object' using errcode = '22023';
  end if;
  if (p_gate = 1 and p_action not in ('create', 'reconcile'))
    or (p_gate = 2 and p_action not in ('deliver', 'reconcile')) then
    raise exception 'Gate action does not match the selected gate' using errcode = '22023';
  end if;

  select build.*
  into v_build
  from public.ads_campaign_builds as build
  where build.id = p_build_id
  for update;
  if not found then
    raise exception 'Campaign build was not found' using errcode = 'P0002';
  end if;

  select plan.* into strict v_plan
  from public.ads_campaign_plans as plan
  where plan.id = v_build.plan_id;
  select approval.* into strict v_approval
  from public.ads_campaign_approvals as approval
  where approval.id = v_build.approval_id;

  if v_approval.decision <> 'approved'
    or v_approval.expires_at <= pg_catalog.clock_timestamp()
    or v_approval.revision_id <> v_build.revision_id
    or v_approval.revision_hash <> v_build.revision_hash
    or v_plan.approved_revision_id <> v_build.revision_id
    or v_plan.approved_revision_hash <> v_build.revision_hash
    or v_plan.active_revision_id <> v_build.revision_id then
    raise exception 'Campaign build approval is no longer current and unexpired' using errcode = '55000';
  end if;
  if p_expected_revision_id is distinct from v_build.revision_id
    or p_expected_revision_hash is distinct from v_build.revision_hash then
    raise exception 'Campaign build revision lock does not match' using errcode = '40001';
  end if;

  select attempt.* into v_attempt
  from public.ads_campaign_gate_attempts as attempt
  where attempt.build_id = v_build.id
    and attempt.request_idempotency_key = p_request_idempotency_key;
  if found then
    if v_attempt.gate is distinct from p_gate
      or v_attempt.action is distinct from p_action
      or v_attempt.revision_id is distinct from p_expected_revision_id
      or v_attempt.revision_hash is distinct from p_expected_revision_hash
      or v_attempt.intent is distinct from p_intent
      or v_attempt.actor_id is distinct from p_actor_id then
      raise exception 'Gate claim idempotency key conflicts with an existing request' using errcode = '22023';
    end if;
    return v_attempt;
  end if;

  select
    coalesce(pg_catalog.bool_or(attempt.gate = 1 and attempt.action in ('create', 'retry')), false),
    coalesce(pg_catalog.bool_or(attempt.gate = 2 and attempt.action = 'deliver'), false)
  into v_expired_gate_1_mutation, v_expired_gate_2_delivery
  from public.ads_campaign_gate_attempts as attempt
  where attempt.build_id = v_build.id and attempt.gate = p_gate
    and attempt.status = 'claimed' and attempt.released_at is null
    and attempt.claim_expires_at <= pg_catalog.clock_timestamp();

  update public.ads_campaign_gate_attempts
  set status = 'expired', released_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  where build_id = v_build.id and gate = p_gate and status = 'claimed'
    and released_at is null and claim_expires_at <= pg_catalog.clock_timestamp();
  get diagnostics v_expired_count = row_count;

  if v_expired_count > 0 and p_gate = 1 then
    v_build.status := 'reconciliation_required';
    if v_expired_gate_1_mutation and p_action <> 'reconcile' then
      raise exception 'Expired Gate 1 mutation requires reconciliation before another mutation' using errcode = '55000';
    end if;
  elsif v_expired_count > 0 and p_gate = 2 then
    v_build.status := 'delivery_unverified';
    if v_expired_gate_2_delivery and p_action <> 'reconcile' then
      raise exception 'Expired Gate 2 delivery requires reconciliation before another delivery' using errcode = '55000';
    end if;
  end if;

  if exists (
    select 1 from public.ads_campaign_gate_attempts as attempt
    where attempt.build_id = v_build.id and attempt.gate = p_gate
      and attempt.status = 'claimed' and attempt.released_at is null
  ) then
    raise exception 'A different active gate claim already exists' using errcode = '55P03';
  end if;

  if p_gate = 1 then
    if p_action = 'create' and not (
      v_build.status = 'pending_gate_1'
      or (v_build.status = 'gate_1_in_progress' and v_expired_count > 0)
    ) then
      raise exception 'Gate 1 create requires a pending build or an expired claim' using errcode = '55000';
    end if;
    if p_action = 'reconcile' and v_build.status <> 'reconciliation_required' then
      raise exception 'Reconciliation requires a build awaiting reconciliation' using errcode = '55000';
    end if;
    if not (p_intent ? 'resources')
      or pg_catalog.jsonb_typeof(p_intent -> 'resources') <> 'array'
      or pg_catalog.jsonb_array_length(p_intent -> 'resources') = 0 then
      raise exception 'Gate 1 intent must declare logical resources' using errcode = '22023';
    end if;
    if exists (
      select 1 from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as item(value)
      where pg_catalog.btrim(coalesce(item.value ->> 'logical_resource_key', '')) = ''
        or pg_catalog.btrim(coalesce(item.value ->> 'resource_type', '')) = ''
    ) or (
      select pg_catalog.count(*) <> pg_catalog.count(distinct item.value ->> 'logical_resource_key')
      from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as item(value)
    ) then
      raise exception 'Gate 1 logical resource intents must be complete and unique' using errcode = '22023';
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as item(value)
      join public.ads_campaign_build_resources as resource
        on resource.build_id = v_build.id
       and resource.logical_resource_key = item.value ->> 'logical_resource_key'
      where resource.resource_type <> item.value ->> 'resource_type'
    ) then
      raise exception 'Logical resource type conflicts with persisted intent' using errcode = '22023';
    end if;
    if p_action = 'reconcile' then
      select attempt.intent into v_latest_mutation_intent
      from public.ads_campaign_gate_attempts as attempt
      where attempt.build_id = v_build.id and attempt.gate = 1
        and attempt.action in ('create', 'retry')
        and attempt.revision_id = v_build.revision_id
        and attempt.revision_hash = v_build.revision_hash
      order by attempt.attempt_number desc, attempt.id desc
      limit 1;
      if not found then
        raise exception 'Gate 1 reconciliation requires a prior mutation intent' using errcode = '55000';
      end if;
      if exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as reconciliation_item(value)
        where not exists (
          select 1
          from pg_catalog.jsonb_array_elements(v_latest_mutation_intent -> 'resources') as mutation_item(value)
          where mutation_item.value ->> 'logical_resource_key' = reconciliation_item.value ->> 'logical_resource_key'
            and mutation_item.value ->> 'resource_type' = reconciliation_item.value ->> 'resource_type'
        )
      ) or exists (
        select 1
        from pg_catalog.jsonb_array_elements(v_latest_mutation_intent -> 'resources') as mutation_item(value)
        where not exists (
          select 1
          from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as reconciliation_item(value)
          where reconciliation_item.value ->> 'logical_resource_key' = mutation_item.value ->> 'logical_resource_key'
            and reconciliation_item.value ->> 'resource_type' = mutation_item.value ->> 'resource_type'
        )
      ) then
        raise exception 'Gate 1 reconciliation intent must match the latest mutation intent' using errcode = '22023';
      end if;
    end if;
  else
    if p_action = 'deliver' and v_build.status <> 'ready_to_deliver' then
      raise exception 'Gate 2 requires a build ready to deliver' using errcode = '55000';
    end if;
    if p_action = 'reconcile' and v_build.status <> 'delivery_unverified' then
      raise exception 'Gate 2 reconciliation requires unverified delivery' using errcode = '55000';
    end if;
  end if;

  select coalesce(pg_catalog.max(attempt.attempt_number), 0) + 1
  into v_attempt_number
  from public.ads_campaign_gate_attempts as attempt
  where attempt.build_id = v_build.id;

  insert into public.ads_campaign_gate_attempts (
    build_id, gate, action, request_idempotency_key, attempt_number,
    revision_id, revision_hash, status, intent, claim_expires_at,
    actor_id, actor_name, trusted_ip, trusted_user_agent
  ) values (
    v_build.id, p_gate, p_action, p_request_idempotency_key, v_attempt_number,
    v_build.revision_id, v_build.revision_hash, 'claimed', p_intent,
    pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => p_claim_ttl_seconds),
    p_actor_id, v_actor_name, p_trusted_ip, p_trusted_user_agent
  ) returning * into v_attempt;

  if p_gate = 1 then
    insert into public.ads_campaign_build_resources (
      build_id, logical_resource_key, resource_type
    )
    select v_build.id, item.value ->> 'logical_resource_key', item.value ->> 'resource_type'
    from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as item(value)
    on conflict (build_id, logical_resource_key) do nothing;
  end if;

  v_from_status := v_build.status;
  update public.ads_campaign_builds
  set status = case when p_gate = 1 then 'gate_1_in_progress' else 'gate_2_in_progress' end,
      gate_1_started_at = case when p_gate = 1 then coalesce(gate_1_started_at, pg_catalog.clock_timestamp()) else gate_1_started_at end,
      gate_2_started_at = case when p_gate = 2 then coalesce(gate_2_started_at, pg_catalog.clock_timestamp()) else gate_2_started_at end,
      delivery_started_at = case when p_gate = 2 then coalesce(delivery_started_at, pg_catalog.clock_timestamp()) else delivery_started_at end,
      updated_at = pg_catalog.clock_timestamp(), lock_version = lock_version + 1
  where id = v_build.id
  returning * into v_build;

  if p_gate = 1 and v_plan.status = 'approved' then
    update public.ads_campaign_plans
    set status = 'launch_in_progress', updated_at = pg_catalog.clock_timestamp(),
        lock_version = lock_version + 1
    where id = v_plan.id;
  end if;

  perform ads_internal.append_campaign_audit(
    v_build.plan_id, v_build.revision_id, v_build.id, v_attempt.id,
    'campaign_gate_claim_acquired', v_from_status, v_build.status,
    p_actor_id, p_trusted_ip, p_trusted_user_agent,
    pg_catalog.jsonb_build_object(
      'gate', p_gate, 'action', p_action,
      'request_idempotency_key', p_request_idempotency_key,
      'claim_expires_at', v_attempt.claim_expires_at
    )
  );
  return v_attempt;
end;
$$;

create or replace function public.ads_acquire_campaign_retry_claim(
  p_build_id bigint,
  p_prior_attempt_id bigint,
  p_request_idempotency_key text,
  p_expected_revision_hash text,
  p_claim_ttl_seconds integer,
  p_intent jsonb,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
)
returns public.ads_campaign_gate_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_build public.ads_campaign_builds%rowtype;
  v_plan public.ads_campaign_plans%rowtype;
  v_approval public.ads_campaign_approvals%rowtype;
  v_parent public.ads_campaign_gate_attempts%rowtype;
  v_attempt public.ads_campaign_gate_attempts%rowtype;
  v_actor_name text;
  v_actor_email text;
  v_actor_role text;
  v_attempt_number integer;
  v_from_status text;
begin
  select actor.actor_name, actor.actor_email, actor.actor_role
  into strict v_actor_name, v_actor_email, v_actor_role
  from ads_internal.resolve_m04_actor(p_actor_id) as actor;

  if pg_catalog.btrim(coalesce(p_request_idempotency_key, '')) = '' then
    raise exception 'Retry claim idempotency key is required' using errcode = '22023';
  end if;
  if p_claim_ttl_seconds is null or p_claim_ttl_seconds < 1 or p_claim_ttl_seconds > 3600 then
    raise exception 'Gate claim TTL must be between 1 and 3600 seconds' using errcode = '22023';
  end if;
  if p_intent is null or pg_catalog.jsonb_typeof(p_intent) <> 'object'
    or pg_catalog.jsonb_typeof(p_intent -> 'resources') <> 'array'
    or pg_catalog.jsonb_array_length(p_intent -> 'resources') = 0 then
    raise exception 'Retry intent must declare logical resources' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as item(value)
    where pg_catalog.btrim(coalesce(item.value ->> 'logical_resource_key', '')) = ''
      or pg_catalog.btrim(coalesce(item.value ->> 'resource_type', '')) = ''
  ) or (
    select pg_catalog.count(*) <> pg_catalog.count(distinct item.value ->> 'logical_resource_key')
    from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as item(value)
  ) then
    raise exception 'Retry logical resource intents must be complete and unique' using errcode = '22023';
  end if;

  select build.* into v_build
  from public.ads_campaign_builds as build
  where build.id = p_build_id
  for update;
  if not found then
    raise exception 'Campaign build was not found' using errcode = 'P0002';
  end if;
  if p_expected_revision_hash is distinct from v_build.revision_hash then
    raise exception 'Campaign build revision lock does not match' using errcode = '40001';
  end if;

  select plan.* into strict v_plan from public.ads_campaign_plans as plan where plan.id = v_build.plan_id;
  select approval.* into strict v_approval from public.ads_campaign_approvals as approval where approval.id = v_build.approval_id;
  if v_approval.plan_id is distinct from v_build.plan_id
    or v_approval.revision_id is distinct from v_build.revision_id
    or v_approval.revision_hash is distinct from v_build.revision_hash then
    raise exception 'Campaign build approval revision lock does not match the build' using errcode = '55000';
  end if;
  if v_approval.decision <> 'approved' or v_approval.expires_at <= pg_catalog.clock_timestamp()
    or v_plan.approved_revision_id <> v_build.revision_id
    or v_plan.approved_revision_hash <> v_build.revision_hash
    or v_plan.active_revision_id <> v_build.revision_id then
    raise exception 'Campaign build approval is no longer current and unexpired' using errcode = '55000';
  end if;

  select attempt.* into v_parent
  from public.ads_campaign_gate_attempts as attempt
  where attempt.id = p_prior_attempt_id;
  if not found then
    raise exception 'Retry parent attempt was not found' using errcode = 'P0002';
  end if;
  if v_parent.build_id <> v_build.id then
    raise exception 'Retry parent does not belong to the selected build' using errcode = '22023';
  end if;
  if v_parent.gate <> 1 or v_parent.action not in ('create', 'retry')
    or v_parent.status not in ('failed', 'reconciliation_required', 'expired')
    or v_parent.revision_id <> v_build.revision_id
    or v_parent.revision_hash <> v_build.revision_hash then
    raise exception 'Retry parent is not an eligible Gate 1 mutation attempt' using errcode = '55000';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as retry_item(value)
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_parent.intent -> 'resources') as parent_item(value)
      where parent_item.value ->> 'logical_resource_key' = retry_item.value ->> 'logical_resource_key'
        and parent_item.value ->> 'resource_type' = retry_item.value ->> 'resource_type'
    )
  ) then
    raise exception 'Retry resources must be a key/type subset of the parent mutation intent' using errcode = '22023';
  end if;

  select attempt.* into v_attempt
  from public.ads_campaign_gate_attempts as attempt
  where attempt.build_id = v_build.id
    and attempt.request_idempotency_key = p_request_idempotency_key;
  if found then
    if v_attempt.action <> 'retry'
      or v_attempt.retry_parent_attempt_id is distinct from v_parent.id
      or v_attempt.revision_hash is distinct from p_expected_revision_hash
      or v_attempt.intent is distinct from p_intent
      or v_attempt.actor_id is distinct from p_actor_id then
      raise exception 'Retry claim idempotency key conflicts with an existing request' using errcode = '22023';
    end if;
    return v_attempt;
  end if;

  if exists (
    select 1 from public.ads_campaign_gate_attempts as attempt
    where attempt.build_id = v_build.id and attempt.gate = 1
      and attempt.status = 'claimed' and attempt.released_at is null
      and attempt.claim_expires_at <= pg_catalog.clock_timestamp()
      and attempt.action in ('create', 'retry')
  ) then
    raise exception 'Expired Gate 1 mutation requires reconciliation before another mutation' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.ads_campaign_gate_attempts as attempt
    where attempt.build_id = v_build.id and attempt.gate = 1
      and attempt.status = 'claimed' and attempt.released_at is null
      and attempt.claim_expires_at <= pg_catalog.clock_timestamp()
  ) then
    raise exception 'Expired Gate 1 reconciliation must be reacquired before mutation retry' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.ads_campaign_gate_attempts as attempt
    where attempt.build_id = v_build.id and attempt.gate = 1
      and attempt.status = 'claimed' and attempt.released_at is null
  ) then
    raise exception 'A different active gate claim already exists' using errcode = '55P03';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_intent -> 'resources') as item(value)
    left join public.ads_campaign_build_resources as resource
      on resource.build_id = v_build.id
     and resource.logical_resource_key = item.value ->> 'logical_resource_key'
    where resource.id is null
      or resource.resource_type is distinct from item.value ->> 'resource_type'
      or resource.provider_resource_id is not null
      or (
        select evidence_attempt.status = 'succeeded'
          and exists (
            select 1 from public.ads_campaign_qa_results as qa
            where qa.attempt_id = evidence_attempt.id
              and qa.build_resource_id = resource.id
              and qa.phase = 'reconciliation' and qa.required
              and qa.result = 'missing'
              and ads_internal.is_nonempty_json_object(qa.readback_evidence)
          )
          and not exists (
            select 1 from public.ads_campaign_qa_results as qa
            where qa.attempt_id = evidence_attempt.id
              and qa.build_resource_id = resource.id
              and qa.phase = 'reconciliation' and qa.required
              and (qa.result <> 'missing'
                or not ads_internal.is_nonempty_json_object(qa.readback_evidence))
          )
        from public.ads_campaign_gate_attempts as evidence_attempt
        where evidence_attempt.build_id = v_build.id
          and evidence_attempt.action = 'reconcile'
          and evidence_attempt.claimed_at > v_parent.claimed_at
          and exists (
            select 1
            from pg_catalog.jsonb_array_elements(evidence_attempt.intent -> 'resources') as evidence_item(value)
            where evidence_item.value ->> 'logical_resource_key' = item.value ->> 'logical_resource_key'
              and evidence_item.value ->> 'resource_type' = item.value ->> 'resource_type'
          )
        order by evidence_attempt.claimed_at desc, evidence_attempt.id desc
        limit 1
      ) is distinct from true
  ) then
    raise exception 'Mutation retry requires every selected resource to be proven missing by newer reconciliation readback' using errcode = '55000';
  end if;

  select coalesce(pg_catalog.max(attempt.attempt_number), 0) + 1 into v_attempt_number
  from public.ads_campaign_gate_attempts as attempt where attempt.build_id = v_build.id;
  insert into public.ads_campaign_gate_attempts (
    build_id, gate, action, request_idempotency_key, retry_parent_attempt_id,
    attempt_number, revision_id, revision_hash, status, intent,
    claim_expires_at, actor_id, actor_name, trusted_ip, trusted_user_agent
  ) values (
    v_build.id, 1, 'retry', p_request_idempotency_key, v_parent.id,
    v_attempt_number, v_build.revision_id, v_build.revision_hash, 'claimed', p_intent,
    pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => p_claim_ttl_seconds),
    p_actor_id, v_actor_name, p_trusted_ip, p_trusted_user_agent
  ) returning * into v_attempt;

  v_from_status := v_build.status;
  update public.ads_campaign_builds
  set status = 'gate_1_in_progress',
      gate_1_started_at = coalesce(gate_1_started_at, pg_catalog.clock_timestamp()),
      updated_at = pg_catalog.clock_timestamp(), lock_version = lock_version + 1
  where id = v_build.id returning * into v_build;
  perform ads_internal.append_campaign_audit(
    v_build.plan_id, v_build.revision_id, v_build.id, v_attempt.id,
    'campaign_gate_retry_claim_acquired', v_from_status, v_build.status,
    p_actor_id, p_trusted_ip, p_trusted_user_agent,
    pg_catalog.jsonb_build_object(
      'gate', 1, 'retry_parent_attempt_id', v_parent.id,
      'request_idempotency_key', p_request_idempotency_key,
      'claim_expires_at', v_attempt.claim_expires_at
    )
  );
  return v_attempt;
end;
$$;

create or replace function public.ads_record_campaign_resource_outcome(
  p_attempt_id bigint,
  p_claim_token uuid,
  p_logical_resource_key text,
  p_outcome text,
  p_provider_resource_id text,
  p_provider_parent_resource_id text,
  p_provider_response jsonb,
  p_error_details jsonb
)
returns public.ads_campaign_build_resources
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.ads_campaign_gate_attempts%rowtype;
  v_build public.ads_campaign_builds%rowtype;
  v_resource public.ads_campaign_build_resources%rowtype;
begin
  select attempt.* into v_attempt
  from public.ads_campaign_gate_attempts as attempt where attempt.id = p_attempt_id;
  if not found then
    raise exception 'Gate attempt was not found' using errcode = 'P0002';
  end if;
  select build.* into strict v_build
  from public.ads_campaign_builds as build where build.id = v_attempt.build_id for update;
  select attempt.* into strict v_attempt
  from public.ads_campaign_gate_attempts as attempt where attempt.id = p_attempt_id for update;
  if v_attempt.claim_token is distinct from p_claim_token
    or v_attempt.status <> 'claimed' or v_attempt.released_at is not null
    or v_attempt.claim_expires_at <= pg_catalog.clock_timestamp() then
    raise exception 'Gate claim is not active' using errcode = '55000';
  end if;
  if pg_catalog.btrim(coalesce(p_logical_resource_key, '')) = '' then
    raise exception 'Logical resource key is required' using errcode = '22023';
  end if;
  if p_outcome is null or p_outcome not in ('succeeded', 'failed', 'ambiguous', 'missing', 'found') then
    raise exception 'Provider resource outcome is invalid' using errcode = '22023';
  end if;

  select resource.* into v_resource
  from public.ads_campaign_build_resources as resource
  where resource.build_id = v_build.id
    and resource.logical_resource_key = p_logical_resource_key
  for update;
  if not found then
    raise exception 'Logical resource was not declared by the persisted intent' using errcode = 'P0002';
  end if;
  if v_resource.provider_resource_id is not null
    and p_provider_resource_id is not null
    and v_resource.provider_resource_id <> p_provider_resource_id then
    raise exception 'A non-null provider resource ID is immutable' using errcode = '55000';
  end if;
  if v_resource.provider_parent_resource_id is not null
    and p_provider_parent_resource_id is not null
    and v_resource.provider_parent_resource_id <> p_provider_parent_resource_id then
    raise exception 'A non-null provider parent resource ID is immutable' using errcode = '55000';
  end if;
  if v_resource.verified_at is not null then
    raise exception 'A verified campaign resource cannot regress' using errcode = '55000';
  end if;

  update public.ads_campaign_build_resources
  set provider_resource_id = coalesce(provider_resource_id, nullif(pg_catalog.btrim(p_provider_resource_id), '')),
      provider_parent_resource_id = coalesce(provider_parent_resource_id, nullif(pg_catalog.btrim(p_provider_parent_resource_id), '')),
      provider_response = coalesce(p_provider_response, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        '_last_attempt_id', v_attempt.id, '_last_outcome', p_outcome
      ),
      updated_at = pg_catalog.clock_timestamp()
  where id = v_resource.id returning * into v_resource;

  update public.ads_campaign_gate_attempts
  set provider_outcome = p_outcome,
      outcome = outcome || pg_catalog.jsonb_build_object(p_logical_resource_key, coalesce(p_provider_response, '{}'::jsonb)),
      error_details = coalesce(p_error_details, error_details),
      updated_at = pg_catalog.clock_timestamp()
  where id = v_attempt.id;

  if p_outcome = 'ambiguous' then
    update public.ads_campaign_gate_attempts
    set status = 'reconciliation_required', released_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    where id = v_attempt.id;
    update public.ads_campaign_builds
    set status = case when v_attempt.gate = 1 then 'reconciliation_required' else 'delivery_unverified' end,
        updated_at = pg_catalog.clock_timestamp(), lock_version = lock_version + 1
    where id = v_build.id;
  end if;
  return v_resource;
end;
$$;

create or replace function public.ads_append_campaign_qa_result(
  p_attempt_id bigint,
  p_claim_token uuid,
  p_build_resource_id bigint,
  p_phase text,
  p_field_path text,
  p_required boolean,
  p_expected_value jsonb,
  p_observed_value jsonb,
  p_result text,
  p_mismatch_code text,
  p_mismatch_detail text,
  p_readback_evidence jsonb
)
returns public.ads_campaign_qa_results
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.ads_campaign_gate_attempts%rowtype;
  v_build public.ads_campaign_builds%rowtype;
  v_resource public.ads_campaign_build_resources%rowtype;
  v_result public.ads_campaign_qa_results%rowtype;
begin
  select attempt.* into v_attempt
  from public.ads_campaign_gate_attempts as attempt where attempt.id = p_attempt_id;
  if not found then
    raise exception 'Gate attempt was not found' using errcode = 'P0002';
  end if;
  select build.* into strict v_build
  from public.ads_campaign_builds as build where build.id = v_attempt.build_id for update;
  select attempt.* into v_attempt
  from public.ads_campaign_gate_attempts as attempt where attempt.id = p_attempt_id for update;
  if not found or v_attempt.build_id is distinct from v_build.id then
    raise exception 'Gate attempt changed while QA waited for its build lock' using errcode = '40001';
  end if;
  if v_attempt.claim_token is distinct from p_claim_token
    or v_attempt.status <> 'claimed' or v_attempt.released_at is not null
    or v_attempt.claim_expires_at <= pg_catalog.clock_timestamp() then
    raise exception 'Gate claim is not active' using errcode = '55000';
  end if;
  if p_build_resource_id is not null then
    select resource.* into v_resource
    from public.ads_campaign_build_resources as resource
    where resource.id = p_build_resource_id for update;
    if not found or v_resource.build_id <> v_attempt.build_id then
      raise exception 'QA resource does not belong to the gate attempt build' using errcode = '22023';
    end if;
    if v_attempt.gate = 1 and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_attempt.intent -> 'resources') as item(value)
      where item.value ->> 'logical_resource_key' = v_resource.logical_resource_key
        and item.value ->> 'resource_type' = v_resource.resource_type
    ) then
      raise exception 'QA resource is outside the gate attempt intent' using errcode = '22023';
    end if;
  end if;
  if (p_phase = 'gate_1' and v_attempt.gate <> 1)
    or (p_phase = 'gate_2' and v_attempt.gate <> 2)
    or (p_phase = 'reconciliation' and v_attempt.action <> 'reconcile')
    or p_phase not in ('gate_1', 'gate_2', 'reconciliation') then
    raise exception 'QA phase does not match the active gate claim' using errcode = '22023';
  end if;
  if pg_catalog.btrim(coalesce(p_field_path, '')) = ''
    or p_result not in ('match', 'mismatch', 'missing', 'unexpected', 'error') then
    raise exception 'QA result is invalid' using errcode = '22023';
  end if;
  if p_phase in ('gate_2', 'reconciliation')
    and not ads_internal.is_nonempty_json_object(p_readback_evidence) then
    raise exception 'Authorization-grade readback evidence must be a non-empty JSON object' using errcode = '22023';
  end if;

  insert into public.ads_campaign_qa_results (
    attempt_id, build_resource_id, phase, field_path, required,
    expected_value, observed_value, result, mismatch_code, mismatch_detail,
    readback_evidence
  ) values (
    v_attempt.id, p_build_resource_id, p_phase, p_field_path, coalesce(p_required, true),
    p_expected_value, p_observed_value, p_result, p_mismatch_code, p_mismatch_detail,
    coalesce(p_readback_evidence, '{}'::jsonb)
  ) returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.ads_finalize_campaign_gate_claim(
  p_attempt_id bigint,
  p_claim_token uuid,
  p_provider_outcome text,
  p_final_readback_evidence jsonb,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
)
returns public.ads_campaign_builds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.ads_campaign_gate_attempts%rowtype;
  v_build public.ads_campaign_builds%rowtype;
  v_actor_name text;
  v_actor_email text;
  v_actor_role text;
  v_from_status text;
  v_to_status text;
  v_attempt_status text;
  v_gate_qa_ready boolean;
  v_reconciliation_all_found boolean := false;
  v_reconciliation_all_resolved boolean := false;
  v_verified_at timestamptz;
begin
  select actor.actor_name, actor.actor_email, actor.actor_role
  into strict v_actor_name, v_actor_email, v_actor_role
  from ads_internal.resolve_m04_actor(p_actor_id) as actor;
  if p_provider_outcome is null or p_provider_outcome not in ('succeeded', 'failed', 'ambiguous', 'unknown', 'missing') then
    raise exception 'Gate provider outcome is invalid' using errcode = '22023';
  end if;

  select attempt.* into v_attempt
  from public.ads_campaign_gate_attempts as attempt where attempt.id = p_attempt_id;
  if not found then
    raise exception 'Gate attempt was not found' using errcode = 'P0002';
  end if;
  select build.* into strict v_build
  from public.ads_campaign_builds as build where build.id = v_attempt.build_id for update;
  select attempt.* into strict v_attempt
  from public.ads_campaign_gate_attempts as attempt where attempt.id = p_attempt_id for update;
  if v_attempt.claim_token is distinct from p_claim_token
    or v_attempt.status <> 'claimed' or v_attempt.released_at is not null
    or v_attempt.claim_expires_at <= pg_catalog.clock_timestamp() then
    raise exception 'Gate claim is not active' using errcode = '55000';
  end if;
  v_from_status := v_build.status;

  if v_attempt.action = 'reconcile' then
    if v_attempt.gate = 1 then
      select
        not exists (
          select 1
          from pg_catalog.jsonb_array_elements(v_attempt.intent -> 'resources') as item(value)
          left join public.ads_campaign_build_resources as resource
            on resource.build_id = v_build.id
           and resource.logical_resource_key = item.value ->> 'logical_resource_key'
           and resource.resource_type = item.value ->> 'resource_type'
          where resource.id is null
            or resource.provider_resource_id is null
            or not exists (
              select 1 from public.ads_campaign_qa_results as qa
              where qa.attempt_id = v_attempt.id and qa.build_resource_id = resource.id
                and qa.phase = 'reconciliation' and qa.required and qa.result = 'match'
                and ads_internal.is_nonempty_json_object(qa.readback_evidence)
            )
            or exists (
              select 1 from public.ads_campaign_qa_results as qa
              where qa.attempt_id = v_attempt.id and qa.build_resource_id = resource.id
                and qa.phase = 'reconciliation' and qa.required
                and (qa.result <> 'match'
                  or not ads_internal.is_nonempty_json_object(qa.readback_evidence))
            )
        ),
        not exists (
          select 1
          from pg_catalog.jsonb_array_elements(v_attempt.intent -> 'resources') as item(value)
          left join public.ads_campaign_build_resources as resource
            on resource.build_id = v_build.id
           and resource.logical_resource_key = item.value ->> 'logical_resource_key'
           and resource.resource_type = item.value ->> 'resource_type'
          where resource.id is null
            or not (
              (
                resource.provider_resource_id is not null
                and exists (
                  select 1 from public.ads_campaign_qa_results as qa
                  where qa.attempt_id = v_attempt.id and qa.build_resource_id = resource.id
                    and qa.phase = 'reconciliation' and qa.required and qa.result = 'match'
                    and ads_internal.is_nonempty_json_object(qa.readback_evidence)
                )
                and not exists (
                  select 1 from public.ads_campaign_qa_results as qa
                  where qa.attempt_id = v_attempt.id and qa.build_resource_id = resource.id
                    and qa.phase = 'reconciliation' and qa.required
                    and (qa.result <> 'match'
                      or not ads_internal.is_nonempty_json_object(qa.readback_evidence))
                )
              )
              or (
                resource.provider_resource_id is null
                and exists (
                  select 1 from public.ads_campaign_qa_results as qa
                  where qa.attempt_id = v_attempt.id and qa.build_resource_id = resource.id
                    and qa.phase = 'reconciliation' and qa.required and qa.result = 'missing'
                    and ads_internal.is_nonempty_json_object(qa.readback_evidence)
                )
                and not exists (
                  select 1 from public.ads_campaign_qa_results as qa
                  where qa.attempt_id = v_attempt.id and qa.build_resource_id = resource.id
                    and qa.phase = 'reconciliation' and qa.required
                    and (qa.result <> 'missing'
                      or not ads_internal.is_nonempty_json_object(qa.readback_evidence))
                )
              )
            )
        )
      into v_reconciliation_all_found, v_reconciliation_all_resolved;

      if p_provider_outcome in ('succeeded', 'missing')
        and ads_internal.is_nonempty_json_object(p_final_readback_evidence)
        and v_reconciliation_all_found then
        v_to_status := 'ready_to_deliver';
        v_attempt_status := 'succeeded';
      elsif p_provider_outcome in ('succeeded', 'missing')
        and ads_internal.is_nonempty_json_object(p_final_readback_evidence)
        and v_reconciliation_all_resolved then
        v_to_status := 'gate_1_failed';
        v_attempt_status := 'succeeded';
      else
        v_to_status := 'reconciliation_required';
        v_attempt_status := 'reconciliation_required';
      end if;
    elsif p_provider_outcome = 'succeeded' then
      select
        ads_internal.is_nonempty_json_object(p_final_readback_evidence)
        and exists (
          select 1
          from public.ads_campaign_qa_results as qa
          join public.ads_campaign_build_resources as resource on resource.id = qa.build_resource_id
          where qa.attempt_id = v_attempt.id and qa.phase = 'reconciliation'
            and qa.required and qa.result = 'match'
            and ads_internal.is_nonempty_json_object(qa.readback_evidence)
            and resource.resource_type = 'campaign' and resource.provider_resource_id is not null
        )
        and not exists (
          select 1 from public.ads_campaign_qa_results as qa
          where qa.attempt_id = v_attempt.id and qa.phase = 'reconciliation'
            and qa.required
            and (qa.result <> 'match'
              or not ads_internal.is_nonempty_json_object(qa.readback_evidence))
        )
      into v_gate_qa_ready;
      if v_gate_qa_ready then
        v_to_status := 'verified';
        v_attempt_status := 'succeeded';
        v_verified_at := pg_catalog.clock_timestamp();
        perform pg_catalog.set_config('ads_internal.gate_2_finalizer', 'on', true);
        update public.ads_campaign_build_resources as resource
        set verified_at = v_verified_at, updated_at = v_verified_at
        where resource.build_id = v_build.id and resource.provider_resource_id is not null
          and exists (
            select 1 from public.ads_campaign_qa_results as qa
            where qa.attempt_id = v_attempt.id and qa.build_resource_id = resource.id
              and qa.phase = 'reconciliation' and qa.result = 'match'
              and ads_internal.is_nonempty_json_object(qa.readback_evidence)
          );
        perform pg_catalog.set_config('ads_internal.gate_2_finalizer', 'off', true);
      else
        v_to_status := 'delivery_unverified';
        v_attempt_status := 'reconciliation_required';
      end if;
    else
      v_to_status := 'delivery_unverified';
      v_attempt_status := 'reconciliation_required';
    end if;
  elsif v_attempt.gate = 1 then
    if p_provider_outcome in ('ambiguous', 'unknown') then
      v_to_status := 'reconciliation_required';
      v_attempt_status := 'reconciliation_required';
    elsif p_provider_outcome <> 'succeeded' then
      v_to_status := 'gate_1_failed';
      v_attempt_status := 'failed';
    else
      select
        exists (
          select 1 from public.ads_campaign_qa_results as qa
          where qa.attempt_id = v_attempt.id and qa.phase = 'gate_1' and qa.required
        )
        and not exists (
          select 1 from public.ads_campaign_qa_results as qa
          where qa.attempt_id = v_attempt.id and qa.phase = 'gate_1'
            and qa.required and qa.result <> 'match'
        )
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(v_attempt.intent -> 'resources') as item(value)
          left join public.ads_campaign_build_resources as resource
            on resource.build_id = v_build.id
           and resource.logical_resource_key = item.value ->> 'logical_resource_key'
          where resource.provider_resource_id is null
            or not exists (
              select 1 from public.ads_campaign_qa_results as qa
              where qa.attempt_id = v_attempt.id and qa.build_resource_id = resource.id
                and qa.phase = 'gate_1' and qa.required and qa.result = 'match'
            )
        )
      into v_gate_qa_ready;
      if v_gate_qa_ready then
        v_to_status := 'ready_to_deliver';
        v_attempt_status := 'succeeded';
      else
        v_to_status := 'qa_failed';
        v_attempt_status := 'failed';
      end if;
    end if;
  else
    if p_provider_outcome in ('ambiguous', 'unknown') then
      v_to_status := 'delivery_unverified';
      v_attempt_status := 'reconciliation_required';
    elsif p_provider_outcome <> 'succeeded' then
      v_to_status := 'gate_2_failed';
      v_attempt_status := 'failed';
    else
      select
        ads_internal.is_nonempty_json_object(p_final_readback_evidence)
        and exists (
          select 1
          from public.ads_campaign_qa_results as qa
          join public.ads_campaign_build_resources as resource on resource.id = qa.build_resource_id
          where qa.attempt_id = v_attempt.id and qa.phase = 'gate_2' and qa.required
            and qa.result = 'match'
            and ads_internal.is_nonempty_json_object(qa.readback_evidence)
            and resource.resource_type = 'campaign' and resource.provider_resource_id is not null
        )
        and not exists (
          select 1 from public.ads_campaign_qa_results as qa
          where qa.attempt_id = v_attempt.id and qa.phase = 'gate_2'
            and qa.required
            and (qa.result <> 'match'
              or not ads_internal.is_nonempty_json_object(qa.readback_evidence))
        )
      into v_gate_qa_ready;
      if v_gate_qa_ready then
        v_to_status := 'verified';
        v_attempt_status := 'succeeded';
        v_verified_at := pg_catalog.clock_timestamp();
        perform pg_catalog.set_config('ads_internal.gate_2_finalizer', 'on', true);
        update public.ads_campaign_build_resources as resource
        set verified_at = v_verified_at, updated_at = v_verified_at
        where resource.build_id = v_build.id and resource.provider_resource_id is not null
          and exists (
            select 1 from public.ads_campaign_qa_results as qa
            where qa.attempt_id = v_attempt.id and qa.build_resource_id = resource.id
              and qa.phase = 'gate_2' and qa.result = 'match'
              and ads_internal.is_nonempty_json_object(qa.readback_evidence)
          );
        perform pg_catalog.set_config('ads_internal.gate_2_finalizer', 'off', true);
      else
        v_to_status := 'delivery_unverified';
        v_attempt_status := 'reconciliation_required';
      end if;
    end if;
  end if;

  update public.ads_campaign_gate_attempts
  set status = v_attempt_status, released_at = pg_catalog.clock_timestamp(),
      provider_outcome = p_provider_outcome,
      outcome = outcome || pg_catalog.jsonb_build_object(
        'final_readback_evidence', coalesce(p_final_readback_evidence, '{}'::jsonb)
      ),
      updated_at = pg_catalog.clock_timestamp()
  where id = v_attempt.id;

  update public.ads_campaign_builds
  set status = v_to_status,
      gate_1_completed_at = case when v_attempt.gate = 1 then pg_catalog.clock_timestamp() else gate_1_completed_at end,
      gate_2_completed_at = case when v_attempt.gate = 2 then pg_catalog.clock_timestamp() else gate_2_completed_at end,
      delivered_at = case when v_to_status = 'verified' then v_verified_at else delivered_at end,
      verified_at = case when v_to_status = 'verified' then v_verified_at else verified_at end,
      final_readback_evidence = case
        when v_attempt.gate = 2
          and ads_internal.is_nonempty_json_object(p_final_readback_evidence)
          then p_final_readback_evidence
        when v_attempt.gate = 2 then '{}'::jsonb
        else final_readback_evidence
      end,
      updated_at = pg_catalog.clock_timestamp(), lock_version = lock_version + 1
  where id = v_build.id returning * into v_build;

  perform ads_internal.append_campaign_audit(
    v_build.plan_id, v_build.revision_id, v_build.id, v_attempt.id,
    'campaign_gate_claim_finalized', v_from_status, v_to_status,
    p_actor_id, p_trusted_ip, p_trusted_user_agent,
    pg_catalog.jsonb_build_object(
      'gate', v_attempt.gate, 'action', v_attempt.action,
      'provider_outcome', p_provider_outcome, 'attempt_status', v_attempt_status
    )
  );
  return v_build;
end;
$$;

create or replace function public.ads_create_campaign_monitoring_handoff(
  p_build_id bigint,
  p_expected_build_lock_version bigint,
  p_expected_revision_hash text,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
)
returns public.ads_campaign_monitoring_handoffs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_build public.ads_campaign_builds%rowtype;
  v_existing public.ads_campaign_monitoring_handoffs%rowtype;
  v_handoff public.ads_campaign_monitoring_handoffs%rowtype;
  v_revision public.ads_campaign_plan_revisions%rowtype;
  v_account public.ads_ad_accounts%rowtype;
  v_campaign public.ads_campaign_build_resources%rowtype;
  v_actor_name text;
  v_actor_email text;
  v_actor_role text;
  v_child_ids jsonb;
begin
  select actor.actor_name, actor.actor_email, actor.actor_role
  into strict v_actor_name, v_actor_email, v_actor_role
  from ads_internal.resolve_m04_actor(p_actor_id) as actor;

  select build.* into v_build
  from public.ads_campaign_builds as build where build.id = p_build_id for update;
  if not found then
    raise exception 'Campaign build was not found' using errcode = 'P0002';
  end if;
  if p_expected_revision_hash is distinct from v_build.revision_hash then
    raise exception 'Campaign build revision lock does not match' using errcode = '40001';
  end if;

  if p_expected_build_lock_version is null then
    raise exception 'Campaign build lock version is required for handoff' using errcode = '40001';
  end if;

  select handoff.* into v_existing
  from public.ads_campaign_monitoring_handoffs as handoff where handoff.build_id = v_build.id;
  if found then
    return v_existing;
  end if;

  if p_expected_build_lock_version is distinct from v_build.lock_version then
    raise exception 'Campaign build lock version is stale' using errcode = '40001';
  end if;
  if v_build.status <> 'verified' or v_build.verified_at is null
    or not ads_internal.is_nonempty_json_object(v_build.final_readback_evidence) then
    raise exception 'Monitoring handoff requires non-empty-object final readback evidence' using errcode = '55000';
  end if;

  select revision.* into strict v_revision
  from public.ads_campaign_plan_revisions as revision where revision.id = v_build.revision_id;
  select account.* into strict v_account
  from public.ads_ad_accounts as account where account.id = v_build.ad_account_id;
  select resource.* into v_campaign
  from public.ads_campaign_build_resources as resource
  where resource.build_id = v_build.id and resource.resource_type = 'campaign'
    and resource.provider_resource_id is not null and resource.verified_at is not null
  order by resource.id limit 1;
  if not found or (
    select pg_catalog.count(*) <> 1
    from public.ads_campaign_build_resources as resource
    where resource.build_id = v_build.id and resource.resource_type = 'campaign'
      and resource.provider_resource_id is not null and resource.verified_at is not null
  ) then
    raise exception 'Monitoring handoff requires one verified campaign mapping' using errcode = '55000';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(resource.provider_resource_id order by resource.logical_resource_key),
    '[]'::jsonb
  ) into v_child_ids
  from public.ads_campaign_build_resources as resource
  where resource.build_id = v_build.id and resource.resource_type <> 'campaign'
    and resource.provider_resource_id is not null and resource.verified_at is not null;

  insert into public.ads_campaign_monitoring_handoffs (
    build_id, client_id, platform, ad_account_id, provider_account_id,
    revision_id, revision_hash, provider_campaign_id, provider_child_ids,
    start_date, end_date, currency, allocated_budget,
    final_readback_evidence, verified_at
  ) values (
    v_build.id, v_revision.client_id, v_build.platform, v_build.ad_account_id,
    v_account.provider_account_id, v_revision.id, v_revision.payload_hash,
    v_campaign.provider_resource_id, v_child_ids, v_revision.start_date,
    v_revision.end_date, v_revision.currency, v_revision.allocated_budget,
    v_build.final_readback_evidence, v_build.verified_at
  ) returning * into v_handoff;

  update public.ads_campaign_builds
  set status = 'handoff_complete', updated_at = pg_catalog.clock_timestamp(),
      lock_version = lock_version + 1
  where id = v_build.id;
  update public.ads_campaign_plans
  set status = 'launched', updated_at = pg_catalog.clock_timestamp(),
      lock_version = lock_version + 1
  where id = v_build.plan_id and status = 'launch_in_progress';
  perform ads_internal.append_campaign_audit(
    v_build.plan_id, v_build.revision_id, v_build.id, null,
    'campaign_monitoring_handoff_created', 'verified', 'handoff_complete',
    p_actor_id, p_trusted_ip, p_trusted_user_agent,
    pg_catalog.jsonb_build_object(
      'handoff_id', v_handoff.id,
      'provider_campaign_id', v_handoff.provider_campaign_id
    )
  );
  return v_handoff;
end;
$$;

-- Preserve the M03 launch-eligibility RPC while allowing only delivery-
-- verified Google campaign builds into the post-launch change workflow.
create or replace function public.ads_get_campaign_launch_eligibility(
  p_account_id text,
  p_campaign_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  adoption_id uuid;
  verified_build_id bigint;
begin
  select adoption.id into adoption_id
  from public.ads_campaign_legacy_adoptions adoption
  where adoption.account_id = p_account_id
    and adoption.campaign_id = p_campaign_id
    and adoption.project_key = 'lt_paid_media'
    and adoption.revoked_at is null
  limit 1;

  if adoption_id is not null then
    return jsonb_build_object('eligible', true, 'source', 'legacy_adoption', 'sourceId', adoption_id::text);
  end if;

  if to_regclass('public.ads_campaign_build_resources') is not null
     and to_regclass('public.ads_campaign_builds') is not null
     and to_regclass('public.ads_ad_accounts') is not null then
    execute $query$
      select build.id
      from public.ads_campaign_build_resources resource
      join public.ads_campaign_builds build on build.id = resource.build_id
      join public.ads_ad_accounts account on account.id = build.ad_account_id
      where account.provider_account_id = $1
        and account.platform = 'google'
        and resource.resource_type = 'campaign'
        and resource.provider_resource_id = $2
        and resource.verified_at is not null
        and build.status in ('verified', 'handoff_complete')
      order by resource.verified_at desc
      limit 1
    $query$ into verified_build_id using p_account_id, p_campaign_id;
  end if;

  if verified_build_id is not null then
    return jsonb_build_object('eligible', true, 'source', 'verified_build', 'sourceId', verified_build_id::text);
  end if;
  return jsonb_build_object('eligible', false, 'source', 'unverified', 'sourceId', null);
end;
$$;

create trigger acpr_append_only before update or delete on public.ads_campaign_plan_revisions
for each row execute function ads_internal.reject_m04_row_mutation();
create trigger aca_append_only before update or delete on public.ads_campaign_approvals
for each row execute function ads_internal.reject_m04_row_mutation();
create trigger acbr_protect before insert or update or delete on public.ads_campaign_build_resources
for each row execute function ads_internal.protect_campaign_build_resource();
create trigger acqr_append_only before update or delete on public.ads_campaign_qa_results
for each row execute function ads_internal.reject_m04_row_mutation();
create trigger acaud_append_only before update or delete on public.ads_campaign_audit_events
for each row execute function ads_internal.reject_m04_row_mutation();
create trigger acmh_append_only before update or delete on public.ads_campaign_monitoring_handoffs
for each row execute function ads_internal.reject_m04_row_mutation();

alter table public.ads_ad_accounts enable row level security;
alter table public.ads_budget_packages enable row level security;
alter table public.ads_campaign_plans enable row level security;
alter table public.ads_campaign_plan_revisions enable row level security;
alter table public.ads_campaign_approvals enable row level security;
alter table public.ads_campaign_builds enable row level security;
alter table public.ads_campaign_build_resources enable row level security;
alter table public.ads_campaign_gate_attempts enable row level security;
alter table public.ads_campaign_qa_results enable row level security;
alter table public.ads_campaign_audit_events enable row level security;
alter table public.ads_campaign_monitoring_handoffs enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ads_ad_accounts','ads_budget_packages','ads_campaign_plans','ads_campaign_plan_revisions',
    'ads_campaign_approvals','ads_campaign_builds','ads_campaign_build_resources',
    'ads_campaign_gate_attempts','ads_campaign_qa_results','ads_campaign_audit_events',
    'ads_campaign_monitoring_handoffs'
  ] loop
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant select on table public.%I to service_role', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select ads_internal.is_approved_operator()))',
      table_name || '_approved_operator_select', table_name
    );
  end loop;
end;
$$;

revoke all on function ads_internal.is_approved_operator() from public, anon;
revoke all on function ads_internal.reject_m04_row_mutation() from public, anon, authenticated;
revoke all on function ads_internal.is_nonempty_json_object(jsonb) from public, anon, authenticated, service_role;
revoke all on function ads_internal.protect_campaign_build_resource() from public, anon, authenticated, service_role;
revoke all on function ads_internal.resolve_m04_actor(uuid) from public, anon, authenticated, service_role;
revoke all on function ads_internal.append_campaign_audit(bigint, bigint, bigint, bigint, text, text, text, uuid, inet, text, jsonb) from public, anon, authenticated, service_role;
grant usage on schema ads_internal to authenticated, service_role;
grant execute on function ads_internal.is_approved_operator() to authenticated, service_role;

revoke all on function public.ads_create_campaign_plan_revision(bigint, bigint, jsonb, text, text, uuid, inet, text) from public, anon, authenticated, service_role;
revoke all on function public.ads_reserve_campaign_budget(bigint, bigint, text, bigint, uuid, inet, text) from public, anon, authenticated, service_role;
revoke all on function public.ads_release_campaign_budget(bigint, bigint, text, uuid, inet, text) from public, anon, authenticated, service_role;
revoke all on function public.ads_approve_campaign_plan_revision(bigint, bigint, text, bigint, timestamptz, text, text, uuid, inet, text) from public, anon, authenticated, service_role;
revoke all on function public.ads_transition_campaign_plan(bigint, bigint, text, text, text, uuid, inet, text) from public, anon, authenticated, service_role;
revoke all on function public.ads_acquire_campaign_gate_claim(bigint, smallint, text, text, bigint, text, integer, jsonb, uuid, inet, text) from public, anon, authenticated, service_role;
revoke all on function public.ads_acquire_campaign_retry_claim(bigint, bigint, text, text, integer, jsonb, uuid, inet, text) from public, anon, authenticated, service_role;
revoke all on function public.ads_record_campaign_resource_outcome(bigint, uuid, text, text, text, text, jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.ads_append_campaign_qa_result(bigint, uuid, bigint, text, text, boolean, jsonb, jsonb, text, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.ads_finalize_campaign_gate_claim(bigint, uuid, text, jsonb, uuid, inet, text) from public, anon, authenticated, service_role;
revoke all on function public.ads_create_campaign_monitoring_handoff(bigint, bigint, text, uuid, inet, text) from public, anon, authenticated, service_role;
revoke all on function public.ads_get_campaign_launch_eligibility(text, text) from public, anon, authenticated;

grant execute on function public.ads_create_campaign_plan_revision(bigint, bigint, jsonb, text, text, uuid, inet, text) to service_role;
grant execute on function public.ads_reserve_campaign_budget(bigint, bigint, text, bigint, uuid, inet, text) to service_role;
grant execute on function public.ads_release_campaign_budget(bigint, bigint, text, uuid, inet, text) to service_role;
grant execute on function public.ads_approve_campaign_plan_revision(bigint, bigint, text, bigint, timestamptz, text, text, uuid, inet, text) to service_role;
grant execute on function public.ads_transition_campaign_plan(bigint, bigint, text, text, text, uuid, inet, text) to service_role;
grant execute on function public.ads_acquire_campaign_gate_claim(bigint, smallint, text, text, bigint, text, integer, jsonb, uuid, inet, text) to service_role;
grant execute on function public.ads_acquire_campaign_retry_claim(bigint, bigint, text, text, integer, jsonb, uuid, inet, text) to service_role;
grant execute on function public.ads_record_campaign_resource_outcome(bigint, uuid, text, text, text, text, jsonb, jsonb) to service_role;
grant execute on function public.ads_append_campaign_qa_result(bigint, uuid, bigint, text, text, boolean, jsonb, jsonb, text, text, text, jsonb) to service_role;
grant execute on function public.ads_finalize_campaign_gate_claim(bigint, uuid, text, jsonb, uuid, inet, text) to service_role;
grant execute on function public.ads_create_campaign_monitoring_handoff(bigint, bigint, text, uuid, inet, text) to service_role;
grant execute on function public.ads_get_campaign_launch_eligibility(text, text) to service_role;

-- M04 Stage 1 safety hardening: one active lease per build and one lock order
-- (build -> plan) for every path that operates on an existing build.
drop index public.acga_build_gate_active_idx;
create unique index acga_build_active_idx on public.ads_campaign_gate_attempts(build_id)
  where released_at is null and status = 'claimed';

-- Final public claim entry points delegate to the hardened build -> plan
-- implementations declared before the original Stage 1 bodies.
create or replace function public.ads_acquire_campaign_gate_claim(
  p_build_id bigint, p_gate smallint, p_action text,
  p_request_idempotency_key text, p_expected_revision_id bigint,
  p_expected_revision_hash text, p_claim_ttl_seconds integer, p_intent jsonb,
  p_actor_id uuid, p_trusted_ip inet, p_trusted_user_agent text
)
returns public.ads_campaign_gate_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.ads_campaign_gate_attempts%rowtype;
begin
  select * into strict v_attempt
  from ads_internal.acquire_campaign_gate_claim_hardened(
    p_build_id, p_gate, p_action, p_request_idempotency_key,
    p_expected_revision_id, p_expected_revision_hash, p_claim_ttl_seconds,
    p_intent, p_actor_id, p_trusted_ip, p_trusted_user_agent
  );
  return v_attempt;
end;
$$;

create or replace function public.ads_acquire_campaign_retry_claim(
  p_build_id bigint, p_prior_attempt_id bigint, p_request_idempotency_key text,
  p_expected_revision_hash text, p_claim_ttl_seconds integer, p_intent jsonb,
  p_actor_id uuid, p_trusted_ip inet, p_trusted_user_agent text
)
returns public.ads_campaign_gate_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.ads_campaign_gate_attempts%rowtype;
begin
  select * into strict v_attempt
  from ads_internal.acquire_campaign_retry_claim_hardened(
    p_build_id, p_prior_attempt_id, p_request_idempotency_key,
    p_expected_revision_hash, p_claim_ttl_seconds, p_intent,
    p_actor_id, p_trusted_ip, p_trusted_user_agent
  );
  return v_attempt;
end;
$$;

revoke all on function ads_internal.acquire_campaign_gate_claim_hardened(
  bigint, smallint, text, text, bigint, text, integer, jsonb, uuid, inet, text
) from public, anon, authenticated, service_role;
revoke all on function ads_internal.acquire_campaign_retry_claim_hardened(
  bigint, bigint, text, text, integer, jsonb, uuid, inet, text
) from public, anon, authenticated, service_role;

create or replace function ads_internal.campaign_gate_1_full_intent_ready(
  p_build_id bigint,
  p_current_attempt_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.ads_campaign_build_resources as resource
    left join lateral (
      select attempt.id, attempt.attempt_number, attempt.status
      from public.ads_campaign_gate_attempts as attempt
      where attempt.build_id = resource.build_id
        and attempt.gate = 1 and attempt.action in ('create', 'retry')
        and exists (
          select 1 from pg_catalog.jsonb_array_elements(attempt.intent -> 'resources') as item(value)
          where item.value ->> 'logical_resource_key' = resource.logical_resource_key
            and item.value ->> 'resource_type' = resource.resource_type
        )
      order by attempt.attempt_number desc, attempt.id desc
      limit 1
    ) as mutation on true
    left join lateral (
      select pg_catalog.count(*) > 0 as has_required_fields,
        pg_catalog.bool_and(
          field_evidence.result = 'match'
          and ads_internal.is_nonempty_json_object(field_evidence.readback_evidence)
        ) as all_required_fields_match
      from (
        select distinct on (qa.field_path)
          qa.field_path, qa.result, qa.readback_evidence
        from public.ads_campaign_qa_results as qa
        join public.ads_campaign_gate_attempts as evidence_attempt
          on evidence_attempt.id = qa.attempt_id
        where qa.build_resource_id = resource.id and qa.required
          and evidence_attempt.build_id = resource.build_id
          and evidence_attempt.gate = 1
          and exists (
            select 1
            from pg_catalog.jsonb_array_elements(evidence_attempt.intent -> 'resources') as item(value)
            where item.value ->> 'logical_resource_key' = resource.logical_resource_key
              and item.value ->> 'resource_type' = resource.resource_type
          )
          and (
            (
              evidence_attempt.id = mutation.id
              and evidence_attempt.action in ('create', 'retry')
              and qa.phase = 'gate_1'
            )
            or (
              evidence_attempt.action = 'reconcile'
              and evidence_attempt.attempt_number > mutation.attempt_number
              and qa.phase = 'reconciliation'
            )
          )
          and (
            qa.result <> 'match'
            or evidence_attempt.status = 'succeeded'
            or evidence_attempt.id = p_current_attempt_id
          )
        order by qa.field_path, evidence_attempt.attempt_number desc, qa.id desc
      ) as field_evidence
    ) as decisive_evidence on true
    where resource.build_id = p_build_id
      and (
        mutation.id is null
        or resource.provider_resource_id is null
        or decisive_evidence.has_required_fields is distinct from true
        or decisive_evidence.all_required_fields_match is distinct from true
      )
  );
$$;
revoke all on function ads_internal.campaign_gate_1_full_intent_ready(bigint, bigint)
  from public, anon, authenticated, service_role;

create or replace function public.ads_record_campaign_resource_outcome(
  p_attempt_id bigint,
  p_claim_token uuid,
  p_logical_resource_key text,
  p_outcome text,
  p_provider_resource_id text,
  p_provider_parent_resource_id text,
  p_provider_response jsonb,
  p_error_details jsonb
)
returns public.ads_campaign_build_resources
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.ads_campaign_gate_attempts%rowtype;
  v_build public.ads_campaign_builds%rowtype;
  v_plan public.ads_campaign_plans%rowtype;
  v_resource public.ads_campaign_build_resources%rowtype;
  v_expected_build_status text;
  v_to_status text;
begin
  select attempt.* into v_attempt
  from public.ads_campaign_gate_attempts as attempt where attempt.id = p_attempt_id;
  if not found then
    raise exception 'Gate attempt was not found' using errcode = 'P0002';
  end if;
  select build.* into strict v_build
  from public.ads_campaign_builds as build where build.id = v_attempt.build_id for update;
  select plan.* into strict v_plan
  from public.ads_campaign_plans as plan where plan.id = v_build.plan_id for update;
  select attempt.* into strict v_attempt
  from public.ads_campaign_gate_attempts as attempt where attempt.id = p_attempt_id for update;
  if v_attempt.claim_token is distinct from p_claim_token
    or v_attempt.status <> 'claimed' or v_attempt.released_at is not null
    or v_attempt.claim_expires_at <= pg_catalog.clock_timestamp() then
    raise exception 'Gate claim is not active' using errcode = '55000';
  end if;
  v_expected_build_status := case when v_attempt.gate = 1 then 'gate_1_in_progress' else 'gate_2_in_progress' end;
  if v_build.status <> v_expected_build_status or v_plan.status <> 'launch_in_progress'
    or v_plan.active_revision_id is distinct from v_build.revision_id
    or v_plan.approved_revision_id is distinct from v_build.revision_id
    or v_plan.approved_revision_hash is distinct from v_build.revision_hash then
    raise exception 'Campaign build is not in the active state for this gate attempt' using errcode = '55000';
  end if;
  if pg_catalog.btrim(coalesce(p_logical_resource_key, '')) = '' then
    raise exception 'Logical resource key is required' using errcode = '22023';
  end if;
  if p_outcome is null or p_outcome not in ('succeeded', 'failed', 'ambiguous', 'unknown', 'missing', 'found') then
    raise exception 'Provider resource outcome is invalid' using errcode = '22023';
  end if;
  select resource.* into v_resource
  from public.ads_campaign_build_resources as resource
  where resource.build_id = v_build.id
    and resource.logical_resource_key = p_logical_resource_key for update;
  if not found then
    raise exception 'Logical resource was not declared by the persisted intent' using errcode = 'P0002';
  end if;
  if v_attempt.gate = 1 and not exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_attempt.intent -> 'resources') as item(value)
    where item.value ->> 'logical_resource_key' = v_resource.logical_resource_key
      and item.value ->> 'resource_type' = v_resource.resource_type
  ) then
    raise exception 'Logical resource is outside the gate attempt intent' using errcode = '22023';
  end if;
  if v_resource.provider_resource_id is not null
    and p_provider_resource_id is not null
    and v_resource.provider_resource_id <> p_provider_resource_id then
    raise exception 'A non-null provider resource ID is immutable' using errcode = '55000';
  end if;
  if v_resource.provider_parent_resource_id is not null
    and p_provider_parent_resource_id is not null
    and v_resource.provider_parent_resource_id <> p_provider_parent_resource_id then
    raise exception 'A non-null provider parent resource ID is immutable' using errcode = '55000';
  end if;
  if v_resource.verified_at is not null then
    raise exception 'A verified campaign resource cannot regress' using errcode = '55000';
  end if;
  update public.ads_campaign_build_resources
  set provider_resource_id = coalesce(provider_resource_id, nullif(pg_catalog.btrim(p_provider_resource_id), '')),
      provider_parent_resource_id = coalesce(provider_parent_resource_id, nullif(pg_catalog.btrim(p_provider_parent_resource_id), '')),
      provider_response = coalesce(p_provider_response, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        '_last_attempt_id', v_attempt.id, '_last_outcome', p_outcome
      ), updated_at = pg_catalog.clock_timestamp()
  where id = v_resource.id returning * into v_resource;
  update public.ads_campaign_gate_attempts
  set provider_outcome = p_outcome,
      outcome = outcome || pg_catalog.jsonb_build_object(p_logical_resource_key, coalesce(p_provider_response, '{}'::jsonb)),
      error_details = coalesce(p_error_details, error_details),
      updated_at = pg_catalog.clock_timestamp()
  where id = v_attempt.id;
  if p_outcome in ('ambiguous', 'unknown') then
    v_to_status := case when v_attempt.gate = 1 then 'reconciliation_required' else 'delivery_unverified' end;
    update public.ads_campaign_gate_attempts
    set status = 'reconciliation_required', released_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    where id = v_attempt.id;
    update public.ads_campaign_builds
    set status = v_to_status, updated_at = pg_catalog.clock_timestamp(),
        lock_version = lock_version + 1
    where id = v_build.id and status = v_expected_build_status;
    if not found then
      raise exception 'Campaign build state changed while resource outcome was recorded' using errcode = '40001';
    end if;
    insert into public.ads_campaign_audit_events (
      plan_id, revision_id, build_id, attempt_id, event_type, from_status, to_status,
      actor_id, actor_name, trusted_ip, trusted_user_agent, metadata, created_at
    ) values (
      v_build.plan_id, v_build.revision_id, v_build.id, v_attempt.id,
      'campaign_resource_outcome_ambiguous', v_expected_build_status, v_to_status,
      v_attempt.actor_id, v_attempt.actor_name, v_attempt.trusted_ip, v_attempt.trusted_user_agent,
      pg_catalog.jsonb_build_object(
        'logical_resource_key', p_logical_resource_key,
        'provider_outcome', p_outcome
      ), pg_catalog.clock_timestamp()
    );
  end if;
  return v_resource;
end;
$$;

create or replace function public.ads_finalize_campaign_gate_claim(
  p_attempt_id bigint,
  p_claim_token uuid,
  p_provider_outcome text,
  p_final_readback_evidence jsonb,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
)
returns public.ads_campaign_builds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.ads_campaign_gate_attempts%rowtype;
  v_build public.ads_campaign_builds%rowtype;
  v_plan public.ads_campaign_plans%rowtype;
  v_actor_name text;
  v_actor_email text;
  v_actor_role text;
  v_from_status text;
  v_to_status text;
  v_attempt_status text;
  v_current_intent_ready boolean := false;
  v_full_intent_ready boolean := false;
  v_reconciliation_all_resolved boolean := false;
  v_gate_qa_ready boolean := false;
  v_verified_at timestamptz;
begin
  select actor.actor_name, actor.actor_email, actor.actor_role
  into strict v_actor_name, v_actor_email, v_actor_role
  from ads_internal.resolve_m04_actor(p_actor_id) as actor;
  if p_provider_outcome is null or p_provider_outcome not in ('succeeded', 'failed', 'ambiguous', 'unknown', 'missing') then
    raise exception 'Gate provider outcome is invalid' using errcode = '22023';
  end if;
  select attempt.* into v_attempt
  from public.ads_campaign_gate_attempts as attempt where attempt.id = p_attempt_id;
  if not found then
    raise exception 'Gate attempt was not found' using errcode = 'P0002';
  end if;
  select build.* into strict v_build
  from public.ads_campaign_builds as build where build.id = v_attempt.build_id for update;
  select plan.* into strict v_plan
  from public.ads_campaign_plans as plan where plan.id = v_build.plan_id for update;
  select attempt.* into strict v_attempt
  from public.ads_campaign_gate_attempts as attempt where attempt.id = p_attempt_id for update;
  if v_attempt.claim_token is distinct from p_claim_token
    or v_attempt.status <> 'claimed' or v_attempt.released_at is not null
    or v_attempt.claim_expires_at <= pg_catalog.clock_timestamp() then
    raise exception 'Gate claim is not active' using errcode = '55000';
  end if;
  v_from_status := case when v_attempt.gate = 1 then 'gate_1_in_progress' else 'gate_2_in_progress' end;
  if v_build.status <> v_from_status or v_plan.status <> 'launch_in_progress'
    or v_plan.active_revision_id is distinct from v_build.revision_id
    or v_plan.approved_revision_id is distinct from v_build.revision_id
    or v_plan.approved_revision_hash is distinct from v_build.revision_hash then
    raise exception 'Campaign build is not in the active state for this gate attempt' using errcode = '55000';
  end if;

  if v_attempt.gate = 1 and v_attempt.action = 'reconcile' then
    select not exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_attempt.intent -> 'resources') as item(value)
      left join public.ads_campaign_build_resources as resource
        on resource.build_id = v_build.id
       and resource.logical_resource_key = item.value ->> 'logical_resource_key'
       and resource.resource_type = item.value ->> 'resource_type'
      left join lateral (
        select pg_catalog.count(*) > 0 as has_required_fields,
          pg_catalog.bool_and(
            ads_internal.is_nonempty_json_object(field_qa.readback_evidence)
            and field_qa.result = case
              when resource.provider_resource_id is null then 'missing'
              else 'match'
            end
          ) as all_required_fields_resolved
        from (
          select distinct on (qa.field_path)
            qa.field_path, qa.result, qa.readback_evidence
          from public.ads_campaign_qa_results as qa
          where qa.attempt_id = v_attempt.id
            and qa.build_resource_id = resource.id
            and qa.phase = 'reconciliation' and qa.required
          order by qa.field_path, qa.id desc
        ) as field_qa
      ) as reconciliation_qa on true
      where resource.id is null
        or reconciliation_qa.has_required_fields is distinct from true
        or reconciliation_qa.all_required_fields_resolved is distinct from true
    ) into v_reconciliation_all_resolved;
    select ads_internal.campaign_gate_1_full_intent_ready(v_build.id, v_attempt.id)
    into v_full_intent_ready;
    if p_provider_outcome in ('succeeded', 'missing')
      and ads_internal.is_nonempty_json_object(p_final_readback_evidence)
      and v_full_intent_ready then
      v_to_status := 'ready_to_deliver';
      v_attempt_status := 'succeeded';
    elsif p_provider_outcome in ('succeeded', 'missing')
      and ads_internal.is_nonempty_json_object(p_final_readback_evidence)
      and v_reconciliation_all_resolved then
      v_to_status := 'gate_1_failed';
      v_attempt_status := 'succeeded';
    else
      v_to_status := 'reconciliation_required';
      v_attempt_status := 'reconciliation_required';
    end if;
  elsif v_attempt.gate = 1 then
    if p_provider_outcome in ('ambiguous', 'unknown') then
      v_to_status := 'reconciliation_required';
      v_attempt_status := 'reconciliation_required';
    elsif p_provider_outcome <> 'succeeded' then
      v_to_status := 'gate_1_failed';
      v_attempt_status := 'failed';
    else
      select not exists (
        select 1
        from pg_catalog.jsonb_array_elements(v_attempt.intent -> 'resources') as item(value)
        left join public.ads_campaign_build_resources as resource
          on resource.build_id = v_build.id
         and resource.logical_resource_key = item.value ->> 'logical_resource_key'
         and resource.resource_type = item.value ->> 'resource_type'
        left join lateral (
          select pg_catalog.count(*) > 0 as has_required_fields,
            pg_catalog.bool_and(
              field_qa.result = 'match'
              and ads_internal.is_nonempty_json_object(field_qa.readback_evidence)
            ) as all_required_fields_match
          from (
            select distinct on (qa.field_path)
              qa.field_path, qa.result, qa.readback_evidence
            from public.ads_campaign_qa_results as qa
            where qa.attempt_id = v_attempt.id and qa.build_resource_id = resource.id
              and qa.phase = 'gate_1' and qa.required
            order by qa.field_path, qa.id desc
          ) as field_qa
        ) as current_qa on true
        where resource.id is null or resource.provider_resource_id is null
          or current_qa.has_required_fields is distinct from true
          or current_qa.all_required_fields_match is distinct from true
      ) into v_current_intent_ready;
      select ads_internal.campaign_gate_1_full_intent_ready(v_build.id, v_attempt.id)
      into v_full_intent_ready;
      if not v_current_intent_ready then
        v_to_status := 'qa_failed';
        v_attempt_status := 'failed';
      elsif v_full_intent_ready then
        v_to_status := 'ready_to_deliver';
        v_attempt_status := 'succeeded';
      elsif v_attempt.action = 'retry' then
        v_to_status := 'gate_1_failed';
        v_attempt_status := 'succeeded';
      else
        v_to_status := 'qa_failed';
        v_attempt_status := 'failed';
      end if;
    end if;
  elsif v_attempt.action = 'reconcile' then
    if p_provider_outcome = 'succeeded' then
      select ads_internal.is_nonempty_json_object(p_final_readback_evidence)
        and exists (
          select 1 from public.ads_campaign_qa_results as qa
          join public.ads_campaign_build_resources as resource on resource.id = qa.build_resource_id
          where qa.attempt_id = v_attempt.id and qa.phase = 'reconciliation'
            and qa.required and qa.result = 'match'
            and ads_internal.is_nonempty_json_object(qa.readback_evidence)
            and resource.resource_type = 'campaign' and resource.provider_resource_id is not null
        )
        and not exists (
          select 1 from public.ads_campaign_qa_results as qa
          where qa.attempt_id = v_attempt.id and qa.phase = 'reconciliation'
            and qa.required and (qa.result <> 'match'
              or not ads_internal.is_nonempty_json_object(qa.readback_evidence))
        ) into v_gate_qa_ready;
      if v_gate_qa_ready then
        v_to_status := 'verified';
        v_attempt_status := 'succeeded';
        v_verified_at := pg_catalog.clock_timestamp();
      else
        v_to_status := 'delivery_unverified';
        v_attempt_status := 'reconciliation_required';
      end if;
    else
      v_to_status := 'delivery_unverified';
      v_attempt_status := 'reconciliation_required';
    end if;
  else
    if p_provider_outcome in ('ambiguous', 'unknown') then
      v_to_status := 'delivery_unverified';
      v_attempt_status := 'reconciliation_required';
    elsif p_provider_outcome <> 'succeeded' then
      v_to_status := 'gate_2_failed';
      v_attempt_status := 'failed';
    else
      select ads_internal.is_nonempty_json_object(p_final_readback_evidence)
        and exists (
          select 1 from public.ads_campaign_qa_results as qa
          join public.ads_campaign_build_resources as resource on resource.id = qa.build_resource_id
          where qa.attempt_id = v_attempt.id and qa.phase = 'gate_2' and qa.required
            and qa.result = 'match'
            and ads_internal.is_nonempty_json_object(qa.readback_evidence)
            and resource.resource_type = 'campaign' and resource.provider_resource_id is not null
        )
        and not exists (
          select 1 from public.ads_campaign_qa_results as qa
          where qa.attempt_id = v_attempt.id and qa.phase = 'gate_2'
            and qa.required and (qa.result <> 'match'
              or not ads_internal.is_nonempty_json_object(qa.readback_evidence))
        ) into v_gate_qa_ready;
      if v_gate_qa_ready then
        v_to_status := 'verified';
        v_attempt_status := 'succeeded';
        v_verified_at := pg_catalog.clock_timestamp();
      else
        v_to_status := 'delivery_unverified';
        v_attempt_status := 'reconciliation_required';
      end if;
    end if;
  end if;

  if v_to_status = 'verified' then
    perform pg_catalog.set_config('ads_internal.gate_2_finalizer', 'on', true);
    update public.ads_campaign_build_resources as resource
    set verified_at = v_verified_at, updated_at = v_verified_at
    where resource.build_id = v_build.id and resource.provider_resource_id is not null
      and exists (
        select 1 from public.ads_campaign_qa_results as qa
        where qa.attempt_id = v_attempt.id and qa.build_resource_id = resource.id
          and qa.phase = case when v_attempt.action = 'reconcile' then 'reconciliation' else 'gate_2' end
          and qa.required and qa.result = 'match'
          and ads_internal.is_nonempty_json_object(qa.readback_evidence)
      );
    perform pg_catalog.set_config('ads_internal.gate_2_finalizer', 'off', true);
  end if;
  update public.ads_campaign_gate_attempts
  set status = v_attempt_status, released_at = pg_catalog.clock_timestamp(),
      provider_outcome = p_provider_outcome,
      outcome = outcome || pg_catalog.jsonb_build_object(
        'final_readback_evidence', coalesce(p_final_readback_evidence, '{}'::jsonb)
      ), updated_at = pg_catalog.clock_timestamp()
  where id = v_attempt.id;
  update public.ads_campaign_builds
  set status = v_to_status,
      gate_1_completed_at = case when v_attempt.gate = 1 then pg_catalog.clock_timestamp() else gate_1_completed_at end,
      gate_2_completed_at = case when v_attempt.gate = 2 then pg_catalog.clock_timestamp() else gate_2_completed_at end,
      delivered_at = case when v_to_status = 'verified' then v_verified_at else delivered_at end,
      verified_at = case when v_to_status = 'verified' then v_verified_at else verified_at end,
      final_readback_evidence = case
        when v_attempt.gate = 2 and ads_internal.is_nonempty_json_object(p_final_readback_evidence)
          then p_final_readback_evidence
        when v_attempt.gate = 2 then '{}'::jsonb
        else final_readback_evidence
      end,
      updated_at = pg_catalog.clock_timestamp(), lock_version = lock_version + 1
  where id = v_build.id and status = v_from_status returning * into v_build;
  if not found then
    raise exception 'Campaign build state changed while gate claim was finalized' using errcode = '40001';
  end if;
  perform ads_internal.append_campaign_audit(
    v_build.plan_id, v_build.revision_id, v_build.id, v_attempt.id,
    'campaign_gate_claim_finalized', v_from_status, v_to_status,
    p_actor_id, p_trusted_ip, p_trusted_user_agent,
    pg_catalog.jsonb_build_object(
      'gate', v_attempt.gate, 'action', v_attempt.action,
      'provider_outcome', p_provider_outcome, 'attempt_status', v_attempt_status
    )
  );
  return v_build;
end;
$$;

create or replace function public.ads_create_campaign_monitoring_handoff(
  p_build_id bigint,
  p_expected_build_lock_version bigint,
  p_expected_revision_hash text,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
)
returns public.ads_campaign_monitoring_handoffs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_build public.ads_campaign_builds%rowtype;
  v_plan public.ads_campaign_plans%rowtype;
  v_existing public.ads_campaign_monitoring_handoffs%rowtype;
  v_handoff public.ads_campaign_monitoring_handoffs%rowtype;
  v_revision public.ads_campaign_plan_revisions%rowtype;
  v_campaign public.ads_campaign_build_resources%rowtype;
  v_actor_name text;
  v_actor_email text;
  v_actor_role text;
  v_child_ids jsonb;
  v_plan_update_count integer;
begin
  select actor.actor_name, actor.actor_email, actor.actor_role
  into strict v_actor_name, v_actor_email, v_actor_role
  from ads_internal.resolve_m04_actor(p_actor_id) as actor;
  select build.* into v_build
  from public.ads_campaign_builds as build where build.id = p_build_id for update;
  if not found then
    raise exception 'Campaign build was not found' using errcode = 'P0002';
  end if;
  if p_expected_revision_hash is distinct from v_build.revision_hash then
    raise exception 'Campaign build revision lock does not match' using errcode = '40001';
  end if;
  if p_expected_build_lock_version is null then
    raise exception 'Campaign build lock version is required for handoff' using errcode = '40001';
  end if;
  select plan.* into strict v_plan
  from public.ads_campaign_plans as plan where plan.id = v_build.plan_id for update;
  select handoff.* into v_existing
  from public.ads_campaign_monitoring_handoffs as handoff where handoff.build_id = v_build.id;
  if found then
    return v_existing;
  end if;
  if p_expected_build_lock_version is distinct from v_build.lock_version then
    raise exception 'Campaign build lock version is stale' using errcode = '40001';
  end if;
  if v_build.status <> 'verified' or v_build.verified_at is null
    or not ads_internal.is_nonempty_json_object(v_build.final_readback_evidence) then
    raise exception 'Monitoring handoff requires non-empty-object final readback evidence' using errcode = '55000';
  end if;
  select revision.* into strict v_revision
  from public.ads_campaign_plan_revisions as revision
  where revision.id = v_build.revision_id and revision.plan_id = v_build.plan_id;
  if v_plan.status is distinct from 'launch_in_progress'
    or v_plan.client_id is distinct from v_revision.client_id
    or v_plan.ad_account_id is distinct from v_revision.ad_account_id
    or v_plan.budget_package_id is distinct from v_revision.budget_package_id
    or v_plan.platform is distinct from v_revision.platform
    or v_plan.active_revision_id is distinct from v_revision.id
    or v_plan.approved_revision_id is distinct from v_revision.id
    or v_plan.approved_revision_hash is distinct from v_revision.payload_hash
    or v_build.revision_hash is distinct from v_revision.payload_hash
    or v_build.ad_account_id is distinct from v_revision.ad_account_id
    or v_build.budget_package_id is distinct from v_revision.budget_package_id
    or v_build.platform is distinct from v_revision.platform then
    raise exception 'Monitoring handoff requires matching immutable build, revision, and launch plan snapshots' using errcode = '55000';
  end if;
  select resource.* into v_campaign
  from public.ads_campaign_build_resources as resource
  where resource.build_id = v_build.id and resource.resource_type = 'campaign'
    and resource.provider_resource_id is not null and resource.verified_at is not null
  order by resource.id limit 1;
  if not found or (
    select pg_catalog.count(*) <> 1
    from public.ads_campaign_build_resources as resource
    where resource.build_id = v_build.id and resource.resource_type = 'campaign'
      and resource.provider_resource_id is not null and resource.verified_at is not null
  ) then
    raise exception 'Monitoring handoff requires one verified campaign mapping' using errcode = '55000';
  end if;
  select coalesce(
    pg_catalog.jsonb_agg(resource.provider_resource_id order by resource.logical_resource_key),
    '[]'::jsonb
  ) into v_child_ids
  from public.ads_campaign_build_resources as resource
  where resource.build_id = v_build.id and resource.resource_type <> 'campaign'
    and resource.provider_resource_id is not null and resource.verified_at is not null;
  insert into public.ads_campaign_monitoring_handoffs (
    build_id, client_id, platform, ad_account_id, provider_account_id,
    revision_id, revision_hash, provider_campaign_id, provider_child_ids,
    start_date, end_date, currency, allocated_budget,
    final_readback_evidence, verified_at
  ) values (
    v_build.id, v_revision.client_id, v_revision.platform, v_revision.ad_account_id,
    v_revision.provider_account_id, v_revision.id, v_revision.payload_hash,
    v_campaign.provider_resource_id, v_child_ids, v_revision.start_date,
    v_revision.end_date, v_revision.currency, v_revision.allocated_budget,
    v_build.final_readback_evidence, v_build.verified_at
  ) returning * into v_handoff;
  update public.ads_campaign_plans
  set status = 'launched', updated_at = pg_catalog.clock_timestamp(),
      lock_version = lock_version + 1
  where id = v_plan.id and status = 'launch_in_progress'
    and active_revision_id = v_revision.id
    and approved_revision_id = v_revision.id
    and approved_revision_hash = v_revision.payload_hash;
  get diagnostics v_plan_update_count = row_count;
  if v_plan_update_count <> 1 then
    raise exception 'Campaign plan changed while monitoring handoff was created' using errcode = '40001';
  end if;
  update public.ads_campaign_builds
  set status = 'handoff_complete', updated_at = pg_catalog.clock_timestamp(),
      lock_version = lock_version + 1
  where id = v_build.id and status = 'verified';
  if not found then
    raise exception 'Campaign build changed while monitoring handoff was created' using errcode = '40001';
  end if;
  perform ads_internal.append_campaign_audit(
    v_build.plan_id, v_build.revision_id, v_build.id, null,
    'campaign_monitoring_handoff_created', 'verified', 'handoff_complete',
    p_actor_id, p_trusted_ip, p_trusted_user_agent,
    pg_catalog.jsonb_build_object(
      'handoff_id', v_handoff.id,
      'provider_campaign_id', v_handoff.provider_campaign_id
    )
  );
  return v_handoff;
end;
$$;

create or replace function public.ads_approve_campaign_plan_revision(
  p_plan_id bigint,
  p_revision_id bigint,
  p_expected_revision_hash text,
  p_expected_plan_lock_version bigint,
  p_approval_expires_at timestamptz,
  p_request_idempotency_key text,
  p_comment text,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
)
returns public.ads_campaign_builds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pre_status text;
  v_pre_build_id bigint;
  v_plan public.ads_campaign_plans%rowtype;
  v_revision public.ads_campaign_plan_revisions%rowtype;
  v_account public.ads_ad_accounts%rowtype;
  v_package public.ads_budget_packages%rowtype;
  v_current_approval public.ads_campaign_approvals%rowtype;
  v_existing_approval public.ads_campaign_approvals%rowtype;
  v_new_approval public.ads_campaign_approvals%rowtype;
  v_build public.ads_campaign_builds%rowtype;
  v_actor_name text;
  v_actor_email text;
  v_actor_role text;
  v_superseded_approval_id bigint;
begin
  select actor.actor_name, actor.actor_email, actor.actor_role
  into strict v_actor_name, v_actor_email, v_actor_role
  from ads_internal.resolve_m04_actor(p_actor_id) as actor;

  if pg_catalog.btrim(coalesce(p_request_idempotency_key, '')) = '' then
    raise exception 'Approval idempotency key is required' using errcode = '22023';
  end if;
  if p_expected_plan_lock_version is null then
    raise exception 'Campaign plan lock version is stale' using errcode = '40001';
  end if;

  -- Exact immutable request identity is resolved before expiry, CAS, or state.
  select approval.* into v_existing_approval
  from public.ads_campaign_approvals as approval
  where approval.plan_id = p_plan_id
    and approval.request_idempotency_key = p_request_idempotency_key;
  if found then
    if v_existing_approval.revision_id is distinct from p_revision_id
      or v_existing_approval.revision_hash is distinct from p_expected_revision_hash
      or v_existing_approval.approved_by_id is distinct from p_actor_id then
      raise exception 'Approval idempotency key conflicts with an existing request' using errcode = '22023';
    end if;
    select build.* into strict v_build
    from public.ads_campaign_builds as build
    where build.plan_id = p_plan_id
      and build.revision_id = v_existing_approval.revision_id
      and build.revision_hash = v_existing_approval.revision_hash;
    return v_build;
  end if;

  select plan.status into v_pre_status
  from public.ads_campaign_plans as plan where plan.id = p_plan_id;
  if not found then
    raise exception 'Campaign plan was not found' using errcode = 'P0002';
  end if;

  if v_pre_status in ('approved', 'launch_in_progress') then
    select build.id into v_pre_build_id
    from public.ads_campaign_builds as build
    where build.plan_id = p_plan_id
      and build.revision_id = p_revision_id
      and build.revision_hash = p_expected_revision_hash;
    if not found then
      raise exception 'Approval renewal requires the exact existing campaign build' using errcode = '55000';
    end if;

    select build.* into strict v_build
    from public.ads_campaign_builds as build where build.id = v_pre_build_id for update;
    select plan.* into strict v_plan
    from public.ads_campaign_plans as plan where plan.id = p_plan_id for update;

    -- A request inserted while this path waited is still exact-idempotent.
    select approval.* into v_existing_approval
    from public.ads_campaign_approvals as approval
    where approval.plan_id = v_plan.id
      and approval.request_idempotency_key = p_request_idempotency_key;
    if found then
      if v_existing_approval.revision_id is distinct from p_revision_id
        or v_existing_approval.revision_hash is distinct from p_expected_revision_hash
        or v_existing_approval.approved_by_id is distinct from p_actor_id then
        raise exception 'Approval idempotency key conflicts with an existing request' using errcode = '22023';
      end if;
      return v_build;
    end if;

    if v_plan.status is distinct from v_pre_status then
      raise exception 'Campaign plan status changed while approval renewal waited' using errcode = '40001';
    end if;
    if v_plan.lock_version is distinct from p_expected_plan_lock_version then
      raise exception 'Campaign plan lock version is stale' using errcode = '40001';
    end if;
    if v_build.plan_id <> v_plan.id
      or v_build.revision_id is distinct from p_revision_id
      or v_build.revision_hash is distinct from p_expected_revision_hash then
      raise exception 'Approval renewal requires the exact existing campaign build' using errcode = '55000';
    end if;
    if v_pre_status = 'approved' and v_build.status <> 'pending_gate_1' then
      raise exception 'Approved renewal requires the exact pending Gate 1 build' using errcode = '55000';
    end if;
    if v_pre_status = 'launch_in_progress'
      and v_build.status in ('verified', 'handoff_complete', 'cancelled') then
      raise exception 'Terminal or cancelled campaign builds cannot renew approval' using errcode = '55000';
    end if;
    if p_approval_expires_at is null or p_approval_expires_at <= pg_catalog.clock_timestamp() then
      raise exception 'Approval expiry must be in the future' using errcode = '22023';
    end if;

    select revision.* into strict v_revision
    from public.ads_campaign_plan_revisions as revision
    where revision.id = p_revision_id and revision.plan_id = v_plan.id;
    select approval.* into strict v_current_approval
    from public.ads_campaign_approvals as approval where approval.id = v_build.approval_id;
    select package.* into strict v_package
    from public.ads_budget_packages as package where package.id = v_plan.budget_package_id;
    select account.* into strict v_account
    from public.ads_ad_accounts as account where account.id = v_plan.ad_account_id;

    if p_approval_expires_at <= v_current_approval.expires_at then
      raise exception 'Approval renewal expiry must be strictly later than the current approval' using errcode = '22023';
    end if;
    if v_plan.active_revision_id is distinct from v_revision.id
      or v_plan.reserved_revision_id is distinct from v_revision.id
      or v_plan.approved_revision_id is distinct from v_revision.id
      or v_plan.approved_revision_hash is distinct from v_revision.payload_hash
      or v_revision.payload_hash is distinct from p_expected_revision_hash
      or v_build.approval_id is distinct from v_current_approval.id
      or v_current_approval.plan_id is distinct from v_plan.id
      or v_current_approval.revision_id is distinct from v_revision.id
      or v_current_approval.revision_hash is distinct from v_revision.payload_hash
      or v_current_approval.decision <> 'approved'
      or v_build.budget_package_id is distinct from v_revision.budget_package_id
      or v_build.budget_package_id is distinct from v_plan.budget_package_id
      or v_build.ad_account_id is distinct from v_revision.ad_account_id
      or v_build.ad_account_id is distinct from v_plan.ad_account_id
      or v_build.platform is distinct from v_revision.platform
      or v_build.platform is distinct from v_plan.platform
      or v_revision.client_id is distinct from v_plan.client_id
      or v_revision.client_id is distinct from v_package.client_id
      or v_revision.client_id is distinct from v_account.client_id
      or v_revision.provider_account_id is distinct from v_account.provider_account_id
      or v_revision.platform is distinct from v_account.platform
      or v_revision.currency is distinct from v_account.currency
      or v_revision.currency is distinct from v_package.currency
      or v_revision.start_date < v_package.start_date
      or v_revision.end_date > v_package.end_date
      or v_plan.reserved_budget is distinct from v_revision.allocated_budget then
      raise exception 'Approval renewal requires an unchanged revision, build, account, and package snapshot' using errcode = '22023';
    end if;
    if not v_account.is_active or v_account.access_status <> 'verified'
      or v_account.access_verified_at is null then
      raise exception 'A verified active ad account is required for approval renewal' using errcode = '55000';
    end if;
    if v_package.status <> 'active' then
      raise exception 'An active budget package is required for approval renewal' using errcode = '55000';
    end if;

    insert into public.ads_campaign_approvals (
      plan_id, revision_id, revision_hash, decision, expires_at,
      request_idempotency_key, comment, superseded_approval_id,
      approved_by_id, approved_by_name, trusted_ip, trusted_user_agent, created_at
    ) values (
      v_plan.id, v_revision.id, v_revision.payload_hash, 'approved', p_approval_expires_at,
      p_request_idempotency_key, p_comment, v_current_approval.id,
      p_actor_id, v_actor_name, p_trusted_ip, p_trusted_user_agent, pg_catalog.clock_timestamp()
    ) returning * into v_new_approval;

    update public.ads_campaign_builds
    set approval_id = v_new_approval.id,
        updated_at = pg_catalog.clock_timestamp(), lock_version = lock_version + 1
    where id = v_build.id returning * into v_build;
    update public.ads_campaign_plans
    set updated_at = pg_catalog.clock_timestamp(), lock_version = lock_version + 1
    where id = v_plan.id returning * into v_plan;

    perform ads_internal.append_campaign_audit(
      v_plan.id, v_revision.id, v_build.id, null,
      'campaign_approval_renewed', v_pre_status, v_pre_status,
      p_actor_id, p_trusted_ip, p_trusted_user_agent,
      pg_catalog.jsonb_build_object(
        'old_approval_id', v_current_approval.id,
        'new_approval_id', v_new_approval.id,
        'old_expires_at', v_current_approval.expires_at,
        'new_expires_at', v_new_approval.expires_at,
        'request_idempotency_key', p_request_idempotency_key
      )
    );
    return v_build;
  end if;

  -- Initial approval is the only plan -> package lock path.
  select plan.* into strict v_plan
  from public.ads_campaign_plans as plan where plan.id = p_plan_id for update;
  -- A request inserted while this path waited is still exact-idempotent.
  select approval.* into v_existing_approval
  from public.ads_campaign_approvals as approval
  where approval.plan_id = v_plan.id
    and approval.request_idempotency_key = p_request_idempotency_key;
  if found then
    if v_existing_approval.revision_id is distinct from p_revision_id
      or v_existing_approval.revision_hash is distinct from p_expected_revision_hash
      or v_existing_approval.approved_by_id is distinct from p_actor_id then
      raise exception 'Approval idempotency key conflicts with an existing request' using errcode = '22023';
    end if;
    select build.* into strict v_build from public.ads_campaign_builds as build
    where build.plan_id = v_plan.id and build.revision_id = p_revision_id;
    return v_build;
  end if;
  if v_plan.status is distinct from v_pre_status then
    raise exception 'Campaign plan status changed while approval waited' using errcode = '40001';
  end if;
  if v_plan.lock_version is distinct from p_expected_plan_lock_version then
    raise exception 'Campaign plan lock version is stale' using errcode = '40001';
  end if;
  if v_plan.status <> 'awaiting_approval' then
    raise exception 'Campaign plan is not eligible for initial approval or renewal' using errcode = '55000';
  end if;
  if p_approval_expires_at is null or p_approval_expires_at <= pg_catalog.clock_timestamp() then
    raise exception 'Approval expiry must be in the future' using errcode = '22023';
  end if;
  if v_plan.active_revision_id is distinct from p_revision_id
    or v_plan.reserved_revision_id is distinct from p_revision_id then
    raise exception 'Approval requires the active reserved revision' using errcode = '55000';
  end if;
  select revision.* into v_revision
  from public.ads_campaign_plan_revisions as revision
  where revision.id = p_revision_id and revision.plan_id = v_plan.id;
  if not found then
    raise exception 'Campaign plan revision was not found' using errcode = 'P0002';
  end if;
  if v_revision.payload_hash is distinct from p_expected_revision_hash then
    raise exception 'Campaign plan revision hash does not match' using errcode = '22023';
  end if;
  if v_plan.reserved_budget <> v_revision.allocated_budget then
    raise exception 'Approval requires the exact reserved revision budget' using errcode = '55000';
  end if;
  select package.* into strict v_package
  from public.ads_budget_packages as package where package.id = v_plan.budget_package_id for update;
  select account.* into strict v_account
  from public.ads_ad_accounts as account where account.id = v_plan.ad_account_id;
  if not v_account.is_active or v_account.access_status <> 'verified'
    or v_account.access_verified_at is null then
    raise exception 'A verified active ad account is required for approval' using errcode = '55000';
  end if;
  if v_package.status <> 'active' then
    raise exception 'An active budget package is required for approval' using errcode = '55000';
  end if;
  if v_revision.client_id <> v_plan.client_id
    or v_revision.client_id <> v_package.client_id
    or v_revision.client_id <> v_account.client_id
    or v_revision.budget_package_id <> v_package.id
    or v_revision.ad_account_id <> v_account.id
    or v_revision.platform <> v_plan.platform
    or v_revision.platform <> v_account.platform
    or v_revision.provider_account_id <> v_account.provider_account_id then
    raise exception 'Approval plan, revision, account, and package ownership must match' using errcode = '22023';
  end if;
  if v_revision.currency <> v_package.currency or v_revision.currency <> v_account.currency then
    raise exception 'Approval account, package, and revision currency must match' using errcode = '22023';
  end if;
  if v_revision.start_date < v_package.start_date or v_revision.end_date > v_package.end_date then
    raise exception 'Revision dates must fall within the budget package flight' using errcode = '22023';
  end if;
  select approval.id into v_superseded_approval_id
  from public.ads_campaign_approvals as approval
  where approval.plan_id = v_plan.id order by approval.created_at desc, approval.id desc limit 1;
  insert into public.ads_campaign_approvals (
    plan_id, revision_id, revision_hash, decision, expires_at,
    request_idempotency_key, comment, superseded_approval_id,
    approved_by_id, approved_by_name, trusted_ip, trusted_user_agent, created_at
  ) values (
    v_plan.id, v_revision.id, v_revision.payload_hash, 'approved', p_approval_expires_at,
    p_request_idempotency_key, p_comment, v_superseded_approval_id,
    p_actor_id, v_actor_name, p_trusted_ip, p_trusted_user_agent, pg_catalog.clock_timestamp()
  ) returning * into v_new_approval;
  insert into public.ads_campaign_builds (
    plan_id, revision_id, revision_hash, approval_id, budget_package_id,
    ad_account_id, platform, status, created_at, updated_at
  ) values (
    v_plan.id, v_revision.id, v_revision.payload_hash, v_new_approval.id, v_package.id,
    v_account.id, v_account.platform, 'pending_gate_1',
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  ) returning * into v_build;
  update public.ads_campaign_plans
  set approved_revision_id = v_revision.id,
      approved_revision_hash = v_revision.payload_hash,
      status = 'approved', updated_at = pg_catalog.clock_timestamp(),
      lock_version = lock_version + 1
  where id = v_plan.id returning * into v_plan;
  perform ads_internal.append_campaign_audit(
    v_plan.id, v_revision.id, v_build.id, null,
    'campaign_plan_revision_approved', v_pre_status, 'approved',
    p_actor_id, p_trusted_ip, p_trusted_user_agent,
    pg_catalog.jsonb_build_object(
      'approval_id', v_new_approval.id,
      'approval_expires_at', v_new_approval.expires_at,
      'build_id', v_build.id,
      'payload_hash', v_revision.payload_hash,
      'request_idempotency_key', p_request_idempotency_key,
      'superseded_approval_id', v_superseded_approval_id
    )
  );
  return v_build;
end;
$$;

create or replace function public.ads_transition_campaign_plan(
  p_plan_id bigint,
  p_expected_lock_version bigint,
  p_expected_from_status text,
  p_to_status text,
  p_reason text,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
)
returns public.ads_campaign_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pre_status text;
  v_pre_build_id bigint;
  v_pre_build_count integer;
  v_plan public.ads_campaign_plans%rowtype;
  v_build public.ads_campaign_builds%rowtype;
  v_actor_name text;
  v_actor_email text;
  v_actor_role text;
begin
  select actor.actor_name, actor.actor_email, actor.actor_role
  into strict v_actor_name, v_actor_email, v_actor_role
  from ads_internal.resolve_m04_actor(p_actor_id) as actor;
  if pg_catalog.btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A campaign plan transition reason is required' using errcode = '22023';
  end if;
  select plan.status, candidate.build_id, candidate.build_count
  into v_pre_status, v_pre_build_id, v_pre_build_count
  from public.ads_campaign_plans as plan
  left join lateral (
    select pg_catalog.min(build.id) as build_id,
           pg_catalog.count(*)::integer as build_count
    from public.ads_campaign_builds as build
    where build.plan_id = plan.id
      and build.status = 'pending_gate_1'
      and build.revision_id = plan.approved_revision_id
      and build.revision_hash = plan.approved_revision_hash
  ) as candidate on true
  where plan.id = p_plan_id;
  if not found then
    raise exception 'Campaign plan was not found' using errcode = 'P0002';
  end if;

  if p_expected_from_status = 'approved' and p_to_status in ('draft', 'cancelled') then
    if v_pre_status <> 'approved' then
      raise exception 'Campaign plan status does not match expected state' using errcode = '40001';
    end if;
    if v_pre_build_count <> 1 or v_pre_build_id is null then
      raise exception 'Approved transition requires one matching pending Gate 1 build' using errcode = '55000';
    end if;
    select build.* into v_build
    from public.ads_campaign_builds as build where build.id = v_pre_build_id for update;
    if not found then
      raise exception 'Campaign plan or pending build changed while transition waited' using errcode = '40001';
    end if;
    select plan.* into v_plan
    from public.ads_campaign_plans as plan where plan.id = p_plan_id for update;
    if not found then
      raise exception 'Campaign plan or pending build changed while transition waited' using errcode = '40001';
    end if;
    if v_pre_status <> 'approved' or v_plan.status <> 'approved'
      or v_plan.status is distinct from p_expected_from_status
      or v_plan.lock_version is distinct from p_expected_lock_version
      or v_build.plan_id <> v_plan.id
      or v_build.status <> 'pending_gate_1'
      or v_build.revision_id is distinct from v_plan.approved_revision_id
      or v_build.revision_hash is distinct from v_plan.approved_revision_hash then
      raise exception 'Campaign plan or pending build changed while transition waited' using errcode = '40001';
    end if;
    update public.ads_campaign_builds
    set status = 'cancelled', updated_at = pg_catalog.clock_timestamp(),
        lock_version = lock_version + 1
    where id = v_build.id and status = 'pending_gate_1'
    returning * into v_build;
    if not found then
      raise exception 'Campaign plan or pending build changed while transition waited' using errcode = '40001';
    end if;
    perform ads_internal.append_campaign_audit(
      v_plan.id, v_build.revision_id, v_build.id, null,
      'campaign_build_cancelled', 'pending_gate_1', 'cancelled',
      p_actor_id, p_trusted_ip, p_trusted_user_agent,
      pg_catalog.jsonb_build_object('reason', p_reason)
    );
  else
    select plan.* into v_plan
    from public.ads_campaign_plans as plan where plan.id = p_plan_id for update;
    if v_plan.status is distinct from v_pre_status then
      raise exception 'Campaign plan status changed while transition waited' using errcode = '40001';
    end if;
    if v_plan.lock_version is distinct from p_expected_lock_version then
      raise exception 'Campaign plan lock version is stale' using errcode = '40001';
    end if;
    if v_plan.status is distinct from p_expected_from_status then
      raise exception 'Campaign plan status does not match expected state' using errcode = '40001';
    end if;
  end if;

  if not (
    (v_plan.status = 'draft' and p_to_status in ('awaiting_approval', 'cancelled'))
    or (v_plan.status = 'awaiting_approval' and p_to_status in ('draft', 'cancelled'))
    or (v_plan.status = 'approved' and p_to_status in ('draft', 'cancelled'))
  ) then
    raise exception 'Requested campaign plan transition is not allowed' using errcode = '55000';
  end if;
  update public.ads_campaign_plans
  set status = p_to_status,
      approved_revision_id = case when p_to_status in ('draft', 'cancelled') then null else approved_revision_id end,
      approved_revision_hash = case when p_to_status in ('draft', 'cancelled') then null else approved_revision_hash end,
      updated_at = pg_catalog.clock_timestamp(), lock_version = lock_version + 1
  where id = v_plan.id returning * into v_plan;
  perform ads_internal.append_campaign_audit(
    v_plan.id, v_plan.active_revision_id, null, null,
    'campaign_plan_transitioned', p_expected_from_status, p_to_status,
    p_actor_id, p_trusted_ip, p_trusted_user_agent,
    pg_catalog.jsonb_build_object('reason', p_reason)
  );
  return v_plan;
end;
$$;
