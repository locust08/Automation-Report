begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000061', 'launch.operator@locus-t.com.my', 'authenticated', 'authenticated', clock_timestamp()),
  ('00000000-0000-0000-0000-000000000062', 'other.launch@digitalbee.ai', 'authenticated', 'authenticated', clock_timestamp());
insert into public.ad_automation_report_users (id, full_name, role, is_active) values
  ('00000000-0000-0000-0000-000000000061', 'Launch Operator', 'admin', true),
  ('00000000-0000-0000-0000-000000000062', 'Other Launch Operator', 'approver', true);

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
             ('ambiguous delivery fixture'), ('verified fixture'),
             ('expired gate 2 fixture'), ('approval mismatch fixture'),
             ('mixed recovery fixture'), ('found recovery fixture'),
             ('invalid gate 2 fixture'), ('invalid gate 2 final fixture'),
             ('invalid handoff fixture')) as fixtures(fixture);

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
select throws_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    (select build.id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'claim fixture'),
    1::smallint, 'create', 'claim-after-expiry',
    (select revision_id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'claim fixture'),
    repeat('a', 64), 300, '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  '55000', 'Expired Gate 1 mutation requires reconciliation before another mutation',
  'an expired mutation claim cannot roll forward a duplicate create'
);
-- If the assertion above exposes the reviewed bug, remove its unintended successful
-- claim so the independent reconciliation assertion can still run to completion.
update public.ads_campaign_gate_attempts
set status = 'released', released_at = clock_timestamp(), updated_at = clock_timestamp()
where request_idempotency_key = 'claim-after-expiry'
  and status = 'claimed' and released_at is null;
select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    (select build.id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'claim fixture'),
    1::smallint, 'reconcile', 'claim-expiry-readback',
    (select revision_id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'claim fixture'),
    repeat('a', 64), 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"},{"logical_resource_key":"ad-group:1","resource_type":"ad_group"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  'the correct reconciliation claim expires the stale mutation and preserves recovery'
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
  '55000', 'Mutation retry requires a Gate 1 failed build',
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
update public.ads_campaign_gate_attempts
set claimed_at = clock_timestamp() - interval '2 hours',
    claim_expires_at = clock_timestamp() - interval '1 hour'
where request_idempotency_key = 'recovery-readback';
select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    (select build.id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'recovery fixture'),
    1::smallint, 'reconcile', 'recovery-readback-after-expiry',
    (select revision_id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'recovery fixture'),
    repeat('a', 64), 300, '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  'an expired Gate 1 reconciliation claim is normalized and reacquired conservatively'
);
-- Preserve a usable downstream fixture after the expected pre-fix reacquisition
-- failure. The lives_ok above remains the behavioral assertion for stale recovery.
update public.ads_campaign_gate_attempts
set status = 'expired', released_at = clock_timestamp(), updated_at = clock_timestamp()
where request_idempotency_key = 'recovery-readback'
  and status = 'claimed'
  and not exists (
    select 1 from public.ads_campaign_gate_attempts
    where request_idempotency_key = 'recovery-readback-after-expiry'
  );
insert into public.ads_campaign_gate_attempts (
  build_id, gate, action, request_idempotency_key, attempt_number,
  revision_id, revision_hash, status, intent, claimed_at, claim_expires_at,
  actor_id, actor_name
)
select build.id, 1, 'reconcile', 'recovery-readback-after-expiry',
  (select coalesce(max(existing.attempt_number), 0) + 1
   from public.ads_campaign_gate_attempts existing where existing.build_id = build.id),
  build.revision_id, build.revision_hash, 'claimed',
  '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
  clock_timestamp(), clock_timestamp() + interval '5 minutes',
  '00000000-0000-0000-0000-000000000061', 'Launch Operator'
from public.ads_campaign_builds build
join public.ads_campaign_plans plan on plan.id = build.plan_id
where plan.created_by_name = 'recovery fixture'
  and not exists (
    select 1 from public.ads_campaign_gate_attempts
    where request_idempotency_key = 'recovery-readback-after-expiry'
  );
