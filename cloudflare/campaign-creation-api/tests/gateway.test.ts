import {afterEach,expect,it,vi} from 'vitest';
import {SignJWT} from 'jose';
import {build} from 'esbuild';
import worker from '../src/index';
import {authenticate,authorize} from '../src/auth';
import {digest,type Scope} from '../src/contracts';
import type {Environment} from '../src/service';
import {database} from './db';
const scope:Scope={subject:'actor',grantRevision:1,accountPageId:'2de4fcc4-f701-808d-b48b-c507d8641ce3',platform:'Google',platformAccountId:'2315114913',connectionRevision:'test',clientId:'00000000-0000-4000-8000-000000000001',providerRevision:'test',googleLoginCustomerId:'4114685827'};
const config={M04_ENABLED:'true',M04_CONNECTION_REVISION:'test',M04_PILOT_ACCOUNT:scope.platformAccountId,M04_PILOT_SERVICE:scope.accountPageId,M04_PILOT_SUBJECT:scope.subject,M04_SERVICE_TOKEN:'t'.repeat(32),M04_DELEGATION_KEY:'k'.repeat(32),DIGITALBEE_GRANT_VERIFY_URL:'https://digitalbee.test/v1/internal/grants/verify',DIGITALBEE_GRANT_VERIFY_TOKEN:'v'.repeat(32),GOOGLE_ADS_CLIENT_ID:'synthetic',GOOGLE_ADS_CLIENT_SECRET:'synthetic',GOOGLE_ADS_REFRESH_TOKEN:'synthetic'};
afterEach(()=>vi.unstubAllGlobals());
it('uses the bound permission authority and rejects a revoked grant without public fallback',async()=>{
  const bound=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    expect(String(input)).toBe(config.DIGITALBEE_GRANT_VERIFY_URL);
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${config.DIGITALBEE_GRANT_VERIFY_TOKEN}`);
    return Response.json({allowed:false,...JSON.parse(String(init?.body))});
  });
  const publicFetch=vi.fn();vi.stubGlobal('fetch',publicFetch);
  await expect(authorize({...config,DIGITALBEE_AUTHORITY:{fetch:bound} as unknown as Fetcher},scope,'campaign_templates_list')).rejects.toThrow('access_denied');
  expect(bound).toHaveBeenCalledTimes(1);expect(publicFetch).not.toHaveBeenCalled();
});
it('verifies the facade serialization order without accepting altered scope or body',async()=>{
  const tool='campaign_workflow_get',input={service_id:scope.accountPageId,workflow_id:crypto.randomUUID()},requestHash=await digest({tool,scope,input});
  const proof=await new SignJWT({...scope,action:tool,requestHash}).setProtectedHeader({alg:'HS256'}).setIssuer('digitalbee').setAudience('https://m04.test').setSubject(scope.subject).setIssuedAt().setExpirationTime('30s').setJti(crypto.randomUUID()).sign(new TextEncoder().encode(config.M04_DELEGATION_KEY));
  const request=new Request('https://m04.test/v1/mcp/campaign-creation/workflows/status',{headers:{Authorization:`Bearer ${config.M04_SERVICE_TOKEN}`,'X-DigitalBee-Delegation':proof,'X-Connection-Revision':'test'}});
  expect(await authenticate(request,config,tool,input,requestHash)).toEqual(scope);
  await expect(authenticate(request,config,tool,{...input,workflow_id:crypto.randomUUID()},requestHash)).rejects.toThrow();
});
it('requires an independent exact Meta pilot gate for a signed Meta scope',async()=>{
  const meta:Scope={...scope,platform:'Meta',platformAccountId:'321606578570386',accountPageId:'2de4fcc4-f701-80ad-aab2-c4ae709c7f9e',googleLoginCustomerId:undefined};
  const tool='campaign_workflow_get',input={service_id:meta.accountPageId,workflow_id:crypto.randomUUID()},requestHash=await digest({tool,scope:meta,input});
  const proof=await new SignJWT({...meta,action:tool,requestHash}).setProtectedHeader({alg:'HS256'}).setIssuer('digitalbee').setAudience('https://m04.test').setSubject(meta.subject).setIssuedAt().setExpirationTime('30s').setJti(crypto.randomUUID()).sign(new TextEncoder().encode(config.M04_DELEGATION_KEY));
  const request=new Request('https://m04.test/v1/mcp/campaign-creation/workflows/status',{headers:{Authorization:`Bearer ${config.M04_SERVICE_TOKEN}`,'X-DigitalBee-Delegation':proof,'X-Connection-Revision':'test'}});
  const enabled={...config,M04_META_CREATION_ENABLED:'true',M04_META_PILOT_SERVICE:meta.accountPageId,M04_META_PILOT_ACCOUNT:meta.platformAccountId};
  expect(await authenticate(request,enabled,tool,input,requestHash)).toEqual(meta);
  await expect(authenticate(request,{...enabled,M04_META_CREATION_ENABLED:'false'},tool,input,requestHash)).rejects.toThrow('access_denied');
  await expect(authenticate(request,{...enabled,M04_META_PILOT_ACCOUNT:'321606578570387'},tool,input,requestHash)).rejects.toThrow('access_denied');
});
it.runIf(!!process.env.DIGITALBEE_M04_CLIENT)('runs the actual DigitalBee M04Client through the real authenticated backend',async()=>{
  const bundle=await build({entryPoints:[process.env.DIGITALBEE_M04_CLIENT!],bundle:true,write:false,format:'esm',platform:'node',target:'es2022'});
  const {M04Client}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  const fixture=await database(),env={...config,DB:fixture.db} as Environment;
  let checks=0;
  env.DIGITALBEE_AUTHORITY={fetch:async(input:RequestInfo|URL,init?:RequestInit)=>{
    expect(String(input)).toBe(config.DIGITALBEE_GRANT_VERIFY_URL);checks++;
    return Response.json({allowed:true,...JSON.parse(String(init?.body))});
  }} as unknown as Fetcher;
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(String(input));
    if(url.hostname==='oauth2.googleapis.com')return Response.json({access_token:'synthetic'});
    if(url.hostname==='googleads.googleapis.com'){
      const body=JSON.parse(String(init?.body));
      if(body.query?.includes('FROM customer'))return Response.json({results:[{customer:{id:scope.platformAccountId,currencyCode:'MYR',timeZone:'Asia/Kuala_Lumpur',manager:false}}]});
      if(body.query)return Response.json({results:[]});
      expect(body.validateOnly).toBe(true);expect(body.partialFailure).toBe(false);return Response.json({});
    }
    throw new Error('Unexpected destination');
  }));
  const client=new M04Client({baseUrl:'https://m04.test',serviceToken:config.M04_SERVICE_TOKEN,delegationKey:config.M04_DELEGATION_KEY,fetcher:(input:RequestInfo|URL,init?:RequestInit)=>worker.fetch(new Request(input,init),env)});
  try{
    const discovered=await client.call('campaign_templates_list',scope,{service_id:scope.accountPageId,limit:20});
    expect(discovered.outcome).toBe('success');expect(discovered.data.brief_schema).toBeTruthy();
    const saved=await client.call('campaign_draft_save',scope,{service_id:scope.accountPageId,idempotency_key:crypto.randomUUID(),source:{kind:'brief',fields:{name:'Synthetic Search',campaign_type:'search',currency:'MYR',timezone:'Asia/Kuala_Lumpur',daily_budget:'10',final_url:'https://example.com/',locations:['geoTargetConstants/2458'],languages:['languageConstants/1000'],ad_group_name:'Synthetic',keywords:['test'],headlines:['Test One','Test Two','Test Three'],descriptions:['Synthetic description one.','Synthetic description two.']}}});
    expect(saved.outcome).toBe('success');
    const edited=await client.call('campaign_draft_save',scope,{service_id:scope.accountPageId,workflow_id:saved.workflow_ref,revision_id:saved.revision_ref,idempotency_key:crypto.randomUUID(),source:{kind:'brief',fields:{...saved.data.plan,name:'Synthetic Search — Card Edit'}}});
    expect(edited.workflow_ref).toBe(saved.workflow_ref);expect(edited.revision_ref).not.toBe(saved.revision_ref);
    const read=await client.call('campaign_workflow_get',scope,{service_id:scope.accountPageId,workflow_id:saved.workflow_ref});
    expect(read).toMatchObject({revision_ref:edited.revision_ref,data:{plan:{name:'Synthetic Search — Card Edit'},revision_history:[{revision_id:saved.revision_ref},{revision_id:edited.revision_ref}]}});
    const revision={service_id:scope.accountPageId,workflow_id:saved.workflow_ref,revision_id:edited.revision_ref};
    const validated=await client.call('campaign_draft_validate',scope,{...revision,idempotency_key:crypto.randomUUID()});
    expect(validated.data.validate_only).toBe(true);
    const prepared=await client.call('campaign_action_prepare',scope,{...revision,idempotency_key:crypto.randomUUID(),action:'approve'});
    expect(prepared.confirmation.draft.account.service_id).toBe(scope.accountPageId);expect(prepared.challenge.token).toBeTruthy();expect(checks).toBeGreaterThanOrEqual(8);
  }finally{fixture.dispose();}
});
