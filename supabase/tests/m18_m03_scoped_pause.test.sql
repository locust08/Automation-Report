-- Disposable PostgreSQL fixture with stubbed operator resolution. Real operator
-- identity and production migration compatibility require connected acceptance.
\set ON_ERROR_STOP on
begin;
create schema extensions;
create extension pgcrypto with schema extensions;
create table public.m03_ads_change_requests(id uuid primary key,platform text,status text,account_identity text,campaign_identity text,lock_version bigint default 0,updated_at timestamptz default now());
create table public.m03_ads_change_request_revisions(id uuid primary key,request_id uuid,revision_number integer,canonical_payload jsonb,payload_hash text);
create table public.m03_ads_change_items(id uuid primary key,request_id uuid,entity_type text,entity_identity text,field_path text,value_type text,baseline_value jsonb,proposed_value jsonb,evidence jsonb,platform_resource_mapping jsonb,provider_result_evidence jsonb,readback_evidence jsonb);
create table public.m03_ads_change_approvals(request_id uuid,revision_id uuid,revision_hash text,decision text);
create table public.m03_ads_provider_resource_mappings(request_id uuid,item_id uuid,operation_plan jsonb);
create table public.m03_ads_request_source_verifications(request_id uuid,platform text,provider_account_identity text,provider_campaign_identity text);
create table public.m03_ads_provider_baseline_snapshots(request_id uuid,revision_id uuid,source text,platform text,account_identity text,campaign_identity text,captured_at timestamptz,canonical_payload jsonb);
create table public.m03_ads_change_events(request_id uuid,revision_id uuid,event_type text,from_status text,to_status text,actor_id uuid,trusted_ip inet,trusted_user_agent text,metadata jsonb);
create function public.m03_ads_assert_operator_v1(uuid,inet,text) returns jsonb language sql as $$select '{}'::jsonb$$;
\ir ../migrations/20261002075616_m03_revision_integrity_receipts.sql
\ir ../migrations/20261002080045_m03_durable_operation_claims.sql
\ir ../migrations/20261002082327_m03_approved_request_scope.sql
\ir ../migrations/20261012015025_m18_m03_scoped_pause.sql
do $$
declare request_id uuid:=gen_random_uuid(); revision_id uuid:=gen_random_uuid(); item_id uuid:=gen_random_uuid(); actor_id uuid:=gen_random_uuid();
  hash text; op jsonb; ophash text; token uuid; observed jsonb; payload text; response jsonb; canonical jsonb;
