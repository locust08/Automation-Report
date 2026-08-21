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
    coalesce(nullif(pg_catalog.btrim(app_admin.full_name), ''), app_admin.email),
    app_admin.email::text,
    'admin'::text
  from public.ads_reporting_auth as app_admin
  where app_admin.user_id = p_actor_id
    and app_admin.is_active is true
    and app_admin.role = 'admin'
    and app_admin.email = pg_catalog.lower(app_admin.email)
    and app_admin.email ~ '^[^@]+@(locus-t\\.com\\.my|digitalbee\\.ai)$'

  union all

  select
    coalesce(nullif(pg_catalog.btrim(staff.email), ''), auth_user.email),
    auth_user.email::text,
    'staff'::text
  from auth.users as auth_user
  join public.ads_staff_members as staff
    on staff.user_id = auth_user.id
   and staff.is_active is true
  where auth_user.id = p_actor_id
    and auth_user.email_confirmed_at is not null
    and auth_user.email = pg_catalog.lower(auth_user.email)
    and auth_user.email ~ '^[^@]+@(locus-t\\.com\\.my|digitalbee\\.ai)$'
    and not exists (
      select 1
      from public.ads_reporting_auth as existing_admin
      where existing_admin.user_id = p_actor_id
        and existing_admin.is_active is true
        and existing_admin.role = 'admin'
    );

  if not found then
    raise exception 'Actor is not an active approved operator' using errcode = '42501';
  end if;
end;
$$;

revoke all on function m04_ads_internal.resolve_m04_actor(uuid) from public, anon, authenticated;
grant execute on function m04_ads_internal.resolve_m04_actor(uuid) to service_role;
