begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table(
  'public', 'ads_campaign_legacy_adoptions',
  'the curated M03 prerequisite owns the legacy-adoptions table before M04'
);

select ok(
  (
    select pg_catalog.array_agg(attribute.attname order by attribute.attnum) = array[
      'id','project_key','account_id','campaign_id','campaign_name','reason',
      'evidence','adopted_by_id','adopted_by_name','adopted_at','revoked_at',
      'revoked_by_id','revoked_by_name'
    ]::name[]
      and pg_catalog.array_agg(
        pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
        order by attribute.attnum
      ) = array[
        'uuid','text','text','text','text','text','jsonb','text','text',
        'timestamp with time zone','timestamp with time zone','text','text'
      ]::text[]
      and pg_catalog.array_agg(attribute.attnotnull order by attribute.attnum) = array[
        true,true,true,true,true,true,true,true,true,true,false,false,false
      ]::boolean[]
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = pg_catalog.to_regclass('public.ads_campaign_legacy_adoptions')
      and attribute.attnum > 0
      and not attribute.attisdropped
  )
  and exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = pg_catalog.to_regclass('public.ads_campaign_legacy_adoptions')
      and constraint_row.conname = 'ads_campaign_legacy_adoptions_pkey'
      and constraint_row.contype = 'p'
  ),
  'the curated M03 legacy-adoptions table has the exact column, type, nullability, and primary-key contract'
);

