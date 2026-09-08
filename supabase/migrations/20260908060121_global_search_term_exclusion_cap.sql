create table if not exists public.ads_dashboard_automation_settings (
  id text primary key check (id = 'global'),
  search_term_exclusion_cap integer not null default 25 check (search_term_exclusion_cap >= 0),
  lock_version integer not null default 0 check (lock_version >= 0),
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.ads_dashboard_automation_settings enable row level security;
revoke all on public.ads_dashboard_automation_settings from public, anon, authenticated;
grant select, update on public.ads_dashboard_automation_settings to service_role;
insert into public.ads_dashboard_automation_settings (id) values ('global') on conflict do nothing;

-- Support both an existing installation and fresh chronological migration replay.
do $migration$
declare
  definition text;
begin
  if to_regprocedure('public.claim_automatic_search_term_actions(uuid,uuid,text,text,jsonb,integer)') is not null then
    definition := pg_get_functiondef('public.claim_automatic_search_term_actions(uuid,uuid,text,text,jsonb,integer)'::regprocedure);
    if position('ads_dashboard_automation_settings' in definition) = 0 then
      if position($old$  if p_run_cap < 1 or p_run_cap > 25 then raise exception 'AUTOMATIC_ACTION_CAP_INVALID'; end if;$old$ in definition) = 0 then
        raise exception 'Unexpected automatic action function; review cap migration before applying';
      end if;
      definition := replace(definition, $old$  if p_run_cap < 1 or p_run_cap > 25 then raise exception 'AUTOMATIC_ACTION_CAP_INVALID'; end if;$old$, $new$  -- The shared setting is authoritative, including calls from older workers.
  select search_term_exclusion_cap into p_run_cap
  from public.ads_dashboard_automation_settings where id = 'global' for share;
  if p_run_cap is null then raise exception 'AUTOMATIC_ACTION_SETTINGS_UNAVAILABLE'; end if;$new$);
      definition := replace(definition, 'if claimed_count >= p_run_cap then continue; end if;', 'if p_run_cap > 0 and claimed_count >= p_run_cap then continue; end if;');
      execute definition;
    end if;
  end if;
end;
$migration$;
notify pgrst, 'reload schema';
