-- Disposable wrapper fixture. Operator resolver and dependency tables are stubs;
-- this does not certify authentication or the entire migration chain.
\set ON_ERROR_STOP on
begin;
create schema extensions;
create extension pgcrypto with schema extensions;
create table public.m03_ads_change_requests(id uuid primary key,platform text,status text,account_identity text,campaign_identity text);
create table public.m03_ads_change_request_revisions(id uuid primary key,request_id uuid,revision_number integer,canonical_payload jsonb,payload_hash text);
create table public.m03_ads_change_items(id uuid primary key,request_id uuid,entity_type text,entity_identity text,field_path text,value_type text,baseline_value jsonb,proposed_value jsonb,evidence jsonb,platform_resource_mapping jsonb);
create table public.m03_ads_change_approvals(request_id uuid,revision_id uuid,revision_hash text,decision text);
create table public.m03_ads_provider_resource_mappings(request_id uuid,item_id uuid,operation_plan jsonb);
create table public.m03_ads_request_source_verifications(request_id uuid,platform text,provider_account_identity text,provider_campaign_identity text);
create table public.m03_ads_provider_baseline_snapshots(request_id uuid,revision_id uuid,source text,platform text,account_identity text,campaign_identity text,captured_at timestamptz,canonical_payload jsonb);
create table public.m03_ads_change_events(request_id uuid,revision_id uuid,event_type text,actor_id uuid,trusted_ip inet,trusted_user_agent text,metadata jsonb);
create function public.m03_ads_assert_operator_v1(uuid,inet,text) returns jsonb language sql as $$select '{}'::jsonb$$;
\ir ../migrations/20261002075616_m03_revision_integrity_receipts.sql
\ir ../migrations/20261002080045_m03_durable_operation_claims.sql
\ir ../migrations/20261002082327_m03_approved_request_scope.sql
do $$
<<fixture>>
declare request_id uuid:=gen_random_uuid(); revision_id uuid:=gen_random_uuid(); item_id uuid:=gen_random_uuid(); actor_id uuid:=gen_random_uuid();
  hash text; op jsonb; optext text; ophash text; result jsonb; claim jsonb; second jsonb; token uuid; readback jsonb; payload_text text;
