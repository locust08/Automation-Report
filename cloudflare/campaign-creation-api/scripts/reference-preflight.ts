import {Google} from '../src/google';
import {planSchema} from '../src/contracts';
import {writeFile,mkdir} from 'node:fs/promises';
// Local read-only diagnostic. This does not create an authorized M04 workflow or acceptance receipt.
const credentials={GOOGLE_ADS_CLIENT_ID:process.env.GOOGLE_OAUTH_CLIENT_ID!,GOOGLE_ADS_CLIENT_SECRET:process.env.GOOGLE_OAUTH_CLIENT_SECRET!,GOOGLE_ADS_REFRESH_TOKEN:process.env.GOOGLE_OAUTH_REFRESH_TOKEN!,GOOGLE_ADS_DEVELOPER_TOKEN:process.env.GOOGLE_ADS_DEVELOPER_TOKEN};
if(!credentials.GOOGLE_ADS_CLIENT_ID||!credentials.GOOGLE_ADS_CLIENT_SECRET||!credentials.GOOGLE_ADS_REFRESH_TOKEN)throw new Error('Existing Google credentials unavailable.');
const scope={subject:'local-read-only-diagnostic',grantRevision:0,accountPageId:'2de4fcc4-f701-808d-b48b-c507d8641ce3',clientId:'00000000-0000-4000-8000-000000000000',platform:'Google' as const,platformAccountId:'2315114913',connectionRevision:'diagnostic',providerRevision:'diagnostic',googleLoginCustomerId:'4114685827'};
try{
  const google=new Google(credentials,scope),reference=await google.referenceAssets();
  const plans=[];
  const searchTargets=reference.sources.find((s:any)=>s.ad.type==='RESPONSIVE_SEARCH_AD')?.campaign_targeting.map((v:any)=>v.campaignCriterion).filter((v:any)=>!v.negative)??[];
  const geoIds=searchTargets.filter((v:any)=>v.type==='LOCATION').map((v:any)=>v.location.geoTargetConstant.split('/').at(-1));
  const languageIds=searchTargets.filter((v:any)=>v.type==='LANGUAGE').map((v:any)=>v.language.languageConstant.split('/').at(-1));
  const labels={locations:await google.query(`SELECT geo_target_constant.id,geo_target_constant.name,geo_target_constant.canonical_name,geo_target_constant.target_type FROM geo_target_constant WHERE geo_target_constant.id IN (${geoIds.join(',')})`),languages:await google.query(`SELECT language_constant.id,language_constant.name FROM language_constant WHERE language_constant.id IN (${languageIds.join(',')})`)};
  console.log(JSON.stringify({verified_search_targeting:labels}));
  for(const source of reference.sources){
    const isSearch=source.ad.type==='RESPONSIVE_SEARCH_AD',type=isSearch?'search':'demand_gen';
    const targets=!isSearch&&process.argv.includes('--reuse-search-targeting')?searchTargets:source.campaign_targeting.map((v:any)=>v.campaignCriterion).filter((v:any)=>!v.negative);
    const locations=targets.filter((v:any)=>v.type==='LOCATION').map((v:any)=>v.location.geoTargetConstant);
    const languages=targets.filter((v:any)=>v.type==='LANGUAGE').map((v:any)=>v.language.languageConstant);
    const fields={name:`DigitalBee Acceptance — ${isSearch?'Search':'Demand Gen'} — 20260928`,campaign_type:type,currency:'MYR',timezone:'Asia/Kuala_Lumpur',daily_budget:'10',final_url:source.ad.final_urls[0],locations,languages,ad_group_name:`Acceptance ${isSearch?'Search':'Demand Gen'}`,headlines:source.ad.headlines,descriptions:source.ad.descriptions,
      ...(isSearch?{keywords:source.keywords.filter((v:any)=>v.matchType==='EXACT').map((v:any)=>v.text)}:{business_name:source.ad.business_name,landscape_images:source.ad.landscape_images,square_images:source.ad.square_images,logos:source.ad.logos,audience:source.targeting.find((v:any)=>v.adGroupCriterion.type==='AUDIENCE')?.adGroupCriterion.audience.audience})};
    const demandBudget=process.argv.find(value=>value.startsWith('--demand-budget='))?.split('=')[1];
    if(!isSearch&&demandBudget)fields.daily_budget=demandBudget;
    const parsed=planSchema.safeParse(fields);
    if(!parsed.success){console.log(JSON.stringify({type,outcome:'missing_inputs',issues:parsed.error.issues.map(i=>({field:i.path.join('.'),message:i.message}))}));continue}
    plans.push(parsed.data);
    if(process.argv.includes('--validate')){
      try{await google.validate(parsed.data,crypto.randomUUID());console.log(JSON.stringify({type,daily_budget:parsed.data.daily_budget,outcome:'validateOnly_passed',provider_action:false,source_campaign:source.campaign.id}));}
      catch(error){console.log(JSON.stringify({type,daily_budget:parsed.data.daily_budget,outcome:'validation_failed',code:error instanceof Error?error.message:'unavailable',provider_action:false}));}
    }
  }
  const dir=new URL('../evidence/private/',import.meta.url);await mkdir(dir,{recursive:true});
  await writeFile(new URL('reference-preflight.json',dir),JSON.stringify({captured_at:new Date().toISOString(),connected_acceptance:false,reference,plans},null,2));
  console.log(JSON.stringify({account:reference.account,sources:reference.sources.map((s:any)=>({campaign:s.campaign.id,ad:s.ad.id,type:s.ad.type,final_url:s.ad.final_urls[0]})),plans:plans.length,provider_action:false}));
}
catch(error){console.error(error instanceof Error?error.message:'Read-only preflight unavailable.');process.exitCode=1;}