select ok(
  (select status = 'expired' and released_at is not null from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-readback'),
  'expired reconciliation evidence is retained without wedging the build'
);
insert into public.ads_campaign_qa_results (
  attempt_id, build_resource_id, phase, field_path, required,
  expected_value, observed_value, result, mismatch_code, mismatch_detail, readback_evidence
) values (
  (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-readback-after-expiry'),
  (select resource.id from public.ads_campaign_build_resources resource join public.ads_campaign_builds build on build.id = resource.build_id join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'recovery fixture' and resource.logical_resource_key = 'campaign'),
  'reconciliation', 'provider.resource.invalid', true, '"absent"', '"absent"',
  'missing', 'INVALID_EVIDENCE', 'array is not authorization-grade evidence', '[]'::jsonb
);
select lives_ok(
  $$select public.ads_finalize_campaign_gate_claim(
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-readback-after-expiry'),
    (select claim_token from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-readback-after-expiry'),
    'missing', '[]'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  'invalid reconciliation evidence is finalized conservatively'
);
select is(
  (select build.status from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'recovery fixture'),
  'reconciliation_required', 'an empty-array readback cannot prove a resource missing'
);
select throws_ok(
  $$select public.ads_acquire_campaign_retry_claim(
    (select build.id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'recovery fixture'),
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-create'),
    'recovery-invalid-proof-retry', repeat('a', 64), 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  '55000', 'Mutation retry requires a Gate 1 failed build',
  'empty-array reconciliation evidence cannot authorize mutation retry'
);
-- Remove a pre-fix retry that incorrectly succeeded and restore the already-tested
-- conservative state so the later valid-proof path is not a cascade failure.
update public.ads_campaign_gate_attempts
set status = 'released', released_at = clock_timestamp(), updated_at = clock_timestamp()
where request_idempotency_key = 'recovery-invalid-proof-retry'
  and status = 'claimed' and released_at is null;
update public.ads_campaign_builds as build
set status = 'reconciliation_required', updated_at = clock_timestamp()
from public.ads_campaign_plans as plan
where plan.id = build.plan_id and plan.created_by_name = 'recovery fixture';
select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    (select build.id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'recovery fixture'),
    1::smallint, 'reconcile', 'recovery-readback-valid',
    (select revision_id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'recovery fixture'),
    repeat('a', 64), 300, '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  'valid reconciliation can follow a conservative invalid-evidence result'
);
select lives_ok(
  $$select public.ads_append_campaign_qa_result(
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-readback-valid'),
    (select claim_token from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-readback-valid'),
    (select resource.id from public.ads_campaign_build_resources resource join public.ads_campaign_builds build on build.id = resource.build_id join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'recovery fixture' and resource.logical_resource_key = 'campaign'),
    'reconciliation', 'provider.resource', true, '"absent"'::jsonb, '"absent"'::jsonb,
    'missing', 'PROVEN_MISSING', 'provider readback found no campaign', '{"query":"campaign lookup","found":false}'::jsonb
  )$$,
  'reconciliation appends provider readback proving the resource is missing'
);
select lives_ok(
  $$select public.ads_finalize_campaign_gate_claim(
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-readback-valid'),
    (select claim_token from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-readback-valid'),
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
  '55P03', 'A different active gate claim already exists',
  'build-wide active-claim exclusion precedes a new retry parent check'
);
select throws_ok(
  $$select public.ads_acquire_campaign_retry_claim(
    (select build.id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'recovery fixture'),
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-create'),
    'recovery-altered-intent', repeat('a', 64), 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"ad_group"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  '22023', 'Retry resources must be a key/type subset of the parent mutation intent',
  'retry acquisition cannot alter the key/type identity of a selected parent resource'
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
  (select action = 'retry'
     and retry_parent_attempt_id = (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-create')
     and attempt_number > (select attempt_number from public.ads_campaign_gate_attempts where request_idempotency_key = 'recovery-create')
     and attempt_number = (select max(existing.attempt_number) from public.ads_campaign_gate_attempts existing where existing.build_id = attempt.build_id)
   from public.ads_campaign_gate_attempts attempt where request_idempotency_key = 'recovery-retry'),
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
    build.id, 1::smallint, 'create', plan.created_by_name || '-create', build.revision_id,
    build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"},{"logical_resource_key":"ad-group:1","resource_type":"ad_group"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )
  from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id
  where plan.created_by_name in ('mixed recovery fixture', 'found recovery fixture')$$,
  'multi-resource recovery fixtures acquire initial Gate 1 mutation claims'
);
select lives_ok(
  $$select public.ads_record_campaign_resource_outcome(
    attempt.id, attempt.claim_token, 'campaign', 'ambiguous', null, null,
    '{"request_sent":true}'::jsonb, '{"timeout":true}'::jsonb
  )
  from public.ads_campaign_gate_attempts attempt
  where attempt.request_idempotency_key in ('mixed recovery fixture-create', 'found recovery fixture-create')$$,
  'multi-resource ambiguous mutations require full-set reconciliation'
);
select throws_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 1::smallint, 'reconcile', 'mixed-incomplete-reconcile', build.revision_id,
    build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )
  from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id
  where plan.created_by_name = 'mixed recovery fixture'$$,
  '22023', 'Gate 1 reconciliation intent must match the latest mutation intent',
  'a reconciliation subset cannot omit an intended resource from full-set derivation'
);
-- Remove the pre-fix subset claim if the assertion above exposes the bypass, so
-- the complete-intent reconciliation scenario remains independent.
update public.ads_campaign_gate_attempts
set status = 'released', released_at = clock_timestamp(), updated_at = clock_timestamp()
where request_idempotency_key = 'mixed-incomplete-reconcile'
  and status = 'claimed' and released_at is null;
update public.ads_campaign_builds as build
set status = 'reconciliation_required', updated_at = clock_timestamp()
from public.ads_campaign_plans as plan
where plan.id = build.plan_id and plan.created_by_name = 'mixed recovery fixture'
  and exists (
    select 1 from public.ads_campaign_gate_attempts
    where request_idempotency_key = 'mixed-incomplete-reconcile'
  );
select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 1::smallint, 'reconcile', plan.created_by_name || '-reconcile', build.revision_id,
    build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"},{"logical_resource_key":"ad-group:1","resource_type":"ad_group"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )
  from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id
  where plan.created_by_name in ('mixed recovery fixture', 'found recovery fixture')$$,
  'multi-resource builds acquire reconciliation claims'
);
select lives_ok(
  $$select public.ads_record_campaign_resource_outcome(
    attempt.id, attempt.claim_token, 'campaign', 'found',
    case when plan.created_by_name = 'mixed recovery fixture' then 'mixed-campaign' else 'found-campaign' end,
    null, '{"readback":"found"}'::jsonb, null
  )
  from public.ads_campaign_gate_attempts attempt
  join public.ads_campaign_builds build on build.id = attempt.build_id
  join public.ads_campaign_plans plan on plan.id = build.plan_id
  where attempt.request_idempotency_key in ('mixed recovery fixture-reconcile', 'found recovery fixture-reconcile')$$,
  'reconciliation persists found campaign mappings without mutation'
);
select lives_ok(
  $$select public.ads_record_campaign_resource_outcome(
    attempt.id, attempt.claim_token, 'ad-group:1', 'found', 'found-ad-group',
    case when plan.created_by_name = 'found recovery fixture' then 'found-campaign' else null end,
    '{"readback":"found"}'::jsonb, null
  )
  from public.ads_campaign_gate_attempts attempt
  join public.ads_campaign_builds build on build.id = attempt.build_id
  join public.ads_campaign_plans plan on plan.id = build.plan_id
  where attempt.request_idempotency_key = 'found recovery fixture-reconcile'$$,
  'all-found reconciliation persists each mapped child identity'
);
select lives_ok(
  $$select public.ads_append_campaign_qa_result(
    attempt.id, attempt.claim_token, resource.id, 'reconciliation', 'provider.exists', true,
    'true'::jsonb, 'true'::jsonb, 'match', null, null,
    jsonb_build_object('found', true, 'provider_id', resource.provider_resource_id)
  )
  from public.ads_campaign_gate_attempts attempt
  join public.ads_campaign_build_resources resource on resource.build_id = attempt.build_id
  where attempt.request_idempotency_key in ('mixed recovery fixture-reconcile', 'found recovery fixture-reconcile')
    and resource.logical_resource_key = 'campaign'$$,
  'campaign found-readback evidence is appended for both recovery fixtures'
);
select lives_ok(
  $$select public.ads_append_campaign_qa_result(
    attempt.id, attempt.claim_token, resource.id, 'reconciliation', 'provider.exists', true,
    'true'::jsonb, 'true'::jsonb, 'match', null, null,
    jsonb_build_object('found', true, 'provider_id', resource.provider_resource_id)
  )
  from public.ads_campaign_gate_attempts attempt
  join public.ads_campaign_build_resources resource on resource.build_id = attempt.build_id
  where attempt.request_idempotency_key = 'found recovery fixture-reconcile'
    and resource.logical_resource_key = 'ad-group:1'$$,
  'all-found reconciliation appends matching child readback'
);
select lives_ok(
  $$select public.ads_append_campaign_qa_result(
    attempt.id, attempt.claim_token, resource.id, 'reconciliation', 'provider.exists', true,
    'false'::jsonb, 'false'::jsonb, 'missing', 'PROVEN_MISSING', null,
    '{"found":false,"query":"ad-group lookup"}'::jsonb
  )
  from public.ads_campaign_gate_attempts attempt
  join public.ads_campaign_build_resources resource on resource.build_id = attempt.build_id
  where attempt.request_idempotency_key = 'mixed recovery fixture-reconcile'
    and resource.logical_resource_key = 'ad-group:1'$$,
  'mixed reconciliation appends proven-missing evidence for only the absent child'
);
select lives_ok(
  $$select public.ads_finalize_campaign_gate_claim(
    attempt.id, attempt.claim_token, 'succeeded', '{"full_set_readback":true}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )
  from public.ads_campaign_gate_attempts attempt
  where attempt.request_idempotency_key in ('mixed recovery fixture-reconcile', 'found recovery fixture-reconcile')$$,
  'Gate 1 reconciliation derives state across the complete intended resource set'
);
select is(
  (select build.status from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'found recovery fixture'),
  'ready_to_deliver', 'all found and matched resources derive ready_to_deliver'
);
select is(
  (select build.status from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'mixed recovery fixture'),
  'gate_1_failed', 'a resolved mixed found/missing set exposes only missing resources for retry'
);
select throws_ok(
  $$select public.ads_acquire_campaign_retry_claim(
    (select build.id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'mixed recovery fixture'),
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'mixed recovery fixture-create'),
    'mixed-retry-found', repeat('a', 64), 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  '55000', 'Mutation retry requires every selected resource to be proven missing by newer reconciliation readback',
  'a found and mapped resource cannot be selected for mutation retry'
);
select lives_ok(
  $$select public.ads_acquire_campaign_retry_claim(
    (select build.id from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'mixed recovery fixture'),
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'mixed recovery fixture-create'),
    'mixed-retry-missing', repeat('a', 64), 300,
    '{"resources":[{"logical_resource_key":"ad-group:1","resource_type":"ad_group"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  'a non-empty parent-intent subset is retryable when every selected resource is proven missing'
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
  '55P03', 'A different active gate claim already exists',
  'Gate 2 cannot overlap the still-active Gate 1 claim'
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

update public.ads_campaign_builds as build
set status = 'ready_to_deliver'
from public.ads_campaign_plans as plan
where plan.id = build.plan_id and plan.created_by_name = 'expired gate 2 fixture';
update public.ads_campaign_plans
set status = 'launch_in_progress'
where created_by_name = 'expired gate 2 fixture';
insert into public.ads_campaign_build_resources (
  build_id, logical_resource_key, resource_type, provider_resource_id
)
select build.id, 'campaign', 'campaign', 'expired-gate-2-campaign'
from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id
where plan.created_by_name = 'expired gate 2 fixture';
select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 2::smallint, 'deliver', 'expired-gate-2-deliver', build.revision_id,
    build.revision_hash, 300, '{}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )
  from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id
  where plan.created_by_name = 'expired gate 2 fixture'$$,
  'the stale Gate 2 fixture acquires an initial delivery claim'
);
update public.ads_campaign_gate_attempts
set claimed_at = clock_timestamp() - interval '2 hours',
    claim_expires_at = clock_timestamp() - interval '1 hour'
where request_idempotency_key = 'expired-gate-2-deliver';
select throws_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 2::smallint, 'deliver', 'expired-gate-2-duplicate', build.revision_id,
    build.revision_hash, 300, '{}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )
  from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id
  where plan.created_by_name = 'expired gate 2 fixture'$$,
  '55000', 'Expired Gate 2 delivery requires reconciliation before another delivery',
  'an expired delivery claim cannot roll forward a second provider delivery'
);
select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 2::smallint, 'reconcile', 'expired-gate-2-readback', build.revision_id,
    build.revision_hash, 300, '{}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )
  from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id
  where plan.created_by_name = 'expired gate 2 fixture'$$,
  'an expired delivery is normalized to delivery_unverified and reacquired for readback'
);
-- Materialize only the missing downstream fixture when the preceding behavioral
-- assertion fails against the reviewed implementation, allowing stale readback
-- reacquisition to be tested independently.
update public.ads_campaign_gate_attempts
set status = 'expired', released_at = clock_timestamp(), updated_at = clock_timestamp()
where request_idempotency_key = 'expired-gate-2-deliver'
  and status = 'claimed'
  and not exists (
    select 1 from public.ads_campaign_gate_attempts
    where request_idempotency_key = 'expired-gate-2-readback'
  );
insert into public.ads_campaign_gate_attempts (
  build_id, gate, action, request_idempotency_key, attempt_number,
  revision_id, revision_hash, status, intent, claimed_at, claim_expires_at,
  actor_id, actor_name
)
select build.id, 2, 'reconcile', 'expired-gate-2-readback',
  (select coalesce(max(existing.attempt_number), 0) + 1
   from public.ads_campaign_gate_attempts existing where existing.build_id = build.id),
  build.revision_id, build.revision_hash, 'claimed', '{}'::jsonb,
  clock_timestamp(), clock_timestamp() + interval '5 minutes',
  '00000000-0000-0000-0000-000000000061', 'Launch Operator'
from public.ads_campaign_builds build
join public.ads_campaign_plans plan on plan.id = build.plan_id
where plan.created_by_name = 'expired gate 2 fixture'
  and not exists (
    select 1 from public.ads_campaign_gate_attempts
    where request_idempotency_key = 'expired-gate-2-readback'
  );
select ok(
  (select status = 'expired' and released_at is not null from public.ads_campaign_gate_attempts where request_idempotency_key = 'expired-gate-2-deliver'),
  'the stale Gate 2 delivery attempt is retained as expired'
);
update public.ads_campaign_gate_attempts
set claimed_at = clock_timestamp() - interval '2 hours',
    claim_expires_at = clock_timestamp() - interval '1 hour'
where request_idempotency_key = 'expired-gate-2-readback';
select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 2::smallint, 'reconcile', 'expired-gate-2-readback-again', build.revision_id,
    build.revision_hash, 300, '{}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )
  from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id
  where plan.created_by_name = 'expired gate 2 fixture'$$,
  'an expired Gate 2 reconciliation claim remains recoverable through reconciliation'
);

update public.ads_campaign_builds as build
set status = 'ready_to_deliver'
from public.ads_campaign_plans as plan
where plan.id = build.plan_id
  and plan.created_by_name in ('invalid gate 2 fixture', 'invalid gate 2 final fixture');
update public.ads_campaign_plans
set status = 'launch_in_progress'
where created_by_name in ('invalid gate 2 fixture', 'invalid gate 2 final fixture');
insert into public.ads_campaign_build_resources (
  build_id, logical_resource_key, resource_type, provider_resource_id
)
select build.id, 'campaign', 'campaign',
  case when plan.created_by_name = 'invalid gate 2 fixture' then 'invalid-qa-campaign' else 'invalid-final-campaign' end
from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id
where plan.created_by_name in ('invalid gate 2 fixture', 'invalid gate 2 final fixture');
select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 2::smallint, 'deliver', plan.created_by_name || '-deliver', build.revision_id,
    build.revision_hash, 300, '{}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )
  from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id
  where plan.created_by_name in ('invalid gate 2 fixture', 'invalid gate 2 final fixture')$$,
  'invalid-evidence fixtures acquire Gate 2 claims'
);
select throws_ok(
  $$select public.ads_append_campaign_qa_result(
    attempt.id, attempt.claim_token, resource.id, 'gate_2', 'campaign.status', true,
    '"ENABLED"'::jsonb, '"ENABLED"'::jsonb, 'match', null, null, '[]'::jsonb
  )
  from public.ads_campaign_gate_attempts attempt
  join public.ads_campaign_build_resources resource on resource.build_id = attempt.build_id
  where attempt.request_idempotency_key = 'invalid gate 2 fixture-deliver'$$,
  '22023', 'Authorization-grade readback evidence must be a non-empty JSON object',
  'an empty array cannot be appended as Gate 2 verification evidence'
);
select lives_ok(
  $$select public.ads_finalize_campaign_gate_claim(
    attempt.id, attempt.claim_token, 'succeeded', '{"status":"ENABLED"}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_gate_attempts attempt
  where attempt.request_idempotency_key = 'invalid gate 2 fixture-deliver'$$,
  'Gate 2 with invalid QA evidence finalizes conservatively'
);
select is(
  (select build.status from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'invalid gate 2 fixture'),
  'delivery_unverified', 'invalid Gate 2 QA evidence cannot derive verified'
);
select lives_ok(
  $$select public.ads_append_campaign_qa_result(
    attempt.id, attempt.claim_token, resource.id, 'gate_2', 'campaign.status', true,
    '"ENABLED"'::jsonb, '"ENABLED"'::jsonb, 'match', null, null,
    '{"status":"ENABLED"}'::jsonb
  )
  from public.ads_campaign_gate_attempts attempt
  join public.ads_campaign_build_resources resource on resource.build_id = attempt.build_id
  where attempt.request_idempotency_key = 'invalid gate 2 final fixture-deliver'$$,
  'the invalid-final fixture has valid persisted Gate 2 QA'
);
select lives_ok(
  $$select public.ads_finalize_campaign_gate_claim(
    attempt.id, attempt.claim_token, 'succeeded', 'null'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_gate_attempts attempt
  where attempt.request_idempotency_key = 'invalid gate 2 final fixture-deliver'$$,
  'a JSON-null final readback finalizes conservatively'
);
select is(
  (select build.status from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'invalid gate 2 final fixture'),
  'delivery_unverified', 'JSON null cannot authorize Gate 2 verification'
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
    build.id, 2::smallint, 'reconcile', 'ambiguous-delivery-invalid-readback', build.revision_id,
    build.revision_hash, 300, '{}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )
  from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id
  where plan.created_by_name = 'ambiguous delivery fixture'$$,
  'delivery_unverified acquires an invalid-evidence reconciliation fixture claim'
);
select throws_ok(
  $$select public.ads_append_campaign_qa_result(
    attempt.id, attempt.claim_token, resource.id, 'reconciliation', 'campaign.status', true,
    '"ENABLED"'::jsonb, '"ENABLED"'::jsonb, 'match', null, null, '"scalar"'::jsonb
  )
  from public.ads_campaign_gate_attempts attempt
  join public.ads_campaign_build_resources resource on resource.build_id = attempt.build_id and resource.logical_resource_key = 'campaign'
  where attempt.request_idempotency_key = 'ambiguous-delivery-invalid-readback'$$,
  '22023', 'Authorization-grade readback evidence must be a non-empty JSON object',
  'a non-empty scalar cannot be appended as delivery reconciliation evidence'
);
insert into public.ads_campaign_qa_results (
  attempt_id, build_resource_id, phase, field_path, required,
  expected_value, observed_value, result, readback_evidence
)
select attempt.id, resource.id, 'reconciliation', 'legacy.invalid.scalar', true,
  '"ENABLED"'::jsonb, '"ENABLED"'::jsonb, 'match', '"scalar"'::jsonb
from public.ads_campaign_gate_attempts attempt
join public.ads_campaign_build_resources resource on resource.build_id = attempt.build_id and resource.logical_resource_key = 'campaign'
where attempt.request_idempotency_key = 'ambiguous-delivery-invalid-readback';
select lives_ok(
  $$select public.ads_finalize_campaign_gate_claim(
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'ambiguous-delivery-invalid-readback'),
    (select claim_token from public.ads_campaign_gate_attempts where request_idempotency_key = 'ambiguous-delivery-invalid-readback'),
    'succeeded', '{"status":"ENABLED"}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )$$,
  'invalid delivery reconciliation evidence finalizes conservatively'
);
select is(
  (select build.status from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id where plan.created_by_name = 'ambiguous delivery fixture'),
  'delivery_unverified', 'scalar reconciliation evidence cannot derive verified'
);
-- Restore the state asserted above after the reviewed implementation incorrectly
-- verifies it, so the independent valid-readback recovery path is not a cascade.
update public.ads_campaign_builds as build
set status = 'delivery_unverified', verified_at = null, delivered_at = null,
    final_readback_evidence = '{}'::jsonb, updated_at = clock_timestamp()
from public.ads_campaign_plans as plan
where plan.id = build.plan_id and plan.created_by_name = 'ambiguous delivery fixture';
set local session_replication_role = replica;
update public.ads_campaign_build_resources as resource
set verified_at = null, updated_at = clock_timestamp()
from public.ads_campaign_builds build, public.ads_campaign_plans plan
where build.id = resource.build_id and plan.id = build.plan_id
  and plan.created_by_name = 'ambiguous delivery fixture';
set local session_replication_role = origin;
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

insert into public.ads_campaign_build_resources (
  build_id, logical_resource_key, resource_type
)
select build.id, 'campaign', 'campaign'
from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id
where plan.created_by_name = 'approval mismatch fixture';
insert into public.ads_campaign_gate_attempts (
  build_id, gate, action, request_idempotency_key, attempt_number,
  revision_id, revision_hash, status, intent, claimed_at, claim_expires_at,
  released_at, actor_id, actor_name
)
select build.id, 1, 'create', 'approval-mismatch-parent', 1,
  build.revision_id, build.revision_hash, 'reconciliation_required',
  '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
  clock_timestamp() - interval '4 minutes', clock_timestamp() - interval '3 minutes',
  clock_timestamp() - interval '3 minutes',
  '00000000-0000-0000-0000-000000000061', 'Launch Operator'
from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id
where plan.created_by_name = 'approval mismatch fixture';
insert into public.ads_campaign_gate_attempts (
  build_id, gate, action, request_idempotency_key, attempt_number,
  revision_id, revision_hash, status, intent, claimed_at, claim_expires_at,
  released_at, actor_id, actor_name
)
select build.id, 1, 'reconcile', 'approval-mismatch-readback', 2,
  build.revision_id, build.revision_hash, 'succeeded',
  '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
  clock_timestamp() - interval '2 minutes', clock_timestamp() - interval '1 minute',
  clock_timestamp() - interval '1 minute',
  '00000000-0000-0000-0000-000000000061', 'Launch Operator'
from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id
where plan.created_by_name = 'approval mismatch fixture';
insert into public.ads_campaign_qa_results (
  attempt_id, build_resource_id, phase, field_path, required,
  expected_value, observed_value, result, mismatch_code, readback_evidence
)
select attempt.id, resource.id, 'reconciliation', 'provider.exists', true,
  'false'::jsonb, 'false'::jsonb, 'missing', 'PROVEN_MISSING', '{"found":false}'::jsonb
from public.ads_campaign_gate_attempts attempt
join public.ads_campaign_build_resources resource on resource.build_id = attempt.build_id
where attempt.request_idempotency_key = 'approval-mismatch-readback';
insert into public.ads_campaign_approvals (
  plan_id, revision_id, revision_hash, decision, expires_at,
  request_idempotency_key, approved_by_id, approved_by_name
)
select plan.id, build.revision_id, repeat('b', 64), 'approved',
  clock_timestamp() + interval '1 day', 'approval-mismatch-corrupt',
  '00000000-0000-0000-0000-000000000061', 'Launch Operator'
from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id
where plan.created_by_name = 'approval mismatch fixture';
update public.ads_campaign_builds as build
set approval_id = approval.id, status = 'gate_1_failed'
from public.ads_campaign_plans as plan, public.ads_campaign_approvals as approval
where plan.id = build.plan_id and plan.created_by_name = 'approval mismatch fixture'
  and approval.plan_id = plan.id and approval.request_idempotency_key = 'approval-mismatch-corrupt';
select throws_ok(
  $$select public.ads_acquire_campaign_retry_claim(
    build.id,
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'approval-mismatch-parent'),
    'approval-mismatch-retry', build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  )
  from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id
  where plan.created_by_name = 'approval mismatch fixture'$$,
  '55000', 'Campaign build approval revision lock does not match the build',
  'retry acquisition binds approval revision ID and hash to the selected build'
);

update public.ads_campaign_builds as build
set status = 'verified', verified_at = clock_timestamp(),
    final_readback_evidence = '[]'::jsonb
from public.ads_campaign_plans as plan
where plan.id = build.plan_id and plan.created_by_name = 'invalid handoff fixture';
set local session_replication_role = replica;
insert into public.ads_campaign_build_resources (
  build_id, logical_resource_key, resource_type, provider_resource_id, verified_at
)
select build.id, 'campaign', 'campaign', 'invalid-handoff-campaign', clock_timestamp()
from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id
where plan.created_by_name = 'invalid handoff fixture';
set local session_replication_role = origin;
select throws_ok(
  $$select public.ads_create_campaign_monitoring_handoff(
    build.id, build.lock_version, build.revision_hash,
    '00000000-0000-0000-0000-000000000061', null, null
  )
  from public.ads_campaign_builds build join public.ads_campaign_plans plan on plan.id = build.plan_id
  where plan.created_by_name = 'invalid handoff fixture'$$,
  '55000', 'Monitoring handoff requires non-empty-object final readback evidence',
  'an empty-array final readback cannot authorize monitoring handoff'
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
select throws_ok(
  $$select public.ads_create_campaign_monitoring_handoff(
    build.id, null, build.revision_hash,
    '00000000-0000-0000-0000-000000000061', null, 'claims-tests/handoff-null-lock'
  )
  from public.ads_campaign_builds build
  join public.ads_campaign_plans plan on plan.id = build.plan_id
  where plan.created_by_name = 'verified fixture'$$,
  '40001', 'Campaign build lock version is required for handoff',
  'an existing handoff retry cannot bypass a NULL expected lock version'
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

create function pg_temp.make_claim_hardening_build(
  p_fixture text,
  p_platform text,
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
    '00000000-0000-0000-0000-000000000001', p_platform,
    'claim-hardening-' || p_fixture, 'Claim hardening ' || p_fixture,
    'MYR', 'Asia/Kuala_Lumpur', 'verified', '{"source":"claims-hardening"}',
    clock_timestamp(), true
  ) returning id into v_account_id;

  insert into public.ads_budget_packages (
    client_id, package_key, package_name, currency, start_date, end_date,
    envelope_amount, committed_amount, status
  ) values (
    '00000000-0000-0000-0000-000000000001', 'claim-hardening-' || p_fixture,
    'Claim hardening ' || p_fixture, 'MYR', '2026-08-01', '2026-08-31',
    1000, 100, 'active'
  ) returning id into v_package_id;

  insert into public.ads_campaign_plans (
    client_id, budget_package_id, ad_account_id, platform, reserved_budget,
    status, created_by_id, created_by_name, lock_version
  ) values (
    '00000000-0000-0000-0000-000000000001', v_package_id, v_account_id,
    p_platform, 100, p_plan_status,
    '00000000-0000-0000-0000-000000000061', p_fixture, 20
  ) returning id into v_plan_id;

  insert into public.ads_campaign_plan_revisions (
    plan_id, revision_number, client_id, ad_account_id, budget_package_id,
    platform, provider_account_id, currency, timezone, start_date, end_date,
    allocated_budget, increment_amount, daily_budget, projected_total,
    objective, destination, plan_payload, canonical_json, payload_hash,
    created_by_id, created_by_name
  ) values (
    v_plan_id, 1, '00000000-0000-0000-0000-000000000001',
    v_account_id, v_package_id, p_platform, 'claim-hardening-' || p_fixture,
    'MYR', 'Asia/Kuala_Lumpur', '2026-08-01', '2026-08-20',
    100, 0, 5, 100, 'leads', 'https://example.test/claim-hardening',
    '{"fixture":true}', '{"fixture":true}', repeat('e', 64),
    '00000000-0000-0000-0000-000000000061', 'Launch Operator'
  ) returning id into v_revision_id;

  update public.ads_campaign_plans
  set active_revision_id = v_revision_id,
      reserved_revision_id = v_revision_id,
      approved_revision_id = v_revision_id,
      approved_revision_hash = repeat('e', 64)
  where id = v_plan_id;

  insert into public.ads_campaign_approvals (
    plan_id, revision_id, revision_hash, decision, expires_at,
    request_idempotency_key, approved_by_id, approved_by_name
  ) values (
    v_plan_id, v_revision_id, repeat('e', 64), 'approved',
    clock_timestamp() + interval '1 day', 'claim-approval-' || p_fixture,
    '00000000-0000-0000-0000-000000000061', 'Launch Operator'
  ) returning id into v_approval_id;

  insert into public.ads_campaign_builds (
    plan_id, revision_id, revision_hash, approval_id, budget_package_id,
    ad_account_id, platform, status, lock_version
  ) values (
    v_plan_id, v_revision_id, repeat('e', 64), v_approval_id,
    v_package_id, v_account_id, p_platform, p_build_status, 10
  ) returning id into v_build_id;
  return v_build_id;
end;
$$;

select pg_temp.make_claim_hardening_build(fixture, platform, plan_status, build_status)
from (values
  ('gate-key-expiry', 'google', 'approved', 'pending_gate_1'),
  ('retry-key-expiry', 'google', 'launch_in_progress', 'gate_1_failed'),
  ('live-lease', 'google', 'approved', 'pending_gate_1'),
  ('failed-g1', 'google', 'launch_in_progress', 'gate_1_failed'),
  ('failed-qa', 'google', 'launch_in_progress', 'qa_failed'),
  ('failed-g2', 'google', 'launch_in_progress', 'gate_2_failed'),
  ('failed-g1-create', 'google', 'launch_in_progress', 'gate_1_failed'),
  ('failed-qa-create', 'google', 'launch_in_progress', 'qa_failed'),
  ('failed-g2-deliver', 'google', 'launch_in_progress', 'gate_2_failed'),
  ('retry-qa-failed', 'google', 'launch_in_progress', 'qa_failed'),
  ('active-cross-gate', 'google', 'launch_in_progress', 'ready_to_deliver'),
  ('active-cross-retry', 'google', 'launch_in_progress', 'gate_1_failed'),
  ('retry-ready', 'google', 'launch_in_progress', 'ready_to_deliver'),
  ('retry-gate2', 'google', 'launch_in_progress', 'gate_2_in_progress'),
  ('retry-verified', 'google', 'launch_in_progress', 'verified'),
  ('retry-handoff', 'google', 'launched', 'handoff_complete'),
  ('receipt-state-mismatch', 'google', 'launch_in_progress', 'gate_1_failed'),
  ('finalizer-state-mismatch', 'google', 'launch_in_progress', 'gate_1_failed'),
  ('ambiguity-audit', 'google', 'launch_in_progress', 'gate_1_in_progress'),
  ('three-resource-recovery', 'google', 'approved', 'pending_gate_1'),
  ('negative-after-match', 'google', 'launch_in_progress', 'gate_1_in_progress'),
  ('handoff-drift', 'google', 'launch_in_progress', 'verified'),
  ('handoff-build-mismatch', 'google', 'launch_in_progress', 'verified'),
  ('handoff-plan-mismatch', 'google', 'approved', 'verified')
) as fixtures(fixture, platform, plan_status, build_status);

select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 1::smallint, 'create', 'gate-key-expiry-one', build.revision_id,
    build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'gate-key-expiry'$$,
  'the gate-key expiry fixture acquires its original claim'
);
set local session_replication_role = replica;
update public.ads_campaign_approvals as approval
set expires_at = clock_timestamp() - interval '1 minute'
from public.ads_campaign_builds as build, public.ads_campaign_plans as plan
where build.approval_id = approval.id and plan.id = build.plan_id
  and plan.created_by_name = 'gate-key-expiry';
set local session_replication_role = origin;
select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 1::smallint, 'create', 'gate-key-expiry-one', build.revision_id,
    build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'gate-key-expiry'$$,
  'an exact gate key resolves before mutable approval expiry checks'
);
select throws_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 1::smallint, 'reconcile', 'gate-key-expiry-one', build.revision_id,
    build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'gate-key-expiry'$$,
  '22023', 'Gate claim idempotency key conflicts with an existing request',
  'an expired approval cannot hide an action conflict on an existing gate key'
);
select throws_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 1::smallint, 'create', 'gate-key-expiry-one', build.revision_id + 1,
    build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'gate-key-expiry'$$,
  '22023', 'Gate claim idempotency key conflicts with an existing request',
  'an expired approval cannot hide a revision conflict on an existing gate key'
);
select throws_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 1::smallint, 'create', 'gate-key-expiry-one', build.revision_id,
    build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign-2","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'gate-key-expiry'$$,
  '22023', 'Gate claim idempotency key conflicts with an existing request',
  'an expired approval cannot hide an intent conflict on an existing gate key'
);
select throws_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 1::smallint, 'create', 'gate-key-expiry-one', build.revision_id,
    build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000062', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'gate-key-expiry'$$,
  '22023', 'Gate claim idempotency key conflicts with an existing request',
  'an expired approval cannot hide an actor conflict on an existing gate key'
);
select throws_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 1::smallint, 'create', 'gate-key-expiry-new', build.revision_id,
    build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'gate-key-expiry'$$,
  '55000', 'Campaign build approval is no longer current and unexpired',
  'a new gate key remains blocked until approval renewal'
);
update public.ads_campaign_gate_attempts
set status = 'expired',
    claimed_at = clock_timestamp() - interval '2 minutes',
    claim_expires_at = clock_timestamp() - interval '1 minute',
    released_at = clock_timestamp() - interval '1 minute'
