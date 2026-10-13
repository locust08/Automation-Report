import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {Miniflare,Response,convertV4MiniflareOptions} from 'miniflare';
import {SignJWT} from 'jose';
import {fileURLToPath} from 'node:url';

// Every outbound call terminates in this harness. No live credentials, DNS,
// Supabase writes or provider actions are available to the fixture.
const actor='00000000-0000-4000-8000-000000000001',requestId='00000000-0000-4000-8000-000000000002',revisionId='00000000-0000-4000-8000-000000000003',service='00000000-0000-4000-8000-000000000004';
const google=process.argv.includes('--google'),platform=google?'google':'meta',account=google?'2315114913':'456';
const item={id:'item',request_id:requestId,entity_type:'campaign',entity_identity:'123',field_path:'campaign.status',value_type:'string',baseline_value:'PAUSED',proposed_value:'PAUSED',evidence:{},platform_resource_mapping:{}};
const payload={platform,account_identity:account,campaign_identity:'123',items:[item]},canonical=JSON.stringify(payload),hash=createHash('sha256').update(canonical).digest('hex');
let status='awaiting_approval',operatorAllowed=true,grantAllowed=true,providerPosts=0,providerReads=0;
let approvals=[],receipts=[];
const calls=[];
const bindings={M03_WORKER_ENABLED:'true',M03_CANONICAL_ORIGIN:'https://m03.example',M03_PAUSE_MCP_ENABLED:'true',M03_PAUSE_MCP_SERVICE_TOKEN:'s'.repeat(40),M03_PAUSE_MCP_DELEGATION_KEY:'d'.repeat(40),M03_PAUSE_MCP_SUBJECT:'fixture',M03_PAUSE_MCP_ACTOR_ID:actor,M03_PAUSE_MCP_CONNECTION_REVISION:'fixture',M03_PAUSE_ENABLED:'approved-test-pilot',M03_PAUSE_ALLOWLIST:JSON.stringify([{actor_id:actor,platform,account_identity:account,campaign_identity:'123'}]),DIGITALBEE_GRANT_VERIFY_URL:'https://authority.example/v1/internal/grants/verify',DIGITALBEE_GRANT_VERIFY_TOKEN:'g'.repeat(40),SUPABASE_URL:'https://gsmxeosdjsbujhiwhbzk.supabase.co',SUPABASE_SECRET_KEY:'synthetic-key',META_ACCESS_TOKEN:'synthetic-provider-token',GOOGLE_OAUTH_CLIENT_ID:'synthetic-google-client',GOOGLE_OAUTH_CLIENT_SECRET:'synthetic-google-secret',GOOGLE_OAUTH_REFRESH_TOKEN:'synthetic-google-refresh',GOOGLE_ADS_DEVELOPER_TOKEN:'synthetic-developer-token',NOTION_TOKEN:'synthetic-notion-token',NOTION_AD_ACCOUNTS_DATABASE_ID:service};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
if(process.argv.includes('--doppler'))Object.assign(bindings,{M03_PAUSE_MCP_CREDENTIAL_SOURCE:'doppler',M03_PAUSE_MCP_SECRET_PROJECT:'synthetic-project',M03_PAUSE_MCP_SECRET_CONFIG:'synthetic-production',M03_PAUSE_MCP_DOPPLER_TOKEN:'synthetic-scoped-token'});
const outbound=async request=>{
 const url=new URL(request.url);
 if(url.origin==='https://api.doppler.com'){
  assert.equal(request.headers.get('Authorization'),'Bearer synthetic-scoped-token');
  const names=url.searchParams.get('secrets').split(',');assert(!names.includes('SUPABASE_SECRET_KEY'));assert(!names.includes('META_ACCESS_TOKEN'));
  const secrets=Object.fromEntries(names.filter(name=>bindings[name]).map(name=>[name,{computed:bindings[name]}]));return json({secrets});
 }
 if(url.origin==='https://oauth2.googleapis.com'){assert.equal(request.headers.get('developer-token'),null);return json({access_token:'synthetic-access',expires_in:3600});}
 if(url.origin==='https://api.notion.com'){if(request.method==='GET')return json({data_sources:[{id:service}]});return json({results:[{id:service,properties:{ID:{type:'rich_text',rich_text:[{plain_text:account}]},Platform:{type:'select',select:{name:'Google'}},'Access Path':{type:'rich_text',rich_text:[{plain_text:'Personal'}]}}}],has_more:false});}
 if(url.origin==='https://googleads.googleapis.com'){assert.equal(request.headers.get('developer-token'),'synthetic-developer-token');assert.equal(request.headers.get('login-customer-id'),null);const data=await request.json();const resource='customers/'+account+'/campaigns/123';if(url.pathname.endsWith(':mutate')){assert.deepEqual(data.operations,[{update:{resourceName:resource,status:'PAUSED'},updateMask:'status'}]);providerPosts++;return json({results:[{resourceName:resource}]});}providerReads++;return json({results:[{campaign:{id:'123',resourceName:resource,status:'PAUSED'}}]});}
 const body=request.method==='POST'?await request.json():null;
 calls.push({origin:url.origin,path:url.pathname,method:request.method});
 if(url.origin==='https://graph.facebook.com'){
  // Meta mutation bodies are form-encoded, handled by a separate branch below.
  assert.equal(request.method,'GET');providerReads++;return json({id:'123',account_id:'456',status:'PAUSED'});
 }
 assert.equal(url.origin,'https://gsmxeosdjsbujhiwhbzk.supabase.co');assert.equal(request.headers.get('apikey'),'synthetic-key');
 const name=url.pathname.split('/').at(-1);
 if(name==='ads_reporting_auth')return json([{user_id:actor,email:'fixture@example.test',full_name:'Fixture',role:'admin',is_active:true}]);
 if(name==='m03_ads_assert_operator_v1'){assert.equal(body.p_trusted_ip,'203.0.113.8');return json(operatorAllowed?{}:{message:'access_denied'},operatorAllowed?200:403);}
 if(name==='m03_ads_revision_integrity_receipt_v1')return json({revision_id:revisionId,payload_hash:hash,canonical_text:canonical});
 if(name==='m03_ads_approve_exact_pause_v1'){assert.equal(body.p_revision_hash,hash);assert.equal(body.p_revision_id,revisionId);approvals=[{revision_id:revisionId,revision_hash:hash}];status='approved';return json({});}
 if(name==='m03_ads_claim_execution_operation_v1'){
  assert.equal(body.p_revision_hash,hash);const op=JSON.parse(body.p_operation_json);
  if(receipts.length)return json({acquired:false,receipt:receipts[0]});
  receipts=[{operation_key:op.operation_key,operation_hash:body.p_operation_hash,claim_token:'synthetic-claim',state:'started',updated_at:new Date().toISOString()}];return json({acquired:true,receipt:receipts[0]});
 }
 if(name==='m03_ads_record_execution_receipt_v1'){assert.equal(body.p_claim_token,'synthetic-claim');receipts[0].state=body.p_readback_json?'verified':'succeeded';return json({});}
 if(name==='m03_ads_reconcile_pause_receipt_v1'){receipts[0].state='verified';return json({});}
 if(name==='m03_ads_finalize_pause_v1'){status='verified';return json({});}
 if(name.startsWith('m03_ads_record_'))return json({});
 if(name==='m03_ads_change_requests')return json([{id:requestId,platform,account_identity:account,campaign_identity:'123',status}]);
 if(name==='m03_ads_change_items')return json([item]);
 if(name==='m03_ads_change_request_revisions')return json([{id:revisionId,request_id:requestId,payload_hash:hash,canonical_payload:payload}]);
 if(name==='m03_ads_request_source_verifications')return json([{platform,provider_account_identity:account,provider_campaign_identity:'123'}]);
 if(name==='m03_ads_change_approvals')return json(approvals);
 if(name==='m03_ads_execution_operations')return json(receipts);
 assert(request.method==='GET',`Unexpected local RPC ${name}`);return json([]);
};
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:fileURLToPath(new URL('../artifact/index.js',import.meta.url)),compatibilityDate:'2026-10-13',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],bindings,
 serviceBindings:{DIGITALBEE_AUTHORITY:async request=>{assert.equal(request.url,bindings.DIGITALBEE_GRANT_VERIFY_URL);const g=await request.json();assert.equal(g.networkContext,undefined);return json({...g,allowed:grantAllowed,email:'fixture@example.test'});}},
 outboundService:async request=>{if(new URL(request.url).origin==='https://graph.facebook.com'&&request.method==='POST'){assert.equal((await request.text()),'status=PAUSED');providerPosts++;return json({success:true});}return outbound(request);}}));
