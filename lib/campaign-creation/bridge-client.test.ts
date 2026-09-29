import {test} from 'node:test';
import assert from 'node:assert/strict';
import {jwtVerify} from 'jose';
import {forwardCampaignCommand} from './bridge-client';

const subject='00000000-0000-4000-8000-000000000123',secret='s'.repeat(40);
const session={sub:subject,email:'ava@locus-t.com.my',role:'admin' as const,sessionBinding:'x'.repeat(43)};

test('forwards an exact signed command and preserves the canonical result',async()=>{
  const result={outcome:'success',workflow_ref:'one',revision_ref:'two',receipt_ref:'receipt',validation_issues:[],allowed_next_actions:[],evidence:[],correlation_id:crypto.randomUUID(),caveats:[],
    data:{status:'verified',readback:{status:'PAUSED',platform:'Meta',campaign_id:'100',adset_id:'101',ad_id:'102'}}};
  let calls=0;
  const fetcher=async(input:RequestInfo|URL,init?:RequestInit)=>{
    calls++;
    assert.equal(String(input),'https://digitalbee.test/v1/internal/campaign-creation');
    const body=String(init?.body),jwt=new Headers(init?.headers).get('Authorization')?.slice(7);
    assert.ok(jwt);
    const {payload}=await jwtVerify(jwt,new TextEncoder().encode(secret),{issuer:'ads-reporting',audience:String(input)});
    assert.equal(payload.sub,subject);assert.equal(payload.dashboard_user_id,subject);assert.equal(payload.session_binding,session.sessionBinding);
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body));
    assert.equal(payload.request_hash,Buffer.from(digest).toString('base64url'));
    return Response.json({result});
  };
  const response=await forwardCampaignCommand(session,{kind:'execute',tool:'campaign_workflows_list',input:{service_id:'2de4fcc4-f701-80ad-aab2-c4ae709c7f9e'}},
    {baseUrl:'https://digitalbee.test',secret,pilotUserId:subject},fetcher);
  assert.deepEqual(response,{result});assert.equal(calls,1);
});

test('refuses any dashboard identity outside the exact pilot',async()=>{
  let calls=0;
  await assert.rejects(()=>forwardCampaignCommand({...session,sub:crypto.randomUUID()},{kind:'execute',tool:'campaign_workflows_list',input:{}},
    {baseUrl:'https://digitalbee.test',secret,pilotUserId:subject},async()=>{calls++;return Response.json({});}));
  assert.equal(calls,0);
});
