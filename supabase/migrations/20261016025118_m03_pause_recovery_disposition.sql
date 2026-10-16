-- A stranded pause claim remains permanent evidence of an unknown transport
-- outcome. Recovery records a separate disposition and creates a new draft in
-- the same transaction; it never edits or replays the original receipt.
create table public.m03_ads_pause_recovery_dispositions (
  id uuid primary key default gen_random_uuid(),
  old_receipt_id uuid not null unique references public.m03_ads_execution_operations(id),
  old_request_id uuid not null unique references public.m03_ads_change_requests(id),
  old_revision_id uuid not null references public.m03_ads_change_request_revisions(id),
  old_revision_hash text not null check (old_revision_hash ~ '^[a-f0-9]{64}$'),
  old_operation_key text not null,
  new_request_id uuid not null unique references public.m03_ads_change_requests(id),
  official_status text not null check (official_status='ENABLED'),
  official_observed_at timestamptz not null,
  source_evidence jsonb not null check (jsonb_typeof(source_evidence)='object'),
  actor_id uuid not null,
  trusted_ip inet,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.m03_ads_pause_recovery_dispositions enable row level security;
revoke all on public.m03_ads_pause_recovery_dispositions from public,anon,authenticated;
grant select,insert on public.m03_ads_pause_recovery_dispositions to service_role;

create function public.m03_ads_prevent_disposed_pause_verification_v1() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.state='verified' and old.state<>'verified' and exists (
    select 1 from public.m03_ads_pause_recovery_dispositions where old_receipt_id=old.id
  ) then raise exception 'disposed_pause_receipt_cannot_verify'; end if;
  return new;
end $$;
create trigger m03_ads_disposed_pause_verification_guard
before update of state on public.m03_ads_execution_operations
for each row execute function public.m03_ads_prevent_disposed_pause_verification_v1();

create function public.m03_ads_recover_unobserved_pause_v1(
  p_request_id uuid,p_revision_id uuid,p_revision_hash text,p_receipt_id uuid,p_operation_key text,
  p_platform text,p_account_identity text,p_campaign_identity text,p_client_id uuid,
  p_official_status text,p_official_observed_at timestamptz,p_source_evidence jsonb,
  p_baseline_payload jsonb,p_baseline_hash text,p_items jsonb,p_idempotency_key text,
  p_actor_id uuid,p_trusted_ip inet,p_trusted_user_agent text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare old_request public.m03_ads_change_requests; old_revision public.m03_ads_change_request_revisions;
  receipt public.m03_ads_execution_operations; old_item public.m03_ads_change_items;
  existing public.m03_ads_pause_recovery_dispositions; created jsonb; new_id uuid;
begin
  perform public.m03_ads_assert_operator_v1(p_actor_id,p_trusted_ip,p_trusted_user_agent);
  select * into old_request from public.m03_ads_change_requests where id=p_request_id for update;
  if not found then raise exception 'change_request_not_found'; end if;
  select * into receipt from public.m03_ads_execution_operations where id=p_receipt_id and request_id=p_request_id for update;
  if not found or receipt.operation_key is distinct from p_operation_key then raise exception 'pause_receipt_scope_mismatch'; end if;
  select * into existing from public.m03_ads_pause_recovery_dispositions where old_receipt_id=receipt.id;
  if found then
    if existing.old_revision_id is distinct from p_revision_id or existing.old_revision_hash is distinct from p_revision_hash
      or existing.actor_id is distinct from p_actor_id then raise exception 'recovery_identity_conflict'; end if;
    return jsonb_build_object('old_request_id',p_request_id,'new_request_id',existing.new_request_id,'already_recovered',true);
  end if;
  select * into old_revision from public.m03_ads_change_request_revisions where request_id=p_request_id order by revision_number desc limit 1;
  if old_revision.id is distinct from p_revision_id or old_revision.payload_hash is distinct from p_revision_hash
    or receipt.revision_id is distinct from old_revision.id or old_request.status not in ('approved','publishing','ready_to_publish','provider_execution_locked')
    or old_request.platform is distinct from p_platform or old_request.account_identity is distinct from p_account_identity
    or old_request.campaign_identity is distinct from p_campaign_identity or old_request.client_id is distinct from p_client_id
    then raise exception 'recovery_scope_changed'; end if;
  perform public.m03_ads_revision_integrity_receipt_v1(p_request_id,p_revision_id,p_revision_hash);
  if not exists(select 1 from public.m03_ads_change_approvals where request_id=p_request_id and revision_id=p_revision_id
    and revision_hash=p_revision_hash and decision='approved') then raise exception 'exact_approval_required'; end if;
  if (select count(*) from public.m03_ads_change_items where request_id=p_request_id)<>1 then raise exception 'exact_pause_item_required'; end if;
  select * into old_item from public.m03_ads_change_items where request_id=p_request_id;
  if old_item.entity_type<>'campaign' or old_item.entity_identity<>p_campaign_identity or old_item.field_path<>'campaign.status'
    or old_item.value_type<>'string' or old_item.baseline_value is distinct from '"ENABLED"'::jsonb
    or old_item.proposed_value is distinct from '"PAUSED"'::jsonb
    or old_revision.canonical_payload->>'platform' is distinct from p_platform
    or old_revision.canonical_payload->>'account_identity' is distinct from p_account_identity
    or old_revision.canonical_payload->>'campaign_identity' is distinct from p_campaign_identity
    or old_revision.canonical_payload->'items' is distinct from jsonb_build_array(jsonb_build_object(
      'entity_type',old_item.entity_type,'entity_identity',old_item.entity_identity,'field_path',old_item.field_path,
      'value_type',old_item.value_type,'baseline_value',old_item.baseline_value,'proposed_value',old_item.proposed_value,
      'evidence',old_item.evidence,'platform_resource_mapping',old_item.platform_resource_mapping))
    or old_item.evidence->>'m18_workflow_id' is distinct from p_source_evidence->>'m18_workflow_id'
    or old_item.evidence->>'m18_revision_id' is distinct from p_source_evidence->>'m18_revision_id'
    or old_item.evidence->>'m18_receipt_id' is distinct from p_source_evidence->>'m18_receipt_id'
    then raise exception 'exact_pause_item_required'; end if;
  if receipt.state<>'started' or receipt.result is not null or receipt.readback is not null
    or receipt.created_at>clock_timestamp()-interval '10 minutes'
    or receipt.operation->>'platform' is distinct from p_platform or receipt.operation->>'action' is distinct from 'update'
    or receipt.operation->>'field_path' is distinct from 'campaign.status'
    or receipt.operation->>'resource_identity' is distinct from p_campaign_identity
    or receipt.operation->'expected_result' is distinct from jsonb_build_object('account_id',p_account_identity,'campaign_id',p_campaign_identity,'status','PAUSED')
    then raise exception 'pause_claim_not_recoverable'; end if;
  if p_official_status<>'ENABLED' or p_official_observed_at not between clock_timestamp()-interval '60 seconds' and clock_timestamp()
    or p_baseline_payload is distinct from jsonb_build_object('campaign:'||p_campaign_identity||':campaign.status', 'ENABLED')
    or p_baseline_hash is distinct from pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      '{'||to_json('campaign:'||p_campaign_identity||':campaign.status')::text||':"ENABLED"}','utf8'),'sha256'),'hex')
    or p_source_evidence is null or jsonb_typeof(p_source_evidence)<>'object'
    or nullif(p_source_evidence->>'m18_workflow_id','') is null
    or nullif(p_source_evidence->>'m18_revision_id','') is null
    or nullif(p_source_evidence->>'m18_receipt_id','') is null
    then raise exception 'fresh_enabled_source_required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<>1
    or p_items->0->>'entity_type'<>'campaign' or p_items->0->>'entity_identity'<>p_campaign_identity
    or p_items->0->>'field_path'<>'campaign.status' or p_items->0->>'value_type'<>'string'
    or p_items->0->'baseline_value' is distinct from '"ENABLED"'::jsonb
    or p_items->0->'proposed_value' is distinct from '"PAUSED"'::jsonb
    or p_items->0->'evidence' is distinct from p_source_evidence
    then raise exception 'recovery_item_invalid'; end if;
  created:=public.m03_ads_create_post_launch_change_request_v1(
    p_platform,'M03 recovered campaign pause','Separate pause after unobserved prior claim',p_client_id,
    p_account_identity,p_campaign_identity,null,null,null,p_request_id,p_items,
    'legacy_provider_adoption',null,p_source_evidence,p_baseline_payload,p_baseline_hash,p_official_observed_at,
    p_actor_id,p_trusted_ip,p_trusted_user_agent,p_idempotency_key);
  new_id:=(created->>'request_id')::uuid;
  insert into public.m03_ads_pause_recovery_dispositions(
    old_receipt_id,old_request_id,old_revision_id,old_revision_hash,old_operation_key,new_request_id,
    official_status,official_observed_at,source_evidence,actor_id,trusted_ip)
    values(receipt.id,p_request_id,p_revision_id,p_revision_hash,p_operation_key,new_id,
    p_official_status,p_official_observed_at,p_source_evidence,p_actor_id,p_trusted_ip);
  insert into public.m03_ads_change_events(request_id,revision_id,event_type,actor_id,trusted_ip,trusted_user_agent,metadata)
    values(p_request_id,p_revision_id,'pause_unobserved_disposed',p_actor_id,p_trusted_ip,left(p_trusted_user_agent,1000),
      jsonb_build_object('old_receipt_id',receipt.id,'new_request_id',new_id,'official_status','ENABLED','official_observed_at',p_official_observed_at));
  return jsonb_build_object('old_request_id',p_request_id,'new_request_id',new_id,'already_recovered',false);
end $$;
revoke all on function public.m03_ads_prevent_disposed_pause_verification_v1() from public,anon,authenticated;
revoke all on function public.m03_ads_recover_unobserved_pause_v1(uuid,uuid,text,uuid,text,text,text,text,uuid,text,timestamptz,jsonb,jsonb,text,jsonb,text,uuid,inet,text) from public,anon,authenticated;
grant execute on function public.m03_ads_recover_unobserved_pause_v1(uuid,uuid,text,uuid,text,text,text,text,uuid,text,timestamptz,jsonb,jsonb,text,jsonb,text,uuid,inet,text) to service_role;
