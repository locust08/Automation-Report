begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.m04_columns_match(p_table text, p_columns text[])
returns boolean
language sql
as $$
  select array_agg(column_name::text order by ordinal_position) = p_columns
  from information_schema.columns
  where table_schema = 'public' and table_name = p_table;
$$;

create function pg_temp.m04_has_constraint(p_table text, p_name text, p_type "char")
returns boolean
language sql
as $$
  select exists (
    select 1
    from pg_constraint con
    where con.conrelid = format('public.%I', p_table)::regclass
      and con.conname = p_name
      and con.contype = p_type
  );
$$;

select has_table('public', table_name, table_name || ' is an M04 table')
from (values
  ('ads_ad_accounts'), ('ads_budget_packages'), ('ads_campaign_plans'),
  ('ads_campaign_plan_revisions'), ('ads_campaign_approvals'), ('ads_campaign_builds'),
  ('ads_campaign_build_resources'), ('ads_campaign_gate_attempts'),
  ('ads_campaign_qa_results'), ('ads_campaign_audit_events'),
  ('ads_campaign_monitoring_handoffs')
) as expected(table_name);

select ok(pg_temp.m04_columns_match(table_name, columns), table_name || ' has the approved column contract')
from (values
  ('ads_ad_accounts', array['id','client_id','platform','provider_account_id','account_name','currency','timezone','access_status','access_evidence','access_verified_at','is_active','created_at','updated_at']::text[]),
  ('ads_budget_packages', array['id','client_id','package_key','package_name','currency','start_date','end_date','envelope_amount','committed_amount','status','lock_version','created_at','updated_at']::text[]),
  ('ads_campaign_plans', array['id','client_id','budget_package_id','ad_account_id','platform','active_revision_id','approved_revision_id','approved_revision_hash','reserved_revision_id','reserved_budget','status','created_by_id','created_by_name','created_at','updated_at','lock_version']::text[]),
  ('ads_campaign_plan_revisions', array['id','plan_id','revision_number','client_id','ad_account_id','budget_package_id','platform','provider_account_id','currency','timezone','start_date','end_date','allocated_budget','increment_amount','daily_budget','projected_total','objective','destination','plan_payload','canonical_json','payload_hash','created_by_id','created_by_name','created_at']::text[]),
  ('ads_campaign_approvals', array['id','plan_id','revision_id','revision_hash','decision','expires_at','request_idempotency_key','comment','superseded_approval_id','approved_by_id','approved_by_name','trusted_ip','trusted_user_agent','created_at']::text[]),
  ('ads_campaign_builds', array['id','plan_id','revision_id','revision_hash','approval_id','budget_package_id','ad_account_id','platform','status','gate_1_started_at','gate_1_completed_at','gate_2_started_at','gate_2_completed_at','delivery_started_at','delivered_at','verified_at','final_readback_evidence','lock_version','created_at','updated_at']::text[]),
  ('ads_campaign_build_resources', array['id','build_id','logical_resource_key','resource_type','provider_resource_id','provider_parent_resource_id','provider_response','verified_at','created_at','updated_at']::text[]),
  ('ads_campaign_gate_attempts', array['id','build_id','gate','action','claim_token','request_idempotency_key','retry_parent_attempt_id','attempt_number','revision_id','revision_hash','status','intent','claimed_at','claim_expires_at','released_at','actor_id','actor_name','trusted_ip','trusted_user_agent','provider_outcome','outcome','error_details','created_at','updated_at']::text[]),
  ('ads_campaign_qa_results', array['id','attempt_id','build_resource_id','phase','field_path','required','expected_value','observed_value','result','mismatch_code','mismatch_detail','readback_evidence','created_at']::text[]),
  ('ads_campaign_audit_events', array['id','plan_id','revision_id','build_id','attempt_id','event_type','from_status','to_status','actor_id','actor_name','trusted_ip','trusted_user_agent','metadata','created_at']::text[]),
  ('ads_campaign_monitoring_handoffs', array['id','build_id','client_id','platform','ad_account_id','provider_account_id','revision_id','revision_hash','provider_campaign_id','provider_child_ids','start_date','end_date','currency','allocated_budget','final_readback_evidence','verified_at','created_at']::text[])
) as expected(table_name, columns);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = expected.table_name
      and column_name = 'id' and data_type = 'bigint' and is_identity = 'YES'
  ),
  expected.table_name || ' uses a generated bigint identity key'
)
from (values
  ('ads_ad_accounts'), ('ads_budget_packages'), ('ads_campaign_plans'),
  ('ads_campaign_plan_revisions'), ('ads_campaign_approvals'), ('ads_campaign_builds'),
  ('ads_campaign_build_resources'), ('ads_campaign_gate_attempts'),
  ('ads_campaign_qa_results'), ('ads_campaign_audit_events'), ('ads_campaign_monitoring_handoffs')
) as expected(table_name);

