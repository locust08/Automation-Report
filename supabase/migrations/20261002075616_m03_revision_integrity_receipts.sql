-- Preserve the historical PostgreSQL jsonb::text revision hash contract.
-- Read only: no historical hash, approval or payload is rewritten.
create or replace function public.m03_ads_revision_integrity_receipt_v1(
  p_request_id uuid, p_revision_id uuid, p_revision_hash text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_revision public.m03_ads_change_request_revisions;
begin
  select * into v_revision from public.m03_ads_change_request_revisions
    where id=p_revision_id and request_id=p_request_id;
  if not found then raise exception 'revision_not_owned_by_request'; end if;
  if v_revision.payload_hash is distinct from p_revision_hash
    or v_revision.payload_hash is distinct from pg_catalog.encode(extensions.digest(pg_catalog.convert_to(v_revision.canonical_payload::text,'utf8'),'sha256'),'hex')
    then raise exception 'revision_integrity_mismatch'; end if;
  return pg_catalog.jsonb_build_object('revision_id',v_revision.id,'payload_hash',v_revision.payload_hash,'canonical_text',v_revision.canonical_payload::text);
end $$;
revoke all on function public.m03_ads_revision_integrity_receipt_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.m03_ads_revision_integrity_receipt_v1(uuid,uuid,text) to service_role;
