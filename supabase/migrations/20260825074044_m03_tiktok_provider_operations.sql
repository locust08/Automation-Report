-- M03 TikTok provider operation persistence. Provider execution remains deployment-locked.
-- Isolation rule: every referenced or changed database object is owned by public.m03_ads_*.

alter table public.m03_ads_provider_operation_resources
  drop constraint if exists m03_ads_provider_operation_resources_platform_check;
alter table public.m03_ads_provider_operation_resources
  add constraint m03_ads_provider_operation_resources_platform_check
  check (platform in ('meta', 'tiktok')) not valid;
alter table public.m03_ads_provider_operation_resources
  validate constraint m03_ads_provider_operation_resources_platform_check;

create or replace function public.m03_ads_record_tiktok_operation_resource_v1(
  p_request_id uuid,
  p_revision_id uuid,
  p_item_id uuid,
  p_resource_mapping_id bigint,
  p_resource_role text,
  p_provider_resource_identity text,
  p_expected_lifecycle_state text,
  p_lifecycle_state text,
  p_creation_evidence jsonb,
  p_readback_evidence jsonb,
  p_normalized_error jsonb,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text,
  p_idempotency_key text
) returns public.m03_ads_provider_operation_resources
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.m03_ads_change_requests;
  v_revision public.m03_ads_change_request_revisions;
  v_row public.m03_ads_provider_operation_resources;
  v_actor record;