begin
  insert into public.m03_ads_change_requests values(request_id,'google','approved','123','456');
  insert into public.m03_ads_change_items values(item_id,request_id,'campaign','456','campaign.name','string','"Old"','"New"','{}','{}');
  insert into public.m03_ads_change_request_revisions
    select fixture.revision_id,fixture.request_id,1,jsonb_build_object('platform','google','account_identity','123','campaign_identity','456','items',jsonb_agg(jsonb_build_object('entity_type',entity_type,'entity_identity',entity_identity,'field_path',field_path,'value_type',value_type,'baseline_value',baseline_value,'proposed_value',proposed_value,'evidence',evidence,'platform_resource_mapping',platform_resource_mapping))),''
    from public.m03_ads_change_items;
  update public.m03_ads_change_request_revisions set payload_hash=encode(extensions.digest(convert_to(canonical_payload::text,'utf8'),'sha256'),'hex') returning payload_hash into hash;
  insert into public.m03_ads_change_approvals values(request_id,revision_id,hash,'approved');
  insert into public.m03_ads_request_source_verifications values(request_id,'google','123','456');
  insert into public.m03_ads_provider_baseline_snapshots values(request_id,revision_id,'provider','google','123','456',clock_timestamp(),'{"campaign:456:campaign.name":"Old"}');
  op:=jsonb_build_object('operation_key','op','item_id',item_id,'platform','google','provider_resource','campaign','field_path','campaign.name','mode','direct_update','action','update','resource_identity','456','payload',jsonb_build_object('name','New'),'expected_result',jsonb_build_object('name','New'),'depends_on','[]'::jsonb,'idempotency_key','stable-key');
  insert into public.m03_ads_provider_resource_mappings values(request_id,item_id,jsonb_build_array(op));
  optext:=op::text; ophash:=encode(extensions.digest(convert_to(optext,'utf8'),'sha256'),'hex');
  claim:=public.m03_ads_claim_execution_operation_v1(request_id,revision_id,hash,optext,ophash,actor_id,null,'fixture');
  second:=public.m03_ads_claim_execution_operation_v1(request_id,revision_id,hash,optext,ophash,actor_id,null,'fixture');
  if claim->>'acquired'<>'true' or second->>'acquired'<>'false' or claim->'receipt'->>'claim_token'<>second->'receipt'->>'claim_token' then raise exception 'TEST duplicate claim'; end if;
  token:=(claim->'receipt'->>'claim_token')::uuid;
  begin
    perform public.m03_ads_claim_execution_operation_v1(request_id,revision_id,repeat('0',64),optext,ophash,actor_id,null,'fixture');
    raise exception 'TEST changed revision accepted'; exception when others then if sqlerrm<>'latest_revision_required' then raise; end if; end;
  begin
    perform public.m03_ads_record_execution_receipt_v1(request_id,revision_id,'op',gen_random_uuid(),'{}',null,null,actor_id,null,'fixture');
    raise exception 'TEST fencing failed'; exception when others then if sqlerrm<>'execution_claim_mismatch' then raise; end if; end;
  result:=jsonb_build_object('operation_key','op','outcome','succeeded','provider_response','{}'::jsonb);
  perform public.m03_ads_record_execution_receipt_v1(request_id,revision_id,'op',token,result,null,null,actor_id,null,'fixture');
  begin
    perform public.m03_ads_record_execution_receipt_v1(request_id,revision_id,'op',token,result||'{"outcome":"failed"}',null,null,actor_id,null,'fixture');
    raise exception 'TEST result overwritten'; exception when others then if sqlerrm<>'execution_result_immutable' then raise; end if; end;
  payload_text:='{"name":"New"}';
  readback:=jsonb_build_object('resource_identity','456','canonical_payload',payload_text::jsonb,'payload_hash',encode(extensions.digest(convert_to(payload_text,'utf8'),'sha256'),'hex'),'verified_at',clock_timestamp());
  begin
    perform public.m03_ads_record_execution_receipt_v1(request_id,revision_id,'op',token,null,(readback||'{"payload_hash":"wrong"}')::text,payload_text,actor_id,null,'fixture');
    raise exception 'TEST hash mismatch accepted'; exception when others then if sqlerrm<>'readback_hash_mismatch' then raise; end if; end;
  perform public.m03_ads_record_execution_receipt_v1(request_id,revision_id,'op',token,null,readback::text,payload_text,actor_id,null,'fixture');
  second:=public.m03_ads_claim_execution_operation_v1(request_id,revision_id,hash,optext,ophash,actor_id,null,'fixture');
  if second->'receipt'->>'state'<>'verified' or second->>'acquired'<>'false' then raise exception 'TEST verified replay'; end if;
  update public.m03_ads_change_requests set account_identity='foreign';
  begin
    perform public.m03_ads_claim_execution_operation_v1(request_id,revision_id,hash,optext,ophash,actor_id,null,'fixture');
    raise exception 'TEST approved scope alteration accepted'; exception when others then if sqlerrm<>'approved_scope_changed' then raise; end if; end;
  update public.m03_ads_change_requests set account_identity='123';
  update public.m03_ads_change_items set proposed_value='"Changed"';
  begin
    perform public.m03_ads_claim_execution_operation_v1(request_id,revision_id,hash,optext,ophash,actor_id,null,'fixture');
    raise exception 'TEST approved item alteration accepted'; exception when others then if sqlerrm<>'approved_items_changed' then raise; end if; end;
  if has_table_privilege('authenticated','public.m03_ads_execution_operations','select')
    or has_function_privilege('anon','public.m03_ads_claim_execution_operation_v1(uuid,uuid,text,text,text,uuid,inet,text)','execute')
    or not (select relrowsecurity from pg_class where oid='public.m03_ads_execution_operations'::regclass) then raise exception 'TEST access unsafe'; end if;
end $$;
rollback;
