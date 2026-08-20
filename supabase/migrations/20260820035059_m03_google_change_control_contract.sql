-- M03 Google-only post-launch change-control contract.
-- This migration extends the existing ads_change_* foundation. It intentionally
-- does not create a second operational change-set workflow.

create extension if not exists pgcrypto;
create schema if not exists ads_internal;

alter table public.ads_change_sets
  add column if not exists evidence jsonb not null default '{}'::jsonb,
  add column if not exists campaign_id text,
  add column if not exists project_key text,
  add column if not exists contract_version integer not null default 1,
  add column if not exists client_id uuid,
  add column if not exists ads_ad_account_id bigint,
  add column if not exists source_plan_revision_id bigint,
  add column if not exists source_campaign_build_id bigint,
  add column if not exists source_monthly_snapshot_id bigint,
  add column if not exists source_optimization_action_id bigint,
  add column if not exists approved_payload_hash text,
  add column if not exists preflight_state_hash text,
  add column if not exists approval_expires_at timestamptz,
  add column if not exists execution_claim_id uuid,
  add column if not exists execution_claimed_at timestamptz,
  add column if not exists execution_claimed_by_id text,
  add column if not exists execution_claimed_by_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ads_change_sets_m03_project_scope_check'
      and conrelid = 'public.ads_change_sets'::regclass
  ) then
    alter table public.ads_change_sets
      add constraint ads_change_sets_m03_project_scope_check
      check (contract_version < 2 or project_key = 'lt_paid_media') not valid;
  end if;
end $$;

alter table public.ads_field_changes
  add column if not exists idempotency_key text,
  add column if not exists execution_claim_id uuid;

alter table public.ads_change_events
  add column if not exists trusted_ip inet,
  add column if not exists trusted_user_agent text;

create table if not exists public.ads_change_set_revisions (
  id uuid primary key default gen_random_uuid(),
  change_set_id uuid not null references public.ads_change_sets(id) on delete restrict,
  project_key text not null check (project_key = 'lt_paid_media'),
  version integer not null check (version > 0),
  canonical_payload jsonb not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  reason text not null default '',
  evidence jsonb not null default '{}'::jsonb,
  source_reference jsonb not null default '{}'::jsonb,
  created_by_id text,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  unique (change_set_id, version)
);

alter table public.ads_change_sets
  add column if not exists approved_revision_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ads_change_sets_approved_revision_id_fkey'
      and conrelid = 'public.ads_change_sets'::regclass
  ) then
    alter table public.ads_change_sets
      add constraint ads_change_sets_approved_revision_id_fkey
      foreign key (approved_revision_id)
      references public.ads_change_set_revisions(id)
      on delete restrict;
  end if;
end $$;

create table if not exists public.ads_campaign_legacy_adoptions (
  id uuid primary key default gen_random_uuid(),
  project_key text not null default 'lt_paid_media' check (project_key = 'lt_paid_media'),
  account_id text not null,
  campaign_id text not null,
  campaign_name text not null,
  reason text not null check (btrim(reason) <> ''),
  evidence jsonb not null check (btrim(coalesce(evidence ->> 'summary', '')) <> ''),
  adopted_by_id text not null,
  adopted_by_name text not null,
  adopted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_id text,
  revoked_by_name text
);

create unique index if not exists ads_campaign_legacy_adoptions_active_unique
  on public.ads_campaign_legacy_adoptions(project_key, account_id, campaign_id)
  where revoked_at is null;

create table if not exists public.ads_change_follow_ups (
  id uuid primary key default gen_random_uuid(),
  project_key text not null default 'lt_paid_media' check (project_key = 'lt_paid_media'),
  change_set_id uuid not null references public.ads_change_sets(id) on delete restrict,
  source_optimization_action_id bigint,
  follow_up_window text not null check (follow_up_window in ('7d', '14d')),
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  handoff_payload jsonb not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (change_set_id, follow_up_window)
);

create table if not exists public.ads_change_execution_claims (
  id uuid primary key default gen_random_uuid(),
  project_key text not null default 'lt_paid_media' check (project_key = 'lt_paid_media'),
  change_set_id uuid not null references public.ads_change_sets(id) on delete restrict,
  change_set_version integer not null,
  approved_payload_hash text not null,
  preflight_state_hash text not null,
  claimed_by_id text not null,
  claimed_by_name text not null,
  trusted_ip inet,
  trusted_user_agent text,
  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  released_at timestamptz,
  final_status text
);

