begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id,email,aud,role,email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000091','m05.release@locus-t.com.my','authenticated','authenticated',clock_timestamp());
insert into public.ad_automation_report_users(id,full_name,role,is_active) values
  ('00000000-0000-0000-0000-000000000091','M05 release operator','admin',true);
insert into public.m04_ads_ad_accounts(
  client_id,platform,provider_account_id,account_name,currency,timezone,
  access_status,access_evidence,access_verified_at,is_active
) values (
  '3584fcc4-f701-808a-b7aa-eae25eacf3a2','google','1998676917','Dscaff','MYR','Asia/Kuala_Lumpur',
  'verified','{"login_customer_id":"3666137525"}',clock_timestamp(),true
);

set local role service_role;
select lives_ok(
  $$select public.m05_ads_seed_dscaff_pilot(
    '00000000-0000-0000-0000-000000000091','notion-revision-test','2026-10-09T00:00:00Z'
  )$$,
  'verified Dscaff source seeds successfully'
);
select is((select count(*)::integer from public.m05_ads_accounts),1,'one pilot account is inserted');
select is((select count(*)::integer from public.m05_ads_allocations),1,'one pilot allocation is inserted');
select lives_ok(
  $$select public.m05_ads_seed_dscaff_pilot(
    '00000000-0000-0000-0000-000000000091','notion-revision-test','2026-10-09T00:00:00Z'
  )$$,
  'identical seed is idempotent'
);
select is((select count(*)::integer from public.m05_ads_accounts),1,'idempotent seed keeps one account');
select is((select count(*)::integer from public.m05_ads_allocations),1,'idempotent seed keeps one allocation');
reset role;

update public.m04_ads_ad_accounts set access_evidence='{"login_customer_id":"other"}'
where provider_account_id='1998676917';
set local role service_role;
select throws_like(
  $$select public.m05_ads_seed_dscaff_pilot(
    '00000000-0000-0000-0000-000000000091','notion-revision-test','2026-10-09T00:00:00Z'
  )$$,
  '%Dscaff M04 account mapping is not verified%',
  'changed Google access path fails closed'
);
reset role;

select * from finish();
rollback;
