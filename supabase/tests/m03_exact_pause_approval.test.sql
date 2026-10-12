\set ON_ERROR_STOP on
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table public.m03_ads_change_requests(id uuid primary key,platform text,status text,account_identity text,campaign_identity text);
create table public.m03_ads_change_request_revisions(id uuid primary key,request_id uuid,revision_number int,canonical_payload jsonb,payload_hash text);
create table public.m03_ads_change_items(request_id uuid,entity_type text,entity_identity text,field_path text,value_type text,baseline_value jsonb,proposed_value jsonb,evidence jsonb,platform_resource_mapping jsonb);
create table public.m03_ads_change_approvals(id uuid primary key,request_id uuid,revision_id uuid,revision_hash text,approved_by_id uuid);
create table public.m03_ads_idempotency_claims(action text,request_id uuid,idempotency_key text,response_snapshot jsonb,unique(action,idempotency_key));
create function public.m03_ads_assert_operator_v1(uuid,inet,text) returns jsonb language sql as $$select '{}'::jsonb$$;
create function public.m03_ads_approve_mock_change_request_v2(p_request_id uuid,p_comment text,p_actor_id uuid,p_trusted_ip inet,p_trusted_user_agent text,p_idempotency_key text) returns jsonb language plpgsql as $$
declare v public.m03_ads_change_request_revisions; response jsonb; aid uuid:=gen_random_uuid();
begin
 select response_snapshot into response from public.m03_ads_idempotency_claims where action='approve_v2' and idempotency_key=p_idempotency_key;
 if found then return response; end if;
 select * into v from public.m03_ads_change_request_revisions where request_id=p_request_id order by revision_number desc limit 1;
 insert into public.m03_ads_change_approvals values(aid,p_request_id,v.id,v.payload_hash,p_actor_id);
 response:=jsonb_build_object('request_id',p_request_id,'approval_id',aid);
 insert into public.m03_ads_idempotency_claims values('approve_v2',p_request_id,p_idempotency_key,response);
 update public.m03_ads_change_requests set status='approved' where id=p_request_id;
 return response;
end $$;
\ir ../migrations/20261002075616_m03_revision_integrity_receipts.sql
\ir ../migrations/20261012044000_m03_exact_pause_approval.sql
do $$
declare rid uuid:=gen_random_uuid(); rev uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); h text; payload jsonb; second uuid:=gen_random_uuid(); secondrev uuid:=gen_random_uuid();
begin
 insert into public.m03_ads_change_requests values(rid,'google','awaiting_approval','2315114913','123');
 insert into public.m03_ads_change_items values(rid,'campaign','123','campaign.status','string','"PAUSED"','"PAUSED"','{}','{}');
 select jsonb_build_object('platform','google','account_identity','2315114913','campaign_identity','123','items',jsonb_agg(jsonb_build_object('entity_type',entity_type,'entity_identity',entity_identity,'field_path',field_path,'value_type',value_type,'baseline_value',baseline_value,'proposed_value',proposed_value,'evidence',evidence,'platform_resource_mapping',platform_resource_mapping))) into payload from public.m03_ads_change_items;
 h:=encode(extensions.digest(convert_to(payload::text,'utf8'),'sha256'),'hex');
 insert into public.m03_ads_change_request_revisions values(rev,rid,1,payload,h);
 begin perform public.m03_ads_approve_exact_pause_v1(rid,gen_random_uuid(),h,'fixture',actor,'127.0.0.1','fixture','unique-key');raise exception 'stale revision accepted'; exception when others then if sqlerrm<>'latest_revision_required' then raise; end if; end;
 perform public.m03_ads_approve_exact_pause_v1(rid,rev,h,'fixture',actor,'127.0.0.1','fixture','unique-key');
 perform public.m03_ads_approve_exact_pause_v1(rid,rev,h,'fixture',actor,'127.0.0.1','fixture','unique-key');
 if (select count(*) from public.m03_ads_change_approvals)<>1 then raise exception 'duplicate approval'; end if;
 insert into public.m03_ads_change_requests values(second,'google','awaiting_approval','2315114913','123');
 insert into public.m03_ads_change_items select second,entity_type,entity_identity,field_path,value_type,baseline_value,proposed_value,evidence,platform_resource_mapping from public.m03_ads_change_items where request_id=rid;
 insert into public.m03_ads_change_request_revisions values(secondrev,second,1,payload,h);
 begin perform public.m03_ads_approve_exact_pause_v1(second,secondrev,h,'fixture',actor,'127.0.0.1','fixture','unique-key');raise exception 'cross-request replay accepted'; exception when others then if sqlerrm<>'idempotency_scope_changed' then raise; end if; end;
 update public.m03_ads_change_items set proposed_value='"ENABLED"' where request_id=rid;
 begin perform public.m03_ads_approve_exact_pause_v1(rid,rev,h,'fixture',actor,'127.0.0.1','fixture','other-key');raise exception 'modified item accepted'; exception when others then if sqlerrm<>'exact_pause_item_required' then raise; end if; end;
 if has_function_privilege('anon','public.m03_ads_approve_exact_pause_v1(uuid,uuid,text,text,uuid,inet,text,text)','EXECUTE') or has_function_privilege('authenticated','public.m03_ads_approve_exact_pause_v1(uuid,uuid,text,text,uuid,inet,text,text)','EXECUTE') then raise exception 'public approval access'; end if;
end $$;
rollback;