create unique index if not exists ads_change_execution_claims_active_unique
  on public.ads_change_execution_claims(project_key, change_set_id)
  where released_at is null;

create or replace function ads_internal.reject_m03_row_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'M03 approval, revision, and event records are append-only' using errcode = '55000';
end;
$$;

drop trigger if exists ads_change_set_revisions_append_only on public.ads_change_set_revisions;
create trigger ads_change_set_revisions_append_only
before update or delete on public.ads_change_set_revisions
for each row execute function ads_internal.reject_m03_row_mutation();

drop trigger if exists ads_change_approvals_append_only on public.ads_change_approvals;
create trigger ads_change_approvals_append_only
before update or delete on public.ads_change_approvals
for each row execute function ads_internal.reject_m03_row_mutation();

drop trigger if exists ads_change_events_append_only on public.ads_change_events;
create trigger ads_change_events_append_only
before update or delete on public.ads_change_events
for each row execute function ads_internal.reject_m03_row_mutation();

create unique index if not exists ads_field_changes_idempotency_key_unique
  on public.ads_field_changes(idempotency_key)
  where idempotency_key is not null;
create index if not exists ads_change_set_revisions_set_created_idx
  on public.ads_change_set_revisions(change_set_id, created_at desc);
create index if not exists ads_change_follow_ups_due_idx
  on public.ads_change_follow_ups(status, due_at)
  where status = 'pending';
create index if not exists ads_change_follow_ups_source_action_idx
  on public.ads_change_follow_ups(source_optimization_action_id)
  where source_optimization_action_id is not null;

alter table public.ads_change_set_revisions enable row level security;
alter table public.ads_campaign_legacy_adoptions enable row level security;
alter table public.ads_change_follow_ups enable row level security;
alter table public.ads_change_execution_claims enable row level security;

revoke all on public.ads_change_set_revisions from anon, authenticated;
revoke all on public.ads_campaign_legacy_adoptions from anon, authenticated;
revoke all on public.ads_change_follow_ups from anon, authenticated;
revoke all on public.ads_change_execution_claims from anon, authenticated;
grant select, insert on public.ads_change_set_revisions to service_role;
grant select, insert, update on public.ads_campaign_legacy_adoptions to service_role;
grant select, insert, update on public.ads_change_follow_ups to service_role;
grant select, insert, update on public.ads_change_execution_claims to service_role;

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

create or replace function public.ads_adopt_legacy_campaign(
  p_account_id text,
  p_campaign_id text,
  p_campaign_name text,
  p_reason text,
  p_evidence jsonb,
  p_actor_id text,
  p_actor_name text
) returns public.ads_campaign_legacy_adoptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  adoption public.ads_campaign_legacy_adoptions;
begin
  if btrim(coalesce(p_reason, '')) = ''
     or btrim(coalesce(p_evidence ->> 'summary', '')) = '' then
    raise exception 'Legacy adoption requires a reason and evidence' using errcode = '23514';
  end if;
  insert into public.ads_campaign_legacy_adoptions(
    project_key, account_id, campaign_id, campaign_name, reason, evidence,
    adopted_by_id, adopted_by_name
  ) values (
    'lt_paid_media', p_account_id, p_campaign_id, p_campaign_name, p_reason, p_evidence,
    p_actor_id, p_actor_name
  )
  on conflict (project_key, account_id, campaign_id) where revoked_at is null
  do update set campaign_name = excluded.campaign_name
  returning * into adoption;
  return adoption;
end;
$$;

create or replace function public.ads_snapshot_change_set_revision(
  p_change_set_id uuid,
  p_expected_version integer,
  p_canonical_json text,
  p_payload_hash text,
  p_reason text,
  p_evidence jsonb,
  p_source_reference jsonb,
  p_actor_id text,
  p_actor_name text
) returns public.ads_change_set_revisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_set public.ads_change_sets;
  revision public.ads_change_set_revisions;
  expected_hash text;
