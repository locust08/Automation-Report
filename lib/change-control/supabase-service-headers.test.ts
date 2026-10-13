import assert from "node:assert/strict";
import test from "node:test";
import { supabaseServiceHeaders } from "./supabase-service-headers";
import { withM03RuntimeEnvironment } from "./runtime-environment";
import { getM03McpOperator } from "./repository";
const jwt = (role: string) => [Buffer.from('{"alg":"HS256"}').toString('base64url'),Buffer.from(JSON.stringify({role})).toString('base64url'),'synthetic_signature'].join('.');
test("modern server secrets use apikey only; legacy service-role JWT uses both headers",async()=>{
 for(const key of ['sb_secret_fixture_only',jwt('service_role')]){
  const expected={apikey:key,...(key.startsWith('sb_secret_')?{}:{authorization:`Bearer ${key}`})};assert.deepEqual(supabaseServiceHeaders(key),expected);
  const old=globalThis.fetch;let called=0;globalThis.fetch=async(_input,init)=>{called++;const headers=new Headers(init?.headers);assert.equal(headers.get('apikey'),key);assert.equal(headers.get('authorization'),key.startsWith('sb_secret_')?null:`Bearer ${key}`);return Response.json([]);};
  try{await withM03RuntimeEnvironment({SUPABASE_URL:'https://gsmxeosdjsbujhiwhbzk.supabase.co',SUPABASE_SECRET_KEY:key},()=>getM03McpOperator('fixture'));assert.equal(called,1);}finally{globalThis.fetch=old;}
 }
});
test("publishable/anon/user/malformed credentials fail before transport",()=>{
 for(const key of ['sb_publishable_fixture',jwt('anon'),jwt('authenticated'),'unknown','eyJ.bad.signature','sb_secret_'])assert.throws(()=>supabaseServiceHeaders(key),/supabase_server_key_required/);
});
