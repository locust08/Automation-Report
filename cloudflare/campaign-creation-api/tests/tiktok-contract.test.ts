import {expect,it} from 'vitest';
import {scopeSchema,tiktokPlanSchema} from '../src/contracts';
import {inputs} from '../src/inputs';

it('accepts exact-source readiness selection separately from continuation',()=>{
 const input={service_id:'3e44fcc4-f701-8034-b219-c996dbdedbe6',source_ad_id:'1866968855581937'};
 expect(inputs.campaign_templates_list.parse(input)).toMatchObject(input);
 expect(inputs.campaign_templates_list.safeParse({...input,cursor:'cursor'}).success).toBe(false);
});

it('accepts only the exact-length TikTok account scope without Google routing',()=>{
  const scope={subject:'ava',grantRevision:1,accountPageId:'3e44fcc4-f701-8034-b219-c996dbdedbe6',clientId:'12345678-1234-4234-8234-123456789def',platform:'TikTok',platformAccountId:'7647057541075271700',connectionRevision:'m04',providerRevision:'tiktok'};
  expect(scopeSchema.parse(scope)).toMatchObject(scope);
  expect(scopeSchema.safeParse({...scope,platformAccountId:'321606578570386'}).success).toBe(false);
  expect(scopeSchema.safeParse({...scope,googleLoginCustomerId:'1234567890'}).success).toBe(false);
});

it('requires an immutable TikTok source and account-currency daily budget',()=>{
  const plan={campaign_type:'tiktok_existing_ad',name:'Falcon Safe paused',currency:'MYR',timezone:'Asia/Kuala_Lumpur',daily_budget:'100.01',source_ad_id:'123',source_campaign_id:'456',source_adgroup_id:'789',source_fingerprint:'a'.repeat(43)};
  expect(tiktokPlanSchema.parse(plan)).toMatchObject(plan);
  expect(tiktokPlanSchema.safeParse({...plan,daily_budget:'0'}).success).toBe(false);
  expect(tiktokPlanSchema.safeParse({...plan,source_adgroup_id:'other'}).success).toBe(false);
});
