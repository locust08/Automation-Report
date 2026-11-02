import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Miniflare, Response, convertV4MiniflareOptions} from 'miniflare';

// Actual packaged entrypoint; every outbound request terminates in this fixture.
// No employee session, live credential, provider or production database is used.
const sentinel='PRIVATE_RUNTIME_SENTINEL_12345678901234567890';
const bindings={M03_WORKER_ENABLED:'true',M03_CANONICAL_ORIGIN:'https://m03.example',M03_PAUSE_MCP_ENABLED:'true',M03_PAUSE_MCP_CREDENTIAL_SOURCE:'doppler',M03_PAUSE_MCP_SECRET_PROJECT:'fixture',M03_PAUSE_MCP_SECRET_CONFIG:'prd',M03_PAUSE_MCP_DOPPLER_TOKEN:sentinel};
const scenarios=[
 {status:401,body:sentinel,reason:'authentication'},
 {status:403,body:sentinel,reason:'permission'},
 {status:429,body:sentinel,reason:'upstream_http'},
 {status:503,body:sentinel,reason:'upstream_http'},
 {status:302,body:sentinel,reason:'upstream_http'},
 {status:200,body:sentinel,reason:'response_json'},
 {status:200,body:'null',reason:'response_shape'},
 {status:200,body:'x'.repeat(65537),reason:'response_size'},
 {status:200,body:'{"secrets":{}}',reason:'required_record_missing'},
 {status:200,body:'{"secrets":{"M03_PAUSE_MCP_SERVICE_TOKEN":{"computed":"short"}}}',reason:'required_record_malformed'},
];
let scenario=scenarios[0],calls=0,authorityCalls=0;
const logs=[];
const mf=new Miniflare(convertV4MiniflareOptions({
 modules:true,scriptPath:fileURLToPath(new URL('../artifact/index.js',import.meta.url)),
 compatibilityDate:'2026-10-13',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],bindings,
 handleStructuredLogs:entry=>logs.push(entry.message),
 serviceBindings:{DIGITALBEE_AUTHORITY:async()=>{authorityCalls++;throw Error('unexpected authority call');}},
 outboundService:async request=>{
  calls++;assert.equal(new URL(request.url).origin,'https://api.doppler.com');
  assert.equal(request.headers.get('authorization'),'Bearer '+sentinel);
  return new Response(scenario.body,{status:scenario.status,headers:{Location:'https://untrusted.example/'}});
 },
}));
try{
 for(const current of scenarios){
  scenario=current;const previousCalls=calls,previousLogs=logs.length;
  const response=await mf.dispatchFetch('https://binding.invalid/api/service/digitalbee/m03-pause',{method:'POST',body:sentinel});
  assert.equal(response.status,503);const body=await response.json();
  assert.deepEqual(Object.keys(body).sort(),['correlation_id','outcome']);assert.equal(body.outcome,'locked');
  assert.equal(calls-previousCalls,1);assert.equal(authorityCalls,0);
  // Structured runtime logs may be delivered immediately after the response.
  for(let attempt=0;attempt<20&&!logs.slice(previousLogs).some(row=>row.includes(body.correlation_id));attempt++)await new Promise(resolve=>setTimeout(resolve,10));
  const row=logs.slice(previousLogs).find(value=>value.includes(body.correlation_id));assert(row,'response must correlate to its protected diagnostic');
  const diagnostic=JSON.parse(row);assert.equal(diagnostic.reason,current.reason);assert.equal(diagnostic.http_status,current.status);
  assert.doesNotMatch(JSON.stringify({body,logs}),new RegExp(sentinel));
 }
 console.log(JSON.stringify({runtime:'workerd',result:'PASS',bootstrapCases:scenarios.length,correlationAndPrivacy:true,credentialCalls:calls,authorityCalls,providerCalls:0,databaseCalls:0,liveCalls:0}));
}finally{await mf.dispose();}
