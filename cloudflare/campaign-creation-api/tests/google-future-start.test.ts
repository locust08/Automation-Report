import {expect,it,vi} from 'vitest';
import {buildOperations,Google,googleStartDate} from '../src/google';
import {digest,planSchema,type Scope} from '../src/contracts';
import {scheduleFor} from '../src/actions';
const scope:Scope={subject:'test',grantRevision:1,accountPageId:'00000000-0000-4000-8000-000000000001',clientId:'00000000-0000-4000-8000-000000000002',platform:'Google',platformAccountId:'2315114913',connectionRevision:'test',providerRevision:'test'};
const plan=planSchema.parse({name:'Future Search',campaign_type:'search',currency:'MYR',timezone:'Asia/Kuala_Lumpur',daily_budget:'10',final_url:'https://example.com/',locations:['geoTargetConstants/2458'],languages:['languageConstants/1000'],ad_group_name:'Group',keywords:['example'],headlines:['One','Two','Three'],descriptions:['First','Second'],start_at:'2099-11-09T16:00:00.000Z'});
const at=Date.parse('2099-11-09T16:00:00.000Z');
it('binds local midnight to the immutable Search plan and PAUSED creation payload',async()=>{
 const ops=buildOperations(scope,plan,'test');expect(ops[1].campaignOperation.create).toMatchObject({status:'PAUSED',startDateTime:'2099-11-10 00:00:00'});
 expect(ops[2].adGroupOperation.create.status).toBe('PAUSED');expect(ops.at(-1)!.adGroupAdOperation.create.status).toBe('PAUSED');
 expect(await digest(plan)).not.toBe(await digest({...plan,start_at:'2099-11-10T16:00:00.000Z'}));
});
it.each(['2099-11-09T16:01:00.000Z','2099-11-09T16:00:00.001Z','invalid'])('rejects an unrepresentable start %s',start_at=>{
 expect(()=>googleStartDate({...plan,campaign_type:'search',start_at} as typeof plan)).toThrow(/google_start_/);
});
it('enforces the exact 72h boundary only for new authorizations',()=>{
 expect(googleStartDate(plan,at-72*3600000)).toBe('2099-11-10');expect(()=>googleStartDate(plan,at-72*3600000+1)).toThrow('google_start_lead_time');
 expect(googleStartDate(plan)).toBe('2099-11-10');
});
it('preserves legacy Search and rejects future-start fields on Demand Gen',()=>{
 const {start_at:ignored,...legacy}=plan as typeof plan & {start_at:string};void ignored;
 expect(buildOperations(scope,planSchema.parse(legacy),'test')[1].campaignOperation.create).not.toHaveProperty('startDateTime');
 expect(planSchema.safeParse({...plan,campaign_type:'demand_gen',keywords:undefined,business_name:'Name',landscape_images:['customers/2315114913/assets/1'],square_images:['customers/2315114913/assets/2'],logos:['customers/2315114913/assets/3'],audience:'customers/2315114913/audiences/4'}).success).toBe(false);
});
it('rejects expired starts before validation or execution can call the provider',async()=>{
 const fetcher=vi.fn(),g=new Google({GOOGLE_ADS_CLIENT_ID:'test',GOOGLE_ADS_CLIENT_SECRET:'test',GOOGLE_ADS_REFRESH_TOKEN:'test'},scope,fetcher);
 const expired=planSchema.parse({...plan,start_at:'2020-11-09T16:00:00.000Z'});
 await expect(g.validate(expired,'test')).rejects.toThrow('google_start_lead_time');await expect(g.create(expired,'test')).rejects.toThrow('google_start_lead_time');expect(fetcher).not.toHaveBeenCalled();
});
it('requires Gate 2 to retain the approved start and current lead time',()=>{
 const scheduled={mode:'scheduled',timezone:plan.timezone,scheduled_at:'2099-11-09T16:00:00.000Z'};
 expect(scheduleFor(scope,plan,scheduled,at-72*3600000).date).toBe('2099-11-10');
 expect(()=>scheduleFor(scope,plan,{...scheduled,scheduled_at:'2099-11-10T16:00:00.000Z'},at-72*3600000)).toThrow('google_schedule_plan_mismatch');
 expect(()=>scheduleFor(scope,plan,scheduled,at-72*3600000+1)).toThrow('invalid_schedule');
});
