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
    coalesce(
      nullif(pg_catalog.btrim(app_admin.full_name), ''),
      nullif(pg_catalog.btrim(staff.email), ''),
      auth_user.email
    ),
    auth_user.email::text,
    case when app_admin.user_id is not null then 'admin'::text else 'staff'::text end
  from auth.users as auth_user
  left join public.ads_staff_members as staff
    on staff.user_id = auth_user.id
   and staff.is_active is true
  left join public.ads_reporting_auth as app_admin
    on app_admin.user_id = auth_user.id
   and app_admin.is_active is true
   and app_admin.role = 'admin'
  where auth_user.id = p_actor_id
    and auth_user.email_confirmed_at is not null
    and auth_user.email = pg_catalog.lower(auth_user.email)
    and auth_user.email ~ '^[^@]+@(locus-t\\.com\\.my|digitalbee\\.ai)$'
    and (staff.user_id is not null or app_admin.user_id is not null);

  if not found then
    raise exception 'Actor is not an active approved operator' using errcode = '42501';
  end if;
end;
$$;

revoke all on function m04_ads_internal.resolve_m04_actor(uuid) from public, anon, authenticated;
grant execute on function m04_ads_internal.resolve_m04_actor(uuid) to service_role;