where request_idempotency_key = 'gate-key-expiry-one';
select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 1::smallint, 'create', 'gate-key-expiry-one', build.revision_id,
    build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'gate-key-expiry'$$,
  'an exact expired gate key still returns its immutable attempt'
);
select ok(
  (select count(*) = 1 and bool_and(status = 'expired' and released_at is not null)
   from public.ads_campaign_gate_attempts where request_idempotency_key = 'gate-key-expiry-one'),
  'returning an expired gate key neither creates nor reactivates a claim'
);

create function pg_temp.seed_retry_proof(p_fixture text)
returns bigint
language plpgsql
as $$
declare
  v_build public.ads_campaign_builds%rowtype;
  v_resource_id bigint;
  v_parent_id bigint;
  v_reconcile_id bigint;
begin
  select build.* into strict v_build
  from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = p_fixture;
  insert into public.ads_campaign_build_resources (build_id, logical_resource_key, resource_type)
  values (v_build.id, 'campaign', 'campaign') returning id into v_resource_id;
  insert into public.ads_campaign_gate_attempts (
    build_id, gate, action, request_idempotency_key, attempt_number,
    revision_id, revision_hash, status, intent, claimed_at, claim_expires_at,
    released_at, actor_id, actor_name
  ) values (
    v_build.id, 1, 'create', p_fixture || '-parent', 1,
    v_build.revision_id, v_build.revision_hash, 'failed',
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    clock_timestamp() - interval '4 minutes', clock_timestamp() - interval '3 minutes',
    clock_timestamp() - interval '3 minutes',
    '00000000-0000-0000-0000-000000000061', 'Launch Operator'
  ) returning id into v_parent_id;
  insert into public.ads_campaign_gate_attempts (
    build_id, gate, action, request_idempotency_key, attempt_number,
    revision_id, revision_hash, status, intent, claimed_at, claim_expires_at,
    released_at, actor_id, actor_name
  ) values (
    v_build.id, 1, 'reconcile', p_fixture || '-proof', 2,
    v_build.revision_id, v_build.revision_hash, 'succeeded',
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    clock_timestamp() - interval '2 minutes', clock_timestamp() - interval '1 minute',
    clock_timestamp() - interval '1 minute',
    '00000000-0000-0000-0000-000000000061', 'Launch Operator'
  ) returning id into v_reconcile_id;
  insert into public.ads_campaign_qa_results (
    attempt_id, build_resource_id, phase, field_path, required,
    expected_value, observed_value, result, readback_evidence
  ) values (
    v_reconcile_id, v_resource_id, 'reconciliation', 'provider.exists', true,
    'false', 'false', 'missing', '{"found":false}'
  );
  return v_parent_id;
