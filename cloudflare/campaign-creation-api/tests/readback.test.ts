import {expect,it,vi} from 'vitest';
import {Google} from '../src/google';
import type {Plan,Scope} from '../src/contracts';
const scope:Scope={subject:'actor',grantRevision:1,accountPageId:'00000000-0000-4000-8000-000000000001',clientId:'00000000-0000-4000-8000-000000000002',platform:'Google',platformAccountId:'2315114913',connectionRevision:'test',providerRevision:'test'};
const prefix='customers/2315114913';
const plan:Plan={name:'Synthetic paused Search',campaign_type:'search',currency:'MYR',timezone:'Asia/Kuala_Lumpur',daily_budget:'10',final_url:'https://example.com/',locations:['geoTargetConstants/2458'],languages:['languageConstants/1000'],ad_group_name:'Synthetic group',keywords:['test'],headlines:['Test One','Test Two','Test Three'],descriptions:['Test description one.','Test description two.']};
function fixture(biddingStrategyType='TARGET_SPEND'){
  const google=new Google({GOOGLE_ADS_CLIENT_ID:'synthetic',GOOGLE_ADS_CLIENT_SECRET:'synthetic',GOOGLE_ADS_REFRESH_TOKEN:'synthetic'},scope);
  const groupCriteria=[{adGroupCriterion:{type:'KEYWORD',status:'PAUSED',keyword:{text:'test',matchType:'EXACT'}}},{adGroupCriterion:{type:'GENDER',status:'ENABLED',negative:false,bidModifier:1}}];
  const targetCriteria=[{campaignCriterion:{type:'LOCATION',location:{geoTargetConstant:plan.locations[0]}}},{campaignCriterion:{type:'LANGUAGE',language:{languageConstant:plan.languages[0]}}},{campaignCriterion:{type:'DEVICE',negative:false,bidModifier:1}}];
  vi.spyOn(google,'query').mockImplementation(async query=>{
    if(query.includes('FROM campaign WHERE'))return [{campaign:{id:'99',resourceName:prefix+'/campaigns/99',status:'PAUSED',advertisingChannelType:'SEARCH',biddingStrategyType,containsEuPoliticalAdvertising:'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',campaignBudget:prefix+'/campaignBudgets/101',networkSettings:{targetGoogleSearch:true}},campaignBudget:{resourceName:prefix+'/campaignBudgets/101',amountMicros:'10000000',explicitlyShared:false,referenceCount:'1',period:'DAILY'}}];
    if(query.includes('FROM ad_group WHERE'))return [{adGroup:{id:'100',resourceName:prefix+'/adGroups/100',campaign:prefix+'/campaigns/99',name:plan.ad_group_name,status:'PAUSED'}}];
    if(query.includes('FROM ad_group_ad WHERE'))return [{adGroupAd:{status:'PAUSED',ad:{type:'RESPONSIVE_SEARCH_AD',finalUrls:[plan.final_url],responsiveSearchAd:{headlines:plan.headlines.map(text=>({text})),descriptions:plan.descriptions.map(text=>({text}))}}}}];
    if(query.includes('FROM ad_group_criterion WHERE'))return groupCriteria;
    if(query.includes('FROM campaign_criterion WHERE'))return targetCriteria;
    throw new Error('Unexpected readback query');
  });
  return {google,groupCriteria,targetCriteria};
}
it('verifies paused managed resources while retaining harmless Google demographic/device defaults',async()=>{
  const {google}=fixture();const result=await google.readback(plan,crypto.randomUUID());expect(result.campaign.status).toBe('PAUSED');expect(result.targeting).toHaveLength(2);
});
it('verifies the distinct Search keywords when Google coalesces duplicate keyword operations',async()=>{
  const {google}=fixture();
  const result=await google.readback({...plan,keywords:['test','test']},crypto.randomUUID());
  expect(result.targeting.filter(row=>row.adGroupCriterion.type==='KEYWORD')).toHaveLength(1);
});
it('rejects a different Search bidding strategy',async()=>{
  const {google}=fixture('MANUAL_CPC');
  await expect(google.readback(plan,crypto.randomUUID())).rejects.toThrow('creation_readback');
});
it.each(['enabled_keyword','excluded_demographic','device_bid','unexpected_target'])('rejects %s drift despite a paused parent',async drift=>{
  const {google,groupCriteria,targetCriteria}=fixture();
  if(drift==='enabled_keyword')groupCriteria[0].adGroupCriterion.status='ENABLED';
  if(drift==='excluded_demographic')groupCriteria[1].adGroupCriterion.negative=true;
  if(drift==='device_bid')targetCriteria[2].campaignCriterion.bidModifier=0;
  if(drift==='unexpected_target')targetCriteria.push({campaignCriterion:{type:'USER_LIST',negative:false,bidModifier:1}});
  await expect(google.readback(plan,crypto.randomUUID())).rejects.toThrow('targeting_readback');
});