async function call(action,confirmationToken,patch={}){
 const raw=JSON.stringify({action,service_id:service,campaign_id:'123',request_id:requestId,idempotency_key:randomUUID(),...(confirmationToken?{confirmation_token:confirmationToken}:{})});
 const scope={subject:'fixture',grantRevision:1,accountPageId:service,clientId:service,platform:google?'Google':'Meta',platformAccountId:account,campaignIdentity:'123',connectionRevision:'fixture',action:`m03_pause:${action}`,requestHash:createHash('sha256').update(raw).digest('base64url'),sessionBinding:'a'.repeat(43),networkContext:{source:'cloudflare-ingress',ip:'203.0.113.8'},...patch};
 const proof=await new SignJWT(scope).setProtectedHeader({alg:'HS256'}).setIssuer('digitalbee').setAudience('https://m03.example').setSubject('fixture').setIssuedAt().setExpirationTime('30s').setJti(randomUUID()).sign(new TextEncoder().encode(bindings.M03_PAUSE_MCP_DELEGATION_KEY));
 const response=await mf.dispatchFetch('https://binding.invalid/api/service/digitalbee/m03-pause',{method:'POST',headers:{Authorization:`Bearer ${bindings.M03_PAUSE_MCP_SERVICE_TOKEN}`,'X-DigitalBee-Delegation':proof,'X-Connection-Revision':'fixture','cf-connecting-ip':'127.0.0.1','x-vercel-id':'spoof'},body:raw});return response.json();
}
try{
 const initial=await call('read'); if(initial.outcome!=='success')console.log(JSON.stringify({initial,calls})); assert.equal(initial.outcome,'success');
 const before=providerReads;assert.equal((await call('read',undefined,{networkContext:undefined})).outcome,'blocked');assert.equal(providerReads,before);
 operatorAllowed=false;assert.equal((await call('read')).outcome,'blocked');assert.equal(providerReads,before);operatorAllowed=true;
 grantAllowed=false;assert.equal((await call('read')).outcome,'blocked');assert.equal(providerReads,before);grantAllowed=true;
 const approve=await call('prepare_approve');assert.equal(approve.outcome,'prepared');assert.equal(approve.display.revision_hash,hash);assert.equal(providerPosts,0);
 assert.equal((await call('approve',approve.confirmation_token)).outcome,'success');
 const pause=await call('prepare_pause');assert.equal(pause.outcome,'prepared');assert.equal(providerPosts,0);
 assert.equal((await call('pause',pause.confirmation_token)).outcome,'success');assert.equal(providerPosts,1);
 await call('pause',pause.confirmation_token);assert.equal(providerPosts,1);
 const final=await call('read');assert.equal(final.display.status,'verified');assert.equal(final.receipts[0].state,'verified');assert.equal(providerPosts,1);
 console.log(JSON.stringify({runtime:'workerd',platform,result:'PASS',canonicalAudience:true,signedNetwork:true,operatorAndGrantDenials:true,separateConfirmations:true,supabaseContract:true,syntheticProviderPosts:providerPosts,noReplay:true,liveCalls:0,outboundFixtureCalls:calls.length}));
}finally{await mf.dispose();}
