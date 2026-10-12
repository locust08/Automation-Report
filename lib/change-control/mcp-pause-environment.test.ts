import test from "node:test";
import assert from "node:assert/strict";
import { m03PauseEnvironment } from "./mcp-pause-environment";
const env={M03_PAUSE_MCP_ENABLED:"true",M03_PAUSE_MCP_CREDENTIAL_SOURCE:"doppler",M03_PAUSE_MCP_SECRET_PROJECT:"fixture",M03_PAUSE_MCP_SECRET_CONFIG:"dev",DOPPLER_TOKEN:"synthetic-token",M03_PAUSE_MCP_SERVICE_TOKEN:"stale"};
test("loads only scoped server credentials without mutating the environment or accepting stale overrides",async()=>{
 const value=await m03PauseEnvironment(env,async(input,init)=>{const url=new URL(String(input));assert.equal(url.hostname,"api.doppler.com");assert.equal(url.searchParams.get("secrets"),"M03_PAUSE_MCP_SERVICE_TOKEN,M03_PAUSE_MCP_DELEGATION_KEY,DIGITALBEE_GRANT_VERIFY_TOKEN");assert.equal(init?.cache,"no-store");return Response.json({secrets:{M03_PAUSE_MCP_SERVICE_TOKEN:{computed:"s".repeat(40)},M03_PAUSE_MCP_DELEGATION_KEY:{raw:"k".repeat(40)},DIGITALBEE_GRANT_VERIFY_TOKEN:"g".repeat(40)}});});
 assert.equal(value.M03_PAUSE_MCP_SERVICE_TOKEN,"s".repeat(40));assert.equal(env.M03_PAUSE_MCP_SERVICE_TOKEN,"stale");
});
test("disabled configuration never fetches; unavailable or incomplete secret store fails closed",async()=>{
 let calls=0;await m03PauseEnvironment({...env,M03_PAUSE_MCP_ENABLED:"false"},async()=>{calls++;throw Error("unexpected");});assert.equal(calls,0);
 for(const fetcher of [async()=>new Response(null,{status:403}),async()=>Response.json({secrets:{}})])await assert.rejects(m03PauseEnvironment(env,fetcher));
 await assert.rejects(m03PauseEnvironment({...env,DOPPLER_TOKEN:undefined}));
});
