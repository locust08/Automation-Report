-- Bind the durable claim to the immutable approved request envelope.
create or replace function public.m03_ads_claim_execution_operation_v1(
  p_request_id uuid,p_revision_id uuid,p_revision_hash text,p_operation_json text,p_operation_hash text,
  p_actor_id uuid,p_trusted_ip inet,p_trusted_user_agent text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.m03_ads_change_requests; v public.m03_ads_change_request_revisions;
  op jsonb:=p_operation_json::jsonb; receipt public.m03_ads_execution_operations;
  reviewed jsonb; reviewed_items jsonb; dependency text;
begin
  perform public.m03_ads_assert_operator_v1(p_actor_id,p_trusted_ip,p_trusted_user_agent);
  select * into r from public.m03_ads_change_requests where id=p_request_id for update;
  if not found then raise exception 'change_request_not_found'; end if;
  select * into v from public.m03_ads_change_request_revisions where request_id=r.id order by revision_number desc limit 1;
  if v.id is distinct from p_revision_id or v.payload_hash is distinct from p_revision_hash then raise exception 'latest_revision_required'; end if;
  perform public.m03_ads_revision_integrity_receipt_v1(r.id,v.id,v.payload_hash);
  if v.canonical_payload->>'platform' is distinct from r.platform
    or v.canonical_payload->>'account_identity' is distinct from r.account_identity
    or v.canonical_payload->>'campaign_identity' is distinct from r.campaign_identity then raise exception 'approved_scope_changed'; end if;
  select jsonb_agg(jsonb_build_object('entity_type',entity_type,'entity_identity',entity_identity,'field_path',field_path,'value_type',value_type,
    'baseline_value',baseline_value,'proposed_value',proposed_value,'evidence',evidence,'platform_resource_mapping',platform_resource_mapping)
    order by entity_type,entity_identity,field_path) into reviewed_items from public.m03_ads_change_items where request_id=r.id;
  if v.canonical_payload->'items' is distinct from reviewed_items then raise exception 'approved_items_changed'; end if;
  if not exists(select 1 from public.m03_ads_change_approvals where request_id=r.id and revision_id=v.id and revision_hash=v.payload_hash and decision='approved') then raise exception 'exact_approval_required'; end if;
  if p_operation_hash is distinct from pg_catalog.encode(extensions.digest(pg_catalog.convert_to(p_operation_json,'utf8'),'sha256'),'hex')
    or op->>'platform' is distinct from r.platform or jsonb_typeof(op->'expected_result') is distinct from 'object'
    or op->'expected_result'='{}'::jsonb or op->'expected_result' ? 'approved_value' or jsonb_typeof(op->'depends_on') is distinct from 'array'
    or nullif(op->>'operation_key','') is null or nullif(op->>'idempotency_key','') is null then raise exception 'invalid_operation_contract'; end if;
  if not exists(select 1 from public.m03_ads_change_items where request_id=r.id and id=(op->>'item_id')::uuid) then raise exception 'item_not_owned_by_request'; end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(op->'affected_item_ids','[]'::jsonb)) affected
    where not exists(select 1 from public.m03_ads_change_items where request_id=r.id and id=affected.value::uuid)) then raise exception 'affected_item_not_owned_by_request'; end if;
  if not exists(select 1 from public.m03_ads_provider_resource_mappings m cross join lateral jsonb_array_elements(m.operation_plan) p
    where m.request_id=r.id and m.item_id=(op->>'item_id')::uuid and p.value=op) then raise exception 'operation_not_in_reviewed_plan'; end if;
  select * into receipt from public.m03_ads_execution_operations where revision_id=v.id and operation_key=op->>'operation_key';
  if found then
    if receipt.operation<>op or receipt.operation_hash<>p_operation_hash or receipt.request_id<>r.id then raise exception 'operation_identity_conflict'; end if;
    return jsonb_build_object('acquired',false,'receipt',to_jsonb(receipt));
  end if;
  if r.status not in ('approved','ready_to_publish','publishing','partially_completed','provider_execution_locked') then raise exception 'request_not_executable'; end if;
  if not exists(select 1 from public.m03_ads_request_source_verifications where request_id=r.id and platform=r.platform
    and provider_account_identity=r.account_identity and provider_campaign_identity=r.campaign_identity) then raise exception 'source_boundary_required'; end if;
  select jsonb_object_agg(entity_type||':'||entity_identity||':'||field_path,baseline_value) into reviewed
    from public.m03_ads_change_items where request_id=r.id;
  if not exists(select 1 from public.m03_ads_provider_baseline_snapshots where request_id=r.id and revision_id=v.id
    and source='provider' and platform=r.platform and account_identity=r.account_identity and campaign_identity=r.campaign_identity
    and captured_at<=clock_timestamp() and captured_at>=clock_timestamp()-interval '15 minutes' and canonical_payload=reviewed) then raise exception 'fresh_reviewed_baseline_required'; end if;
  for dependency in select jsonb_array_elements_text(op->'depends_on') loop
    if not exists(select 1 from public.m03_ads_execution_operations where revision_id=v.id and operation_key=dependency and state='verified'
      and (readback->>'verified_at')::timestamptz between clock_timestamp()-interval '15 minutes' and clock_timestamp()) then raise exception 'dependency_not_verified'; end if;
  end loop;
  insert into public.m03_ads_execution_operations(request_id,revision_id,item_id,operation_key,idempotency_key,operation,operation_hash,actor_id,trusted_ip,trusted_user_agent)
    values(r.id,v.id,(op->>'item_id')::uuid,op->>'operation_key',op->>'idempotency_key',op,p_operation_hash,p_actor_id,p_trusted_ip,left(p_trusted_user_agent,1000)) returning * into receipt;
  insert into public.m03_ads_change_events(request_id,revision_id,event_type,actor_id,trusted_ip,trusted_user_agent,metadata)
    values(r.id,v.id,'execution_operation_claimed',p_actor_id,p_trusted_ip,left(p_trusted_user_agent,1000),jsonb_build_object('operation_key',receipt.operation_key,'operation_hash',receipt.operation_hash));
  return jsonb_build_object('acquired',true,'receipt',to_jsonb(receipt));
end $$;

