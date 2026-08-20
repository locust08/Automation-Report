begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select has_table('public', 'traffic_quality_account_policies', 'account policies are durable');
select has_table('public', 'traffic_quality_recommendations', 'recommendations are durable');
select has_table('public', 'traffic_quality_decision_events', 'decision history is durable');
select has_table('public', 'traffic_quality_agency_placement_risks', 'agency risks are durable');
select has_table('public', 'traffic_quality_reports', 'verified reports are durable');
select col_is_pk('public', 'traffic_quality_account_policies', 'account_id', 'policy data is isolated by account key');
select has_index('public', 'ads_change_sets', 'ads_change_sets_idempotency_key_idx', 'M03 handoffs have a unique idempotency index');
select has_function('public', 'create_traffic_quality_m03_draft', array['text','text','uuid[]','text','text','text'], 'M01 handoff function exists');

insert into public.traffic_quality_recommendations (
  id, account_id, account_name, source_kind, source_item_key, item_value,
  item_type, campaign_id, campaign_name, source_snapshot, classification,
  recommended_action, recommended_negative_match_type, ai_confidence,
  explanation, client_confirmation_required, priority_score, priority,
  review_cadence, current_status
) values
  ('00000000-0000-0000-0000-000000000101', '1111111111', 'Account one', 'search_term', 'term-1', 'free quote', null, '101', 'Search', '{}', 'Free or cheap intent', 'exclude', 'phrase', 95, 'Free intent', false, 85, 'critical', 'immediate', 'excluded'),
  ('00000000-0000-0000-0000-000000000102', '2222222222', 'Account two', 'placement', 'place-2', 'mobileapp::2-com.example', 'MOBILE_APPLICATION', '202', 'PMax', '{}', 'Spam or suspicious', 'exclude', 'exact', 91, 'Suspicious traffic', true, 80, 'critical', 'immediate', 'excluded');

insert into public.traffic_quality_decision_events (
  id, recommendation_id, account_id, action, actor_id, actor_email, actor_role, recommendation_snapshot
) values (
  '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101',
  '1111111111', 'exclude', 'reviewer', 'reviewer@example.test', 'specialist', '{}'
);

select throws_ok(
  $$update public.traffic_quality_decision_events set comment = 'changed' where id = '00000000-0000-0000-0000-000000000201'$$,
  'traffic quality decision events are immutable',
  'decision events cannot be updated'
);
select throws_ok(
  $$delete from public.traffic_quality_decision_events where id = '00000000-0000-0000-0000-000000000201'$$,
  'traffic quality decision events are immutable',
  'decision events cannot be deleted'
);

set local role service_role;
select lives_ok(
  $$select public.create_traffic_quality_m03_draft('1111111111', 'Account one', array['00000000-0000-0000-0000-000000000101'::uuid], 'm01:test:one', 'operator', 'operator@example.test')$$,
  'a selected exclusion creates an M03 draft'
);
select is(
  (select count(*)::integer from public.ads_change_sets where idempotency_key = 'm01:test:one'),
  1,
  'the M03 draft is created once'
);
select is(
  (select count(*)::integer from public.ads_field_changes where source_recommendation_id = '00000000-0000-0000-0000-000000000101'),
  1,
  'the immutable recommendation snapshot creates one change item'
);
select lives_ok(
  $$select public.create_traffic_quality_m03_draft('1111111111', 'Account one', array['00000000-0000-0000-0000-000000000101'::uuid], 'm01:test:one', 'operator', 'operator@example.test')$$,
  'repeating the same idempotency key returns the existing draft'
);
select throws_ok(
  $$select public.create_traffic_quality_m03_draft('1111111111', 'Account one', array['00000000-0000-0000-0000-000000000102'::uuid], 'm01:test:mixed', 'operator', 'operator@example.test')$$,
  'all recommendations must be selected exclusions from the same account',
  'cross-account handoffs are rejected'
);

select * from finish();
rollback;