select ok(pg_temp.m04_has_constraint(table_name, table_name || '_pkey', 'p'), table_name || ' has a primary key')
from (values
  ('ads_ad_accounts'), ('ads_budget_packages'), ('ads_campaign_plans'),
  ('ads_campaign_plan_revisions'), ('ads_campaign_approvals'), ('ads_campaign_builds'),
  ('ads_campaign_build_resources'), ('ads_campaign_gate_attempts'),
  ('ads_campaign_qa_results'), ('ads_campaign_audit_events'),
  ('ads_campaign_monitoring_handoffs')
) as expected(table_name);

select ok(pg_temp.m04_has_constraint(table_name, constraint_name, 'f'), table_name || '.' || constraint_name || ' preserves an M04 foreign key')
from (values
  ('ads_campaign_plans','acp_budget_package_fk'), ('ads_campaign_plans','acp_ad_account_fk'),
  ('ads_campaign_plans','acp_active_revision_fk'), ('ads_campaign_plans','acp_approved_revision_fk'),
  ('ads_campaign_plans','acp_reserved_revision_fk'), ('ads_campaign_plan_revisions','acpr_plan_fk'),
  ('ads_campaign_plan_revisions','acpr_account_fk'), ('ads_campaign_plan_revisions','acpr_package_fk'),
  ('ads_campaign_approvals','aca_plan_fk'), ('ads_campaign_approvals','aca_revision_fk'),
  ('ads_campaign_approvals','aca_superseded_fk'), ('ads_campaign_builds','acb_plan_fk'),
  ('ads_campaign_builds','acb_revision_fk'), ('ads_campaign_builds','acb_approval_fk'),
  ('ads_campaign_builds','acb_package_fk'), ('ads_campaign_builds','acb_account_fk'),
  ('ads_campaign_build_resources','acbr_build_fk'), ('ads_campaign_gate_attempts','acga_build_fk'),
  ('ads_campaign_gate_attempts','acga_retry_parent_fk'), ('ads_campaign_gate_attempts','acga_revision_fk'),
  ('ads_campaign_qa_results','acqr_attempt_fk'), ('ads_campaign_qa_results','acqr_resource_fk'),
  ('ads_campaign_audit_events','acaud_plan_fk'), ('ads_campaign_audit_events','acaud_revision_fk'),
  ('ads_campaign_audit_events','acaud_build_fk'), ('ads_campaign_audit_events','acaud_attempt_fk'),
  ('ads_campaign_monitoring_handoffs','acmh_build_fk'), ('ads_campaign_monitoring_handoffs','acmh_revision_fk'),
  ('ads_campaign_monitoring_handoffs','acmh_account_fk')
) as expected(table_name, constraint_name);

select ok(pg_temp.m04_has_constraint(table_name, constraint_name, 'c'), table_name || '.' || constraint_name || ' enforces its lifecycle state')
from (values
  ('ads_ad_accounts','aac_platform'), ('ads_budget_packages','abp_amounts'),
  ('ads_campaign_plans','acp_status'), ('ads_campaign_plan_revisions','acpr_payload_match'),
  ('ads_campaign_approvals','aca_decision'), ('ads_campaign_builds','acb_status'),
  ('ads_campaign_gate_attempts','acga_gate'), ('ads_campaign_qa_results','acqr_result')
) as expected(table_name, constraint_name);

select ok(exists (
  select 1 from pg_indexes
  where schemaname = 'public' and tablename = expected.table_name and indexname = expected.index_name
), expected.index_name || ' supports its foreign-key lookup')
from (values
  ('ads_campaign_plans','acp_package_idx'), ('ads_campaign_plans','acp_account_idx'),
  ('ads_campaign_plan_revisions','acpr_plan_idx'), ('ads_campaign_approvals','aca_plan_idx'),
  ('ads_campaign_builds','acb_plan_idx'), ('ads_campaign_build_resources','acbr_build_idx'),
  ('ads_campaign_gate_attempts','acga_build_gate_active_idx'), ('ads_campaign_qa_results','acqr_attempt_idx'),
  ('ads_campaign_audit_events','acaud_plan_idx'), ('ads_campaign_monitoring_handoffs','acmh_build_uidx')
) as expected(table_name, index_name);

