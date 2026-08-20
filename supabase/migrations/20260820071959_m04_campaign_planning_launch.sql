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
    'campaign_budget_reserved', 'draft', 'awaiting_approval',
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

create trigger acpr_append_only before update or delete on public.ads_campaign_plan_revisions
for each row execute function ads_internal.reject_m04_row_mutation();
create trigger aca_append_only before update or delete on public.ads_campaign_approvals
for each row execute function ads_internal.reject_m04_row_mutation();
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
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select ads_internal.is_approved_operator()))',
      table_name || '_approved_operator_select', table_name
    );
  end loop;
end;
$$;

revoke all on function ads_internal.is_approved_operator() from public, anon;
revoke all on function ads_internal.reject_m04_row_mutation() from public, anon, authenticated;
revoke all on function ads_internal.resolve_m04_actor(uuid) from public, anon, authenticated, service_role;
revoke all on function ads_internal.append_campaign_audit(bigint, bigint, bigint, bigint, text, text, text, uuid, inet, text, jsonb) from public, anon, authenticated, service_role;
grant usage on schema ads_internal to authenticated, service_role;
grant execute on function ads_internal.is_approved_operator() to authenticated, service_role;

revoke all on function public.ads_create_campaign_plan_revision(bigint, bigint, jsonb, text, text, uuid, inet, text) from public, anon, authenticated, service_role;
revoke all on function public.ads_reserve_campaign_budget(bigint, bigint, text, bigint, uuid, inet, text) from public, anon, authenticated, service_role;
revoke all on function public.ads_release_campaign_budget(bigint, bigint, text, uuid, inet, text) from public, anon, authenticated, service_role;
revoke all on function public.ads_approve_campaign_plan_revision(bigint, bigint, text, bigint, timestamptz, text, text, uuid, inet, text) from public, anon, authenticated, service_role;
revoke all on function public.ads_transition_campaign_plan(bigint, bigint, text, text, text, uuid, inet, text) from public, anon, authenticated, service_role;

grant execute on function public.ads_create_campaign_plan_revision(bigint, bigint, jsonb, text, text, uuid, inet, text) to service_role;
grant execute on function public.ads_reserve_campaign_budget(bigint, bigint, text, bigint, uuid, inet, text) to service_role;
grant execute on function public.ads_release_campaign_budget(bigint, bigint, text, uuid, inet, text) to service_role;
grant execute on function public.ads_approve_campaign_plan_revision(bigint, bigint, text, bigint, timestamptz, text, text, uuid, inet, text) to service_role;
grant execute on function public.ads_transition_campaign_plan(bigint, bigint, text, text, text, uuid, inet, text) to service_role;
