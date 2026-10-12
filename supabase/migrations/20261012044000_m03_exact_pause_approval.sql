-- Approve the revision displayed by a private MCP card under the same request lock.
create function public.m03_ads_approve_exact_pause_v1(
 p_request_id uuid,p_revision_id uuid,p_revision_hash text,p_comment text,
 p_actor_id uuid,p_trusted_ip inet,p_trusted_user_agent text,p_idempotency_key text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.m03_ads_change_requests; v public.m03_ads_change_request_revisions; reviewed jsonb;
begin
 perform public.m03_ads_assert_operator_v1(p_actor_id,p_trusted_ip,p_trusted_user_agent);
 select * into r from public.m03_ads_change_requests where id=p_request_id for update;
 if not found or r.platform not in ('google','meta') then raise exception 'pause_request_required'; end if;
 select * into v from public.m03_ads_change_request_revisions where request_id=r.id order by revision_number desc limit 1;
 if v.id is distinct from p_revision_id or v.payload_hash is distinct from p_revision_hash then raise exception 'latest_revision_required'; end if;
 perform public.m03_ads_revision_integrity_receipt_v1(r.id,v.id,v.payload_hash);
 if exists(select 1 from public.m03_ads_idempotency_claims c where c.action='approve_v2' and c.idempotency_key=p_idempotency_key and (c.request_id is distinct from r.id or not exists(select 1 from public.m03_ads_change_approvals a where a.id=(c.response_snapshot->>'approval_id')::uuid and a.request_id=r.id and a.revision_id=v.id and a.revision_hash=v.payload_hash and a.approved_by_id=p_actor_id))) then raise exception 'idempotency_scope_changed'; end if;
 if v.canonical_payload->>'platform' is distinct from r.platform or v.canonical_payload->>'account_identity' is distinct from r.account_identity or v.canonical_payload->>'campaign_identity' is distinct from r.campaign_identity then raise exception 'approved_scope_changed'; end if;
 select jsonb_agg(jsonb_build_object('entity_type',entity_type,'entity_identity',entity_identity,'field_path',field_path,'value_type',value_type,'baseline_value',baseline_value,'proposed_value',proposed_value,'evidence',evidence,'platform_resource_mapping',platform_resource_mapping) order by entity_type,entity_identity,field_path) into reviewed from public.m03_ads_change_items where request_id=r.id;
 if reviewed is null or v.canonical_payload->'items' is distinct from reviewed or jsonb_array_length(reviewed)<>1 or reviewed->0->>'entity_type' is distinct from 'campaign' or reviewed->0->>'entity_identity' is distinct from r.campaign_identity or reviewed->0->>'field_path' is distinct from 'campaign.status' or reviewed->0->>'value_type' is distinct from 'string' or reviewed->0->>'proposed_value' is distinct from 'PAUSED' or jsonb_typeof(reviewed->0->'baseline_value') is distinct from 'string' or reviewed->0->>'baseline_value' not in ('ACTIVE','ENABLED','PAUSED') then raise exception 'exact_pause_item_required'; end if;
 return public.m03_ads_approve_mock_change_request_v2(r.id,p_comment,p_actor_id,p_trusted_ip,p_trusted_user_agent,p_idempotency_key);
end $$;
revoke all on function public.m03_ads_approve_exact_pause_v1(uuid,uuid,text,text,uuid,inet,text,text) from public,anon,authenticated;
grant execute on function public.m03_ads_approve_exact_pause_v1(uuid,uuid,text,text,uuid,inet,text,text) to service_role;