begin
  select * into current_set from public.ads_change_sets
  where id = p_change_set_id for update;
  if not found then raise exception 'Change set was not found' using errcode = 'P0002'; end if;
  if current_set.version <> p_expected_version then
    raise exception 'Change set version changed' using errcode = '40001';
  end if;
  if current_set.status not in ('draft', 'validation_failed', 'conflict_detected') then
    raise exception 'Only editable change sets can create revisions' using errcode = '55000';
  end if;
  expected_hash := encode(digest(convert_to(p_canonical_json, 'UTF8'), 'sha256'), 'hex');
  if expected_hash <> p_payload_hash then
    raise exception 'Revision payload hash mismatch' using errcode = '22000';
  end if;

  insert into public.ads_change_set_revisions(
    change_set_id, project_key, version, canonical_payload, payload_hash, reason, evidence,
    source_reference, created_by_id, created_by_name
  ) values (
    p_change_set_id, 'lt_paid_media', p_expected_version, p_canonical_json::jsonb, p_payload_hash,
    p_reason, coalesce(p_evidence, '{}'::jsonb), coalesce(p_source_reference, '{}'::jsonb),
    p_actor_id, p_actor_name
  )
  on conflict (change_set_id, version) do nothing
  returning * into revision;

  if revision.id is null then
    select * into revision from public.ads_change_set_revisions
    where change_set_id = p_change_set_id and version = p_expected_version;
    if revision.payload_hash <> p_payload_hash then
      raise exception 'Revision version is immutable' using errcode = '55000';
    end if;
  end if;
  return revision;
end;
$$;

create or replace function public.ads_approve_change_set_revision(
  p_change_set_id uuid,
  p_expected_version integer,
  p_revision_id uuid,
  p_payload_hash text,
  p_expires_at timestamptz,
  p_actor_id text,
  p_actor_name text,
  p_comment text,
  p_trusted_ip inet,
  p_trusted_user_agent text
) returns public.ads_change_sets
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_set public.ads_change_sets;
begin
  select * into current_set from public.ads_change_sets
  where id = p_change_set_id for update;
  if current_set.status <> 'awaiting_approval' or current_set.version <> p_expected_version then
    raise exception 'Only the current validated revision can be approved' using errcode = '55000';
  end if;
  if current_set.contract_version >= 2 and current_set.project_key is distinct from 'lt_paid_media' then
    raise exception 'Change set does not belong to LT Paid Media' using errcode = '42501';
  end if;
  if btrim(current_set.reason) = ''
     or btrim(coalesce(current_set.evidence ->> 'summary', '')) = '' then
    raise exception 'Approval requires a reason and evidence' using errcode = '23514';
  end if;
  if p_expires_at <= clock_timestamp() then
    raise exception 'Approval expiry must be in the future' using errcode = '23514';
  end if;
  if current_set.preflight_state_hash is null then
    raise exception 'Approval requires completed platform preflight evidence' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.ads_change_set_revisions revision
    where revision.id = p_revision_id
      and revision.change_set_id = p_change_set_id
      and revision.version = p_expected_version
      and revision.payload_hash = p_payload_hash
  ) then
    raise exception 'Approval payload does not match the immutable revision' using errcode = '23514';
  end if;

  update public.ads_change_sets set
    status = 'approved', approved_at = clock_timestamp(),
    approved_revision_id = p_revision_id, approved_payload_hash = p_payload_hash,
    approval_expires_at = p_expires_at, updated_at = clock_timestamp()
  where id = p_change_set_id
  returning * into current_set;

  insert into public.ads_change_approvals(
    change_set_id, decision, approver_id, approver_name, comment, change_set_version
  ) values (
    p_change_set_id, 'approved', p_actor_id, p_actor_name, nullif(btrim(p_comment), ''), p_expected_version
  );

  insert into public.ads_change_events(
    change_set_id, event_type, from_status, to_status, actor_id, actor_name,
    message, metadata, trusted_ip, trusted_user_agent
  ) values (
    p_change_set_id, 'approved', 'awaiting_approval', 'approved', p_actor_id,
    p_actor_name, 'Immutable revision approved for publishing.',
    jsonb_build_object('version', p_expected_version, 'payloadHash', p_payload_hash),
    p_trusted_ip, left(p_trusted_user_agent, 1000)
  );
  return current_set;
end;
$$;

