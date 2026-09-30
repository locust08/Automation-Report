import {expect,it} from 'vitest';
import {SignJWT} from 'jose';
import {authenticate,authorize} from '../src/auth';
import {digest,metaPlanSchema} from '../src/contracts';
it('limits enabled TikTok creation to the exact Falcon pilot while retaining mapped reads',async()=>{
 const env={M04_TIKTOK_CREATION_ENABLED:'true',M04_TIKTOK_PILOT_ACCOUNT:'7647057541075271700',M04_TIKTOK_PILOT_SERVICE:'3e44fcc4-f701-8034-b219-c996dbdedbe6',M04_PILOT_SUBJECT:'ava',DIGITALBEE_GRANT_VERIFY_URL:'https://digitalbee.test/v1/internal/grants/verify',DIGITALBEE_GRANT_VERIFY_TOKEN:'t'.repeat(32)} as any;
 const scope={platform:'TikTok',subject:'ava',accountPageId:env.M04_TIKTOK_PILOT_SERVICE,platformAccountId:env.M04_TIKTOK_PILOT_ACCOUNT} as any;
 const fetcher=async(_input:RequestInfo|URL,init?:RequestInit)=>Response.json({allowed:true,...JSON.parse(String(init?.body))});
 await expect(authorize(env,scope,'campaign_gate1_create',fetcher)).resolves.toBeUndefined();
 for(const changed of [{subject:'other'},{accountPageId:'other'},{platformAccountId:'123'}])for(const tool of ['campaign_gate1_create','campaign_action_prepare_gate1'])await expect(authorize(env,{...scope,...changed},tool,fetcher)).rejects.toThrow('provider_creation_disabled');
 await expect(authorize(env,{...scope,subject:'other'},'campaign_templates_list',fetcher)).resolves.toBeUndefined();
});

it('authenticates mapped non-pilot readiness with provider creation off',async()=>{
 const scope={subject:'another-employee',grantRevision:4,accountPageId:'12345678-1234-4234-8234-123456789abc',clientId:'12345678-1234-4234-8234-123456789def',platform:'Meta',platformAccountId:'1234567890123456',connectionRevision:'r1',providerRevision:'p1'};
 const env={M04_ENABLED:'true',M04_CONNECTION_REVISION:'r1',M04_META_CREATION_ENABLED:'false',M04_SERVICE_TOKEN:'t'.repeat(32),M04_DELEGATION_KEY:'k'.repeat(32)} as any;
 const tool='campaign_templates_list',input={service_id:scope.accountPageId},requestHash=await digest({tool,scope,input});
 const proof=await new SignJWT({...scope,action:tool,requestHash}).setProtectedHeader({alg:'HS256'}).setIssuer('digitalbee').setAudience('https://m04.test').setSubject(scope.subject).setIssuedAt().setExpirationTime('30s').setJti(crypto.randomUUID()).sign(new TextEncoder().encode(env.M04_DELEGATION_KEY));
 const request=new Request('https://m04.test/v1/mcp/campaign-creation/templates',{headers:{Authorization:`Bearer ${env.M04_SERVICE_TOKEN}`,'X-DigitalBee-Delegation':proof,'X-Connection-Revision':'r1'}});
 expect(await authenticate(request,env,tool,input,requestHash)).toEqual(scope);
});
it('blocks Meta dispatch independently of readiness authentication',async()=>{
 const env={M04_META_CREATION_ENABLED:'false',DIGITALBEE_GRANT_VERIFY_URL:'https://digitalbee.test/v1/internal/grants/verify',DIGITALBEE_GRANT_VERIFY_TOKEN:'t'.repeat(32)} as any;
 const scope={platform:'Meta'} as any;
 await expect(authorize(env,scope,'campaign_gate1_create',async(_input,init)=>Response.json({allowed:true,...JSON.parse(String(init?.body))}))).rejects.toThrow('provider_creation_disabled');
});
it('accepts account-native currency and timezone in a Meta draft',()=>{
 expect(metaPlanSchema.safeParse({campaign_type:'meta_existing_ad',name:'USD plan',currency:'USD',timezone:'America/New_York',daily_budget:'4.13',source_ad_id:'1',source_campaign_id:'2',source_adset_id:'3',source_fingerprint:'a'.repeat(43)}).success).toBe(true);
});

it('blocks TikTok dispatch while allowing signed read-only readiness with creation off',async()=>{
 const env={M04_TIKTOK_CREATION_ENABLED:'false',DIGITALBEE_GRANT_VERIFY_URL:'https://digitalbee.test/v1/internal/grants/verify',DIGITALBEE_GRANT_VERIFY_TOKEN:'t'.repeat(32)} as any;
 await expect(authorize(env,{platform:'TikTok'} as any,'campaign_gate1_create',async(_input,init)=>Response.json({allowed:true,...JSON.parse(String(init?.body))}))).rejects.toThrow('provider_creation_disabled');
});
