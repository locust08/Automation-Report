create or replace function m04_ads_internal.resolve_m04_actor(p_actor_id uuid)
returns table(actor_name text, actor_email text, actor_role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select
    coalesce(nullif(pg_catalog.btrim(operator.email), ''), auth_user.email),
    auth_user.email::text,
    'staff'::text
  from auth.users as auth_user
  join public.ads_staff_members as operator on operator.user_id = auth_user.id
  where auth_user.id = p_actor_id
    and operator.is_active
    and auth_user.email_confirmed_at is not null
    and auth_user.email = pg_catalog.lower(auth_user.email)
    and auth_user.email ~ '^[^@]+@(locus-t\.com\.my|digitalbee\.ai)$';

  if not found then
    raise exception 'Actor is not an active approved operator' using errcode = '42501';
  end if;
end;
$$;

revoke all on function m04_ads_internal.resolve_m04_actor(uuid)
  from public, anon, authenticated, service_role;
