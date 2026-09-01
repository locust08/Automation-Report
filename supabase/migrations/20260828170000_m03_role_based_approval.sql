alter table public.m03_ads_change_events
  add column if not exists actor_role text;
alter table public.m03_ads_change_events
  add column if not exists actor_email text;

update public.ads_dashboard_workflow_policies
set approval_required = true,
    updated_at = clock_timestamp()
where policy_key = 'm03_change_control_approval'
  and approval_required is false;

alter table public.m03_ads_change_events
  drop constraint if exists m03_ads_change_events_actor_role_check;

alter table public.m03_ads_change_events
  add constraint m03_ads_change_events_actor_role_check
  check (actor_role is null or actor_role in ('user','pms','co','specialist','approver','tl','pm','admin'));

drop function if exists m03_ads_internal.resolve_operator(uuid, inet);

create function m03_ads_internal.resolve_operator(p_actor_id uuid, p_trusted_ip inet)
returns table(actor_name text, actor_email text, actor_role text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  return query
  select coalesce(nullif(pg_catalog.btrim(a.full_name), ''), a.email),
         pg_catalog.lower(a.email)::text,
         a.role::text
  from public.ads_reporting_auth a
  where a.user_id = p_actor_id
    and a.is_active is true
    and a.role in ('pms','co','specialist','approver','tl','pm','admin')
    and exists (
      select 1 from public.m03_ads_approved_domains d
      where d.client_id is null and d.is_active is true
        and d.domain = pg_catalog.split_part(pg_catalog.lower(a.email), '@', 2)
    )
    ;
  if not found then
    raise exception 'operator_role_or_domain_not_approved' using errcode = '42501';
  end if;
end;
$$;

create or replace function m03_ads_internal.capture_event_actor_role()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.actor_id is not null then
    select a.role::text, pg_catalog.lower(a.email) into new.actor_role, new.actor_email
    from public.ads_reporting_auth a
    where a.user_id = new.actor_id and a.is_active is true;
  end if;
  return new;
end;
$$;

drop trigger if exists m03_ads_change_events_capture_actor_role on public.m03_ads_change_events;
create trigger m03_ads_change_events_capture_actor_role
before insert on public.m03_ads_change_events
for each row execute function m03_ads_internal.capture_event_actor_role();

update public.m03_ads_change_events e
set actor_role = a.role::text
from public.ads_reporting_auth a
where e.actor_id = a.user_id
  and e.actor_role is null;

update public.m03_ads_change_events e
set actor_email = pg_catalog.lower(a.email)
from public.ads_reporting_auth a
where e.actor_id = a.user_id
  and e.actor_email is null;

create or replace function public.m03_ads_cancel_mock_change_request_v2(
  p_request_id uuid, p_comment text, p_actor_id uuid, p_trusted_ip inet,
  p_trusted_user_agent text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_request public.m03_ads_change_requests;
  v_claim public.m03_ads_idempotency_claims;
  v_actor record;
  v_from text;
  v_revision_id uuid;
  v_response jsonb;
begin
  select * into v_actor from m03_ads_internal.resolve_operator(p_actor_id,p_trusted_ip);
  select * into v_claim from public.m03_ads_idempotency_claims
  where action='cancel_v2' and idempotency_key=p_idempotency_key;
  if found then return v_claim.response_snapshot; end if;

  select * into v_request from public.m03_ads_change_requests where id=p_request_id for update;
  if not found then raise exception 'change_request_not_found'; end if;
  if v_request.status = 'cancelled' then raise exception 'request_already_cancelled'; end if;
  if v_request.status = 'approved' and v_actor.actor_role <> 'admin' then
    raise exception 'only_administrator_can_cancel_approved_request' using errcode = '42501';
  end if;
  if v_request.status not in ('draft','validation_failed','awaiting_approval','approved') then
    raise exception 'request_cannot_be_cancelled';
  end if;

  select r.id into v_revision_id
  from public.m03_ads_change_request_revisions r
  where r.request_id = p_request_id
  order by r.revision_number desc
  limit 1;

  v_from:=v_request.status;
  update public.m03_ads_change_requests
  set status='cancelled',updated_at=clock_timestamp(),lock_version=lock_version+1
  where id=p_request_id returning * into v_request;
  insert into public.m03_ads_change_events(
    request_id,revision_id,event_type,from_status,to_status,actor_id,actor_name,trusted_ip,trusted_user_agent,metadata
  ) values(
    p_request_id,v_revision_id,'request_cancelled',v_from,'cancelled',p_actor_id,v_actor.actor_name,
    p_trusted_ip,left(p_trusted_user_agent,1000),pg_catalog.jsonb_build_object('comment',p_comment)
  );
  v_response:=pg_catalog.jsonb_build_object(
    'request_id',p_request_id,'status','cancelled','lock_version',v_request.lock_version
  );
  insert into public.m03_ads_idempotency_claims(action,request_id,idempotency_key,response_snapshot)
  values('cancel_v2',p_request_id,p_idempotency_key,v_response);
  return v_response;
end;
$$;