create or replace function public.ads_claim_change_set_publish(
  p_change_set_id uuid,
  p_expected_version integer,
  p_expected_payload_hash text,
  p_preflight_state_hash text,
  p_actor_id text,
  p_actor_name text,
  p_trusted_ip inet,
  p_trusted_user_agent text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_set public.ads_change_sets;
  eligibility jsonb;
  claim_id uuid := gen_random_uuid();
begin
  select * into current_set from public.ads_change_sets
  where id = p_change_set_id for update;
  if current_set.version <> p_expected_version
     or current_set.approved_payload_hash is distinct from p_expected_payload_hash
     or current_set.preflight_state_hash is distinct from p_preflight_state_hash then
    raise exception 'Approved revision hash changed' using errcode = '40001';
  end if;
  if current_set.contract_version >= 2 and (
    current_set.status not in ('approved', 'failed', 'partially_completed')
    or current_set.approval_expires_at is null
    or current_set.approval_expires_at <= clock_timestamp()
  ) then
    raise exception 'A current unexpired approval is required' using errcode = '55000';
  end if;
  if current_set.contract_version >= 2 and current_set.project_key is distinct from 'lt_paid_media' then
    raise exception 'Change set does not belong to LT Paid Media' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.ads_change_execution_claims claim
    where claim.change_set_id = p_change_set_id
      and claim.released_at is null
      and claim.expires_at > clock_timestamp()
  ) then
    raise exception 'This change set is already being published' using errcode = '55P03';
  end if;
  update public.ads_change_execution_claims set
    released_at = clock_timestamp(), final_status = 'expired'
  where change_set_id = p_change_set_id
    and released_at is null
    and expires_at <= clock_timestamp();
  if current_set.contract_version >= 2 then
    if current_set.campaign_id is null then
      raise exception 'Post-launch campaign identity is required' using errcode = '23514';
    end if;
    eligibility := public.ads_get_campaign_launch_eligibility(current_set.account_id, current_set.campaign_id);
    if coalesce((eligibility ->> 'eligible')::boolean, false) is not true then
      raise exception 'Campaign has no verified launch or authorized legacy adoption' using errcode = '23514';
    end if;
  end if;

  update public.ads_change_sets set
    status = 'publishing', updated_at = clock_timestamp()
  where id = p_change_set_id;

  update public.ads_field_changes set
    idempotency_key = coalesce(idempotency_key,
      'm03_' || encode(digest(convert_to(
        p_change_set_id::text || ':' || p_expected_version::text || ':' || id::text,
        'UTF8'
      ), 'sha256'), 'hex')),
    updated_at = clock_timestamp()
  where change_set_id = p_change_set_id and publish_status <> 'succeeded';

  insert into public.ads_change_execution_claims(
    id, project_key, change_set_id, change_set_version, approved_payload_hash,
    preflight_state_hash, claimed_by_id, claimed_by_name, trusted_ip,
    trusted_user_agent
  ) values (
    claim_id, 'lt_paid_media', p_change_set_id, p_expected_version, p_expected_payload_hash,
    p_preflight_state_hash, p_actor_id, p_actor_name, p_trusted_ip,
    left(p_trusted_user_agent, 1000)
  );

  insert into public.ads_change_events(
    change_set_id, event_type, from_status, to_status, actor_id, actor_name,
    message, metadata, trusted_ip, trusted_user_agent
  ) values (
    p_change_set_id, 'publishing_claimed', current_set.status, 'publishing',
    p_actor_id, p_actor_name, 'Publish execution claimed after hash and launch preflight.',
    jsonb_build_object('claimId', claim_id, 'preflightStateHash', p_preflight_state_hash),
    p_trusted_ip, left(p_trusted_user_agent, 1000)
  );
  return claim_id;
end;
$$;

create or replace function public.ads_finalize_change_set_verification(
  p_change_set_id uuid,
  p_actor_id text,
  p_actor_name text,
  p_trusted_ip inet,
  p_trusted_user_agent text
) returns public.ads_change_sets
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_status text;
  current_set public.ads_change_sets;
  total_count integer;
  verified_count integer;
  resolved_status text;
  verification_time timestamptz := clock_timestamp();