begin
  select * into v_actor from m03_ads_internal.resolve_operator(p_actor_id, p_trusted_ip);
  select * into v_row from public.m03_ads_provider_operation_resources where idempotency_key = p_idempotency_key;
  if found then
    if v_row.request_id <> p_request_id or v_row.revision_id <> p_revision_id
      or v_row.item_id <> p_item_id or v_row.resource_role <> p_resource_role
      or v_row.platform <> 'tiktok' then
      raise exception 'idempotency_key_reused_for_different_tiktok_resource';
    end if;
    return v_row;
  end if;
  if p_resource_role not in ('previous_ad', 'replacement_ad') then
    raise exception 'invalid_tiktok_operation_resource_role';
  end if;
  if p_lifecycle_state not in ('planned','created','verified','activated','disabled','failed','compensation_required') then
    raise exception 'invalid_tiktok_operation_resource_state';
  end if;
  if jsonb_typeof(coalesce(p_creation_evidence, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_readback_evidence, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_normalized_error, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_tiktok_operation_evidence';
  end if;

  select * into v_request from public.m03_ads_change_requests where id = p_request_id for update;
  if not found or v_request.platform <> 'tiktok' then raise exception 'tiktok_change_request_not_found'; end if;
  select * into v_revision from public.m03_ads_change_request_revisions
    where id = p_revision_id and request_id = p_request_id;
  if not found then raise exception 'revision_not_owned_by_request'; end if;
  if not exists (
    select 1 from public.m03_ads_change_approvals
    where request_id = p_request_id and revision_id = p_revision_id and revision_hash = v_revision.payload_hash
  ) then raise exception 'exact_revision_approval_required'; end if;
  if not exists (
    select 1 from public.m03_ads_change_items where id = p_item_id and request_id = p_request_id
  ) then raise exception 'change_item_not_owned_by_request'; end if;
  if p_resource_mapping_id is not null and not exists (
    select 1 from public.m03_ads_provider_resource_mappings
    where id = p_resource_mapping_id and request_id = p_request_id and item_id = p_item_id and platform = 'tiktok'
  ) then raise exception 'resource_mapping_not_owned_by_item'; end if;

  select * into v_row from public.m03_ads_provider_operation_resources
    where item_id = p_item_id and resource_role = p_resource_role for update;
  if found then
    if v_row.platform <> 'tiktok' or v_row.revision_id <> p_revision_id then
      raise exception 'operation_resource_revision_mismatch';
    end if;
    if p_expected_lifecycle_state is not null and v_row.lifecycle_state <> p_expected_lifecycle_state then
      raise exception 'stale_provider_operation_stage';
    end if;
    if v_row.lifecycle_state <> p_lifecycle_state and not (
      (v_row.lifecycle_state = 'planned' and p_lifecycle_state in ('created','verified','disabled','failed'))
      or (v_row.lifecycle_state = 'created' and p_lifecycle_state in ('verified','failed'))
      or (v_row.lifecycle_state = 'verified' and p_lifecycle_state in ('activated','disabled','failed'))
      or (v_row.lifecycle_state = 'activated' and p_lifecycle_state in ('disabled','failed','compensation_required'))
      or (v_row.lifecycle_state = 'disabled' and p_lifecycle_state in ('verified','compensation_required'))
      or (v_row.lifecycle_state = 'failed' and p_lifecycle_state in ('planned','created'))
      or (v_row.lifecycle_state = 'compensation_required' and p_lifecycle_state in ('disabled','failed'))
    ) then raise exception 'invalid_tiktok_operation_stage_transition'; end if;
    update public.m03_ads_provider_operation_resources set
      provider_resource_identity = coalesce(nullif(pg_catalog.btrim(p_provider_resource_identity), ''), provider_resource_identity),
      lifecycle_state = p_lifecycle_state,
      creation_evidence = coalesce(p_creation_evidence, creation_evidence),
      readback_evidence = coalesce(p_readback_evidence, readback_evidence),
      normalized_error = coalesce(p_normalized_error, normalized_error),
      updated_at = clock_timestamp()
    where id = v_row.id returning * into v_row;
  else
    if p_expected_lifecycle_state is not null and p_expected_lifecycle_state <> 'planned' then
      raise exception 'stale_provider_operation_stage';
    end if;
    insert into public.m03_ads_provider_operation_resources(
      request_id, revision_id, item_id, resource_mapping_id, platform, resource_role,
      provider_resource_identity, lifecycle_state, creation_evidence, readback_evidence,
      normalized_error, idempotency_key
    ) values (
      p_request_id, p_revision_id, p_item_id, p_resource_mapping_id, 'tiktok', p_resource_role,
      nullif(pg_catalog.btrim(p_provider_resource_identity), ''), p_lifecycle_state,
      coalesce(p_creation_evidence, '{}'::jsonb), coalesce(p_readback_evidence, '{}'::jsonb),
      coalesce(p_normalized_error, '{}'::jsonb), p_idempotency_key
    ) returning * into v_row;
  end if;

  insert into public.m03_ads_change_events(
    request_id, revision_id, event_type, actor_id, actor_name, trusted_ip, trusted_user_agent, metadata
  ) values (
    p_request_id, p_revision_id, 'tiktok_provider_operation_resource_advanced', p_actor_id,
    v_actor.actor_name, p_trusted_ip, left(p_trusted_user_agent, 1000),
    jsonb_build_object('resource_id', v_row.id, 'item_id', p_item_id, 'role', p_resource_role,
      'lifecycle_state', p_lifecycle_state, 'provider_execution_locked', true)
  );
  return v_row;
end;
$$;

create or replace function public.m03_ads_record_tiktok_item_attempt_v1(
  p_request_id uuid,
  p_item_id uuid,
  p_revision_id uuid,
  p_action text,
  p_attempt_number integer,
  p_idempotency_key text,
  p_operation_key text,
  p_result text,
  p_replacement_stage text,
  p_provider_request jsonb,
  p_provider_result_evidence jsonb,
  p_readback_evidence jsonb,
  p_normalized_error jsonb,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text
) returns public.m03_ads_change_item_attempts
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.m03_ads_change_requests;
  v_revision public.m03_ads_change_request_revisions;
  v_row public.m03_ads_change_item_attempts;
  v_actor record;
begin
  select * into v_actor from m03_ads_internal.resolve_operator(p_actor_id, p_trusted_ip);
  select * into v_row from public.m03_ads_change_item_attempts where operation_key = p_operation_key;
  if found then
    if v_row.request_id <> p_request_id or v_row.revision_id <> p_revision_id or v_row.item_id <> p_item_id then
      raise exception 'operation_key_reused_for_different_tiktok_attempt';
    end if;
    return v_row;
  end if;
  if p_result not in ('provider_execution_locked','pending','succeeded','failed','verified','mismatch','compensation_required') then
    raise exception 'invalid_tiktok_attempt_result';
  end if;
  if p_attempt_number < 1 then raise exception 'invalid_tiktok_attempt_number'; end if;
  if jsonb_typeof(coalesce(p_provider_request, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_provider_result_evidence, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_readback_evidence, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_normalized_error, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_tiktok_attempt_evidence';
  end if;
  select * into v_request from public.m03_ads_change_requests where id = p_request_id for update;
  if not found or v_request.platform <> 'tiktok' then raise exception 'tiktok_change_request_not_found'; end if;
  select * into v_revision from public.m03_ads_change_request_revisions
    where id = p_revision_id and request_id = p_request_id;
  if not found then raise exception 'revision_not_owned_by_request'; end if;
  if not exists (
    select 1 from public.m03_ads_change_approvals
    where request_id = p_request_id and revision_id = p_revision_id and revision_hash = v_revision.payload_hash
  ) then raise exception 'exact_revision_approval_required'; end if;
  if not exists (
    select 1 from public.m03_ads_change_items where id = p_item_id and request_id = p_request_id
  ) then raise exception 'change_item_not_owned_by_request'; end if;

  insert into public.m03_ads_change_item_attempts(
    request_id, item_id, revision_id, action, attempt_number, idempotency_key, operation_key,
    result, replacement_stage, provider_request, provider_result_evidence, readback_evidence, normalized_error
  ) values (
    p_request_id, p_item_id, p_revision_id, p_action, p_attempt_number, p_idempotency_key, p_operation_key,
    p_result, p_replacement_stage, coalesce(p_provider_request, '{}'::jsonb),
    coalesce(p_provider_result_evidence, '{}'::jsonb), coalesce(p_readback_evidence, '{}'::jsonb),
    coalesce(p_normalized_error, '{}'::jsonb)
  ) returning * into v_row;
  insert into public.m03_ads_change_events(
    request_id, revision_id, event_type, actor_id, actor_name, trusted_ip, trusted_user_agent, metadata
  ) values (
    p_request_id, p_revision_id, 'tiktok_item_attempt_recorded', p_actor_id, v_actor.actor_name,
    p_trusted_ip, left(p_trusted_user_agent, 1000),
    jsonb_build_object('attempt_id', v_row.id, 'operation_key', p_operation_key, 'result', p_result)
  );
  return v_row;
end;
$$;

create or replace function public.m03_ads_record_tiktok_readback_v1(
  p_request_id uuid,
  p_revision_id uuid,
  p_item_id uuid,
  p_operation_key text,
  p_readback_evidence jsonb,
  p_matches_approved_value boolean,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.m03_ads_change_requests;
  v_revision public.m03_ads_change_request_revisions;
  v_claim public.m03_ads_idempotency_claims;
  v_actor record;
  v_response jsonb;
begin
  select * into v_actor from m03_ads_internal.resolve_operator(p_actor_id, p_trusted_ip);
  select * into v_claim from public.m03_ads_idempotency_claims
    where action = 'tiktok_readback_v1' and idempotency_key = p_idempotency_key;
  if found then
    if v_claim.request_id <> p_request_id or v_claim.response_snapshot->>'item_id' <> p_item_id::text then
      raise exception 'idempotency_key_reused_for_different_tiktok_readback';
    end if;
    return v_claim.response_snapshot;
  end if;
  if jsonb_typeof(coalesce(p_readback_evidence, '{}'::jsonb)) <> 'object' then raise exception 'invalid_tiktok_readback_evidence'; end if;
  select * into v_request from public.m03_ads_change_requests where id = p_request_id for update;
  if not found or v_request.platform <> 'tiktok' then raise exception 'tiktok_change_request_not_found'; end if;
  select * into v_revision from public.m03_ads_change_request_revisions where id = p_revision_id and request_id = p_request_id;
  if not found then raise exception 'revision_not_owned_by_request'; end if;
  if not exists (
    select 1 from public.m03_ads_change_approvals
    where request_id = p_request_id and revision_id = p_revision_id and revision_hash = v_revision.payload_hash
  ) then raise exception 'exact_revision_approval_required'; end if;
  update public.m03_ads_change_items set
    readback_evidence = coalesce(p_readback_evidence, '{}'::jsonb),
    provider_result_evidence = provider_result_evidence || jsonb_build_object(
      'operation_key', p_operation_key,
      'verification_result', case when p_matches_approved_value then 'verified' else 'mismatch' end
    )
  where id = p_item_id and request_id = p_request_id;
  if not found then raise exception 'change_item_not_owned_by_request'; end if;
  v_response := jsonb_build_object('request_id', p_request_id, 'revision_id', p_revision_id,
    'item_id', p_item_id, 'operation_key', p_operation_key,
    'result', case when p_matches_approved_value then 'verified' else 'mismatch' end);
  insert into public.m03_ads_change_events(
    request_id, revision_id, event_type, actor_id, actor_name, trusted_ip, trusted_user_agent, metadata
  ) values (
    p_request_id, p_revision_id,
    case when p_matches_approved_value then 'tiktok_readback_verified' else 'tiktok_readback_mismatch' end,
    p_actor_id, v_actor.actor_name, p_trusted_ip, left(p_trusted_user_agent, 1000), v_response
  );
  insert into public.m03_ads_idempotency_claims(action, request_id, idempotency_key, response_snapshot)
  values ('tiktok_readback_v1', p_request_id, p_idempotency_key, v_response);
  return v_response;
end;
$$;

create or replace function public.m03_ads_finalize_tiktok_item_v1(
  p_request_id uuid,
  p_revision_id uuid,
  p_item_id uuid,
  p_result text,
  p_provider_result_evidence jsonb,
  p_readback_evidence jsonb,
  p_normalized_error jsonb,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.m03_ads_change_requests;
  v_revision public.m03_ads_change_request_revisions;
  v_claim public.m03_ads_idempotency_claims;
  v_actor record;
  v_response jsonb;
begin
  select * into v_actor from m03_ads_internal.resolve_operator(p_actor_id, p_trusted_ip);
  select * into v_claim from public.m03_ads_idempotency_claims
    where action = 'finalize_tiktok_item_v1' and idempotency_key = p_idempotency_key;
  if found then
    if v_claim.request_id <> p_request_id or v_claim.response_snapshot->>'item_id' <> p_item_id::text then
      raise exception 'idempotency_key_reused_for_different_tiktok_item';
    end if;
    return v_claim.response_snapshot;
  end if;
  if p_result not in ('provider_execution_locked','pending','succeeded','failed','verified','mismatch','compensation_required') then
    raise exception 'invalid_tiktok_item_result';
  end if;
  if jsonb_typeof(coalesce(p_provider_result_evidence, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_readback_evidence, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_normalized_error, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_tiktok_item_evidence';
  end if;
  select * into v_request from public.m03_ads_change_requests where id = p_request_id for update;
  if not found or v_request.platform <> 'tiktok' then raise exception 'tiktok_change_request_not_found'; end if;
  select * into v_revision from public.m03_ads_change_request_revisions where id = p_revision_id and request_id = p_request_id;
  if not found then raise exception 'revision_not_owned_by_request'; end if;
  if not exists (
    select 1 from public.m03_ads_change_approvals
    where request_id = p_request_id and revision_id = p_revision_id and revision_hash = v_revision.payload_hash
  ) then raise exception 'exact_revision_approval_required'; end if;
  update public.m03_ads_change_items set
    provider_result_evidence = coalesce(p_provider_result_evidence, '{}'::jsonb),
    readback_evidence = coalesce(p_readback_evidence, '{}'::jsonb),
    validation_issues = case when p_result in ('failed','mismatch','compensation_required') then
      jsonb_build_array(jsonb_build_object('path', field_path,
        'message', coalesce(nullif(p_normalized_error->>'message', ''), 'TikTok operation requires attention.'),
        'severity', 'error')) else '[]'::jsonb end
  where id = p_item_id and request_id = p_request_id;
  if not found then raise exception 'change_item_not_owned_by_request'; end if;
  v_response := jsonb_build_object('request_id', p_request_id, 'revision_id', p_revision_id,
    'item_id', p_item_id, 'result', p_result);
  insert into public.m03_ads_change_events(
    request_id, revision_id, event_type, actor_id, actor_name, trusted_ip, trusted_user_agent, metadata
  ) values (
    p_request_id, p_revision_id, 'tiktok_item_finalized', p_actor_id, v_actor.actor_name,
    p_trusted_ip, left(p_trusted_user_agent, 1000),
    v_response || jsonb_build_object('normalized_error', coalesce(p_normalized_error, '{}'::jsonb))
  );
  insert into public.m03_ads_idempotency_claims(action, request_id, idempotency_key, response_snapshot)
  values ('finalize_tiktok_item_v1', p_request_id, p_idempotency_key, v_response);
  return v_response;
end;
$$;

create or replace function public.m03_ads_derive_tiktok_request_status_v1(
  p_request_id uuid,
  p_revision_id uuid,
  p_actor_id uuid,
  p_trusted_ip inet,
  p_trusted_user_agent text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.m03_ads_change_requests;
  v_revision public.m03_ads_change_request_revisions;
  v_claim public.m03_ads_idempotency_claims;
  v_actor record;
  v_total integer; v_verified integer; v_failed integer; v_succeeded integer;
  v_status text; v_response jsonb;
begin
  select * into v_actor from m03_ads_internal.resolve_operator(p_actor_id, p_trusted_ip);
  select * into v_claim from public.m03_ads_idempotency_claims
    where action = 'derive_tiktok_request_status_v1' and idempotency_key = p_idempotency_key;
  if found then
    if v_claim.request_id <> p_request_id then raise exception 'idempotency_key_reused_for_different_request'; end if;
    return v_claim.response_snapshot;
  end if;
  select * into v_request from public.m03_ads_change_requests where id = p_request_id for update;
  if not found or v_request.platform <> 'tiktok' then raise exception 'tiktok_change_request_not_found'; end if;
  select * into v_revision from public.m03_ads_change_request_revisions where id = p_revision_id and request_id = p_request_id;
  if not found then raise exception 'revision_not_owned_by_request'; end if;
  if not exists (
    select 1 from public.m03_ads_change_approvals
    where request_id = p_request_id and revision_id = p_revision_id and revision_hash = v_revision.payload_hash
  ) then raise exception 'exact_revision_approval_required'; end if;
  select count(*) into v_total from public.m03_ads_change_items where request_id = p_request_id;
  select
    count(*) filter (where latest.result = 'verified'),
    count(*) filter (where latest.result in ('failed','mismatch','compensation_required')),
    count(*) filter (where latest.result = 'succeeded')
  into v_verified, v_failed, v_succeeded
  from (
    select distinct on (item_id) item_id, result from public.m03_ads_change_item_attempts
    where request_id = p_request_id and revision_id = p_revision_id
    order by item_id, created_at desc, id desc
  ) latest;
  v_status := case
    when v_total > 0 and v_verified = v_total then 'verified'
    when v_failed > 0 and (v_verified > 0 or v_succeeded > 0) then 'partially_completed'
    when v_failed > 0 then 'failed'
    when v_succeeded > 0 then 'published'
    else v_request.status
  end;
  update public.m03_ads_change_requests set status = v_status,
    updated_at = clock_timestamp(), lock_version = lock_version + 1
  where id = p_request_id returning * into v_request;
  v_response := jsonb_build_object('request_id', p_request_id, 'revision_id', p_revision_id,
    'status', v_status, 'verified_items', v_verified, 'failed_items', v_failed,
    'succeeded_items', v_succeeded, 'total_items', v_total, 'lock_version', v_request.lock_version);
  insert into public.m03_ads_change_events(
    request_id, revision_id, event_type, actor_id, actor_name, trusted_ip, trusted_user_agent, metadata
  ) values (
    p_request_id, p_revision_id, 'tiktok_request_status_derived', p_actor_id, v_actor.actor_name,
    p_trusted_ip, left(p_trusted_user_agent, 1000), v_response
  );
  insert into public.m03_ads_idempotency_claims(action, request_id, idempotency_key, response_snapshot)
  values ('derive_tiktok_request_status_v1', p_request_id, p_idempotency_key, v_response);
  return v_response;
end;
$$;

do $$ declare f regprocedure; begin
  foreach f in array array[
    'public.m03_ads_record_tiktok_operation_resource_v1(uuid,uuid,uuid,bigint,text,text,text,text,jsonb,jsonb,jsonb,uuid,inet,text,text)'::regprocedure,
    'public.m03_ads_record_tiktok_item_attempt_v1(uuid,uuid,uuid,text,integer,text,text,text,text,jsonb,jsonb,jsonb,jsonb,uuid,inet,text)'::regprocedure,
    'public.m03_ads_record_tiktok_readback_v1(uuid,uuid,uuid,text,jsonb,boolean,uuid,inet,text,text)'::regprocedure,
    'public.m03_ads_finalize_tiktok_item_v1(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,uuid,inet,text,text)'::regprocedure,
    'public.m03_ads_derive_tiktok_request_status_v1(uuid,uuid,uuid,inet,text,text)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public,anon,authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

comment on table public.m03_ads_provider_operation_resources is
  'M03 Meta and TikTok creative-replacement operation resources and durable saga stages. Provider execution remains deployment-locked.';
