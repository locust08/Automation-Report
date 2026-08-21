begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000051', 'workflow.operator@locus-t.com.my', 'authenticated', 'authenticated', clock_timestamp()),
  ('00000000-0000-0000-0000-000000000052', 'second.operator@digitalbee.ai', 'authenticated', 'authenticated', clock_timestamp()),
  ('00000000-0000-0000-0000-000000000053', 'blocked@example.test', 'authenticated', 'authenticated', clock_timestamp());

insert into public.ad_automation_report_users (id, full_name, role, is_active) values
  ('00000000-0000-0000-0000-000000000051', 'Workflow Operator', 'approver', true),
  ('00000000-0000-0000-0000-000000000052', 'Second Operator', 'admin', true),
  ('00000000-0000-0000-0000-000000000053', 'Blocked Operator', 'admin', true);

insert into public.ads_ad_accounts (
  client_id, platform, provider_account_id, account_name, currency, timezone,
  access_status, access_evidence, access_verified_at, is_active
) values
  ('00000000-0000-0000-0000-000000000001', 'google', 'workflow-main', 'Workflow Main', 'MYR', 'Asia/Kuala_Lumpur', 'verified', '{"source":"local-test"}', clock_timestamp(), true),
  ('00000000-0000-0000-0000-000000000001', 'google', 'workflow-usd', 'Workflow USD', 'USD', 'Asia/Kuala_Lumpur', 'verified', '{"source":"local-test"}', clock_timestamp(), true),
  ('00000000-0000-0000-0000-000000000001', 'meta', 'workflow-unavailable', 'Workflow Unavailable', 'MYR', 'Asia/Kuala_Lumpur', 'unavailable', '{}', null, true);

insert into public.ads_budget_packages (
  client_id, package_key, package_name, currency, start_date, end_date, envelope_amount, status
) values
  ('00000000-0000-0000-0000-000000000001', 'workflow-main', 'Workflow Main', 'MYR', '2026-08-01', '2026-08-31', 1000, 'active'),
  ('00000000-0000-0000-0000-000000000001', 'workflow-release', 'Workflow Release', 'MYR', '2026-08-01', '2026-08-31', 1000, 'active'),
  ('00000000-0000-0000-0000-000000000001', 'workflow-launched', 'Workflow Launched', 'MYR', '2026-08-01', '2026-08-31', 1000, 'active'),
  ('00000000-0000-0000-0000-000000000001', 'workflow-awaiting-audit', 'Workflow Awaiting Audit', 'MYR', '2026-08-01', '2026-08-31', 1000, 'active');

insert into public.ads_campaign_plans (
  client_id, budget_package_id, ad_account_id, platform, created_by_id, created_by_name
)
select
  '00000000-0000-0000-0000-000000000001', package.id, account.id, account.platform,
  '00000000-0000-0000-0000-000000000051', fixture.creator
from (values
  ('Main fixture', 'workflow-main', 'workflow-main'),
  ('Over fixture', 'workflow-main', 'workflow-main'),
  ('Date fixture', 'workflow-main', 'workflow-main'),
  ('Currency fixture', 'workflow-main', 'workflow-usd'),
  ('Unavailable fixture', 'workflow-main', 'workflow-unavailable'),
  ('Unauthorized fixture', 'workflow-main', 'workflow-main'),
  ('Release fixture', 'workflow-release', 'workflow-main'),
  ('Launched fixture', 'workflow-launched', 'workflow-main'),
  ('Awaiting audit fixture', 'workflow-awaiting-audit', 'workflow-main')
) as fixture(creator, package_key, provider_account_id)
join public.ads_budget_packages as package on package.package_key = fixture.package_key
join public.ads_ad_accounts as account on account.provider_account_id = fixture.provider_account_id;

select has_function(
  'public', 'ads_create_campaign_plan_revision',
  array['bigint','bigint','jsonb','text','text','uuid','inet','text'],
  'revision creation RPC exists with the approved signature'
);
select has_function(
  'public', 'ads_reserve_campaign_budget',
  array['bigint','bigint','text','bigint','uuid','inet','text'],
  'budget reservation RPC exists with the approved signature'
);
select has_function(
  'public', 'ads_release_campaign_budget',
  array['bigint','bigint','text','uuid','inet','text'],
  'budget release RPC exists with the approved signature'
);
select has_function(
  'public', 'ads_approve_campaign_plan_revision',
  array['bigint','bigint','text','bigint','timestamp with time zone','text','text','uuid','inet','text'],
  'approval RPC exists with the approved signature'
);
select has_function(
  'public', 'ads_transition_campaign_plan',
  array['bigint','bigint','text','text','text','uuid','inet','text'],
  'plan transition RPC exists with the approved signature'
);

