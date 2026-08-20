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
grant usage on schema ads_internal to authenticated, service_role;
grant execute on function ads_internal.is_approved_operator() to authenticated, service_role;