end;
$$;

select pg_temp.seed_retry_proof(fixture)
from (values
  ('retry-key-expiry'), ('active-cross-retry'), ('retry-ready'),
  ('retry-gate2'), ('retry-verified'), ('retry-handoff'), ('retry-qa-failed')
) as fixtures(fixture);

select lives_ok(
  $$select public.ads_acquire_campaign_retry_claim(
    build.id,
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'retry-key-expiry-parent'),
    'retry-key-expiry-one', build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'retry-key-expiry'$$,
  'the retry-key expiry fixture acquires its original retry claim'
);
set local session_replication_role = replica;
update public.ads_campaign_approvals as approval
set expires_at = clock_timestamp() - interval '1 minute'
from public.ads_campaign_builds as build, public.ads_campaign_plans as plan
where build.approval_id = approval.id and plan.id = build.plan_id
  and plan.created_by_name = 'retry-key-expiry';
set local session_replication_role = origin;
select lives_ok(
  $$select public.ads_acquire_campaign_retry_claim(
    build.id,
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'retry-key-expiry-parent'),
    'retry-key-expiry-one', build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'retry-key-expiry'$$,
  'an exact retry key resolves before mutable approval expiry checks'
);
select throws_ok(
  $$select public.ads_acquire_campaign_retry_claim(
    build.id,
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'retry-key-expiry-proof'),
    'retry-key-expiry-one', build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'retry-key-expiry'$$,
  '22023', 'Retry claim idempotency key conflicts with an existing request',
  'an expired approval cannot hide a parent conflict on an existing retry key'
);
select throws_ok(
  $$select public.ads_acquire_campaign_retry_claim(
    build.id,
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'retry-key-expiry-parent'),
    'retry-key-expiry-one', build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"other","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'retry-key-expiry'$$,
  '22023', 'Retry claim idempotency key conflicts with an existing request',
  'an expired approval cannot hide an intent conflict on an existing retry key'
);
select throws_ok(
  $$select public.ads_acquire_campaign_retry_claim(
    build.id,
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'retry-key-expiry-parent'),
    'retry-key-expiry-one', repeat('f', 64), 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'retry-key-expiry'$$,
  '22023', 'Retry claim idempotency key conflicts with an existing request',
  'an expired approval cannot hide a revision-hash conflict on an existing retry key'
);
select throws_ok(
  $$select public.ads_acquire_campaign_retry_claim(
    build.id,
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'retry-key-expiry-parent'),
    'retry-key-expiry-one', build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000062', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'retry-key-expiry'$$,
  '22023', 'Retry claim idempotency key conflicts with an existing request',
  'an expired approval cannot hide an actor conflict on an existing retry key'
);
select throws_ok(
  $$select public.ads_acquire_campaign_retry_claim(
    build.id,
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'retry-key-expiry-parent'),
    'retry-key-expiry-new', build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'retry-key-expiry'$$,
  '55000', 'Campaign build approval is no longer current and unexpired',
  'a new retry key remains blocked until approval renewal'
);
update public.ads_campaign_gate_attempts
set status = 'expired',
    claimed_at = clock_timestamp() - interval '2 minutes',
    claim_expires_at = clock_timestamp() - interval '1 minute',
    released_at = clock_timestamp() - interval '1 minute'
