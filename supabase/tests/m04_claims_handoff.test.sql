begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000061', 'launch.operator@locus-t.com.my', 'authenticated', 'authenticated', clock_timestamp());
insert into public.ad_automation_report_users (id, full_name, role, is_active) values
  ('00000000-0000-0000-0000-000000000061', 'Launch Operator', 'admin', true);

insert into public.ads_ad_accounts (
  client_id, platform, provider_account_id, account_name, currency, timezone,
  access_status, access_evidence, access_verified_at, is_active
) values (
  '00000000-0000-0000-0000-000000000001', 'google', 'claims-account',
  'Claims Account', 'MYR', 'Asia/Kuala_Lumpur', 'verified',
  '{"source":"claims-test"}', clock_timestamp(), true
);
insert into public.ads_budget_packages (
  client_id, package_key, package_name, currency, start_date, end_date,
  envelope_amount, committed_amount, status
) values (
  '00000000-0000-0000-0000-000000000001', 'claims-package', 'Claims Package',
  'MYR', '2026-08-01', '2026-08-31', 5000, 500, 'active'
);

create function pg_temp.make_approved_build(p_fixture text)
returns bigint
language plpgsql
as $$
declare
  v_plan_id bigint;
  v_revision_id bigint;
  v_approval_id bigint;
  v_build_id bigint;
begin
  insert into public.ads_campaign_plans (
    client_id, budget_package_id, ad_account_id, platform, reserved_budget,
    status, created_by_id, created_by_name
  ) values (
    '00000000-0000-0000-0000-000000000001',
    (select id from public.ads_budget_packages where package_key = 'claims-package'),
    (select id from public.ads_ad_accounts where provider_account_id = 'claims-account'),
    'google', 100, 'awaiting_approval',
    '00000000-0000-0000-0000-000000000061', p_fixture
  ) returning id into v_plan_id;

  insert into public.ads_campaign_plan_revisions (
    plan_id, revision_number, client_id, ad_account_id, budget_package_id,
    platform, provider_account_id, currency, timezone, start_date, end_date,
    allocated_budget, increment_amount, daily_budget, projected_total,
    objective, destination, plan_payload, canonical_json, payload_hash,
    created_by_id, created_by_name
  ) values (
    v_plan_id, 1, '00000000-0000-0000-0000-000000000001',
    (select id from public.ads_ad_accounts where provider_account_id = 'claims-account'),
    (select id from public.ads_budget_packages where package_key = 'claims-package'),
    'google', 'claims-account', 'MYR', 'Asia/Kuala_Lumpur',
    '2026-08-01', '2026-08-20', 100, 0, 5, 100, 'leads',
    'https://example.test/claims', '{"fixture":true}', '{"fixture":true}',
    repeat('a', 64), '00000000-0000-0000-0000-000000000061', 'Launch Operator'
  ) returning id into v_revision_id;

  update public.ads_campaign_plans
  set active_revision_id = v_revision_id,
      approved_revision_id = v_revision_id,
      approved_revision_hash = repeat('a', 64),
      reserved_revision_id = v_revision_id,
      status = 'approved'
  where id = v_plan_id;

  insert into public.ads_campaign_approvals (
    plan_id, revision_id, revision_hash, decision, expires_at,
    request_idempotency_key, approved_by_id, approved_by_name
  ) values (
    v_plan_id, v_revision_id, repeat('a', 64), 'approved',
    clock_timestamp() + interval '1 day', 'approve-' || p_fixture,
    '00000000-0000-0000-0000-000000000061', 'Launch Operator'
  ) returning id into v_approval_id;

  insert into public.ads_campaign_builds (
    plan_id, revision_id, revision_hash, approval_id, budget_package_id,
    ad_account_id, platform
  ) values (
    v_plan_id, v_revision_id, repeat('a', 64), v_approval_id,
    (select id from public.ads_budget_packages where package_key = 'claims-package'),
    (select id from public.ads_ad_accounts where provider_account_id = 'claims-account'),
    'google'
  ) returning id into v_build_id;

  return v_build_id;
end;
$$;

select pg_temp.make_approved_build(fixture)
from (values ('claim fixture'), ('recovery fixture'), ('mismatch fixture'),
             ('ambiguous delivery fixture'), ('verified fixture')) as fixtures(fixture);

