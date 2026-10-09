begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', name, name || ' exists')
from (values ('m05_ads_accounts'),('m05_ads_allocations'),('m05_ads_daily_spend'),('m05_ads_missing_days'),('m05_ads_capture_jobs'),('m05_ads_monitor_runs'),
  ('m05_ads_campaign_handoffs'),('m05_ads_snapshots'),('m05_ads_alerts'),
  ('m05_ads_recommendations'),('m05_ads_decisions'),('m05_ads_followups'),('m05_ads_audit')) as tables(name);

select ok(c.relrowsecurity, c.relname || ' has RLS enabled')
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname like 'm05_ads_%' and c.relkind='r';

select ok(not has_table_privilege('anon',format('public.%I',name),'SELECT')
  and not has_table_privilege('authenticated',format('public.%I',name),'SELECT')
  and not has_table_privilege('anon',format('public.%I',name),'INSERT')
  and not has_table_privilege('authenticated',format('public.%I',name),'INSERT'),
  name || ' denies direct client reads and writes')
from (values ('m05_ads_accounts'),('m05_ads_allocations'),('m05_ads_daily_spend'),('m05_ads_missing_days'),('m05_ads_capture_jobs'),('m05_ads_monitor_runs'),
  ('m05_ads_campaign_handoffs'),('m05_ads_snapshots'),('m05_ads_alerts'),
  ('m05_ads_recommendations'),('m05_ads_decisions'),('m05_ads_followups'),('m05_ads_audit')) as tables(name);

select ok(not exists (
  select 1 from pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r',c.relowner))) acl
  where acl.grantee = 0
), c.relname || ' denies PUBLIC')
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname like 'm05_ads_%' and c.relkind='r';

select ok(has_table_privilege('service_role',format('public.%I',name),'SELECT')
  and has_table_privilege('service_role',format('public.%I',name),'INSERT'),
  name || ' allows server-only evidence access')
from (values ('m05_ads_accounts'),('m05_ads_allocations'),('m05_ads_daily_spend'),('m05_ads_missing_days'),('m05_ads_capture_jobs'),('m05_ads_monitor_runs'),
  ('m05_ads_campaign_handoffs'),('m05_ads_snapshots'),('m05_ads_alerts'),
  ('m05_ads_recommendations'),('m05_ads_decisions'),('m05_ads_followups'),('m05_ads_audit')) as tables(name);

select ok(has_table_privilege('service_role','public.m05_ads_accounts','UPDATE')
  and has_table_privilege('service_role','public.m05_ads_allocations','UPDATE')
  and has_table_privilege('service_role','public.m05_ads_daily_spend','UPDATE')
  and has_table_privilege('service_role','public.m05_ads_missing_days','UPDATE')
  and has_table_privilege('service_role','public.m05_ads_monitor_runs','UPDATE')
  and has_table_privilege('service_role','public.m05_ads_daily_spend','DELETE')
  and has_table_privilege('service_role','public.m05_ads_missing_days','DELETE'),
  'security-invoker RPC mutation privileges are explicit');

select ok(not has_function_privilege('anon','public.m05_ads_record_daily_capture(text,bigint,date,date,text,text,timestamptz,jsonb,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','public.m05_ads_record_daily_capture(text,bigint,date,date,text,text,timestamptz,jsonb,jsonb)','EXECUTE')
  and has_function_privilege('service_role','public.m05_ads_record_daily_capture(text,bigint,date,date,text,text,timestamptz,jsonb,jsonb)','EXECUTE'),
  'capture RPC is server-only');

select ok(not has_function_privilege('anon','public.m05_ads_capture_month_snapshot(bigint,date,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.m05_ads_capture_month_snapshot(bigint,date,uuid)','EXECUTE')
  and has_function_privilege('service_role','public.m05_ads_capture_month_snapshot(bigint,date,uuid)','EXECUTE'),
  'snapshot RPC is server-only');

select ok(not has_function_privilege('anon','public.m05_ads_accept_verified_handoff(bigint)','EXECUTE')
  and not has_function_privilege('authenticated','public.m05_ads_accept_verified_handoff(bigint)','EXECUTE')
  and has_function_privilege('service_role','public.m05_ads_accept_verified_handoff(bigint)','EXECUTE'),
  'verified M04 handoff RPC is server-only');

select ok(not has_function_privilege('anon','public.m05_ads_record_monitor_run(text,bigint,text,integer,integer,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.m05_ads_record_monitor_run(text,bigint,text,integer,integer,text)','EXECUTE')
  and has_function_privilege('service_role','public.m05_ads_record_monitor_run(text,bigint,text,integer,integer,text)','EXECUTE'),
  'monitor run RPC is server-only');

select ok(not has_function_privilege('anon','public.m05_ads_seed_dscaff_pilot(uuid,text,timestamptz)','EXECUTE')
  and not has_function_privilege('authenticated','public.m05_ads_seed_dscaff_pilot(uuid,text,timestamptz)','EXECUTE')
  and has_function_privilege('service_role','public.m05_ads_seed_dscaff_pilot(uuid,text,timestamptz)','EXECUTE'),
  'Dscaff pilot seed RPC is server-only');

select ok(not exists (
  select 1 from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f',p.proowner))) acl
  where acl.grantee = 0
), p.proname || ' denies PUBLIC')
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'm05_ads_record_daily_capture','m05_ads_capture_month_snapshot',
  'm05_ads_accept_verified_handoff','m05_ads_record_monitor_run','m05_ads_seed_dscaff_pilot'
);

select ok(not p.prosecdef, p.proname || ' is security invoker')
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'm05_ads_record_daily_capture','m05_ads_capture_month_snapshot',
  'm05_ads_accept_verified_handoff','m05_ads_record_monitor_run','m05_ads_seed_dscaff_pilot'
);

select * from finish();
rollback;