begin
  select * into current_set from public.ads_change_sets
  where id = p_change_set_id for update;
  if not found then raise exception 'Change set was not found' using errcode = 'P0002'; end if;
  if current_set.status not in ('partially_completed', 'verification_in_progress') then
    raise exception 'Change set does not have retryable verification' using errcode = '55000';
  end if;
  if current_set.contract_version >= 2 and current_set.project_key is distinct from 'lt_paid_media' then
    raise exception 'Change set does not belong to LT Paid Media' using errcode = '42501';
  end if;
  prior_status := current_set.status;

  select count(*), count(*) filter (where verification_status = 'verified')
  into total_count, verified_count
  from public.ads_field_changes where change_set_id = p_change_set_id;
  resolved_status := case when total_count > 0 and verified_count = total_count then 'verified' else 'partially_completed' end;

  update public.ads_change_sets set
    status = resolved_status,
    verified_at = case when resolved_status = 'verified' then coalesce(verified_at, verification_time) else verified_at end,
    updated_at = verification_time
  where id = p_change_set_id
  returning * into current_set;

  if resolved_status = 'verified' then
    insert into public.ads_change_follow_ups(
      project_key, change_set_id, source_optimization_action_id, follow_up_window, due_at, handoff_payload
    ) values
      ('lt_paid_media', p_change_set_id, current_set.source_optimization_action_id, '7d', verification_time + interval '7 days',
       jsonb_build_object('changeSetId', p_change_set_id, 'publishedAt', current_set.published_at, 'verifiedAt', current_set.verified_at)),
      ('lt_paid_media', p_change_set_id, current_set.source_optimization_action_id, '14d', verification_time + interval '14 days',
       jsonb_build_object('changeSetId', p_change_set_id, 'publishedAt', current_set.published_at, 'verifiedAt', current_set.verified_at))
    on conflict (change_set_id, follow_up_window) do nothing;
  end if;

  insert into public.ads_change_events(
    change_set_id, event_type, from_status, to_status, actor_id, actor_name,
    message, metadata, trusted_ip, trusted_user_agent
  ) values (
    p_change_set_id, 'verification_finalized', prior_status, resolved_status,
    p_actor_id, p_actor_name, 'Google Ads readback verification retry was finalized.',
    jsonb_build_object('total', total_count, 'verified', verified_count),
    p_trusted_ip, left(p_trusted_user_agent, 1000)
  );
  return current_set;
end;
$$;

create or replace function public.ads_record_change_item_result(
  p_change_set_id uuid,
  p_field_change_id uuid,
  p_claim_id uuid,
  p_publish_succeeded boolean,
  p_published_value jsonb,
  p_platform_response jsonb,
  p_error_message text,
  p_verified boolean,
  p_verified_value jsonb
) returns public.ads_field_changes
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.ads_field_changes;
begin
  if not exists (
    select 1
    from public.ads_change_sets change_set
    join public.ads_change_execution_claims claim
      on claim.change_set_id = change_set.id
    where change_set.id = p_change_set_id
      and change_set.status = 'publishing'
      and claim.id = p_claim_id
      and claim.released_at is null
      and claim.expires_at > clock_timestamp()
  ) then
    raise exception 'Publish claim is no longer active' using errcode = '55000';
  end if;
  select * into item from public.ads_field_changes
  where id = p_field_change_id and change_set_id = p_change_set_id for update;
  if item.publish_status = 'succeeded' then return item; end if;
  update public.ads_field_changes set
    publish_attempts = publish_attempts + 1,
    publish_status = case when p_publish_succeeded then 'succeeded' else 'failed' end,
    published_value = case when p_publish_succeeded then p_published_value else published_value end,
    platform_response = coalesce(p_platform_response, platform_response),
    last_error_message = nullif(p_error_message, ''),
    verification_status = case when p_verified then 'verified' when p_publish_succeeded then 'failed' else verification_status end,
    verified_value = case when p_verified then p_verified_value else verified_value end,
    updated_at = clock_timestamp()
  where id = p_field_change_id
  returning * into item;
  return item;
end;
$$;

create or replace function public.ads_finalize_change_set_publish(
  p_change_set_id uuid,
  p_claim_id uuid,
  p_actor_id text,
  p_actor_name text,
  p_trusted_ip inet,
  p_trusted_user_agent text
) returns public.ads_change_sets
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_set public.ads_change_sets;
  total_count integer;
  published_count integer;
  verified_count integer;
  resolved_status text;
  publish_time timestamptz := clock_timestamp();