select ok(
  (
    with expected(column_name, default_expression) as (values
      ('id'::name, 'gen_random_uuid()'::text),
      ('project_key'::name, '''lt_paid_media''::text'::text),
      ('adopted_at'::name, 'now()'::text)
    )
    select pg_catalog.count(*) = 3
      and pg_catalog.bool_and(
        pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid)
          = expected.default_expression
      )
    from expected
    join pg_catalog.pg_attribute as attribute
      on attribute.attrelid = pg_catalog.to_regclass('public.ads_campaign_legacy_adoptions')
     and attribute.attname = expected.column_name
    join pg_catalog.pg_attrdef as default_row
      on default_row.adrelid = attribute.attrelid
     and default_row.adnum = attribute.attnum
  )
  and (
    select pg_catalog.count(*) = 3
      and pg_catalog.bool_or(expression = '(project_key = ''lt_paid_media''::text)')
      and pg_catalog.bool_or(expression = '(btrim(reason) <> ''''::text)')
      and pg_catalog.bool_or(
        expression = '(btrim(COALESCE((evidence ->> ''summary''::text), ''''::text)) <> ''''::text)'
      )
    from (
      select pg_catalog.pg_get_expr(constraint_row.conbin, constraint_row.conrelid) as expression
      from pg_catalog.pg_constraint as constraint_row
      where constraint_row.conrelid = pg_catalog.to_regclass('public.ads_campaign_legacy_adoptions')
        and constraint_row.contype = 'c'
    ) as checks
  )
  and (
    select pg_catalog.count(*) = 3
    from pg_catalog.pg_attrdef as default_row
    where default_row.adrelid = pg_catalog.to_regclass('public.ads_campaign_legacy_adoptions')
  ),
  'the curated M03 legacy-adoptions table preserves the exact defaults and validation checks'
);

select ok(
  coalesce((
    select index_row.indisunique
      and pg_catalog.pg_get_indexdef(index_row.indexrelid) =
        'CREATE UNIQUE INDEX ads_campaign_legacy_adoptions_active_unique ON public.ads_campaign_legacy_adoptions USING btree (project_key, account_id, campaign_id) WHERE (revoked_at IS NULL)'
    from pg_catalog.pg_index as index_row
    join pg_catalog.pg_class as index_class on index_class.oid = index_row.indexrelid
    where index_class.relname = 'ads_campaign_legacy_adoptions_active_unique'
      and index_row.indrelid = pg_catalog.to_regclass('public.ads_campaign_legacy_adoptions')
  ), false),
  'the curated M03 legacy-adoptions table preserves the active-adoption unique partial index'
);

select ok(
  coalesce((
    select table_row.relrowsecurity
    from pg_catalog.pg_class as table_row
    where table_row.oid = pg_catalog.to_regclass('public.ads_campaign_legacy_adoptions')
  ), false)
  and coalesce(pg_catalog.has_table_privilege(
    'service_role', pg_catalog.to_regclass('public.ads_campaign_legacy_adoptions'), 'SELECT'
  ), false)
  and coalesce(pg_catalog.has_table_privilege(
    'service_role', pg_catalog.to_regclass('public.ads_campaign_legacy_adoptions'), 'INSERT'
  ), false)
  and coalesce(pg_catalog.has_table_privilege(
    'service_role', pg_catalog.to_regclass('public.ads_campaign_legacy_adoptions'), 'UPDATE'
  ), false)
  and not coalesce(pg_catalog.has_table_privilege(
    'service_role', pg_catalog.to_regclass('public.ads_campaign_legacy_adoptions'), 'DELETE'
  ), false)
  and not coalesce(pg_catalog.has_table_privilege(
    'anon', pg_catalog.to_regclass('public.ads_campaign_legacy_adoptions'), 'SELECT'
  ), false)
  and not coalesce(pg_catalog.has_table_privilege(
    'anon', pg_catalog.to_regclass('public.ads_campaign_legacy_adoptions'), 'INSERT'
  ), false)
  and not coalesce(pg_catalog.has_table_privilege(
    'anon', pg_catalog.to_regclass('public.ads_campaign_legacy_adoptions'), 'UPDATE'
  ), false)
  and not coalesce(pg_catalog.has_table_privilege(
    'anon', pg_catalog.to_regclass('public.ads_campaign_legacy_adoptions'), 'DELETE'
  ), false)
  and not coalesce(pg_catalog.has_table_privilege(
    'authenticated', pg_catalog.to_regclass('public.ads_campaign_legacy_adoptions'), 'SELECT'
  ), false)
  and not coalesce(pg_catalog.has_table_privilege(
    'authenticated', pg_catalog.to_regclass('public.ads_campaign_legacy_adoptions'), 'INSERT'
  ), false)
  and not coalesce(pg_catalog.has_table_privilege(
    'authenticated', pg_catalog.to_regclass('public.ads_campaign_legacy_adoptions'), 'UPDATE'
  ), false)
  and not coalesce(pg_catalog.has_table_privilege(
    'authenticated', pg_catalog.to_regclass('public.ads_campaign_legacy_adoptions'), 'DELETE'
  ), false),
  'the curated M03 legacy-adoptions table enables RLS and preserves its service-role-only write ACL'
);

-- The curated prerequisite owns the pre-M04 table contract. This block keeps
-- only the historical function fallback used when the M04 override is absent.
do $fixture$
begin
  if to_regprocedure('public.ads_get_campaign_launch_eligibility(text,text)') is null then
    execute $function$
      create function public.ads_get_campaign_launch_eligibility(
        p_account_id text,
        p_campaign_id text
      ) returns jsonb
      language plpgsql
      security definer
      set search_path = ''
      as $body$
      declare
        adoption_id uuid;
        verified_build_id bigint;
      begin
        select adoption.id into adoption_id
        from public.ads_campaign_legacy_adoptions adoption
        where adoption.account_id = p_account_id
          and adoption.campaign_id = p_campaign_id
          and adoption.project_key = 'lt_paid_media'
          and adoption.revoked_at is null
        limit 1;

        if adoption_id is not null then
          return jsonb_build_object('eligible', true, 'source', 'legacy_adoption', 'sourceId', adoption_id::text);
        end if;

        if to_regclass('public.ads_campaign_build_resources') is not null
           and to_regclass('public.ads_campaign_builds') is not null
           and to_regclass('public.ads_ad_accounts') is not null then
          execute $query$
            select build.id
            from public.ads_campaign_build_resources resource
            join public.ads_campaign_builds build on build.id = resource.build_id
            join public.ads_ad_accounts account on account.id = build.ad_account_id
            where account.provider_account_id = $1
              and resource.resource_type = 'campaign'
              and resource.provider_resource_id = $2
              and resource.verified_at is not null
              and build.status in ('verified', 'handoff_complete')
            order by resource.verified_at desc
            limit 1
          $query$ into verified_build_id using p_account_id, p_campaign_id;
        end if;

        if verified_build_id is not null then
          return jsonb_build_object('eligible', true, 'source', 'verified_build', 'sourceId', verified_build_id::text);
        end if;
        return jsonb_build_object('eligible', false, 'source', 'unverified', 'sourceId', null);
      end;
      $body$
    $function$;
    revoke all on function public.ads_get_campaign_launch_eligibility(text, text) from public, anon, authenticated;
    grant execute on function public.ads_get_campaign_launch_eligibility(text, text) to service_role;
  end if;
end;
$fixture$;

create temporary table m04_m03_cases (
  fixture_name text primary key,
  platform text not null,
  provider_account_id text not null,
  build_status text not null,
  resource_type text not null,
  provider_resource_id text not null,
  resource_verified boolean not null
);

insert into m04_m03_cases values
  ('legacy-precedence', 'google', '100000000001', 'verified', 'campaign', '200000000001', true),
  ('google-verified', 'google', '100000000002', 'verified', 'campaign', '200000000002', true),
  ('google-handoff', 'google', '100000000003', 'handoff_complete', 'campaign', '200000000003', true),
  ('resource-unverified', 'google', '100000000004', 'verified', 'campaign', '200000000004', false),
  ('wrong-resource-type', 'google', '100000000005', 'verified', 'ad_group', '200000000005', true),
  ('wrong-account', 'google', '100000000006', 'verified', 'campaign', '200000000006', true),
  ('wrong-campaign', 'google', '100000000007', 'verified', 'campaign', '200000000007', true),
  ('meta-numeric-collision', 'meta', '300000000001', 'verified', 'campaign', '400000000001', true),
  ('tiktok-numeric-collision', 'tiktok', '300000000002', 'handoff_complete', 'campaign', '400000000002', true),
  ('status-pending-gate-1', 'google', '500000000001', 'pending_gate_1', 'campaign', '600000000001', true),
  ('status-gate-1-in-progress', 'google', '500000000002', 'gate_1_in_progress', 'campaign', '600000000002', true),
  ('status-gate-1-failed', 'google', '500000000003', 'gate_1_failed', 'campaign', '600000000003', true),
  ('status-qa-failed', 'google', '500000000004', 'qa_failed', 'campaign', '600000000004', true),
  ('status-reconciliation-required', 'google', '500000000005', 'reconciliation_required', 'campaign', '600000000005', true),
  ('status-ready-to-deliver', 'google', '500000000006', 'ready_to_deliver', 'campaign', '600000000006', true),
  ('status-gate-2-in-progress', 'google', '500000000007', 'gate_2_in_progress', 'campaign', '600000000007', true),
  ('status-gate-2-failed', 'google', '500000000008', 'gate_2_failed', 'campaign', '600000000008', true),
  ('status-delivery-unverified', 'google', '500000000009', 'delivery_unverified', 'campaign', '600000000009', true),
  ('status-cancelled', 'google', '500000000010', 'cancelled', 'campaign', '600000000010', true);

insert into public.ads_ad_accounts (
  client_id, platform, provider_account_id, account_name, currency, timezone,
  access_status, access_evidence, access_verified_at, is_active
)
select
  '00000000-0000-0000-0000-000000000401', cases.platform,
  cases.provider_account_id, cases.fixture_name, 'MYR', 'Asia/Kuala_Lumpur',
  'verified', '{"source":"m03-compatibility-test"}'::jsonb, clock_timestamp(), true
from m04_m03_cases as cases;

insert into public.ads_budget_packages (
  client_id, package_key, package_name, currency, start_date, end_date,
  envelope_amount, status
) values (
  '00000000-0000-0000-0000-000000000401', 'm03-compatibility',
  'M03 compatibility', 'MYR', '2026-08-01', '2026-08-31', 100000, 'active'
);

insert into public.ads_campaign_plans (
  client_id, budget_package_id, ad_account_id, platform,
  created_by_id, created_by_name
)
select
  account.client_id, package.id, account.id, account.platform,
  '00000000-0000-0000-0000-000000000402', cases.fixture_name
from m04_m03_cases as cases
join public.ads_ad_accounts as account
  on account.platform = cases.platform
 and account.provider_account_id = cases.provider_account_id
cross join public.ads_budget_packages as package
where package.package_key = 'm03-compatibility';

insert into public.ads_campaign_plan_revisions (
  plan_id, revision_number, client_id, ad_account_id, budget_package_id,
  platform, provider_account_id, currency, timezone, start_date, end_date,
  allocated_budget, increment_amount, daily_budget, projected_total,
  objective, destination, plan_payload, canonical_json, payload_hash,
  created_by_id, created_by_name
)
select
  plan.id, 1, plan.client_id, plan.ad_account_id, plan.budget_package_id,
  plan.platform, account.provider_account_id, account.currency, account.timezone,
  '2026-08-01', '2026-08-31', 1, 0, 1, 1,
  'leads', 'https://example.test/m03', '{}'::jsonb, '{}', repeat('a', 64),
  plan.created_by_id, plan.created_by_name
from public.ads_campaign_plans as plan
join public.ads_ad_accounts as account on account.id = plan.ad_account_id
where plan.client_id = '00000000-0000-0000-0000-000000000401';

update public.ads_campaign_plans as plan
set active_revision_id = revision.id
from public.ads_campaign_plan_revisions as revision
where revision.plan_id = plan.id
  and plan.client_id = '00000000-0000-0000-0000-000000000401';

insert into public.ads_campaign_approvals (
  plan_id, revision_id, revision_hash, decision, expires_at,
  request_idempotency_key, approved_by_id, approved_by_name
)
select
  plan.id, revision.id, revision.payload_hash, 'approved',
  clock_timestamp() + interval '1 day', 'm03-' || plan.created_by_name,
  '00000000-0000-0000-0000-000000000402', 'M03 Compatibility Operator'
from public.ads_campaign_plans as plan
join public.ads_campaign_plan_revisions as revision on revision.plan_id = plan.id
where plan.client_id = '00000000-0000-0000-0000-000000000401';

insert into public.ads_campaign_builds (
  plan_id, revision_id, revision_hash, approval_id, budget_package_id,
  ad_account_id, platform, status, verified_at, final_readback_evidence
)
select
  plan.id, revision.id, revision.payload_hash, approval.id,
  plan.budget_package_id, plan.ad_account_id, plan.platform, cases.build_status,
  case when cases.build_status in ('verified', 'handoff_complete') then clock_timestamp() end,
  case when cases.build_status in ('verified', 'handoff_complete')
    then '{"source":"m03-compatibility-test"}'::jsonb else '{}'::jsonb end
from m04_m03_cases as cases
join public.ads_campaign_plans as plan on plan.created_by_name = cases.fixture_name
join public.ads_campaign_plan_revisions as revision on revision.plan_id = plan.id
join public.ads_campaign_approvals as approval on approval.plan_id = plan.id
where plan.client_id = '00000000-0000-0000-0000-000000000401';

select pg_catalog.set_config('ads_internal.gate_2_finalizer', 'on', true);
insert into public.ads_campaign_build_resources (
  build_id, logical_resource_key, resource_type, provider_resource_id,
  provider_response, verified_at
)
select
  build.id, cases.fixture_name, cases.resource_type, cases.provider_resource_id,
  '{"source":"m03-compatibility-test"}'::jsonb,
  case when cases.resource_verified then clock_timestamp() end
from m04_m03_cases as cases
join public.ads_campaign_plans as plan on plan.created_by_name = cases.fixture_name
join public.ads_campaign_builds as build on build.plan_id = plan.id
where plan.client_id = '00000000-0000-0000-0000-000000000401';
select pg_catalog.set_config('ads_internal.gate_2_finalizer', 'off', true);

insert into public.ads_campaign_legacy_adoptions (
  id, project_key, account_id, campaign_id, campaign_name, reason, evidence,
  adopted_by_id, adopted_by_name
) values (
  '00000000-0000-0000-0000-000000000403', 'lt_paid_media',
  '100000000001', '200000000001', 'Legacy precedence',
  'Explicitly adopted before M04', '{"summary":"approved legacy adoption"}',
  'legacy-operator', 'Legacy Operator'
);

select has_function(
  'public', 'ads_get_campaign_launch_eligibility', array['text','text'],
  'M03 launch eligibility keeps its text/text signature'
);
select function_returns(
  'public', 'ads_get_campaign_launch_eligibility', array['text','text'], 'jsonb',
  'M03 launch eligibility keeps its jsonb return type'
);
select ok(
  (
    select routine.prosecdef
      and pg_catalog.array_to_string(routine.proconfig, ',') = 'search_path=""'
    from pg_catalog.pg_proc as routine
    where routine.oid = 'public.ads_get_campaign_launch_eligibility(text,text)'::regprocedure
  ),
  'M03 launch eligibility remains SECURITY DEFINER with an empty search_path'
);
select ok(
  has_function_privilege(
    'service_role', 'public.ads_get_campaign_launch_eligibility(text,text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.ads_get_campaign_launch_eligibility(text,text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'public.ads_get_campaign_launch_eligibility(text,text)', 'EXECUTE'
  ),
  'M03 launch eligibility execution remains limited to service_role'
);

select is(
  public.ads_get_campaign_launch_eligibility('100000000001', '200000000001'),
  '{"eligible":true,"source":"legacy_adoption","sourceId":"00000000-0000-0000-0000-000000000403"}'::jsonb,
  'legacy adoption remains eligible and takes precedence over a verified build'
);
select is(
  public.ads_get_campaign_launch_eligibility('100000000002', '200000000002'),
  pg_catalog.jsonb_build_object(
    'eligible', true, 'source', 'verified_build', 'sourceId',
    (select build.id::text
     from public.ads_campaign_builds as build
     join public.ads_campaign_plans as plan on plan.id = build.plan_id
     where plan.created_by_name = 'google-verified')
  ),
  'a delivery-verified Google build is eligible'
);
select is(
  public.ads_get_campaign_launch_eligibility('100000000003', '200000000003'),
  pg_catalog.jsonb_build_object(
    'eligible', true, 'source', 'verified_build', 'sourceId',
    (select build.id::text
     from public.ads_campaign_builds as build
     join public.ads_campaign_plans as plan on plan.id = build.plan_id
     where plan.created_by_name = 'google-handoff')
  ),
  'a handoff-complete Google build remains eligible'
);

select is(
  public.ads_get_campaign_launch_eligibility(cases.account_id, cases.campaign_id),
  '{"eligible":false,"source":"unverified","sourceId":null}'::jsonb,
  cases.description
)
from (values
  ('100000000004', '200000000004', 'a campaign resource with null verified_at is ineligible'),
  ('100000000005', '200000000005', 'a verified non-campaign resource is ineligible'),
  ('000000000000', '200000000006', 'a campaign from the wrong account is ineligible'),
  ('100000000007', '000000000000', 'a mismatched provider campaign ID is ineligible'),
  ('300000000001', '400000000001', 'a matching Meta numeric collision is ineligible'),
  ('300000000002', '400000000002', 'a matching TikTok numeric collision is ineligible')
) as cases(account_id, campaign_id, description);

select is(
  public.ads_get_campaign_launch_eligibility(cases.provider_account_id, cases.provider_resource_id),
  '{"eligible":false,"source":"unverified","sourceId":null}'::jsonb,
  cases.fixture_name || ' is ineligible before verified Gate 2 completion'
)
from m04_m03_cases as cases
where cases.fixture_name like 'status-%'
order by cases.fixture_name;

select * from finish();
rollback;