select ok(c.relrowsecurity and exists (
  select 1 from pg_policies p
  where p.schemaname = 'public' and p.tablename = c.relname
    and p.policyname = c.relname || '_approved_operator_select'
    and p.cmd = 'SELECT'
), c.relname || ' has RLS and an approved-operator SELECT policy')
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
  'ads_ad_accounts','ads_budget_packages','ads_campaign_plans','ads_campaign_plan_revisions',
  'ads_campaign_approvals','ads_campaign_builds','ads_campaign_build_resources',
  'ads_campaign_gate_attempts','ads_campaign_qa_results','ads_campaign_audit_events',
  'ads_campaign_monitoring_handoffs'
)
order by c.relname;

select has_function('ads_internal', 'is_approved_operator', array[]::text[], 'approved operator helper exists');
select ok(has_table_privilege('authenticated', 'public.ads_ad_accounts', 'SELECT'), 'authenticated has SELECT capability only');
select ok(not has_table_privilege('authenticated', 'public.ads_ad_accounts', 'INSERT, UPDATE, DELETE'), 'authenticated cannot write M04 tables');
select ok(not has_table_privilege('anon', 'public.ads_ad_accounts', 'SELECT'), 'anon cannot read M04 tables');
select ok(has_function_privilege('authenticated', 'ads_internal.is_approved_operator()', 'EXECUTE'), 'authenticated can execute only the RLS helper');

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000000041', 'operator@locus-t.com.my', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000042', 'blocked@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000043', 'unconfirmed@digitalbee.ai', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000044', 'operator@locus-t.com.my@attacker.test', 'authenticated', 'authenticated');
update auth.users
set email_confirmed_at = clock_timestamp()
where id in (
  '00000000-0000-0000-0000-000000000041'::uuid,
  '00000000-0000-0000-0000-000000000042'::uuid,
  '00000000-0000-0000-0000-000000000044'::uuid
);
insert into public.ad_automation_report_users (id, full_name, role, is_active) values
  ('00000000-0000-0000-0000-000000000041', 'Approved operator', 'admin', true),
  ('00000000-0000-0000-0000-000000000042', 'Blocked operator', 'admin', true),
  ('00000000-0000-0000-0000-000000000043', 'Unconfirmed operator', 'admin', true),
  ('00000000-0000-0000-0000-000000000044', 'Malformed operator', 'admin', true);
insert into public.ads_ad_accounts (client_id, platform, provider_account_id, account_name, currency, timezone)
values ('00000000-0000-0000-0000-000000000001', 'google', '1000000000', 'Security test account', 'MYR', 'Asia/Kuala_Lumpur');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000041","email":"operator@locus-t.com.my","role":"authenticated"}';
select is((select count(*)::integer from public.ads_ad_accounts), 1, 'approved-domain operator can SELECT admitted M04 rows');
select throws_ok(
  $$insert into public.ads_ad_accounts (client_id, platform, provider_account_id, account_name, currency, timezone) values ('00000000-0000-0000-0000-000000000001', 'google', '1000000001', 'blocked write', 'MYR', 'Asia/Kuala_Lumpur')$$,
  '42501', 'permission denied for table ads_ad_accounts', 'authenticated writes are denied'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000042","email":"blocked@example.test","role":"authenticated"}';
select is((select count(*)::integer from public.ads_ad_accounts), 0, 'unapproved-domain operator sees no M04 rows');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000043","email":"unconfirmed@digitalbee.ai","role":"authenticated"}';
select is((select count(*)::integer from public.ads_ad_accounts), 0, 'unconfirmed approved-domain operator sees no M04 rows');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000044","email":"operator@locus-t.com.my@attacker.test","role":"authenticated"}';
select is((select count(*)::integer from public.ads_ad_accounts), 0, 'malformed multi-at address sees no M04 rows');
reset role;

set local role anon;
select throws_ok($$select count(*) from public.ads_ad_accounts$$, '42501', 'permission denied for table ads_ad_accounts', 'anon reads are denied');
reset role;

select * from finish();
rollback;