begin
  select * into current_set from public.ads_change_sets
  where id = p_change_set_id
    and exists (
      select 1 from public.ads_change_execution_claims claim
      where claim.id = p_claim_id
        and claim.change_set_id = p_change_set_id
        and claim.released_at is null
    )
  for update;
  if not found then raise exception 'Publish claim is no longer active' using errcode = '55000'; end if;
  select count(*), count(*) filter (where publish_status = 'succeeded'),
         count(*) filter (where verification_status = 'verified')
  into total_count, published_count, verified_count
  from public.ads_field_changes where change_set_id = p_change_set_id;
  resolved_status := case
    when total_count > 0 and verified_count = total_count then 'verified'
    when published_count = 0 then 'failed'
    else 'partially_completed'
  end;
  update public.ads_change_sets set
    status = resolved_status,
    published_at = coalesce(published_at, case when published_count > 0 then publish_time end),
    verified_at = case when resolved_status = 'verified' then coalesce(verified_at, publish_time) else verified_at end,
    updated_at = publish_time
  where id = p_change_set_id
  returning * into current_set;

  update public.ads_change_execution_claims set
    released_at = publish_time, final_status = resolved_status
  where id = p_claim_id;

  if resolved_status = 'verified' then
    insert into public.ads_change_follow_ups(
      project_key, change_set_id, source_optimization_action_id, follow_up_window, due_at, handoff_payload
    ) values
      ('lt_paid_media', p_change_set_id, current_set.source_optimization_action_id, '7d', publish_time + interval '7 days',
       jsonb_build_object('changeSetId', p_change_set_id, 'publishedAt', current_set.published_at, 'verifiedAt', current_set.verified_at)),
      ('lt_paid_media', p_change_set_id, current_set.source_optimization_action_id, '14d', publish_time + interval '14 days',
       jsonb_build_object('changeSetId', p_change_set_id, 'publishedAt', current_set.published_at, 'verifiedAt', current_set.verified_at))
    on conflict (change_set_id, follow_up_window) do nothing;
  end if;

  insert into public.ads_change_events(
    change_set_id, event_type, from_status, to_status, actor_id, actor_name,
    message, metadata, trusted_ip, trusted_user_agent
  ) values (
    p_change_set_id, 'publish_finalized', 'publishing', resolved_status,
    p_actor_id, p_actor_name, 'Per-item publishing and readback were finalized.',
    jsonb_build_object('total', total_count, 'published', published_count, 'verified', verified_count),
    p_trusted_ip, left(p_trusted_user_agent, 1000)
  );
  return current_set;
end;
$$;

revoke all on function public.ads_get_campaign_launch_eligibility(text, text) from public, anon, authenticated;
revoke all on function public.ads_adopt_legacy_campaign(text, text, text, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.ads_snapshot_change_set_revision(uuid, integer, text, text, text, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.ads_approve_change_set_revision(uuid, integer, uuid, text, timestamptz, text, text, text, inet, text) from public, anon, authenticated;
revoke all on function public.ads_claim_change_set_publish(uuid, integer, text, text, text, text, inet, text) from public, anon, authenticated;
revoke all on function public.ads_record_change_item_result(uuid, uuid, uuid, boolean, jsonb, jsonb, text, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.ads_finalize_change_set_publish(uuid, uuid, text, text, inet, text) from public, anon, authenticated;
revoke all on function public.ads_finalize_change_set_verification(uuid, text, text, inet, text) from public, anon, authenticated;

grant execute on function public.ads_get_campaign_launch_eligibility(text, text) to service_role;
grant execute on function public.ads_adopt_legacy_campaign(text, text, text, text, jsonb, text, text) to service_role;
grant execute on function public.ads_snapshot_change_set_revision(uuid, integer, text, text, text, jsonb, jsonb, text, text) to service_role;
grant execute on function public.ads_approve_change_set_revision(uuid, integer, uuid, text, timestamptz, text, text, text, inet, text) to service_role;
grant execute on function public.ads_claim_change_set_publish(uuid, integer, text, text, text, text, inet, text) to service_role;
grant execute on function public.ads_record_change_item_result(uuid, uuid, uuid, boolean, jsonb, jsonb, text, boolean, jsonb) to service_role;
grant execute on function public.ads_finalize_change_set_publish(uuid, uuid, text, text, inet, text) to service_role;
grant execute on function public.ads_finalize_change_set_verification(uuid, text, text, inet, text) to service_role;

comment on table public.ads_change_set_revisions is 'Immutable M03 revision snapshots; ads_change_sets remains the operational workflow record.';
comment on table public.ads_campaign_legacy_adoptions is 'Explicit admin authorization for post-launch editing of campaigns not created through Module 4.';
comment on table public.ads_change_follow_ups is 'Idempotent Module 5 handoff records for verified M03 changes.';
comment on table public.ads_change_execution_claims is 'Short-lived atomic execution claims; external Google calls occur outside database transactions.';