where request_idempotency_key = 'retry-key-expiry-one';
select lives_ok(
  $$select public.ads_acquire_campaign_retry_claim(
    build.id,
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'retry-key-expiry-parent'),
    'retry-key-expiry-one', build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'retry-key-expiry'$$,
  'an exact expired retry key still returns its immutable attempt'
);
select ok(
  (select count(*) = 1 and bool_and(status = 'expired' and released_at is not null)
   from public.ads_campaign_gate_attempts where request_idempotency_key = 'retry-key-expiry-one'),
  'returning an expired retry key neither creates nor reactivates a claim'
);

select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 1::smallint, 'create', 'live-lease-create', build.revision_id,
    build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'live-lease'$$,
  'the live-lease fixture acquires Gate 1 before approval expiry'
);
set local session_replication_role = replica;
update public.ads_campaign_approvals as approval
set expires_at = clock_timestamp() - interval '1 minute'
from public.ads_campaign_builds as build, public.ads_campaign_plans as plan
where build.approval_id = approval.id and plan.id = build.plan_id
  and plan.created_by_name = 'live-lease';
set local session_replication_role = origin;
select lives_ok(
  $$select public.ads_record_campaign_resource_outcome(
    attempt.id, attempt.claim_token, 'campaign', 'succeeded',
    'live-lease-campaign', null, '{"status":"PAUSED"}', null
  ) from public.ads_campaign_gate_attempts as attempt
  where attempt.request_idempotency_key = 'live-lease-create'$$,
  'a live claim token remains an authorization lease after approval expiry'
);
select lives_ok(
  $$select public.ads_append_campaign_qa_result(
    attempt.id, attempt.claim_token, resource.id, 'gate_1', 'campaign.status', true,
    '"PAUSED"', '"PAUSED"', 'match', null, null, '{"status":"PAUSED"}'
  ) from public.ads_campaign_gate_attempts as attempt
  join public.ads_campaign_build_resources as resource on resource.build_id = attempt.build_id
  where attempt.request_idempotency_key = 'live-lease-create'$$,
  'the live lease can append its persisted Gate 1 evidence after approval expiry'
);
select lives_ok(
  $$select public.ads_finalize_campaign_gate_claim(
    attempt.id, attempt.claim_token, 'succeeded', '{"gate_1":true}',
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_gate_attempts as attempt
  where attempt.request_idempotency_key = 'live-lease-create'$$,
  'the live lease can finalize after approval expiry without becoming a new claim'
);

insert into public.ads_campaign_build_resources (build_id, logical_resource_key, resource_type)
select build.id, 'campaign', 'campaign'
from public.ads_campaign_builds as build
join public.ads_campaign_plans as plan on plan.id = build.plan_id
where plan.created_by_name in ('failed-g1', 'failed-qa', 'failed-g1-create', 'failed-qa-create');
insert into public.ads_campaign_gate_attempts (
  build_id, gate, action, request_idempotency_key, attempt_number,
  revision_id, revision_hash, status, intent, claimed_at, claim_expires_at,
  released_at, actor_id, actor_name
)
select build.id, 1, 'create', plan.created_by_name || '-prior', 1,
  build.revision_id, build.revision_hash, 'failed',
  '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
  clock_timestamp() - interval '2 minutes', clock_timestamp() - interval '1 minute',
  clock_timestamp() - interval '1 minute',
  '00000000-0000-0000-0000-000000000061', 'Launch Operator'
from public.ads_campaign_builds as build
join public.ads_campaign_plans as plan on plan.id = build.plan_id
where plan.created_by_name in ('failed-g1', 'failed-qa', 'failed-g1-create', 'failed-qa-create', 'failed-g2');

select throws_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 2::smallint, 'reconcile', 'failed-g1-wrong-gate',
    build.revision_id, build.revision_hash, 300, '{}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'failed-g1'$$,
  '55000', 'Failed Gate 1 states require Gate 1 reconciliation',
  'a Gate 1 failed state rejects Gate 2 reconciliation'
);
select throws_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 1::smallint, 'reconcile', 'failed-g2-wrong-gate',
    build.revision_id, build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'failed-g2'$$,
  '55000', 'Failed Gate 2 state requires Gate 2 reconciliation',
  'a Gate 2 failed state rejects Gate 1 reconciliation'
);

select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 1::smallint, 'reconcile', plan.created_by_name || '-reconcile',
    build.revision_id, build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name in ('failed-g1', 'failed-qa')$$,
  'Gate 1 failed and QA-failed builds admit only read-only Gate 1 reconciliation'
);
select lives_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 2::smallint, 'reconcile', 'failed-g2-reconcile',
    build.revision_id, build.revision_hash, 300, '{}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'failed-g2'$$,
  'a Gate 2 failed build admits only read-only Gate 2 reconciliation'
);
select throws_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 1::smallint, 'create', plan.created_by_name || '-shortcut',
    build.revision_id, build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name in ('failed-g1-create', 'failed-qa-create')$$,
  '55000', 'Failed Gate 1 states require reconciliation before mutation',
  'failed Gate 1 states reject direct create shortcuts'
);
select throws_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 2::smallint, 'deliver', 'failed-g2-deliver-shortcut',
    build.revision_id, build.revision_hash, 300, '{}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'failed-g2-deliver'$$,
  '55000', 'Failed Gate 2 state requires reconciliation before delivery',
  'a failed Gate 2 state rejects a direct delivery shortcut'
);

insert into public.ads_campaign_gate_attempts (
  build_id, gate, action, request_idempotency_key, attempt_number,
  revision_id, revision_hash, status, intent, claim_expires_at,
  actor_id, actor_name
)
select build.id, 1, 'create', 'active-cross-gate-existing', 1,
  build.revision_id, build.revision_hash, 'claimed',
  '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
  clock_timestamp() + interval '5 minutes',
  '00000000-0000-0000-0000-000000000061', 'Launch Operator'
