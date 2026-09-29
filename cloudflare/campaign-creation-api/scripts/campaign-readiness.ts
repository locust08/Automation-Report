import {Meta} from '../src/meta';
import {TikTok} from '../src/tiktok';
import {ProviderError} from '../src/google';
import {campaignBlocker} from '../src/blockers';
const platform=process.argv[2];
if(platform!=='Meta'&&platform!=='TikTok')throw new Error('Choose Meta or TikTok.');
const scope={subject:'read-only-diagnostic',grantRevision:0,accountPageId:platform==='Meta'?'2de4fcc4-f701-80ad-aab2-c4ae709c7f9e':'3e44fcc4-f701-8034-b219-c996dbdedbe6',clientId:'00000000-0000-4000-8000-000000000000',platform,platformAccountId:platform==='Meta'?'321606578570386':'7647057541075271700',connectionRevision:'diagnostic',providerRevision:'diagnostic'};
try{
 const env={META_ACCESS_TOKEN:process.env.META_ACCESS_TOKEN,META_API_VERSION:process.env.META_API_VERSION??'v25.0',TIKTOK_ACCESS_TOKEN:process.env.TIKTOK_ACCESS_TOKEN,M04_TIKTOK_MIN_DAILY_BUDGET:process.env.M04_TIKTOK_MIN_DAILY_BUDGET,M04_TIKTOK_BUDGET_CURRENCY:process.env.M04_TIKTOK_BUDGET_CURRENCY};
 const refs=platform==='Meta'?await new Meta(env,scope).referenceAssets():await new TikTok(env,scope).referenceAssets();
 console.log(JSON.stringify({platform,account:refs.account,sources:refs.sources,provider_creation:false,captured_at:new Date().toISOString()}));
}catch(error){console.log(JSON.stringify({platform,provider_creation:false,blocker:campaignBlocker(error instanceof ProviderError?error.code:'request_failed')}));process.exitCode=1;}