begin
  insert into public.m03_ads_change_requests(id,platform,status,account_identity,campaign_identity) values(request_id,'google','approved','2315114913','123');
  insert into public.m03_ads_change_items values(item_id,request_id,'campaign','123','campaign.status','string','"ENABLED"','"PAUSED"','{}','{}','{}','{}');
  select jsonb_build_object('platform','google','account_identity','2315114913','campaign_identity','123','items',jsonb_agg(jsonb_build_object('entity_type',entity_type,'entity_identity',entity_identity,'field_path',field_path,'value_type',value_type,'baseline_value',baseline_value,'proposed_value',proposed_value,'evidence',evidence,'platform_resource_mapping',platform_resource_mapping))) into canonical from public.m03_ads_change_items;
  hash:=encode(extensions.digest(convert_to(canonical::text,'utf8'),'sha256'),'hex');
  insert into public.m03_ads_change_request_revisions values(revision_id,request_id,1,canonical,hash);
  insert into public.m03_ads_change_approvals values(request_id,revision_id,hash,'approved');
  insert into public.m03_ads_request_source_verifications values(request_id,'google','2315114913','123');
  payload:=public.m03_ads_pause_canonical_payload_v1('2315114913','123');
  op:=jsonb_build_object('operation_key','pause','idempotency_key','pause-key','item_id',item_id,'platform','google','action','update','field_path','campaign.status','resource_identity','123','expected_result',payload::jsonb,'depends_on',jsonb_build_array());
  ophash:=encode(extensions.digest(convert_to(op::text,'utf8'),'sha256'),'hex');
  insert into public.m03_ads_provider_resource_mappings values(request_id,item_id,jsonb_build_array(op));
  insert into public.m03_ads_provider_baseline_snapshots values(request_id,revision_id,'provider','google','2315114913','123',now(),'{"campaign:123:campaign.status":"ENABLED"}');
  response:=public.m03_ads_claim_execution_operation_v1(request_id,revision_id,hash,op::text,ophash,actor_id,null,'fixture'); token:=(response->'receipt'->>'claim_token')::uuid;
  begin
    perform public.m03_ads_finalize_pause_v1(request_id,revision_id,hash,actor_id,null,'fixture'); raise exception 'TEST unverified pause finalized';
  exception when others then if sqlerrm<>'verified_pause_required' then raise; end if; end;
  perform public.m03_ads_record_execution_receipt_v1(request_id,revision_id,'pause',token,jsonb_build_object('operation_key','pause','outcome','ambiguous','provider_response','{}'::jsonb),null,null,actor_id,null,'fixture');
  observed:=jsonb_build_object('resource_identity','123','canonical_payload',payload::jsonb,'payload_hash',encode(extensions.digest(convert_to(payload,'utf8'),'sha256'),'hex'),'verified_at',clock_timestamp());
  begin
    perform public.m03_ads_reconcile_pause_receipt_v1(request_id,revision_id,hash,'pause',token,observed::text,payload,gen_random_uuid(),null,'fixture'); raise exception 'TEST foreign actor accepted';
  exception when others then if sqlerrm<>'pause_receipt_scope_mismatch' then raise; end if; end;
  begin
    perform public.m03_ads_reconcile_pause_receipt_v1(request_id,revision_id,hash,'pause',token,(observed||'{"canonical_payload":{"status":"ACTIVE"}}')::text,payload,actor_id,null,'fixture'); raise exception 'TEST active readback accepted';
  exception when others then if sqlerrm<>'official_paused_readback_required' then raise; end if; end;
  begin
    perform public.m03_ads_reconcile_pause_receipt_v1(request_id,revision_id,hash,'pause',token,(observed||jsonb_build_object('verified_at',clock_timestamp()-interval '16 minutes'))::text,payload,actor_id,null,'fixture'); raise exception 'TEST stale readback accepted';
  exception when others then if sqlerrm<>'official_paused_readback_required' then raise; end if; end;
  perform public.m03_ads_reconcile_pause_receipt_v1(request_id,revision_id,hash,'pause',token,observed::text,payload,actor_id,null,'fixture');
  response:=public.m03_ads_finalize_pause_v1(request_id,revision_id,hash,actor_id,null,'fixture');
  perform public.m03_ads_finalize_pause_v1(request_id,revision_id,hash,actor_id,null,'fixture');
  if response->>'status'<>'verified' or (select lock_version from public.m03_ads_change_requests where id=request_id)<>1 then raise exception 'TEST finalization not idempotent'; end if;
  if (select result->>'outcome' from public.m03_ads_execution_operations)<>'ambiguous' then raise exception 'TEST original outcome overwritten'; end if;
  update public.m03_ads_change_items set proposed_value='"ACTIVE"';
  begin
    perform public.m03_ads_finalize_pause_v1(request_id,revision_id,hash,actor_id,null,'fixture'); raise exception 'TEST edited items finalized';
  exception when others then if sqlerrm<>'exact_pause_item_required' then raise; end if; end;
  if has_function_privilege('authenticated','public.m03_ads_finalize_pause_v1(uuid,uuid,text,uuid,inet,text)','execute') or has_function_privilege('anon','public.m03_ads_reconcile_pause_receipt_v1(uuid,uuid,text,text,uuid,text,text,uuid,inet,text)','execute') then raise exception 'TEST public access granted'; end if;
end $$;
rollback;