select has_function(
  'public', 'ads_acquire_campaign_gate_claim',
  array['bigint','smallint','text','text','bigint','text','integer','jsonb','uuid','inet','text'],
  'gate claim RPC exists with the approved signature'
);
select has_function(
  'public', 'ads_acquire_campaign_retry_claim',
  array['bigint','bigint','text','text','integer','jsonb','uuid','inet','text'],
  'retry claim RPC exists with the approved signature'
);
select has_function(
  'public', 'ads_record_campaign_resource_outcome',
  array['bigint','uuid','text','text','text','text','jsonb','jsonb'],
  'resource outcome RPC exists with the approved signature'
);
select has_function(
  'public', 'ads_append_campaign_qa_result',
  array['bigint','uuid','bigint','text','text','boolean','jsonb','jsonb','text','text','text','jsonb'],
  'QA append RPC exists with the approved signature'
);
select has_function(
  'public', 'ads_finalize_campaign_gate_claim',
  array['bigint','uuid','text','jsonb','uuid','inet','text'],
  'gate finalizer RPC exists with the approved signature and no caller-selected state'
);
select has_function(
  'public', 'ads_create_campaign_monitoring_handoff',
  array['bigint','bigint','text','uuid','inet','text'],
  'monitoring handoff RPC exists with the approved signature'
);

select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    (select build.id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'claim fixture'),
    1::smallint, 'create', 'claim-one',
    (select revision_id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'claim fixture'),
    repeat('a', 64), 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"},{"logical_resource_key":"ad-group:1","resource_type":"ad_group"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', '203.0.113.61', 'claims-tests/first'
  )$$,
  'Gate 1 persists its claim and logical resource intents before provider mutation'
);
select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    (select build.id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'claim fixture'),
    1::smallint, 'create', 'claim-one',
    (select revision_id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'claim fixture'),
    repeat('a', 64), 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"},{"logical_resource_key":"ad-group:1","resource_type":"ad_group"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', '198.51.100.61', 'claims-tests/idempotent'
  )$$,
  'an identical immutable-input request key returns the existing claim'
);
select is(
  (select count(*)::integer from public.ads_campaign_gate_attempts attempt join public.ads_campaign_plans plan on plan.id = (select build.plan_id from public.ads_campaign_builds build where build.id = attempt.build_id) where plan.created_by_name = 'claim fixture'),
  1, 'identical claim acquisition creates one attempt only'
);
select is(
  (select count(*)::integer from public.ads_campaign_build_resources resource join public.ads_campaign_builds build on build.id = resource.build_id join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'claim fixture'),
  2, 'Gate 1 claim materializes every declared logical resource intent'
);
select throws_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    (select build.id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'claim fixture'),
    1::smallint, 'create', 'claim-two',
    (select revision_id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'claim fixture'),
    repeat('a', 64), 300, '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  '55P03', 'A different active gate claim already exists',
  'a different active request key cannot steal a gate claim'
);

update public.ads_campaign_gate_attempts
set claimed_at = clock_timestamp() - interval '2 hours',
    claim_expires_at = clock_timestamp() - interval '1 hour'
where request_idempotency_key = 'claim-one';
select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    (select build.id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'claim fixture'),
    1::smallint, 'create', 'claim-after-expiry',
    (select revision_id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'claim fixture'),
    repeat('a', 64), 300, '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  'an expired claim is released under the build lock and replaced'
);
select ok(
  (select status = 'expired' and released_at is not null from public.ads_campaign_gate_attempts where request_idempotency_key = 'claim-one'),
  'stale claim evidence is retained as expired'
);

