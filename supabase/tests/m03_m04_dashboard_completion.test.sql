begin;
select plan(15);

select has_table('public','m03_ads_change_item_attempts','M03 item attempts exist');
select has_table('public','m03_ads_admin_events','M03 config audit exists');
select has_table('public','m04_ads_admin_events','M04 config audit exists');
select has_function('public','m03_ads_create_mock_change_request_v2','versioned create RPC exists');
select has_function('public','m03_ads_edit_mock_change_request_v2','versioned edit RPC exists');
select has_function('public','m03_ads_validate_mock_change_request_v2','versioned validate RPC exists');
select has_function('public','m03_ads_approve_mock_change_request_v2','versioned approve RPC exists');
select has_function('public','m03_ads_cancel_mock_change_request_v2','versioned cancel RPC exists');
select row_security_active('public','m03_ads_change_item_attempts','attempt RLS enabled');
select row_security_active('public','m03_ads_admin_events','M03 audit RLS enabled');
select row_security_active('public','m04_ads_admin_events','M04 audit RLS enabled');
select is((select count(*)::integer from public.m03_ads_approved_domains where client_id is null and domain in ('locus-t.com.my','digitalbee.ai') and is_active),2,'approved operator domains seeded once');
select ok(not has_table_privilege('anon','public.m03_ads_admin_events','SELECT'),'anon cannot read M03 audit');
select ok(not has_table_privilege('authenticated','public.m04_ads_admin_events','SELECT'),'authenticated cannot read M04 audit');
select throws_ok($$select public.m03_ads_create_mock_change_request_v2('google','x','x',null,'a','c',null,null,null,null,null,'[]'::jsonb,'00000000-0000-0000-0000-000000000000','127.0.0.1','test','test-key-123')$$,'42501',null,'inactive actor cannot mutate M03');

select * from finish();
rollback;
