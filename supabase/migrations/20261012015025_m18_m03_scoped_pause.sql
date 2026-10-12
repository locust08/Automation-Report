-- M03-only pause reconciliation/finalization. Server operator checks and exact
-- immutable revision scope remain mandatory; no provider mutation occurs here.
create function public.m03_ads_reconcile_pause_receipt_v1(
  p_request_id uuid,p_revision_id uuid,p_revision_hash text,p_operation_key text,p_claim_token uuid,
  p_readback_json text,p_payload_json text,p_actor_id uuid,p_trusted_ip inet,p_trusted_user_agent text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.m03_ads_change_requests; v public.m03_ads_change_request_revisions;
  receipt public.m03_ads_execution_operations; observed jsonb:=p_readback_json::jsonb; expected jsonb;
begin
  perform public.m03_ads_assert_operator_v1(p_actor_id,p_trusted_ip,p_trusted_user_agent);
  select * into r from public.m03_ads_change_requests where id=p_request_id for update;
  if not found or r.platform not in ('google','meta') or r.status not in ('approved','ready_to_publish','publishing','partially_completed','provider_execution_locked','verified') then raise exception 'pause_request_not_executable'; end if;
  select * into v from public.m03_ads_change_request_revisions where request_id=r.id order by revision_number desc limit 1;
  if v.id is distinct from p_revision_id or v.payload_hash is distinct from p_revision_hash then raise exception 'latest_revision_required'; end if;
  perform public.m03_ads_revision_integrity_receipt_v1(r.id,v.id,v.payload_hash);
  if v.canonical_payload->>'platform' is distinct from r.platform or v.canonical_payload->>'account_identity' is distinct from r.account_identity or v.canonical_payload->>'campaign_identity' is distinct from r.campaign_identity then raise exception 'approved_scope_changed'; end if;
  if not exists(select 1 from public.m03_ads_change_approvals where request_id=r.id and revision_id=v.id and revision_hash=v.payload_hash and decision='approved') then raise exception 'exact_approval_required'; end if;
  if (select count(*) from public.m03_ads_change_items where request_id=r.id)<>1 or not exists(
    select 1 from public.m03_ads_change_items i where i.request_id=r.id and i.entity_type='campaign' and i.entity_identity=r.campaign_identity and i.field_path='campaign.status' and i.value_type='string' and i.proposed_value='"PAUSED"'::jsonb
      and v.canonical_payload->'items'=jsonb_build_array(jsonb_build_object('entity_type',i.entity_type,'entity_identity',i.entity_identity,'field_path',i.field_path,'value_type',i.value_type,'baseline_value',i.baseline_value,'proposed_value',i.proposed_value,'evidence',i.evidence,'platform_resource_mapping',i.platform_resource_mapping))) then raise exception 'exact_pause_item_required'; end if;
  select * into receipt from public.m03_ads_execution_operations where request_id=r.id and revision_id=v.id and operation_key=p_operation_key for update;
  expected:=jsonb_build_object('account_id',r.account_identity,'campaign_id',r.campaign_identity,'status','PAUSED');
  if not found or receipt.claim_token is distinct from p_claim_token or receipt.actor_id is distinct from p_actor_id
    or receipt.operation->>'platform' is distinct from r.platform or receipt.operation->>'action' is distinct from 'update'
    or receipt.operation->>'field_path' is distinct from 'campaign.status' or receipt.operation->>'resource_identity' is distinct from r.campaign_identity
    or receipt.operation->'expected_result' is distinct from expected then raise exception 'pause_receipt_scope_mismatch'; end if;
  if observed->>'resource_identity' is distinct from r.campaign_identity or observed->'canonical_payload' is distinct from expected
    or observed->'canonical_payload' is distinct from p_payload_json::jsonb
    or observed->>'payload_hash' is distinct from pg_catalog.encode(extensions.digest(pg_catalog.convert_to(p_payload_json,'utf8'),'sha256'),'hex')
    or nullif(observed->>'verified_at','') is null or (observed->>'verified_at')::timestamptz not between clock_timestamp()-interval '15 minutes' and clock_timestamp() then raise exception 'official_paused_readback_required'; end if;
  -- Preserve the original result, including ambiguous outcomes. A readback can
  -- establish the desired state but cannot reconstruct the lost POST response.
  update public.m03_ads_execution_operations set readback=observed,state='verified',updated_at=clock_timestamp() where id=receipt.id returning * into receipt;
  insert into public.m03_ads_change_events(request_id,revision_id,event_type,actor_id,trusted_ip,trusted_user_agent,metadata)
    values(r.id,v.id,'pause_official_state_reconciled',p_actor_id,p_trusted_ip,left(p_trusted_user_agent,1000),jsonb_build_object('operation_key',p_operation_key,'original_outcome',receipt.result->>'outcome','readback_hash',observed->>'payload_hash'));
  return to_jsonb(receipt);
end $$;

create function public.m03_ads_finalize_pause_v1(p_request_id uuid,p_revision_id uuid,p_revision_hash text,p_actor_id uuid,p_trusted_ip inet,p_trusted_user_agent text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.m03_ads_change_requests; receipt public.m03_ads_execution_operations; previous text;
begin
  perform public.m03_ads_assert_operator_v1(p_actor_id,p_trusted_ip,p_trusted_user_agent);
  select * into r from public.m03_ads_change_requests where id=p_request_id for update;
  if not found or (select count(*) from public.m03_ads_execution_operations where request_id=r.id and revision_id=p_revision_id)<>1 then raise exception 'exact_pause_receipt_required'; end if;
  select * into receipt from public.m03_ads_execution_operations where request_id=r.id and revision_id=p_revision_id;
  if receipt.state<>'verified' then raise exception 'verified_pause_required'; end if;
  perform public.m03_ads_reconcile_pause_receipt_v1(r.id,p_revision_id,p_revision_hash,receipt.operation_key,receipt.claim_token,receipt.readback::text,
    -- PostgreSQL jsonb text is not the JavaScript hash contract. Retain the
    -- original canonical payload serialization as supplied by the caller below.
    public.m03_ads_pause_canonical_payload_v1(r.account_identity,r.campaign_identity),p_actor_id,p_trusted_ip,p_trusted_user_agent);
  previous:=r.status;
  update public.m03_ads_change_items set provider_result_evidence=jsonb_build_object('operation_key',receipt.operation_key,'outcome',receipt.result->>'outcome'),readback_evidence=receipt.readback where request_id=r.id;
  if previous<>'verified' then
    update public.m03_ads_change_requests set status='verified',lock_version=lock_version+1,updated_at=clock_timestamp() where id=r.id;
    insert into public.m03_ads_change_events(request_id,revision_id,event_type,from_status,to_status,actor_id,trusted_ip,trusted_user_agent,metadata)
      values(r.id,p_revision_id,'pause_verified',previous,'verified',p_actor_id,p_trusted_ip,left(p_trusted_user_agent,1000),jsonb_build_object('operation_key',receipt.operation_key,'readback_hash',receipt.readback->>'payload_hash'));
  end if;
  return jsonb_build_object('request_id',r.id,'status','verified','readback',receipt.readback);
end $$;

-- The payload contains only validated numeric identities and a fixed status.
create function public.m03_ads_pause_canonical_payload_v1(account_id text,campaign_id text) returns text language sql immutable security invoker set search_path='' as $$
  select '{"account_id":'||to_json(account_id)::text||',"campaign_id":'||to_json(campaign_id)::text||',"status":"PAUSED"}'
$$;
revoke all on function public.m03_ads_reconcile_pause_receipt_v1(uuid,uuid,text,text,uuid,text,text,uuid,inet,text) from public,anon,authenticated;
revoke all on function public.m03_ads_finalize_pause_v1(uuid,uuid,text,uuid,inet,text) from public,anon,authenticated;
revoke all on function public.m03_ads_pause_canonical_payload_v1(text,text) from public,anon,authenticated;
grant execute on function public.m03_ads_reconcile_pause_receipt_v1(uuid,uuid,text,text,uuid,text,text,uuid,inet,text) to service_role;
grant execute on function public.m03_ads_finalize_pause_v1(uuid,uuid,text,uuid,inet,text) to service_role;
grant execute on function public.m03_ads_pause_canonical_payload_v1(text,text) to service_role;
