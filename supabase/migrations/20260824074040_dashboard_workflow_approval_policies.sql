create table if not exists public.ads_dashboard_workflow_policies (
  policy_key text primary key check (policy_key in (
    'search_term_approval',
    'placement_exclusion_approval',
    'm03_change_control_approval',
    'm04_campaign_readiness_approval'
  )),
  approval_required boolean not null default false,
  lock_version integer not null default 0 check (lock_version >= 0),
  updated_by_id text,
  updated_by_name text,
  updated_at timestamptz not null default now()
);

create table if not exists public.ads_dashboard_workflow_policy_events (
  id bigint generated always as identity primary key,
  policy_key text not null references public.ads_dashboard_workflow_policies(policy_key),
  previous_approval_required boolean not null,
  approval_required boolean not null,
  actor_id text not null,
  actor_name text not null,
  actor_email text not null,
  trusted_ip inet,
  trusted_user_agent text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists ads_dashboard_workflow_policy_events_policy_created_idx
  on public.ads_dashboard_workflow_policy_events(policy_key, created_at desc);

insert into public.ads_dashboard_workflow_policies (policy_key, approval_required)
values
  ('search_term_approval', false),
  ('placement_exclusion_approval', false),
  ('m03_change_control_approval', false),
  ('m04_campaign_readiness_approval', false)
on conflict (policy_key) do nothing;

alter table public.ads_dashboard_workflow_policies enable row level security;
alter table public.ads_dashboard_workflow_policy_events enable row level security;

revoke all on public.ads_dashboard_workflow_policies from public, anon, authenticated;
revoke all on public.ads_dashboard_workflow_policy_events from public, anon, authenticated;
revoke all on sequence public.ads_dashboard_workflow_policy_events_id_seq from public, anon, authenticated;
grant select, update on public.ads_dashboard_workflow_policies to service_role;
grant select, insert on public.ads_dashboard_workflow_policy_events to service_role;
grant usage, select on sequence public.ads_dashboard_workflow_policy_events_id_seq to service_role;

create or replace function public.ads_set_dashboard_workflow_policy_v1(
  p_policy_key text,
  p_approval_required boolean,
  p_expected_lock_version integer,
  p_actor_id text,
  p_actor_name text,
  p_actor_email text,
  p_trusted_ip inet,
  p_trusted_user_agent text,
  p_idempotency_key text
) returns public.ads_dashboard_workflow_policies
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_current public.ads_dashboard_workflow_policies;
  v_result public.ads_dashboard_workflow_policies;
begin
  if coalesce(length(trim(p_idempotency_key)), 0) < 8 then
    raise exception 'A valid idempotency key is required' using errcode = '22023';
  end if;

  select * into v_current
  from public.ads_dashboard_workflow_policies
  where policy_key = p_policy_key
  for update;

  if not found then
    raise exception 'Unknown workflow policy' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.ads_dashboard_workflow_policy_events
    where idempotency_key = p_idempotency_key
  ) then
    return v_current;
  end if;

  if v_current.lock_version <> p_expected_lock_version then
    raise exception 'Workflow policy changed; reload settings' using errcode = '40001';
  end if;

  update public.ads_dashboard_workflow_policies
  set approval_required = p_approval_required,
      lock_version = lock_version + 1,
      updated_by_id = p_actor_id,
      updated_by_name = p_actor_name,
      updated_at = now()
  where policy_key = p_policy_key
  returning * into v_result;

  insert into public.ads_dashboard_workflow_policy_events (
    policy_key, previous_approval_required, approval_required,
    actor_id, actor_name, actor_email, trusted_ip, trusted_user_agent, idempotency_key
  ) values (
    p_policy_key, v_current.approval_required, p_approval_required,
    p_actor_id, p_actor_name, lower(trim(p_actor_email)), p_trusted_ip,
    left(coalesce(p_trusted_user_agent, 'unknown'), 1000), p_idempotency_key
  );

  return v_result;
end;
$$;

revoke all on function public.ads_set_dashboard_workflow_policy_v1(
  text, boolean, integer, text, text, text, inet, text, text
) from public, anon, authenticated;
grant execute on function public.ads_set_dashboard_workflow_policy_v1(
  text, boolean, integer, text, text, text, inet, text, text
) to service_role;
