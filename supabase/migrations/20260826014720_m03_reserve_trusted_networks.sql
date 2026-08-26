-- Keep public.m03_ads_trusted_networks intact for a possible future provider-
-- publishing network gate. Current M03 authorization uses the active reporting
-- administrator and approved operator email domain only. Trusted request IP is
-- still captured as audit evidence, but it is not matched against that table.
create or replace function m03_ads_internal.resolve_operator(
  p_actor_id uuid,
  p_trusted_ip inet
) returns table(actor_name text, actor_email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select
    coalesce(nullif(pg_catalog.btrim(a.full_name), ''), a.email),
    pg_catalog.lower(a.email)::text
  from public.ads_reporting_auth a
  where a.user_id = p_actor_id
    and a.is_active is true
    and a.role = 'admin'
    and exists (
      select 1
      from public.m03_ads_approved_domains d
      where d.client_id is null
        and d.is_active is true
        and d.domain = pg_catalog.split_part(pg_catalog.lower(a.email), '@', 2)
    );

  if not found then
    raise exception 'operator_domain_not_approved' using errcode = '42501';
  end if;
end;
$$;