from public.ads_campaign_builds as build
join public.ads_campaign_plans as plan on plan.id = build.plan_id
where plan.created_by_name = 'active-cross-gate';
select throws_ok(
  $$select public.ads_acquire_campaign_gate_claim(
    build.id, 2::smallint, 'deliver', 'active-cross-gate-new',
    build.revision_id, build.revision_hash, 300, '{}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'active-cross-gate'$$,
  '55P03', 'A different active gate claim already exists',
  'an active Gate 1 claim excludes a concurrent Gate 2 claim on the same build'
);

create function pg_temp.build_wide_active_constraint_rejects_cross_gate()
returns boolean
language plpgsql
as $$
declare
  v_build public.ads_campaign_builds%rowtype;
begin
  select build.* into strict v_build
  from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'active-cross-gate';
  begin
    insert into public.ads_campaign_gate_attempts (
      build_id, gate, action, request_idempotency_key, attempt_number,
      revision_id, revision_hash, status, intent, claim_expires_at,
      actor_id, actor_name
    ) values (
      v_build.id, 2, 'deliver', 'active-cross-gate-catalog-probe', 2,
      v_build.revision_id, v_build.revision_hash, 'claimed', '{}'::jsonb,
      clock_timestamp() + interval '5 minutes',
      '00000000-0000-0000-0000-000000000061', 'Launch Operator'
    );
    raise exception 'build-wide active-claim constraint accepted a second gate'
      using errcode = 'P0001';
  exception
    when unique_violation then return true;
    when sqlstate 'P0001' then return false;
  end;
end;
$$;
select ok(
  pg_temp.build_wide_active_constraint_rejects_cross_gate(),
  'the catalog constraint rejects two active claims for different gates on one build'
);

insert into public.ads_campaign_gate_attempts (
  build_id, gate, action, request_idempotency_key, attempt_number,
  revision_id, revision_hash, status, intent, claim_expires_at,
  actor_id, actor_name
)
select build.id, 2, 'reconcile', 'active-cross-retry-existing', 3,
  build.revision_id, build.revision_hash, 'claimed', '{}'::jsonb,
  clock_timestamp() + interval '5 minutes',
  '00000000-0000-0000-0000-000000000061', 'Launch Operator'
from public.ads_campaign_builds as build
join public.ads_campaign_plans as plan on plan.id = build.plan_id
where plan.created_by_name = 'active-cross-retry';
select throws_ok(
  $$select public.ads_acquire_campaign_retry_claim(
    build.id,
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = 'active-cross-retry-parent'),
    'active-cross-retry-new', build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'active-cross-retry'$$,
  '55P03', 'A different active gate claim already exists',
  'an active Gate 2 claim excludes a Gate 1 retry on the same build'
);

select throws_ok(
  $$select public.ads_acquire_campaign_retry_claim(
    build.id,
    (select id from public.ads_campaign_gate_attempts where request_idempotency_key = plan.created_by_name || '-parent'),
    plan.created_by_name || '-retry-forbidden', build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  ) from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name in ('retry-ready', 'retry-gate2', 'retry-verified', 'retry-handoff', 'retry-qa-failed')$$,
  '55000', 'Mutation retry requires a Gate 1 failed build',
  'mutation retry is rejected from ready, Gate 2, verified, and handoff states'
);

insert into public.ads_campaign_build_resources (
  build_id, logical_resource_key, resource_type
)
select build.id, 'campaign', 'campaign'
from public.ads_campaign_builds as build
join public.ads_campaign_plans as plan on plan.id = build.plan_id
where plan.created_by_name in (
  'receipt-state-mismatch', 'finalizer-state-mismatch',
  'ambiguity-audit', 'negative-after-match'
);
insert into public.ads_campaign_gate_attempts (
  build_id, gate, action, request_idempotency_key, attempt_number,
  revision_id, revision_hash, status, intent, claim_expires_at,
  actor_id, actor_name, trusted_ip, trusted_user_agent
)
select build.id, 1, 'create', plan.created_by_name || '-active', 1,
  build.revision_id, build.revision_hash, 'claimed',
  '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
  clock_timestamp() + interval '5 minutes',
  '00000000-0000-0000-0000-000000000061', 'Launch Operator',
  '203.0.113.64', 'claims-tests/persisted-attribution'
from public.ads_campaign_builds as build
join public.ads_campaign_plans as plan on plan.id = build.plan_id
where plan.created_by_name in (
  'receipt-state-mismatch', 'finalizer-state-mismatch',
  'ambiguity-audit', 'negative-after-match'
);

create function pg_temp.resource_state_guard_is_side_effect_free()
returns boolean
language plpgsql
as $$
declare
  v_attempt public.ads_campaign_gate_attempts%rowtype;
  v_resource public.ads_campaign_build_resources%rowtype;
  v_build public.ads_campaign_builds%rowtype;
  v_audit_count bigint;
begin
  select attempt.* into strict v_attempt
  from public.ads_campaign_gate_attempts as attempt
  where request_idempotency_key = 'receipt-state-mismatch-active';
  select * into strict v_resource from public.ads_campaign_build_resources
  where build_id = v_attempt.build_id and logical_resource_key = 'campaign';
  select * into strict v_build from public.ads_campaign_builds where id = v_attempt.build_id;
  select count(*) into v_audit_count from public.ads_campaign_audit_events where build_id = v_build.id;
  begin
    perform public.ads_record_campaign_resource_outcome(
      v_attempt.id, v_attempt.claim_token, 'campaign', 'ambiguous', null, null,
      '{"request_sent":true}', '{"timeout":true}'
    );
  exception when sqlstate '55000' then
    null;
  end;
  return (select status = v_attempt.status and released_at is not distinct from v_attempt.released_at
          from public.ads_campaign_gate_attempts where id = v_attempt.id)
    and (select provider_resource_id is not distinct from v_resource.provider_resource_id
           and provider_response = v_resource.provider_response
         from public.ads_campaign_build_resources where id = v_resource.id)
    and (select status = v_build.status and lock_version = v_build.lock_version
         from public.ads_campaign_builds where id = v_build.id)
    and (select count(*) from public.ads_campaign_audit_events where build_id = v_build.id) = v_audit_count;
end;
$$;
select ok(
  pg_temp.resource_state_guard_is_side_effect_free(),
  'an ambiguous resource receipt is side-effect-free when the build no longer matches its attempt state'
);

create function pg_temp.finalizer_state_guard_is_side_effect_free()
returns boolean
language plpgsql
as $$
declare
  v_attempt public.ads_campaign_gate_attempts%rowtype;
  v_build public.ads_campaign_builds%rowtype;
  v_audit_count bigint;
begin
  select attempt.* into strict v_attempt
  from public.ads_campaign_gate_attempts as attempt
  where request_idempotency_key = 'finalizer-state-mismatch-active';
  select * into strict v_build from public.ads_campaign_builds where id = v_attempt.build_id;
  select count(*) into v_audit_count from public.ads_campaign_audit_events where build_id = v_build.id;
  begin
    perform public.ads_finalize_campaign_gate_claim(
      v_attempt.id, v_attempt.claim_token, 'failed', '{"failure":true}',
      '00000000-0000-0000-0000-000000000061', null, null
    );
  exception when sqlstate '55000' then
    null;
  end;
  return (select status = v_attempt.status and released_at is not distinct from v_attempt.released_at
          from public.ads_campaign_gate_attempts where id = v_attempt.id)
    and (select status = v_build.status and lock_version = v_build.lock_version
         from public.ads_campaign_builds where id = v_build.id)
    and (select count(*) from public.ads_campaign_audit_events where build_id = v_build.id) = v_audit_count;
end;
$$;
select ok(
  pg_temp.finalizer_state_guard_is_side_effect_free(),
  'gate finalization is side-effect-free when the build no longer matches its attempt state'
);

create function pg_temp.ambiguity_audit_is_attributed()
returns boolean
language plpgsql
as $$
declare
  v_attempt public.ads_campaign_gate_attempts%rowtype;
begin
  select attempt.* into strict v_attempt
  from public.ads_campaign_gate_attempts as attempt
  where request_idempotency_key = 'ambiguity-audit-active';
  perform public.ads_record_campaign_resource_outcome(
    v_attempt.id, v_attempt.claim_token, 'campaign', 'unknown', null, null,
    '{"request_sent":true}', '{"timeout":true}'
  );
  return (select status = 'reconciliation_required' and released_at is not null
          from public.ads_campaign_gate_attempts where id = v_attempt.id)
    and (select status = 'reconciliation_required'
         from public.ads_campaign_builds where id = v_attempt.build_id)
    and (
      select count(*) = 1
        and bool_and(audit.actor_id = v_attempt.actor_id)
        and bool_and(audit.actor_name = v_attempt.actor_name)
        and bool_and(audit.trusted_ip = v_attempt.trusted_ip)
        and bool_and(audit.trusted_user_agent = v_attempt.trusted_user_agent)
      from public.ads_campaign_audit_events as audit
      where audit.attempt_id = v_attempt.id
        and audit.event_type = 'campaign_resource_outcome_ambiguous'
    );
exception when others then
  return false;
end;
$$;
select ok(
  pg_temp.ambiguity_audit_is_attributed(),
  'an ambiguous or unknown resource outcome appends exactly one audit event with persisted attempt attribution'
);

create function pg_temp.three_resource_recovery_is_causal()
returns boolean
language plpgsql
as $$
declare
  v_build public.ads_campaign_builds%rowtype;
  v_create public.ads_campaign_gate_attempts%rowtype;
  v_reconcile public.ads_campaign_gate_attempts%rowtype;
  v_retry_b public.ads_campaign_gate_attempts%rowtype;
  v_retry_c public.ads_campaign_gate_attempts%rowtype;
  v_resource public.ads_campaign_build_resources%rowtype;
begin
  select build.* into strict v_build
  from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'three-resource-recovery';

  select * into strict v_create
  from public.ads_acquire_campaign_gate_claim(
    v_build.id, 1::smallint, 'create', 'three-resource-create',
    v_build.revision_id, v_build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"},{"logical_resource_key":"ad-group:b","resource_type":"ad_group"},{"logical_resource_key":"ad-group:c","resource_type":"ad_group"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  );
  perform public.ads_record_campaign_resource_outcome(
    v_create.id, v_create.claim_token, 'campaign', 'succeeded',
    'three-resource-campaign', null, '{"status":"PAUSED"}', null
  );
  perform public.ads_record_campaign_resource_outcome(
    v_create.id, v_create.claim_token, 'ad-group:b', 'ambiguous',
    null, null, '{"request_sent":true}', '{"timeout":true}'
  );

  select * into strict v_reconcile
  from public.ads_acquire_campaign_gate_claim(
    v_build.id, 1::smallint, 'reconcile', 'three-resource-reconcile',
    v_build.revision_id, v_build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"},{"logical_resource_key":"ad-group:b","resource_type":"ad_group"},{"logical_resource_key":"ad-group:c","resource_type":"ad_group"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  );
  for v_resource in
    select resource.*
    from public.ads_campaign_build_resources as resource
    where resource.build_id = v_build.id
    order by resource.logical_resource_key
  loop
    if v_resource.logical_resource_key = 'campaign' then
      perform public.ads_append_campaign_qa_result(
        v_reconcile.id, v_reconcile.claim_token, v_resource.id,
        'reconciliation', 'provider.exists', true, 'true', 'true', 'match',
        null, null, '{"found":true,"provider_id":"three-resource-campaign"}'
      );
    else
      perform public.ads_append_campaign_qa_result(
        v_reconcile.id, v_reconcile.claim_token, v_resource.id,
        'reconciliation', 'provider.exists', true, 'false', 'false', 'missing',
        'PROVEN_MISSING', null, '{"found":false}'
      );
    end if;
  end loop;
  perform public.ads_finalize_campaign_gate_claim(
    v_reconcile.id, v_reconcile.claim_token, 'succeeded',
    '{"campaign":"found","ad-group:b":"missing","ad-group:c":"missing"}',
    '00000000-0000-0000-0000-000000000061', null, null
  );
  if (select status from public.ads_campaign_builds where id = v_build.id) <> 'gate_1_failed' then
    raise exception 'full reconciliation did not preserve the failed recovery state';
  end if;

  select * into strict v_retry_b
  from public.ads_acquire_campaign_retry_claim(
    v_build.id, v_create.id, 'three-resource-retry-b', v_build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"ad-group:b","resource_type":"ad_group"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  );
  perform public.ads_record_campaign_resource_outcome(
    v_retry_b.id, v_retry_b.claim_token, 'ad-group:b', 'succeeded',
    'three-resource-b', null, '{"status":"PAUSED"}', null
  );
  select * into strict v_resource from public.ads_campaign_build_resources
  where build_id = v_build.id and logical_resource_key = 'ad-group:b';
  perform public.ads_append_campaign_qa_result(
    v_retry_b.id, v_retry_b.claim_token, v_resource.id,
    'gate_1', 'ad_group.status', true, '"PAUSED"', '"PAUSED"', 'match',
    null, null, '{"status":"PAUSED"}'
  );
  perform public.ads_finalize_campaign_gate_claim(
    v_retry_b.id, v_retry_b.claim_token, 'succeeded', '{"ad-group:b":"created"}',
    '00000000-0000-0000-0000-000000000061', null, null
  );
  if (select status from public.ads_campaign_gate_attempts where id = v_retry_b.id) <> 'succeeded'
    or (select status from public.ads_campaign_builds where id = v_build.id) <> 'gate_1_failed' then
    raise exception 'partial retry incorrectly completed the full build';
  end if;

  select * into strict v_retry_c
  from public.ads_acquire_campaign_retry_claim(
    v_build.id, v_create.id, 'three-resource-retry-c', v_build.revision_hash, 300,
    '{"resources":[{"logical_resource_key":"ad-group:c","resource_type":"ad_group"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  );
  perform public.ads_record_campaign_resource_outcome(
    v_retry_c.id, v_retry_c.claim_token, 'ad-group:c', 'succeeded',
    'three-resource-c', null, '{"status":"PAUSED"}', null
  );
  select * into strict v_resource from public.ads_campaign_build_resources
  where build_id = v_build.id and logical_resource_key = 'ad-group:c';
  perform public.ads_append_campaign_qa_result(
    v_retry_c.id, v_retry_c.claim_token, v_resource.id,
    'gate_1', 'ad_group.status', true, '"PAUSED"', '"PAUSED"', 'match',
    null, null, '{"status":"PAUSED"}'
  );
  perform public.ads_finalize_campaign_gate_claim(
    v_retry_c.id, v_retry_c.claim_token, 'succeeded', '{"ad-group:c":"created"}',
    '00000000-0000-0000-0000-000000000061', null, null
  );
  return (select status = 'ready_to_deliver' from public.ads_campaign_builds where id = v_build.id)
    and (select status = 'succeeded' from public.ads_campaign_gate_attempts where id = v_retry_c.id);
exception when others then
  return false;
end;
$$;
select ok(
  pg_temp.three_resource_recovery_is_causal(),
  'A found and B/C missing requires both partial retries before full-intent Gate 1 readiness'
);

create function pg_temp.newer_negative_evidence_blocks_readiness()
returns boolean
language plpgsql
as $$
declare
  v_attempt public.ads_campaign_gate_attempts%rowtype;
  v_resource public.ads_campaign_build_resources%rowtype;
begin
  select attempt.* into strict v_attempt
  from public.ads_campaign_gate_attempts as attempt
  where attempt.request_idempotency_key = 'negative-after-match-active';
  select resource.* into strict v_resource
  from public.ads_campaign_build_resources as resource
  where resource.build_id = v_attempt.build_id and resource.logical_resource_key = 'campaign';
  perform public.ads_record_campaign_resource_outcome(
    v_attempt.id, v_attempt.claim_token, 'campaign', 'succeeded',
    'negative-after-match-campaign', null, '{"status":"PAUSED"}', null
  );
  perform public.ads_append_campaign_qa_result(
    v_attempt.id, v_attempt.claim_token, v_resource.id,
    'gate_1', 'campaign.status', true, '"PAUSED"', '"PAUSED"', 'match',
    null, null, '{"status":"PAUSED"}'
  );
  perform public.ads_append_campaign_qa_result(
    v_attempt.id, v_attempt.claim_token, v_resource.id,
    'gate_1', 'campaign.status', true, '"PAUSED"', '"REMOVED"', 'mismatch',
    'NEWER_NEGATIVE', 'a later decisive readback contradicted the earlier match',
    '{"status":"REMOVED"}'
  );
  perform public.ads_finalize_campaign_gate_claim(
    v_attempt.id, v_attempt.claim_token, 'succeeded', '{"status":"REMOVED"}',
    '00000000-0000-0000-0000-000000000061', null, null
  );
  return (select status = 'qa_failed' from public.ads_campaign_builds where id = v_attempt.build_id)
    and (select status = 'failed' from public.ads_campaign_gate_attempts where id = v_attempt.id);
exception when others then
  return false;
end;
$$;
select ok(
  pg_temp.newer_negative_evidence_blocks_readiness(),
  'newer decisive negative resource evidence defeats an earlier required match'
);

update public.ads_campaign_builds as build
set verified_at = clock_timestamp(),
    final_readback_evidence = '{"status":"ENABLED","immutable":true}'::jsonb
from public.ads_campaign_plans as plan
where plan.id = build.plan_id
  and plan.created_by_name in ('handoff-drift', 'handoff-build-mismatch', 'handoff-plan-mismatch');
set local session_replication_role = replica;
insert into public.ads_campaign_build_resources (
  build_id, logical_resource_key, resource_type, provider_resource_id, verified_at
)
select build.id, 'campaign', 'campaign', plan.created_by_name || '-campaign', clock_timestamp()
from public.ads_campaign_builds as build
join public.ads_campaign_plans as plan on plan.id = build.plan_id
where plan.created_by_name in ('handoff-drift', 'handoff-build-mismatch', 'handoff-plan-mismatch');
set local session_replication_role = origin;
update public.ads_ad_accounts as account
set provider_account_id = account.provider_account_id || '-directory-drift',
    currency = 'USD', timezone = 'UTC'
from public.ads_campaign_plans as plan
where plan.ad_account_id = account.id and plan.created_by_name = 'handoff-drift';
update public.ads_campaign_builds as build
set platform = 'meta'
from public.ads_campaign_plans as plan
where plan.id = build.plan_id and plan.created_by_name = 'handoff-build-mismatch';

create function pg_temp.handoff_drift_uses_revision()
returns boolean
language plpgsql
as $$
declare
  v_build public.ads_campaign_builds%rowtype;
  v_revision public.ads_campaign_plan_revisions%rowtype;
  v_handoff public.ads_campaign_monitoring_handoffs%rowtype;
begin
  select build.* into strict v_build
  from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = 'handoff-drift';
  select revision.* into strict v_revision
  from public.ads_campaign_plan_revisions as revision where revision.id = v_build.revision_id;
  select * into strict v_handoff
  from public.ads_create_campaign_monitoring_handoff(
    v_build.id, v_build.lock_version, v_build.revision_hash,
    '00000000-0000-0000-0000-000000000061', null, null
  );
  return v_handoff.client_id = v_revision.client_id
    and v_handoff.platform = v_revision.platform
    and v_handoff.ad_account_id = v_revision.ad_account_id
    and v_handoff.provider_account_id = v_revision.provider_account_id
    and v_handoff.revision_id = v_revision.id
    and v_handoff.revision_hash = v_revision.payload_hash
    and v_handoff.start_date = v_revision.start_date
    and v_handoff.end_date = v_revision.end_date
    and v_handoff.currency = v_revision.currency
    and v_handoff.allocated_budget = v_revision.allocated_budget
    and (select status = 'handoff_complete' from public.ads_campaign_builds where id = v_build.id)
    and (select status = 'launched' from public.ads_campaign_plans where id = v_build.plan_id);
exception when others then
  return false;
end;
$$;
select ok(
  pg_temp.handoff_drift_uses_revision(),
  'mutable account-directory drift cannot rewrite immutable revision-derived handoff identity'
);

create function pg_temp.handoff_mismatch_is_side_effect_free(p_fixture text)
returns boolean
language plpgsql
as $$
declare
  v_build public.ads_campaign_builds%rowtype;
  v_plan public.ads_campaign_plans%rowtype;
begin
  select build.* into strict v_build
  from public.ads_campaign_builds as build
  join public.ads_campaign_plans as plan on plan.id = build.plan_id
  where plan.created_by_name = p_fixture;
  select plan.* into strict v_plan
  from public.ads_campaign_plans as plan where plan.id = v_build.plan_id;
  begin
    perform public.ads_create_campaign_monitoring_handoff(
      v_build.id, v_build.lock_version, v_build.revision_hash,
      '00000000-0000-0000-0000-000000000061', null, null
    );
  exception when sqlstate '55000' then
    null;
  end;
  return not exists (
      select 1 from public.ads_campaign_monitoring_handoffs where build_id = v_build.id
    )
    and (select status = v_build.status and lock_version = v_build.lock_version
         from public.ads_campaign_builds where id = v_build.id)
    and (select status = v_plan.status and lock_version = v_plan.lock_version
         from public.ads_campaign_plans where id = v_plan.id);
end;
$$;
select ok(
  pg_temp.handoff_mismatch_is_side_effect_free('handoff-build-mismatch'),
  'handoff rejects a build snapshot that no longer matches its immutable revision'
);
select ok(
  pg_temp.handoff_mismatch_is_side_effect_free('handoff-plan-mismatch'),
  'handoff rejects a locked plan that is not launch_in_progress without changing state'
);

create function pg_temp.run_generic_platform_lifecycle(p_platform text)
returns boolean
language plpgsql
as $$
declare
  v_account_id bigint;
  v_package_id bigint;
  v_plan public.ads_campaign_plans%rowtype;
  v_revision public.ads_campaign_plan_revisions%rowtype;
  v_build public.ads_campaign_builds%rowtype;
  v_attempt public.ads_campaign_gate_attempts%rowtype;
  v_resource public.ads_campaign_build_resources%rowtype;
  v_handoff public.ads_campaign_monitoring_handoffs%rowtype;
  v_provider_account_id text := 'generic-' || p_platform;
  v_hash constant text := '4de43ffc59a2e30653465f2a1521003623076f9aab294d6f7d7debf632128baf';
begin
  insert into public.ads_ad_accounts (
    client_id, platform, provider_account_id, account_name, currency, timezone,
    access_status, access_evidence, access_verified_at, is_active
  ) values (
    '00000000-0000-0000-0000-000000000001', p_platform, v_provider_account_id,
    'Generic ' || p_platform, 'MYR', 'Asia/Kuala_Lumpur', 'verified',
    '{"source":"generic-lifecycle"}', clock_timestamp(), true
  ) returning id into v_account_id;
  insert into public.ads_budget_packages (
    client_id, package_key, package_name, currency, start_date, end_date,
    envelope_amount, status
  ) values (
    '00000000-0000-0000-0000-000000000001', 'generic-' || p_platform,
    'Generic ' || p_platform, 'MYR', '2026-08-01', '2026-08-31', 1000, 'active'
  ) returning id into v_package_id;
  insert into public.ads_campaign_plans (
    client_id, budget_package_id, ad_account_id, platform, created_by_id, created_by_name
  ) values (
    '00000000-0000-0000-0000-000000000001', v_package_id, v_account_id,
    p_platform, '00000000-0000-0000-0000-000000000061', 'generic-' || p_platform
  ) returning * into v_plan;

  select * into strict v_revision
  from public.ads_create_campaign_plan_revision(
    v_plan.id, v_plan.lock_version,
    '{"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}'::jsonb,
    '{"allocated_budget":400,"daily_budget":20,"destination":"https://example.test/landing","end_date":"2026-08-20","increment_amount":0,"objective":"leads","projected_total":400,"start_date":"2026-08-01"}',
    v_hash, '00000000-0000-0000-0000-000000000061', null, null
  );
  select plan.* into strict v_plan from public.ads_campaign_plans as plan where plan.id = v_plan.id;
  perform public.ads_reserve_campaign_budget(
    v_plan.id, v_revision.id, v_hash, v_plan.lock_version,
    '00000000-0000-0000-0000-000000000061', null, null
  );
  select plan.* into strict v_plan from public.ads_campaign_plans as plan where plan.id = v_plan.id;
  select * into strict v_build
  from public.ads_approve_campaign_plan_revision(
    v_plan.id, v_revision.id, v_hash, v_plan.lock_version,
    clock_timestamp() + interval '2 hours', 'generic-' || p_platform || '-approval',
    'generic lifecycle', '00000000-0000-0000-0000-000000000061', null, null
  );
  select * into strict v_attempt
  from public.ads_acquire_campaign_gate_claim(
    v_build.id, 1::smallint, 'create', 'generic-' || p_platform || '-gate-1',
    v_revision.id, v_hash, 300,
    '{"resources":[{"logical_resource_key":"campaign","resource_type":"campaign"}]}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  );
  perform public.ads_record_campaign_resource_outcome(
    v_attempt.id, v_attempt.claim_token, 'campaign', 'succeeded',
    'generic-' || p_platform || '-campaign', null, '{"status":"PAUSED"}', null
  );
  select resource.* into strict v_resource
  from public.ads_campaign_build_resources as resource
  where resource.build_id = v_build.id and resource.logical_resource_key = 'campaign';
  perform public.ads_append_campaign_qa_result(
    v_attempt.id, v_attempt.claim_token, v_resource.id,
    'gate_1', 'campaign.status', true, '"PAUSED"', '"PAUSED"', 'match',
    null, null, '{"status":"PAUSED"}'
  );
  select * into strict v_build
  from public.ads_finalize_campaign_gate_claim(
    v_attempt.id, v_attempt.claim_token, 'succeeded', '{"status":"PAUSED"}',
    '00000000-0000-0000-0000-000000000061', null, null
  );
  select * into strict v_attempt
  from public.ads_acquire_campaign_gate_claim(
    v_build.id, 2::smallint, 'deliver', 'generic-' || p_platform || '-gate-2',
    v_revision.id, v_hash, 300, '{}'::jsonb,
    '00000000-0000-0000-0000-000000000061', null, null
  );
  perform public.ads_append_campaign_qa_result(
    v_attempt.id, v_attempt.claim_token, v_resource.id,
    'gate_2', 'campaign.status', true, '"ENABLED"', '"ENABLED"', 'match',
    null, null, '{"status":"ENABLED"}'
  );
  select * into strict v_build
  from public.ads_finalize_campaign_gate_claim(
    v_attempt.id, v_attempt.claim_token, 'succeeded', '{"status":"ENABLED"}',
    '00000000-0000-0000-0000-000000000061', null, null
  );
  select * into strict v_handoff
  from public.ads_create_campaign_monitoring_handoff(
    v_build.id, v_build.lock_version, v_hash,
    '00000000-0000-0000-0000-000000000061', null, null
  );
  return v_handoff.platform = p_platform
    and v_handoff.provider_account_id = v_provider_account_id
    and v_handoff.revision_id = v_revision.id
    and v_handoff.revision_hash = v_hash
    and v_handoff.provider_campaign_id = 'generic-' || p_platform || '-campaign'
    and (select status = 'handoff_complete' from public.ads_campaign_builds where id = v_build.id)
    and (select status = 'launched' from public.ads_campaign_plans where id = v_plan.id);
exception when others then
  return false;
end;
$$;
select ok(
  pg_temp.run_generic_platform_lifecycle('meta'),
  'Meta completes the generic database lifecycle through immutable monitoring handoff'
);
select ok(
  pg_temp.run_generic_platform_lifecycle('tiktok'),
  'TikTok completes the generic database lifecycle through immutable monitoring handoff'
);

select throws_ok(
  $$update public.ads_campaign_build_resources as resource
    set logical_resource_key = 'rewritten-campaign'
    from public.ads_campaign_builds build, public.ads_campaign_plans plan
    where build.id = resource.build_id and plan.id = build.plan_id
      and plan.created_by_name = 'claim fixture'
      and resource.logical_resource_key = 'campaign'$$,
  '55000', 'Campaign resource logical identity is immutable',
  'a persisted logical resource key cannot be rewritten'
);
select throws_ok(
  $$update public.ads_campaign_build_resources as resource
    set resource_type = 'campaign'
    from public.ads_campaign_builds build, public.ads_campaign_plans plan
    where build.id = resource.build_id and plan.id = build.plan_id
      and plan.created_by_name = 'claim fixture'
      and resource.logical_resource_key = 'ad-group:1'$$,
  '55000', 'Campaign resource logical identity is immutable',
  'a persisted resource type cannot be rewritten'
);
select throws_ok(
  $$update public.ads_campaign_build_resources as resource
    set verified_at = clock_timestamp()
    from public.ads_campaign_builds build, public.ads_campaign_plans plan
    where build.id = resource.build_id and plan.id = build.plan_id
      and plan.created_by_name = 'mismatch fixture'
      and resource.logical_resource_key = 'campaign'$$,
  '55000', 'Campaign resource verification requires Gate 2 finalizer context',
  'an arbitrary direct update cannot mark a resource delivery-verified'
);

select ok(
  has_table_privilege('service_role', format('public.%I', expected.table_name), 'SELECT')
    and not has_table_privilege('service_role', format('public.%I', expected.table_name), 'INSERT')
    and not has_table_privilege('service_role', format('public.%I', expected.table_name), 'UPDATE')
    and not has_table_privilege('service_role', format('public.%I', expected.table_name), 'DELETE'),
  expected.table_name || ' is SELECT-only for service_role; writes require narrow RPCs'
)
from (values
  ('ads_ad_accounts'), ('ads_budget_packages'), ('ads_campaign_plans'),
  ('ads_campaign_plan_revisions'), ('ads_campaign_approvals'), ('ads_campaign_builds'),
  ('ads_campaign_build_resources'), ('ads_campaign_gate_attempts'),
  ('ads_campaign_qa_results'), ('ads_campaign_audit_events'),
  ('ads_campaign_monitoring_handoffs')
) as expected(table_name);

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