select lives_ok(
  $$select public.ads_create_campaign_plan_revision(
    (select id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    0,
    $json${"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}$json$::jsonb,
    $json${"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}$json$,
    '4de43ffc59a2e30653465f2a1521003623076f9aab294d6f7d7debf632128baf',
    '00000000-0000-0000-0000-000000000051', '203.0.113.51', 'workflow-tests/revision-one'
  )$$,
  'a canonical payload with its exact SHA-256 creates a revision'
);

select is(
  (select payload_hash from public.ads_campaign_plan_revisions where plan_id = (select id from public.ads_campaign_plans where created_by_name = 'Main fixture') and revision_number = 1),
  '4de43ffc59a2e30653465f2a1521003623076f9aab294d6f7d7debf632128baf',
  'the database persists the exact SHA-256 revision lock'
);
select is(
  (select created_by_name from public.ads_campaign_plan_revisions where plan_id = (select id from public.ads_campaign_plans where created_by_name = 'Main fixture') and revision_number = 1),
  'Workflow Operator',
  'revision authorship is resolved from database operator records'
);

select throws_ok(
  $$select public.ads_create_campaign_plan_revision(
    (select id from public.ads_campaign_plans where created_by_name = 'Date fixture'), 0,
    $json${"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}$json$::jsonb,
    $json${"allocated_budget":401,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}$json$,
    '4de43ffc59a2e30653465f2a1521003623076f9aab294d6f7d7debf632128baf',
    '00000000-0000-0000-0000-000000000051', null, null
  )$$,
  '22023', 'Canonical JSON does not match the revision payload',
  'canonical JSON and parsed payload cannot diverge'
);
select throws_ok(
  $$select public.ads_create_campaign_plan_revision(
    (select id from public.ads_campaign_plans where created_by_name = 'Date fixture'), 0,
    $json${"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}$json$::jsonb,
    $json${"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}$json$,
    repeat('0', 64), '00000000-0000-0000-0000-000000000051', null, null
  )$$,
  '22023', 'Revision payload hash does not match canonical JSON',
  'the expected revision hash cannot be forged'
);

select throws_ok(
  $$update public.ads_campaign_plan_revisions set objective = 'tampered' where plan_id = (select id from public.ads_campaign_plans where created_by_name = 'Main fixture')$$,
  '55000', 'M04 evidence rows are append-only', 'revision updates are rejected'
);
select throws_ok(
  $$delete from public.ads_campaign_plan_revisions where plan_id = (select id from public.ads_campaign_plans where created_by_name = 'Main fixture')$$,
  '55000', 'M04 evidence rows are append-only', 'revision deletes are rejected'
);

select lives_ok(
  $$select public.ads_create_campaign_plan_revision(
    (select id from public.ads_campaign_plans where created_by_name = 'Main fixture'), 1,
    $json${"allocated_budget":500,"daily_budget":25,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":100,"objective":"leads","projected_total":500,"start_date":"2026-08-01"}$json$::jsonb,
    $json${"allocated_budget":500,"daily_budget":25,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":100,"objective":"leads","projected_total":500,"start_date":"2026-08-01"}$json$,
    '22bb20288774b76d21425209b1e9916c5b04232bd1915b73b4d2ee1f8ff0b438',
    '00000000-0000-0000-0000-000000000051', '203.0.113.52', 'workflow-tests/revision-two'
  )$$,
  'a later immutable revision supersedes the active pointer'
);
select is(
  (select revision_number from public.ads_campaign_plan_revisions where id = (select active_revision_id from public.ads_campaign_plans where created_by_name = 'Main fixture')),
  2,
  'the second revision is the only active revision'
);
select is(
  (select count(*)::integer from public.ads_campaign_plan_revisions where plan_id = (select id from public.ads_campaign_plans where created_by_name = 'Main fixture')),
  2,
  'supersession preserves both immutable revisions'
);

select throws_ok(
  $$select public.ads_create_campaign_plan_revision(
    (select id from public.ads_campaign_plans where created_by_name = 'Date fixture'), 0,
    $json${"allocated_budget":100,"daily_budget":10,"destination":"https://example.test/landing","end_date":"2026-09-02","increment_amount":0,"objective":"leads","projected_total":100,"start_date":"2026-08-20"}$json$::jsonb,
    $json${"allocated_budget":100,"daily_budget":10,"destination":"https://example.test/landing","end_date":"2026-09-02","increment_amount":0,"objective":"leads","projected_total":100,"start_date":"2026-08-20"}$json$,
    'ff98272f078fd3e3d94784343f8247cf2412d5f70e6b6cc8858dda297c5405de',
    '00000000-0000-0000-0000-000000000051', null, null
  )$$,
  '22023', 'Revision dates must fall within the budget package flight',
  'revision dates outside the package flight are rejected'
);
select throws_ok(
  $$select public.ads_create_campaign_plan_revision(
    (select id from public.ads_campaign_plans where created_by_name = 'Currency fixture'), 0,
    $json${"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}$json$::jsonb,
    $json${"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}$json$,
    '4de43ffc59a2e30653465f2a1521003623076f9aab294d6f7d7debf632128baf',
    '00000000-0000-0000-0000-000000000051', null, null
  )$$,
  '22023', 'Plan account and budget package currencies must match',
  'account/package currency mismatches are rejected'
);
select throws_ok(
  $$select public.ads_create_campaign_plan_revision(
    (select id from public.ads_campaign_plans where created_by_name = 'Unavailable fixture'), 0,
    $json${"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}$json$::jsonb,
    $json${"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}$json$,
    '4de43ffc59a2e30653465f2a1521003623076f9aab294d6f7d7debf632128baf',
    '00000000-0000-0000-0000-000000000051', null, null
  )$$,
  '55000', 'A verified active ad account is required',
  'unavailable ad accounts cannot produce revisions'
);
select throws_ok(
  $$select public.ads_create_campaign_plan_revision(
    (select id from public.ads_campaign_plans where created_by_name = 'Unauthorized fixture'), 0,
    $json${"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}$json$::jsonb,
    $json${"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}$json$,
    '4de43ffc59a2e30653465f2a1521003623076f9aab294d6f7d7debf632128baf',
    '00000000-0000-0000-0000-000000000053', null, null
  )$$,
  '42501', 'Actor is not an active approved operator',
  'unapproved-domain actors cannot mutate workflow state'
);
select throws_ok(
  $$select public.ads_create_campaign_plan_revision(
    (select id from public.ads_campaign_plans where created_by_name = 'Unauthorized fixture'), null,
    $json${"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}$json$::jsonb,
    $json${"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}$json$,
    '4de43ffc59a2e30653465f2a1521003623076f9aab294d6f7d7debf632128baf',
    '00000000-0000-0000-0000-000000000051', null, null
  )$$,
  '40001', 'Campaign plan lock version is stale',
  'a null expected lock version cannot bypass optimistic locking'
);

select lives_ok(
  $$select public.ads_reserve_campaign_budget(
    (select id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    (select active_revision_id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    '22bb20288774b76d21425209b1e9916c5b04232bd1915b73b4d2ee1f8ff0b438', 2,
    '00000000-0000-0000-0000-000000000051', '203.0.113.53', 'workflow-tests/reserve'
  )$$,
  'the active revision reserves package budget atomically'
);
select is((select committed_amount from public.ads_budget_packages where package_key = 'workflow-main'), 500.000000::numeric, 'reservation increments committed package budget');
select is((select reserved_budget from public.ads_campaign_plans where created_by_name = 'Main fixture'), 500.000000::numeric, 'reservation binds the active revision amount to the plan');
select is((select status from public.ads_campaign_plans where created_by_name = 'Main fixture'), 'awaiting_approval', 'reservation submits the plan for approval');

select lives_ok(
  $$select public.ads_reserve_campaign_budget(
    (select id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    (select active_revision_id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    '22bb20288774b76d21425209b1e9916c5b04232bd1915b73b4d2ee1f8ff0b438', 2,
    '00000000-0000-0000-0000-000000000051', '198.51.100.99', 'workflow-tests/reserve-retry'
  )$$,
  'an identical reservation retry succeeds despite its stale expected lock version'
);
select is((select committed_amount from public.ads_budget_packages where package_key = 'workflow-main'), 500.000000::numeric, 'reservation retry does not double-allocate');
select is((select count(*)::integer from public.ads_campaign_audit_events where event_type = 'campaign_budget_reserved' and plan_id = (select id from public.ads_campaign_plans where created_by_name = 'Main fixture')), 1, 'reservation retry does not duplicate audit evidence');
select throws_ok(
  $$select public.ads_reserve_campaign_budget(
    (select id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    (select active_revision_id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    '22bb20288774b76d21425209b1e9916c5b04232bd1915b73b4d2ee1f8ff0b438', null,
    '00000000-0000-0000-0000-000000000051', null, null
  )$$,
  '40001', 'Campaign plan lock version is stale',
  'an identical reservation retry rejects a null expected lock version'
);
select throws_ok(
  $$select public.ads_reserve_campaign_budget(
    (select id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    (select active_revision_id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    null, 2, '00000000-0000-0000-0000-000000000051', null, null
  )$$,
  '22023', 'Campaign plan revision hash does not match',
  'a null revision hash cannot invoke reservation idempotency'
);

select lives_ok(
  $$select public.ads_create_campaign_plan_revision(
    (select id from public.ads_campaign_plans where created_by_name = 'Over fixture'), 0,
    $json${"allocated_budget":1200,"daily_budget":60,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":800,"objective":"leads","projected_total":1200,"start_date":"2026-08-01"}$json$::jsonb,
    $json${"allocated_budget":1200,"daily_budget":60,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":800,"objective":"leads","projected_total":1200,"start_date":"2026-08-01"}$json$,
    'b3cc54eaf931e6390e975df947d26f55a3c837a08de7ba07785d935c881fb3db',
    '00000000-0000-0000-0000-000000000051', null, null
  )$$,
  'an otherwise valid revision can reach budget reservation validation'
);
select throws_ok(
  $$select public.ads_reserve_campaign_budget(
    (select id from public.ads_campaign_plans where created_by_name = 'Over fixture'),
    (select active_revision_id from public.ads_campaign_plans where created_by_name = 'Over fixture'),
    'b3cc54eaf931e6390e975df947d26f55a3c837a08de7ba07785d935c881fb3db', 1,
    '00000000-0000-0000-0000-000000000051', null, null
  )$$,
  '23514', 'Budget package does not have enough available allocation',
  'a reservation cannot over-allocate the shared package'
);
select is((select committed_amount from public.ads_budget_packages where package_key = 'workflow-main'), 500.000000::numeric, 'failed over-allocation leaves committed budget unchanged');

select throws_ok(
  $$select public.ads_transition_campaign_plan(
    (select id from public.ads_campaign_plans where created_by_name = 'Main fixture'), 3,
    'awaiting_approval', 'launched', 'bypass provider gates',
    '00000000-0000-0000-0000-000000000051', null, null
  )$$,
  '55000', 'Requested campaign plan transition is not allowed',
  'the generic transition RPC cannot bypass approval and launch gates'
);
select throws_ok(
  $$select public.ads_approve_campaign_plan_revision(
    (select id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    (select active_revision_id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    '22bb20288774b76d21425209b1e9916c5b04232bd1915b73b4d2ee1f8ff0b438', 3,
    clock_timestamp() - interval '1 second', 'approval-expired', 'expired',
    '00000000-0000-0000-0000-000000000051', null, null
  )$$,
  '22023', 'Approval expiry must be in the future',
  'expired approvals are rejected using database time'
);

update public.ads_ad_accounts set access_status = 'unavailable' where provider_account_id = 'workflow-main';
select throws_ok(
  $$select public.ads_approve_campaign_plan_revision(
    (select id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    (select active_revision_id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    '22bb20288774b76d21425209b1e9916c5b04232bd1915b73b4d2ee1f8ff0b438', 3,
    clock_timestamp() + interval '1 hour', 'approval-no-access', null,
    '00000000-0000-0000-0000-000000000051', null, null
  )$$,
  '55000', 'A verified active ad account is required for approval',
  'approval rechecks current account access'
);
update public.ads_ad_accounts set access_status = 'verified' where provider_account_id = 'workflow-main';

update public.ads_budget_packages set currency = 'USD' where package_key = 'workflow-main';
select throws_ok(
  $$select public.ads_approve_campaign_plan_revision(
    (select id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    (select active_revision_id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    '22bb20288774b76d21425209b1e9916c5b04232bd1915b73b4d2ee1f8ff0b438', 3,
    clock_timestamp() + interval '1 hour', 'approval-currency-drift', null,
    '00000000-0000-0000-0000-000000000051', null, null
  )$$,
  '22023', 'Approval account, package, and revision currency must match',
  'approval rejects package currency drift'
);
update public.ads_budget_packages set currency = 'MYR' where package_key = 'workflow-main';

select lives_ok(
  $$select public.ads_approve_campaign_plan_revision(
    (select id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    (select active_revision_id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    '22bb20288774b76d21425209b1e9916c5b04232bd1915b73b4d2ee1f8ff0b438', 3,
    clock_timestamp() + interval '1 hour', 'approval-main-v2', 'approved locally',
    '00000000-0000-0000-0000-000000000051', '203.0.113.54', 'workflow-tests/approve'
  )$$,
  'a reserved active revision creates an immutable approval and Gate 1 build'
);
select is((select status from public.ads_campaign_plans where created_by_name = 'Main fixture'), 'approved', 'approval atomically locks the plan status');
select is((select count(*)::integer from public.ads_campaign_approvals where plan_id = (select id from public.ads_campaign_plans where created_by_name = 'Main fixture')), 1, 'approval inserts one immutable decision');
select is((select status from public.ads_campaign_builds where plan_id = (select id from public.ads_campaign_plans where created_by_name = 'Main fixture')), 'pending_gate_1', 'approval creates exactly one pending Gate 1 build');

select lives_ok(
  $$select public.ads_approve_campaign_plan_revision(
    (select id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    (select active_revision_id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    '22bb20288774b76d21425209b1e9916c5b04232bd1915b73b4d2ee1f8ff0b438', 3,
    clock_timestamp() + interval '2 hours', 'approval-main-v2', 'retry differs but cannot rewrite evidence',
    '00000000-0000-0000-0000-000000000051', '198.51.100.100', 'workflow-tests/approve-retry'
  )$$,
  'an approval idempotency retry returns its existing build despite a stale lock version'
);
select is((select count(*)::integer from public.ads_campaign_approvals where plan_id = (select id from public.ads_campaign_plans where created_by_name = 'Main fixture')), 1, 'approval retry does not duplicate approvals');
select is((select count(*)::integer from public.ads_campaign_builds where plan_id = (select id from public.ads_campaign_plans where created_by_name = 'Main fixture')), 1, 'approval retry does not duplicate builds');
select throws_ok(
  $$select public.ads_approve_campaign_plan_revision(
    (select id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    (select active_revision_id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    '22bb20288774b76d21425209b1e9916c5b04232bd1915b73b4d2ee1f8ff0b438', null,
    clock_timestamp() + interval '2 hours', 'approval-main-v2', null,
    '00000000-0000-0000-0000-000000000051', null, null
  )$$,
  '40001', 'Campaign plan lock version is stale',
  'an identical approval retry rejects a null expected lock version'
);
select throws_ok(
  $$select public.ads_approve_campaign_plan_revision(
    (select id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    (select active_revision_id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    null, 3, clock_timestamp() + interval '2 hours', 'approval-main-v2', null,
    '00000000-0000-0000-0000-000000000051', null, null
  )$$,
  '22023', 'Approval idempotency key conflicts with an existing request',
  'a null revision hash cannot invoke approval idempotency'
);

select lives_ok(
  $$select public.ads_transition_campaign_plan(
    (select id from public.ads_campaign_plans where created_by_name = 'Main fixture'), 4,
    'approved', 'draft', 'prepare a superseding revision',
    '00000000-0000-0000-0000-000000000052', '203.0.113.55', 'workflow-tests/reopen'
  )$$,
  'an approved plan may return to draft for an explicit revision'
);
select lives_ok(
  $$select public.ads_create_campaign_plan_revision(
    (select id from public.ads_campaign_plans where created_by_name = 'Main fixture'), 5,
    $json${"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}$json$::jsonb,
    $json${"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}$json$,
    '4de43ffc59a2e30653465f2a1521003623076f9aab294d6f7d7debf632128baf',
    '00000000-0000-0000-0000-000000000052', null, null
  )$$,
  'a new draft revision invalidates the plan approval pointer without rewriting history'
);
select ok(
  (select
    active_revision_id is not null
    and approved_revision_id is null
    and approved_revision_hash is null
    and lock_version = 6
  from public.ads_campaign_plans where created_by_name = 'Main fixture'),
  'new active revision clears the old approval lock'
);
select lives_ok(
  $$select public.ads_reserve_campaign_budget(
    (select id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    (select active_revision_id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    '4de43ffc59a2e30653465f2a1521003623076f9aab294d6f7d7debf632128baf', 6,
    '00000000-0000-0000-0000-000000000052', null, null
  )$$,
  'the superseding revision atomically adjusts its prior reservation delta'
);
select is((select committed_amount from public.ads_budget_packages where package_key = 'workflow-main'), 400.000000::numeric, 'replacement reservation applies only the revision delta');
select lives_ok(
  $$select public.ads_approve_campaign_plan_revision(
    (select id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    (select active_revision_id from public.ads_campaign_plans where created_by_name = 'Main fixture'),
    '4de43ffc59a2e30653465f2a1521003623076f9aab294d6f7d7debf632128baf', 7,
    clock_timestamp() + interval '1 hour', 'approval-main-v3', 'supersedes v2',
    '00000000-0000-0000-0000-000000000052', null, null
  )$$,
  'the superseding reserved revision can be approved'
);
select ok(
  (select new_approval.superseded_approval_id is not null
    and new_approval.superseded_approval_id = old_approval.id
   from public.ads_campaign_approvals as new_approval
   join public.ads_campaign_approvals as old_approval on old_approval.request_idempotency_key = 'approval-main-v2'
   where new_approval.request_idempotency_key = 'approval-main-v3'),
  'the new immutable approval links to the superseded decision'
);

select lives_ok(
  $$select public.ads_create_campaign_plan_revision(
    (select id from public.ads_campaign_plans where created_by_name = 'Awaiting audit fixture'), 0,
    $json${"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}$json$::jsonb,
    $json${"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}$json$,
    '4de43ffc59a2e30653465f2a1521003623076f9aab294d6f7d7debf632128baf',
    '00000000-0000-0000-0000-000000000051', null, null
  )$$,
  'awaiting-audit fixture revision is created'
);
update public.ads_campaign_plans
set status = 'awaiting_approval'
where created_by_name = 'Awaiting audit fixture';
select lives_ok(
  $$select public.ads_reserve_campaign_budget(
    (select id from public.ads_campaign_plans where created_by_name = 'Awaiting audit fixture'),
    (select active_revision_id from public.ads_campaign_plans where created_by_name = 'Awaiting audit fixture'),
    '4de43ffc59a2e30653465f2a1521003623076f9aab294d6f7d7debf632128baf', 1,
    '00000000-0000-0000-0000-000000000051', null, 'workflow-tests/reserve-from-awaiting'
  )$$,
  'a plan already awaiting approval can reserve its active revision'
);
select is(
  (select from_status from public.ads_campaign_audit_events
   where plan_id = (select id from public.ads_campaign_plans where created_by_name = 'Awaiting audit fixture')
     and event_type = 'campaign_budget_reserved'),
  'awaiting_approval',
  'reservation audit preserves the locked pre-update source status'
);

select lives_ok(
  $$select public.ads_create_campaign_plan_revision(
    (select id from public.ads_campaign_plans where created_by_name = 'Release fixture'), 0,
    $json${"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}$json$::jsonb,
    $json${"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}$json$,
    '4de43ffc59a2e30653465f2a1521003623076f9aab294d6f7d7debf632128baf',
    '00000000-0000-0000-0000-000000000051', null, null
  )$$,
  'release fixture revision is created'
);
select lives_ok(
  $$select public.ads_reserve_campaign_budget(
    (select id from public.ads_campaign_plans where created_by_name = 'Release fixture'),
    (select active_revision_id from public.ads_campaign_plans where created_by_name = 'Release fixture'),
    '4de43ffc59a2e30653465f2a1521003623076f9aab294d6f7d7debf632128baf', 1,
    '00000000-0000-0000-0000-000000000051', null, null
  )$$,
  'release fixture budget is reserved'
);
select lives_ok(
  $$select public.ads_release_campaign_budget(
    (select id from public.ads_campaign_plans where created_by_name = 'Release fixture'), 2,
    'campaign paused before approval', '00000000-0000-0000-0000-000000000051',
    '203.0.113.56', 'workflow-tests/release'
  )$$,
  'the plan current reservation can be explicitly released'
);
select ok(
  (select committed_amount = 0 and lock_version = 2 from public.ads_budget_packages where package_key = 'workflow-release'),
  'release subtracts only the plan current reservation'
);
select ok(
  (select reserved_revision_id is null and reserved_budget = 0 and status = 'draft' and lock_version = 3 from public.ads_campaign_plans where created_by_name = 'Release fixture'),
  'release clears the plan reservation lock'
);

select lives_ok(
  $$select public.ads_create_campaign_plan_revision(
    (select id from public.ads_campaign_plans where created_by_name = 'Launched fixture'), 0,
    $json${"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}$json$::jsonb,
    $json${"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}$json$,
    '4de43ffc59a2e30653465f2a1521003623076f9aab294d6f7d7debf632128baf',
    '00000000-0000-0000-0000-000000000051', null, null
  )$$,
  'launched fixture revision is created'
);
select lives_ok(
  $$select public.ads_reserve_campaign_budget(
    (select id from public.ads_campaign_plans where created_by_name = 'Launched fixture'),
    (select active_revision_id from public.ads_campaign_plans where created_by_name = 'Launched fixture'),
    '4de43ffc59a2e30653465f2a1521003623076f9aab294d6f7d7debf632128baf', 1,
    '00000000-0000-0000-0000-000000000051', null, null
  )$$,
  'launched fixture budget is reserved'
);
update public.ads_campaign_plans set status = 'launched' where created_by_name = 'Launched fixture';
select throws_ok(
  $$select public.ads_release_campaign_budget(
    (select id from public.ads_campaign_plans where created_by_name = 'Launched fixture'), 2,
    'too late', '00000000-0000-0000-0000-000000000051', null, null
  )$$,
  '55000', 'Campaign budget cannot be released after launch has started',
  'release is forbidden after launch'
);

create function pg_temp.make_hardening_approved_build(
  p_fixture text,
  p_plan_status text,
  p_build_status text
)
returns bigint
language plpgsql
as $$
declare
  v_account_id bigint;
  v_package_id bigint;
  v_plan_id bigint;
  v_revision_id bigint;
  v_approval_id bigint;
  v_build_id bigint;
begin
  insert into public.ads_ad_accounts (
    client_id, platform, provider_account_id, account_name, currency, timezone,
    access_status, access_evidence, access_verified_at, is_active
  ) values (
    '00000000-0000-0000-0000-000000000001', 'google',
    'hardening-' || p_fixture, 'Hardening ' || p_fixture, 'MYR', 'Asia/Kuala_Lumpur',
    'verified', '{"source":"workflow-hardening"}', clock_timestamp(), true
  ) returning id into v_account_id;

  insert into public.ads_budget_packages (
    client_id, package_key, package_name, currency, start_date, end_date,
    envelope_amount, committed_amount, status
  ) values (
    '00000000-0000-0000-0000-000000000001', 'hardening-' || p_fixture,
    'Hardening ' || p_fixture, 'MYR', '2026-08-01', '2026-08-31',
    1000, 100, 'active'
  ) returning id into v_package_id;

  insert into public.ads_campaign_plans (
    client_id, budget_package_id, ad_account_id, platform, reserved_budget,
    status, created_by_id, created_by_name, lock_version
  ) values (
    '00000000-0000-0000-0000-000000000001', v_package_id, v_account_id,
    'google', 100, p_plan_status,
    '00000000-0000-0000-0000-000000000051', p_fixture, 10
  ) returning id into v_plan_id;

  insert into public.ads_campaign_plan_revisions (
    plan_id, revision_number, client_id, ad_account_id, budget_package_id,
    platform, provider_account_id, currency, timezone, start_date, end_date,
    allocated_budget, increment_amount, daily_budget, projected_total,
    objective, destination, plan_payload, canonical_json, payload_hash,
    created_by_id, created_by_name
  ) values (
    v_plan_id, 1, '00000000-0000-0000-0000-000000000001',
    v_account_id, v_package_id, 'google', 'hardening-' || p_fixture,
    'MYR', 'Asia/Kuala_Lumpur', '2026-08-01', '2026-08-20',
    100, 0, 5, 100, 'leads', 'https://example.test/hardening',
    '{"fixture":true}', '{"fixture":true}', repeat('d', 64),
    '00000000-0000-0000-0000-000000000051', 'Workflow Operator'
  ) returning id into v_revision_id;

  update public.ads_campaign_plans
  set active_revision_id = v_revision_id,
      reserved_revision_id = v_revision_id,
      approved_revision_id = v_revision_id,
      approved_revision_hash = repeat('d', 64)
  where id = v_plan_id;

  insert into public.ads_campaign_approvals (
    plan_id, revision_id, revision_hash, decision, expires_at,
    request_idempotency_key, approved_by_id, approved_by_name
  ) values (
    v_plan_id, v_revision_id, repeat('d', 64), 'approved',
    clock_timestamp() + interval '1 hour', 'initial-' || p_fixture,
    '00000000-0000-0000-0000-000000000051', 'Workflow Operator'
  ) returning id into v_approval_id;

  insert into public.ads_campaign_builds (
    plan_id, revision_id, revision_hash, approval_id, budget_package_id,
    ad_account_id, platform, status, lock_version
  ) values (
    v_plan_id, v_revision_id, repeat('d', 64), v_approval_id,
    v_package_id, v_account_id, 'google', p_build_status, 4
  ) returning id into v_build_id;

  return v_build_id;
end;
$$;

select pg_temp.make_hardening_approved_build(fixture, plan_status, build_status)
from (values
  ('approval-expired-key', 'approved', 'pending_gate_1'),
  ('renew-before-gate', 'approved', 'pending_gate_1'),
  ('renew-launch-recovery', 'launch_in_progress', 'gate_1_failed'),
  ('renew-expiry-reject', 'approved', 'pending_gate_1'),
  ('renew-shorter-expiry', 'approved', 'pending_gate_1'),
  ('renew-stale-lock', 'approved', 'pending_gate_1'),
  ('renew-snapshot-drift', 'approved', 'pending_gate_1'),
  ('renew-inactive-package', 'approved', 'pending_gate_1'),
  ('renew-invalid-approved-build', 'approved', 'gate_1_failed'),
  ('renew-terminal', 'launch_in_progress', 'verified'),
  ('renew-cancelled', 'cancelled', 'cancelled'),
  ('renewed-old-key', 'approved', 'pending_gate_1'),
  ('approved-release-reject', 'approved', 'pending_gate_1'),
  ('transition-inconsistent-approved', 'approved', 'gate_1_failed'),
  ('transition-release', 'approved', 'pending_gate_1')
) as fixtures(fixture, plan_status, build_status);

set local session_replication_role = replica;
update public.ads_campaign_approvals
set expires_at = clock_timestamp() - interval '1 minute'
where request_idempotency_key = 'initial-approval-expired-key';
set local session_replication_role = origin;

create temporary table approval_replay_results (
  fixture text primary key,
  returned_build_id bigint not null,
  original_build_id bigint not null,
  side_effect_free boolean not null
) on commit drop;

create function pg_temp.capture_approval_replay(p_fixture text, p_request_key text)
returns void
language plpgsql
as $$
declare
  v_plan_before public.ads_campaign_plans%rowtype;
  v_plan_after public.ads_campaign_plans%rowtype;
  v_build_before public.ads_campaign_builds%rowtype;
  v_build_after public.ads_campaign_builds%rowtype;
  v_returned public.ads_campaign_builds%rowtype;
  v_approval_count integer;
  v_build_count integer;
  v_audit_count integer;
begin
  select * into strict v_plan_before
  from public.ads_campaign_plans where created_by_name = p_fixture;
  select * into strict v_build_before
  from public.ads_campaign_builds where plan_id = v_plan_before.id;
  select count(*)::integer into v_approval_count
  from public.ads_campaign_approvals where plan_id = v_plan_before.id;
  select count(*)::integer into v_build_count
  from public.ads_campaign_builds where plan_id = v_plan_before.id;
  select count(*)::integer into v_audit_count
  from public.ads_campaign_audit_events where plan_id = v_plan_before.id;

  select * into strict v_returned
  from public.ads_approve_campaign_plan_revision(
    v_plan_before.id, v_plan_before.active_revision_id,
    v_plan_before.approved_revision_hash, v_plan_before.lock_version - 1,
    clock_timestamp() + interval '2 days', p_request_key,
    'idempotent historical replay',
    '00000000-0000-0000-0000-000000000051',
    '203.0.113.57', 'workflow-tests/approval-replay'
  );

  select * into strict v_plan_after
  from public.ads_campaign_plans where id = v_plan_before.id;
  select * into strict v_build_after
  from public.ads_campaign_builds where id = v_build_before.id;
  insert into approval_replay_results (
    fixture, returned_build_id, original_build_id, side_effect_free
  ) values (
    p_fixture, v_returned.id, v_build_before.id,
    to_jsonb(v_plan_after) = to_jsonb(v_plan_before)
      and to_jsonb(v_build_after) = to_jsonb(v_build_before)
      and (select count(*) from public.ads_campaign_approvals where plan_id = v_plan_before.id) = v_approval_count
      and (select count(*) from public.ads_campaign_builds where plan_id = v_plan_before.id) = v_build_count
      and (select count(*) from public.ads_campaign_audit_events where plan_id = v_plan_before.id) = v_audit_count
  );
end;
$$;

select pg_temp.capture_approval_replay(
  'approval-expired-key', 'initial-approval-expired-key'
);
select is(
  (select returned_build_id from approval_replay_results where fixture = 'approval-expired-key'),
  (select original_build_id from approval_replay_results where fixture = 'approval-expired-key'),
  'an exact expired approval key returns the original build identity'
);
select ok(
  (select side_effect_free from approval_replay_results where fixture = 'approval-expired-key'),
  'an exact expired approval replay changes no approval, build, plan lock, or audit evidence'
);
select throws_ok(
  $$select public.ads_approve_campaign_plan_revision(
    plan.id, plan.active_revision_id, repeat('d', 64), 10,
    clock_timestamp() + interval '1 day', 'initial-approval-expired-key', null,
    '00000000-0000-0000-0000-000000000052', null, null
  ) from public.ads_campaign_plans as plan
  where plan.created_by_name = 'approval-expired-key'$$,
  '22023', 'Approval idempotency key conflicts with an existing request',
  'an approval key cannot be replayed by a different actor'
);
select throws_ok(
  $$select public.ads_approve_campaign_plan_revision(
    plan.id, plan.active_revision_id + 1, repeat('f', 64), 10,
    clock_timestamp() + interval '1 day', 'initial-approval-expired-key', null,
    '00000000-0000-0000-0000-000000000051', null, null
  ) from public.ads_campaign_plans as plan
  where plan.created_by_name = 'approval-expired-key'$$,
  '22023', 'Approval idempotency key conflicts with an existing request',
  'an expired approval cannot hide a revision identity conflict on its existing key'
);

create function pg_temp.renewal_is_atomic(p_fixture text, p_request_key text)
returns boolean
language plpgsql
as $$
declare
  v_plan public.ads_campaign_plans%rowtype;
  v_build_before public.ads_campaign_builds%rowtype;
  v_build_after public.ads_campaign_builds%rowtype;
  v_returned public.ads_campaign_builds%rowtype;
  v_old_approval public.ads_campaign_approvals%rowtype;
  v_new_approval public.ads_campaign_approvals%rowtype;
begin
  select * into strict v_plan from public.ads_campaign_plans where created_by_name = p_fixture;
  select * into strict v_build_before from public.ads_campaign_builds where plan_id = v_plan.id;
  select * into strict v_old_approval from public.ads_campaign_approvals where id = v_build_before.approval_id;

  select * into strict v_returned
  from public.ads_approve_campaign_plan_revision(
    v_plan.id, v_plan.active_revision_id, v_plan.approved_revision_hash,
    v_plan.lock_version, v_old_approval.expires_at + interval '1 hour',
    p_request_key, 'renewed atomically',
    '00000000-0000-0000-0000-000000000051',
    '203.0.113.57', 'workflow-tests/renewal'
  );

  select * into strict v_plan from public.ads_campaign_plans where id = v_plan.id;
  select * into strict v_build_after from public.ads_campaign_builds where id = v_build_before.id;
  select * into strict v_new_approval from public.ads_campaign_approvals where id = v_build_after.approval_id;
  return v_returned.id = v_build_before.id
    and v_build_after.id = v_build_before.id
    and v_build_after.status = v_build_before.status
    and v_build_after.lock_version = v_build_before.lock_version + 1
    and v_plan.lock_version = 11
    and v_new_approval.superseded_approval_id = v_old_approval.id
    and v_new_approval.expires_at > v_old_approval.expires_at
    and (select count(*) from public.ads_campaign_builds where plan_id = v_plan.id) = 1
    and (select count(*) from public.ads_campaign_approvals where plan_id = v_plan.id) = 2
    and exists (
      select 1 from public.ads_campaign_audit_events as audit
      where audit.plan_id = v_plan.id
        and audit.event_type = 'campaign_approval_renewed'
        and (audit.metadata ->> 'old_approval_id')::bigint = v_old_approval.id
        and (audit.metadata ->> 'new_approval_id')::bigint = v_new_approval.id
        and audit.metadata ? 'old_expires_at'
        and audit.metadata ? 'new_expires_at'
    );
exception when others then
  return false;
end;
$$;

select ok(
  pg_temp.renewal_is_atomic('renew-before-gate', 'renew-before-gate-v2'),
  'approval renewal before Gate 1 returns the original build, appends evidence, repoints it, and advances both CAS locks'
);
select ok(
  pg_temp.renewal_is_atomic('renew-launch-recovery', 'renew-launch-recovery-v2'),
  'approval renewal returns and preserves the original nonterminal launch-recovery build'
);

select throws_ok(
  $$select public.ads_approve_campaign_plan_revision(
    plan.id, plan.active_revision_id, plan.approved_revision_hash, plan.lock_version,
    approval.expires_at, 'renew-equal-expiry', null,
    '00000000-0000-0000-0000-000000000051', null, null
  ) from public.ads_campaign_plans as plan
  join public.ads_campaign_builds as build on build.plan_id = plan.id
  join public.ads_campaign_approvals as approval on approval.id = build.approval_id
  where plan.created_by_name = 'renew-expiry-reject'$$,
  '22023', 'Approval renewal expiry must be strictly later than the current approval',
  'approval renewal rejects an equal expiry'
);
select throws_ok(
  $$select public.ads_approve_campaign_plan_revision(
    plan.id, plan.active_revision_id, plan.approved_revision_hash, plan.lock_version,
    approval.expires_at - interval '1 minute', 'renew-shorter-expiry-v2', null,
    '00000000-0000-0000-0000-000000000051', null, null
  ) from public.ads_campaign_plans as plan
  join public.ads_campaign_builds as build on build.plan_id = plan.id
  join public.ads_campaign_approvals as approval on approval.id = build.approval_id
  where plan.created_by_name = 'renew-shorter-expiry'$$,
  '22023', 'Approval renewal expiry must be strictly later than the current approval',
  'approval renewal rejects a shorter expiry'
);
select throws_ok(
  $$select public.ads_approve_campaign_plan_revision(
    plan.id, plan.active_revision_id, plan.approved_revision_hash, plan.lock_version - 1,
    approval.expires_at + interval '1 hour', 'renew-stale-lock-v2', null,
    '00000000-0000-0000-0000-000000000051', null, null
  ) from public.ads_campaign_plans as plan
  join public.ads_campaign_builds as build on build.plan_id = plan.id
  join public.ads_campaign_approvals as approval on approval.id = build.approval_id
  where plan.created_by_name = 'renew-stale-lock'$$,
  '40001', 'Campaign plan lock version is stale',
  'approval renewal enforces the supplied plan CAS after locking build then plan'
);

update public.ads_ad_accounts as account
set provider_account_id = provider_account_id || '-drifted'
from public.ads_campaign_plans as plan
where plan.ad_account_id = account.id and plan.created_by_name = 'renew-snapshot-drift';
select throws_ok(
  $$select public.ads_approve_campaign_plan_revision(
    plan.id, plan.active_revision_id, plan.approved_revision_hash, plan.lock_version,
    approval.expires_at + interval '1 hour', 'renew-snapshot-drift-v2', null,
    '00000000-0000-0000-0000-000000000051', null, null
  ) from public.ads_campaign_plans as plan
  join public.ads_campaign_builds as build on build.plan_id = plan.id
  join public.ads_campaign_approvals as approval on approval.id = build.approval_id
  where plan.created_by_name = 'renew-snapshot-drift'$$,
  '22023', 'Approval renewal requires an unchanged revision, build, account, and package snapshot',
  'approval renewal rejects mutable account identity drift'
);

update public.ads_budget_packages as package
set status = 'closed'
from public.ads_campaign_plans as plan
where plan.budget_package_id = package.id and plan.created_by_name = 'renew-inactive-package';
select throws_ok(
  $$select public.ads_approve_campaign_plan_revision(
    plan.id, plan.active_revision_id, plan.approved_revision_hash, plan.lock_version,
    approval.expires_at + interval '1 hour', 'renew-inactive-package-v2', null,
    '00000000-0000-0000-0000-000000000051', null, null
  ) from public.ads_campaign_plans as plan
  join public.ads_campaign_builds as build on build.plan_id = plan.id
  join public.ads_campaign_approvals as approval on approval.id = build.approval_id
  where plan.created_by_name = 'renew-inactive-package'$$,
  '55000', 'An active budget package is required for approval renewal',
  'approval renewal revalidates the package lifecycle'
);

select throws_ok(
  $$select public.ads_approve_campaign_plan_revision(
    plan.id, plan.active_revision_id, plan.approved_revision_hash, plan.lock_version,
    approval.expires_at + interval '1 hour', 'renew-invalid-approved-build-v2', null,
    '00000000-0000-0000-0000-000000000051', null, null
  ) from public.ads_campaign_plans as plan
  join public.ads_campaign_builds as build on build.plan_id = plan.id
  join public.ads_campaign_approvals as approval on approval.id = build.approval_id
  where plan.created_by_name = 'renew-invalid-approved-build'$$,
  '55000', 'Approved renewal requires the exact pending Gate 1 build',
  'an approved plan cannot renew a non-pending build'
);
select throws_ok(
  $$select public.ads_approve_campaign_plan_revision(
    plan.id, plan.active_revision_id, plan.approved_revision_hash, plan.lock_version,
    approval.expires_at + interval '1 hour', 'renew-terminal-v2', null,
    '00000000-0000-0000-0000-000000000051', null, null
  ) from public.ads_campaign_plans as plan
  join public.ads_campaign_builds as build on build.plan_id = plan.id
  join public.ads_campaign_approvals as approval on approval.id = build.approval_id
  where plan.created_by_name = 'renew-terminal'$$,
  '55000', 'Terminal or cancelled campaign builds cannot renew approval',
  'a verified build cannot renew approval'
);
select throws_ok(
  $$select public.ads_approve_campaign_plan_revision(
    plan.id, plan.active_revision_id, plan.approved_revision_hash, plan.lock_version,
    approval.expires_at + interval '1 hour', 'renew-cancelled-v2', null,
    '00000000-0000-0000-0000-000000000051', null, null
  ) from public.ads_campaign_plans as plan
  join public.ads_campaign_builds as build on build.plan_id = plan.id
  join public.ads_campaign_approvals as approval on approval.id = build.approval_id
  where plan.created_by_name = 'renew-cancelled'$$,
  '55000', 'Campaign plan is not eligible for initial approval or renewal',
  'a cancelled plan/build cannot renew approval'
);

select public.ads_approve_campaign_plan_revision(
  plan.id, plan.active_revision_id, plan.approved_revision_hash, plan.lock_version,
  approval.expires_at + interval '1 hour', 'renewed-old-key-v2',
  'real renewal before historical replay',
  '00000000-0000-0000-0000-000000000051',
  '203.0.113.57', 'workflow-tests/real-renewal'
)
from public.ads_campaign_plans as plan
join public.ads_campaign_builds as build on build.plan_id = plan.id
join public.ads_campaign_approvals as approval on approval.id = build.approval_id
where plan.created_by_name = 'renewed-old-key';

select pg_temp.capture_approval_replay(
  'renewed-old-key', 'initial-renewed-old-key'
);
select is(
  (select returned_build_id from approval_replay_results where fixture = 'renewed-old-key'),
  (select original_build_id from approval_replay_results where fixture = 'renewed-old-key'),
  'an old approval key returns the original build after a real renewal'
);
select ok(
  (select side_effect_free from approval_replay_results where fixture = 'renewed-old-key'),
  'an old-key replay after real renewal changes no approval, build, plan lock, or audit evidence'
);

select throws_ok(
  $$select public.ads_release_campaign_budget(
    plan.id, plan.lock_version, 'unsafe direct approved release',
    '00000000-0000-0000-0000-000000000051', null, null
  ) from public.ads_campaign_plans as plan
  where plan.created_by_name = 'approved-release-reject'$$,
  '55000', 'Approved campaign plans must cancel their pending build before budget release',
  'direct budget release from approved is rejected'
);

select throws_ok(
  $$select public.ads_transition_campaign_plan(
    plan.id, plan.lock_version, 'approved', 'draft',
    'reject an initially inconsistent approved snapshot',
    '00000000-0000-0000-0000-000000000051', null,
    'workflow-tests/transition-inconsistent-approved'
  ) from public.ads_campaign_plans as plan
  where plan.created_by_name = 'transition-inconsistent-approved'$$,
  '55000', 'Approved transition requires one matching pending Gate 1 build',
  'an initially inconsistent approved plan/build snapshot remains an invariant error'
);

create function pg_temp.transition_then_release_is_coherent()
returns boolean
language plpgsql
as $$
declare
  v_plan public.ads_campaign_plans%rowtype;
begin
  select * into strict v_plan
  from public.ads_campaign_plans where created_by_name = 'transition-release';
  select * into strict v_plan
  from public.ads_transition_campaign_plan(
    v_plan.id, v_plan.lock_version, 'approved', 'draft',
    'cancel build before release',
    '00000000-0000-0000-0000-000000000051', null,
    'workflow-tests/transition-release'
  );
  if v_plan.lock_version <> 11 or exists (
    select 1 from public.ads_campaign_builds
    where plan_id = v_plan.id and status <> 'cancelled'
  ) then
    return false;
  end if;
  select * into strict v_plan
  from public.ads_release_campaign_budget(
    v_plan.id, v_plan.lock_version, 'release after coherent cancellation',
    '00000000-0000-0000-0000-000000000051', null,
    'workflow-tests/release-after-transition'
  );
  return v_plan.status = 'draft'
    and v_plan.lock_version = 12
    and v_plan.reserved_revision_id is null
    and v_plan.reserved_budget = 0
    and (select committed_amount from public.ads_budget_packages where id = v_plan.budget_package_id) = 0
    and (select count(*) from public.ads_campaign_builds where plan_id = v_plan.id) = 1
    and not exists (
      select 1 from public.ads_campaign_builds
      where plan_id = v_plan.id and status <> 'cancelled'
    )
    and exists (
      select 1 from public.ads_campaign_audit_events
      where plan_id = v_plan.id and event_type = 'campaign_build_cancelled'
    );
exception when others then
  return false;
end;
$$;

select ok(
  pg_temp.transition_then_release_is_coherent(),
  'approved transition cancels its exact build before release clears only the committed reservation'
);

select is(
  (select actor_name from public.ads_campaign_audit_events where event_type = 'campaign_plan_revision_approved' and trusted_user_agent = 'workflow-tests/approve'),
  'Workflow Operator',
  'audit actor name is database-derived rather than caller-supplied'
);
select is(
  (select trusted_ip::text from public.ads_campaign_audit_events where event_type = 'campaign_plan_revision_approved' and trusted_user_agent = 'workflow-tests/approve'),
  '203.0.113.54/32',
  'audit preserves trusted caller IP evidence'
);
select is(
  (select trusted_user_agent from public.ads_campaign_audit_events where event_type = 'campaign_plan_revision_approved' and trusted_ip = '203.0.113.54'),
  'workflow-tests/approve',
  'audit preserves trusted caller user-agent evidence'
);
select is(
  (select metadata ->> 'actor_email' from public.ads_campaign_audit_events where event_type = 'campaign_plan_revision_approved' and trusted_user_agent = 'workflow-tests/approve'),
  'workflow.operator@locus-t.com.my',
  'audit stores the database-confirmed actor email as evidence'
);
select is(
  (select metadata ->> 'actor_role' from public.ads_campaign_audit_events where event_type = 'campaign_plan_revision_approved' and trusted_user_agent = 'workflow-tests/approve'),
  'approver',
  'audit stores the database-resolved actor role as evidence'
);
select ok(
  (select created_at <= clock_timestamp() from public.ads_campaign_audit_events where event_type = 'campaign_plan_revision_approved' and trusted_user_agent = 'workflow-tests/approve'),
  'audit timestamps come from database time'
);

select ok(
  case
    when to_regprocedure('public.ads_create_campaign_plan_revision(bigint,bigint,jsonb,text,text,uuid,inet,text)') is null then false
    else has_function_privilege('service_role', 'public.ads_create_campaign_plan_revision(bigint,bigint,jsonb,text,text,uuid,inet,text)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.ads_create_campaign_plan_revision(bigint,bigint,jsonb,text,text,uuid,inet,text)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.ads_create_campaign_plan_revision(bigint,bigint,jsonb,text,text,uuid,inet,text)', 'EXECUTE')
  end,
  'workflow RPC execution is limited to service_role'
);
select ok(
  case
    when to_regprocedure('ads_internal.resolve_m04_actor(uuid)') is null
      or to_regprocedure('ads_internal.append_campaign_audit(bigint,bigint,bigint,bigint,text,text,text,uuid,inet,text,jsonb)') is null then false
    else not has_function_privilege('service_role', 'ads_internal.resolve_m04_actor(uuid)', 'EXECUTE')
      and not has_function_privilege('service_role', 'ads_internal.append_campaign_audit(bigint,bigint,bigint,bigint,text,text,text,uuid,inet,text,jsonb)', 'EXECUTE')
  end,
  'internal actor and audit helpers are not directly executable'
);

select * from finish();
rollback;
