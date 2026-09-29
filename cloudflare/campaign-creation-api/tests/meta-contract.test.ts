import {describe,expect,it} from 'vitest';
import {metaPlanSchema,scopeSchema} from '../src/contracts';

describe('Meta paused campaign contract',()=>{
  it('accepts numeric mapped Meta accounts and rejects Google-only routing',()=>{
    const base={subject:'ava',grantRevision:6,accountPageId:'2de4fcc4-f701-80ad-aab2-c4ae709c7f9e',clientId:'2de4fcc4-f701-808d-b48b-c507d8641ce3',platform:'Meta',platformAccountId:'321606578570386',connectionRevision:'m04-test',providerRevision:'meta-1'};
    expect(scopeSchema.parse(base)).toMatchObject({platform:'Meta',platformAccountId:'321606578570386'});
    expect(scopeSchema.parse({...base,platformAccountId:'1234567890123456'}).platformAccountId).toBe('1234567890123456');
    expect(()=>scopeSchema.parse({...base,googleLoginCustomerId:'1234567890'})).toThrow();
  });

  it('holds a bounded immutable source ad and daily budget without Google-only fields',()=>{
    const draft={campaign_type:'meta_existing_ad',name:'LOCUS-T paused test',currency:'MYR',timezone:'Asia/Kuala_Lumpur',daily_budget:'10.00',source_ad_id:'123456789012345',source_campaign_id:'987654321012345',source_adset_id:'111222333444555',source_fingerprint:'a'.repeat(43)};
    expect(metaPlanSchema.parse(draft)).toEqual(draft);
    expect(()=>metaPlanSchema.parse({...draft,source_ad_id:'act_123'})).toThrow();
    expect(metaPlanSchema.parse({...draft,currency:'USD'}).currency).toBe('USD');
    expect(()=>metaPlanSchema.parse({...draft,source_fingerprint:undefined})).toThrow();
  });
});