select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    (select build.id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'recovery fixture'),
    1::smallint, 'create', 'recovery-create',
    (select revision_id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'recovery fixture'),
    repeat('a', 64), 300, '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  'the recovery fixture acquires its initial mutation claim'
);
select lives_ok(
  $$select public.ads_record_campaign_resource_outcome(
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-create'),
    (select claim_token from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-create'),
    'campaign', 'ambiguous', null, null, '{"request_sent":true}'::jsonb, '{"timeout":true}'::jsonb
  )$$,
  'an ambiguous provider outcome is persisted without inventing an ID'
);
select is(
  (select build.status from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'recovery fixture'),
  'reconciliation_required', 'an ambiguous mutation requires reconciliation'
);
select throws_ok(
  $$select public.ads_acquire_campaign_retry_claim(
    (select build.id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'recovery fixture'),
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-create'),
    'recovery-too-soon', repeat('a', 64), 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  '55000', 'Mutation retry requires every intended resource to be proven missing by reconciliation readback',
  'an ambiguous mutation cannot be retried before missing-resource readback'
);
select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    (select build.id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'recovery fixture'),
    1::smallint, 'reconcile', 'recovery-readback',
    (select revision_id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'recovery fixture'),
    repeat('a', 64), 300, '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  'reconciliation gets its own persisted readback claim'
);
select lives_ok(
  $$select public.ads_append_campaign_qa_result(
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-readback'),
    (select claim_token from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-readback'),
    (select resource.id from public.ads_campaign_build_resources resource join public.ads_campaign_builds build on build.id = resource.build_id join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'recovery fixture' and resource.logical_resource_key = 'campaign'),
    'reconciliation', 'provider.resource', true, '"absent"'::jsonb, '"absent"'::jsonb,
    'missing', 'PROVEN_MISSING', 'provider readback found no campaign', '{"query":"campaign lookup","found":false}'::jsonb
  )$$,
  'reconciliation appends provider readback proving the resource is missing'
);
select lives_ok(
  $$select public.ads_finalize_campaign_gate_claim(
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-readback'),
    (select claim_token from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-readback'),
    'missing', '{"found":false}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  'reconciliation finalization releases its readback claim'
);
select throws_ok(
  $$select public.ads_acquire_campaign_retry_claim(
    (select build.id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'claim fixture'),
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-create'),
    'wrong-build-retry', repeat('a', 64), 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  '22023', 'Retry parent does not belong to the selected build',
  'retry acquisition validates its parent build'
);
select throws_ok(
  $$select public.ads_acquire_campaign_retry_claim(
    (select build.id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'recovery fixture'),
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-create'),
    'recovery-altered-intent', repeat('a', 64), 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"ad_group"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  '22023', 'Retry intent must match the parent logical resources',
  'retry acquisition cannot narrow or alter the mutation covered by missing-resource proof'
);
select lives_ok(
  $$select public.ads_acquire_campaign_retry_claim(
    (select build.id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'recovery fixture'),
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-create'),
    'recovery-retry', repeat('a', 64), 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  'a mutation retry is claimable only after proven-missing readback'
);
select ok(
  (select action = 'retry' and retry_parent_attempt_id = (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-create') and attempt_number = 3 from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-retry'),
  'retry evidence binds the validated parent and monotonic attempt number'
);
select lives_ok(
  $$select public.ads_record_campaign_resource_outcome(
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-retry'),
    (select claim_token from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-retry'),
    'campaign', 'succeeded', 'provider-campaign-recovery', null, '{"status":"PAUSED"}'::jsonb, null
  )$$,
  'a proven-missing retry may persist the newly created provider ID'
);
select throws_ok(
  $$select public.ads_record_campaign_resource_outcome(
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-retry'),
    (select claim_token from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-retry'),
    'campaign', 'succeeded', 'replacement-id', null, '{}'::jsonb, null
  )$$,
  '55000', 'A non-null provider resource ID is immutable',
  'a persisted provider ID cannot be replaced'
);

select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    (select build.id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'mismatch fixture'),
    1::smallint, 'create', 'mismatch-create',
    (select revision_id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'mismatch fixture'),
    repeat('a', 64), 300, '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  'the mismatch fixture acquires Gate 1'
);
select throws_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    (select build.id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'mismatch fixture'),
    2::smallint, 'deliver', 'mismatch-deliver-early',
    (select revision_id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'mismatch fixture'),
    repeat('a', 64), 300, '{}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  '55000', 'Gate 2 requires a build ready to deliver',
  'Gate 2 cannot start before derived Gate 1 readiness'
);
select lives_ok(
  $$select public.ads_record_campaign_resource_outcome(
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'mismatch-create'),
    (select claim_token from public.ads_campaign_gate_attempts where request_idempotency_key = 'mismatch-create'),
    'campaign', 'succeeded', 'provider-campaign-mismatch', null, '{}', null
  )$$,
  'the mismatch fixture records its provider campaign'
);
select lives_ok(
  $$select public.ads_append_campaign_qa_result(
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'mismatch-create'),
    (select claim_token from public.ads_campaign_gate_attempts where request_idempotency_key = 'mismatch-create'),
    (select resource.id from public.ads_campaign_build_resources resource join public.ads_campaign_builds build on build.id = resource.build_id join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'mismatch fixture'),
    'gate_1', 'campaign.status', true, '"PAUSED"'::jsonb, '"ENABLED"'::jsonb,
    'mismatch', 'STATUS_MISMATCH', 'campaign was not created paused', '{"status":"ENABLED"}'::jsonb
  )$$,
  'Gate 1 QA persists a required mismatch'
);
select throws_ok(
  $$update public.ads_campaign_qa_results set result = 'match' where mismatch_code = 'STATUS_MISMATCH'$$,
  '55000', 'M04 evidence rows are append-only', 'QA results cannot be rewritten'
);
select throws_ok(
  $$delete from public.ads_campaign_qa_results where mismatch_code = 'STATUS_MISMATCH'$$,
  '55000', 'M04 evidence rows are append-only', 'QA results cannot be deleted'
);
select lives_ok(
  $$select public.ads_finalize_campaign_gate_claim(
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'mismatch-create'),
    (select claim_token from public.ads_campaign_gate_attempts where request_idempotency_key = 'mismatch-create'),
    'succeeded', '{"provider_mutation":"complete"}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  'Gate 1 finalizer derives failure from persisted QA instead of caller intent'
);
select is(
  (select build.status from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'mismatch fixture'),
  'qa_failed', 'a required Gate 1 mismatch prevents ready_to_deliver'
);

select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 1::smallint, 'create', plan.created_by_name || '-create', build.revision_id,
    build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )
  from public.ads_campaign_builds build
  join public.ads_campaign_plans plan on plan.id = build.plan_id
  where plan.created_by_name in ('ambiguous delivery fixture', 'verified fixture')$$,
  'the delivery fixtures acquire Gate 1 claims'
);
select lives_ok(
  $$select public.ads_record_campaign_resource_outcome(
    attempt.id, attempt.claim_token, 'campaign', 'succeeded',
    case when plan.created_by_name = 'verified fixture' then 'provider-campaign-verified' else 'provider-campaign-ambiguous' end,
    null, '{"status":"PAUSED"}'::jsonb, null
  )
  from public.ads_campaign_gate_attempts attempt
  join public.ads_campaign_builds build on build.id = attempt.build_id
  join public.ads_campaign_plans plan on plan.id = build.plan_id
  where attempt.request_idempotency_key in ('ambiguous delivery fixture-create', 'verified fixture-create')$$,
  'the delivery fixtures persist provider campaign mappings'
);
select lives_ok(
  $$select public.ads_append_campaign_qa_result(
    attempt.id, attempt.claim_token, resource.id, 'gate_1', 'campaign.status', true,
    '"PAUSED"'::jsonb, '"PAUSED"'::jsonb, 'match', null, null, '{"status":"PAUSED"}'::jsonb
  )
  from public.ads_campaign_gate_attempts attempt
  join public.ads_campaign_build_resources resource on resource.build_id = attempt.build_id and resource.logical_resource_key = 'campaign'
  where attempt.request_idempotency_key in ('ambiguous delivery fixture-create', 'verified fixture-create')$$,
  'required Gate 1 comparisons match for both delivery fixtures'
);
select lives_ok(
  $$select public.ads_finalize_campaign_gate_claim(
    attempt.id, attempt.claim_token, 'succeeded', '{"gate_1":"complete"}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )
  from public.ads_campaign_gate_attempts attempt
  where attempt.request_idempotency_key in ('ambiguous delivery fixture-create', 'verified fixture-create')$$,
  'matching required Gate 1 evidence derives ready_to_deliver'
);
select is(
  (select count(*)::integer from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name in ('ambiguous delivery fixture', 'verified fixture') and build.status = 'ready_to_deliver'),
  2, 'only database-derived Gate 1 readiness opens Gate 2'
);

select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 2::smallint, 'deliver', plan.created_by_name || '-deliver', build.revision_id,
    build.revision_hash, 300, '{}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )
  from public.ads_campaign_builds build
  join public.ads_campaign_plans plan on plan.id = build.plan_id
  where plan.created_by_name in ('ambiguous delivery fixture', 'verified fixture')$$,
  'ready builds acquire Gate 2 delivery claims'
);
select lives_ok(
  $$select public.ads_finalize_campaign_gate_claim(
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'ambiguous delivery fixture-deliver'),
    (select claim_token from public.ads_campaign_gate_attempts where request_idempotency_key = 'ambiguous delivery fixture-deliver'),
    'ambiguous', '{"request_sent":true,"readback":"unknown"}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  'an ambiguous Gate 2 provider outcome is finalized conservatively'
);
select ok(
  (select build.status = 'delivery_unverified' and build.verified_at is null from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'ambiguous delivery fixture'),
  'unknown Gate 2 state derives delivery_unverified rather than verified'
);
select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 2::smallint, 'reconcile', 'ambiguous-delivery-readback', build.revision_id,
    build.revision_hash, 300, '{}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )
  from public.ads_campaign_builds build
  join public.ads_campaign_plans plan on plan.id = build.plan_id
  where plan.created_by_name = 'ambiguous delivery fixture'$$,
  'delivery_unverified can acquire a read-only reconciliation claim'
);
select lives_ok(
  $$select public.ads_append_campaign_qa_result(
    attempt.id, attempt.claim_token, resource.id, 'reconciliation', 'campaign.status', true,
    '"ENABLED"'::jsonb, '"ENABLED"'::jsonb, 'match', null, null,
    '{"status":"ENABLED","provider_id":"provider-campaign-ambiguous"}'::jsonb
  )
  from public.ads_campaign_gate_attempts attempt
  join public.ads_campaign_build_resources resource on resource.build_id = attempt.build_id and resource.logical_resource_key = 'campaign'
  where attempt.request_idempotency_key = 'ambiguous-delivery-readback'$$,
  'delivery reconciliation appends authoritative final readback'
);
select lives_ok(
  $$select public.ads_finalize_campaign_gate_claim(
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'ambiguous-delivery-readback'),
    (select claim_token from public.ads_campaign_gate_attempts where request_idempotency_key = 'ambiguous-delivery-readback'),
    'succeeded', '{"status":"ENABLED","provider_id":"provider-campaign-ambiguous"}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  'authoritative reconciliation finalizes the previously ambiguous delivery'
);
select ok(
  (select build.status = 'verified' and build.verified_at is not null and resource.verified_at is not null
   from public.ads_campaign_builds build
   join public.ads_campaign_plans plan on plan.id = build.plan_id
   join public.ads_campaign_build_resources resource on resource.build_id = build.id and resource.logical_resource_key = 'campaign'
   where plan.created_by_name = 'ambiguous delivery fixture'),
  'Gate 2 reconciliation derives verified only from matching persisted readback'
);

select lives_ok(
  $$select public.ads_append_campaign_qa_result(
    attempt.id, attempt.claim_token, resource.id, 'gate_2', 'campaign.status', true,
    '"ENABLED"'::jsonb, '"ENABLED"'::jsonb, 'match', null, null,
    '{"status":"ENABLED","provider_id":"provider-campaign-verified"}'::jsonb
  )
  from public.ads_campaign_gate_attempts attempt
  join public.ads_campaign_build_resources resource on resource.build_id = attempt.build_id and resource.logical_resource_key = 'campaign'
  where attempt.request_idempotency_key = 'verified fixture-deliver'$$,
  'Gate 2 appends final delivery readback for the verified campaign'
);
select lives_ok(
  $$select public.ads_finalize_campaign_gate_claim(
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'verified fixture-deliver'),
    (select claim_token from public.ads_campaign_gate_attempts where request_idempotency_key = 'verified fixture-deliver'),
    'succeeded', '{"status":"ENABLED","provider_id":"provider-campaign-verified"}'::jsonb,
    '00000000-0000-0000-0000-000000000061', '203.0.113.62', 'claims-tests/verify'
  )$$,
  'successful final provider readback derives verified'
);
select ok(
  (select build.status = 'verified' and build.verified_at is not null and resource.verified_at is not null
   from public.ads_campaign_builds build
   join public.ads_campaign_plans plan on plan.id = build.plan_id
   join public.ads_campaign_build_resources resource on resource.build_id = build.id and resource.logical_resource_key = 'campaign'
   where plan.created_by_name = 'verified fixture'),
  'resource.verified_at is written only by successful Gate 2 delivery readback'
);
select throws_ok(
  $$select public.ads_record_campaign_resource_outcome(
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'verified fixture-deliver'),
    (select claim_token from public.ads_campaign_gate_attempts where request_idempotency_key = 'verified fixture-deliver'),
    'campaign', 'failed', null, null, '{}', '{"late":"error"}'
  )$$,
  '55000', 'Gate claim is not active', 'a released claim cannot regress a verified resource'
);

select lives_ok(
  $$select public.ads_create_campaign_monitoring_handoff(
    build.id, build.lock_version, build.revision_hash,
    '00000000-0000-0000-0000-000000000061', '203.0.113.63', 'claims-tests/handoff'
  )
  from public.ads_campaign_builds build
  join public.ads_campaign_plans plan on plan.id = build.plan_id
  where plan.created_by_name = 'verified fixture'$$,
  'verified database evidence creates one minimal monitoring handoff atomically'
);
select lives_ok(
  $$select public.ads_create_campaign_monitoring_handoff(
    build.id, build.lock_version - 1, build.revision_hash,
    '00000000-0000-0000-0000-000000000061', null, 'claims-tests/handoff-retry'
  )
  from public.ads_campaign_builds build
  join public.ads_campaign_plans plan on plan.id = build.plan_id
  where plan.created_by_name = 'verified fixture'$$,
  'an identical handoff retry returns the one immutable handoff'
);
select ok(
  (select count(*) = 1
     and bool_and(handoff.provider_campaign_id = 'provider-campaign-verified')
     and bool_and(handoff.provider_child_ids = '[]'::jsonb)
     and bool_and(build.status = 'handoff_complete')
   from public.ads_campaign_monitoring_handoffs handoff
   join public.ads_campaign_builds build on build.id = handoff.build_id
   join public.ads_campaign_plans plan on plan.id = build.plan_id
   where plan.created_by_name = 'verified fixture'),
  'handoff is DB-derived, minimal, unique, and advances verified to handoff_complete'
);
select throws_ok(
  $$update public.ads_campaign_monitoring_handoffs set provider_campaign_id = 'tampered'$$,
  '55000', 'M04 evidence rows are append-only', 'monitoring handoff cannot be rewritten'
);
select throws_ok(
  $$delete from public.ads_campaign_monitoring_handoffs$$,
  '55000', 'M04 evidence rows are append-only', 'monitoring handoff cannot be deleted'
);

select ok(
  case
    when to_regprocedure('public.ads_acquire_campaign_gate_claim(bigint,smallint,text,text,bigint,text,integer,jsonb,uuid,inet,text)') is null
      or to_regprocedure('public.ads_create_campaign_monitoring_handoff(bigint,bigint,text,uuid,inet,text)') is null then false
    else has_function_privilege('service_role', 'public.ads_acquire_campaign_gate_claim(bigint,smallint,text,text,bigint,text,integer,jsonb,uuid,inet,text)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.ads_acquire_campaign_gate_claim(bigint,smallint,text,text,bigint,text,integer,jsonb,uuid,inet,text)', 'EXECUTE')
      and has_function_privilege('service_role', 'public.ads_acquire_campaign_retry_claim(bigint,bigint,text,text,integer,jsonb,uuid,inet,text)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.ads_acquire_campaign_retry_claim(bigint,bigint,text,text,integer,jsonb,uuid,inet,text)', 'EXECUTE')
      and has_function_privilege('service_role', 'public.ads_record_campaign_resource_outcome(bigint,uuid,text,text,text,text,jsonb,jsonb)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.ads_record_campaign_resource_outcome(bigint,uuid,text,text,text,text,jsonb,jsonb)', 'EXECUTE')
      and has_function_privilege('service_role', 'public.ads_append_campaign_qa_result(bigint,uuid,bigint,text,text,boolean,jsonb,jsonb,text,text,text,jsonb)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.ads_append_campaign_qa_result(bigint,uuid,bigint,text,text,boolean,jsonb,jsonb,text,text,text,jsonb)', 'EXECUTE')
      and has_function_privilege('service_role', 'public.ads_finalize_campaign_gate_claim(bigint,uuid,text,jsonb,uuid,inet,text)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.ads_finalize_campaign_gate_claim(bigint,uuid,text,jsonb,uuid,inet,text)', 'EXECUTE')
      and has_function_privilege('service_role', 'public.ads_create_campaign_monitoring_handoff(bigint,bigint,text,uuid,inet,text)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.ads_create_campaign_monitoring_handoff(bigint,bigint,text,uuid,inet,text)', 'EXECUTE')
      and not has_function_privilege('service_role', 'ads_internal.protect_campaign_build_resource()', 'EXECUTE')
  end,
  'Task 3 RPC execution is limited to service_role'
);

select * from finish();
rollback;
