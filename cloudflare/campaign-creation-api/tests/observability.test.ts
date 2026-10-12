import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {EventMessage} from 'posthog-node';
const sdk=vi.hoisted(()=>({capture:vi.fn(),shutdown:vi.fn(),create:vi.fn()}));
vi.mock('posthog-node/edge',()=>({PostHog:class {constructor(...args:unknown[]){sdk.create(...args);}captureException=sdk.capture;shutdown=sdk.shutdown;}}));
import {captureUnexpected,expectedError,filterEvent,markExpected,observeWorker,releaseFor,posthogConfiguration} from '../src/observability';
const env={POSTHOG_PROJECT_TOKEN:'phc_test',POSTHOG_HOST:'https://us.i.posthog.com',POSTHOG_ENVIRONMENT:'production',POSTHOG_RELEASE:'digitalbee-mcp@abcdef1',ERROR_MONITORING_ENABLED:'true',ERROR_MONITOR:{getByName:()=>({fetch:async()=>new Response('{}')})}};
const receipt='11111111-1111-4111-8111-111111111111';
const ctx=()=>({waitUntil:vi.fn()});
beforeEach(()=>{vi.resetAllMocks();sdk.shutdown.mockResolvedValue(undefined);});
describe('privacy',()=>{
 it('rebuilds exceptions, rejecting arbitrary data while keeping source map coordinates',()=>{
  const secret='SENSITIVE_SENTINEL';
  const event={event:'$exception',distinctId:secret,groups:{account:secret},properties:{operation:'campaign.operation',error_category:'TypeError',correlation_id:receipt,receipt_id:receipt,user:secret,$current_url:secret,$set:{email:secret},$release_id:receipt,$exception_list:[{value:secret,stacktrace:{frames:[{filename:secret,vars:{token:secret}},{filename:'index.js',lineno:50,colno:3,function:secret,context_line:secret,chunk_id:receipt}]}}]}} as EventMessage;
  const filtered=filterEvent(event,'digitalbee-mcp','production',env.POSTHOG_RELEASE);
  expect(JSON.stringify(filtered)).not.toContain(secret);expect(filtered?.properties?.$process_person_profile).toBe(false);
  expect(filtered?.properties?.$exception_list[0].stacktrace.frames).toEqual([{platform:'node:javascript',filename:'index.js',lineno:50,colno:3,in_app:true,chunk_id:receipt}]);
  expect(filterEvent({...event,event:'$pageview'},'m04','production','m04@abcdef1')).toBeNull();
 });
 it('drops expected denials and marked malformed client JSON',()=>{
  class Denied extends Error{};class ZodError extends Error{};class ProviderError extends Error{outcome='rejected';}
  for(const e of [new Denied(),new ZodError(),new Error('access_denied'),new Error('invalid_request'),new Error('provider_creation_disabled'),new Error('stale_revision'),new ProviderError()])expect(expectedError(e)).toBe(true);
  const input=new SyntaxError('invalid JSON');markExpected(input);expect(expectedError(input)).toBe(true);expect(expectedError(new SyntaxError('storage corruption'))).toBe(false);
 });
 it('validates region, token, service release and environment',()=>{
  expect(posthogConfiguration(env,'digitalbee-mcp').enabled).toBe(true);
  for(const change of [{POSTHOG_HOST:'https://private.test'},{POSTHOG_PROJECT_TOKEN:'invalid'},{POSTHOG_ENVIRONMENT:'employee'},{POSTHOG_RELEASE:'m04@abcdef1'}])expect(posthogConfiguration({...env,...change},'digitalbee-mcp').enabled).toBe(false);
  expect(releaseFor({CF_VERSION_METADATA:{id:receipt}},'m04')).toBe('m04@'+receipt);
 });
});
describe('invocation isolation',()=>{
 it('gives the SDK a sanitized copy and deduplicates caught then rethrown errors',async()=>{
  const error=new TypeError('PRIVATE_SENTINEL');error.stack='TypeError: PRIVATE_SENTINEL\n    at PRIVATE_SENTINEL (index.js:50:3)\n    at secret (/private/path.ts:1:1)';
  const handler=vi.fn(async(..._args:unknown[])=>{captureUnexpected(error,'campaign.create',{receiptId:receipt});throw error;});
  await expect(observeWorker('digitalbee-mcp',{fetch:handler}).fetch({},env,ctx())).rejects.toBe(error);
  expect(handler).toHaveBeenCalledTimes(1);expect(sdk.capture).toHaveBeenCalledTimes(1);expect(sdk.capture.mock.calls[0]?.[0]).not.toBe(error);
  expect(sdk.capture.mock.calls[0]?.[0].stack).not.toContain('PRIVATE_SENTINEL');expect(sdk.capture.mock.calls[0]?.[0].stack).toContain('index.js:50:3');
 });
 it.each(['fetch','queue','scheduled'] as const)('preserves %s results through setup, capture and flush failures',async name=>{
  const handler=vi.fn(async(..._args:unknown[])=>{captureUnexpected(new Error('private'),'http.fetch');return 42;});
  const worker=observeWorker('digitalbee-mcp',{[name]:handler});
  sdk.create.mockImplementationOnce(()=>{throw new Error('setup');});expect(await worker[name]?.({},env,ctx())).toBe(42);expect(handler).toHaveBeenCalledTimes(1);
  handler.mockClear();sdk.capture.mockImplementationOnce(()=>{throw new Error('capture');});sdk.shutdown.mockRejectedValueOnce(new Error('flush'));
  expect(await worker[name]?.({},env,{waitUntil(){throw new Error('ctx');}})).toBe(42);expect(handler).toHaveBeenCalledTimes(1);
 });
 it('bypasses SDK without configuration and never captures outside an invocation',async()=>{
  const handler=vi.fn(async(..._args:unknown[])=>42);expect(await observeWorker('m04',{fetch:handler}).fetch({}, {},ctx())).toBe(42);
  captureUnexpected(new Error('private'),'http.fetch');expect(sdk.create).not.toHaveBeenCalled();expect(sdk.capture).not.toHaveBeenCalled();
 });
 it('flushes after invocation-owned background work without changing its waitUntil promise',async()=>{
  let unblock:()=>void=()=>{};const gate=new Promise<void>(r=>{unblock=r;});const scheduled:Promise<unknown>[]=[];let original:Promise<unknown>;
  const worker=observeWorker('digitalbee-mcp',{async fetch(...args:unknown[]){original=gate.then(()=>{captureUnexpected(new Error('private'),'telemetry.write');});(args[2] as {waitUntil:(p:Promise<unknown>)=>void}).waitUntil(original);return 42;}});
  expect(await worker.fetch({},env,{waitUntil(p:Promise<unknown>){scheduled.push(p);}})).toBe(42);expect(sdk.shutdown).not.toHaveBeenCalled();expect(scheduled[0]).toBe(original!);
  unblock();await Promise.all(scheduled);expect(sdk.capture).toHaveBeenCalledTimes(1);expect(sdk.shutdown).toHaveBeenCalledTimes(1);
 });
 it('isolates overlapping invocations, including their flushes',async()=>{
  let unblock:()=>void=()=>{};const pending=new Promise<void>(r=>{unblock=r;});
  const worker=observeWorker('digitalbee-mcp',{async fetch(which:unknown,..._args:unknown[]){if(which===1)await pending;captureUnexpected(new Error('private'),'campaign.readback',{receiptId:which===1?receipt:undefined});return which;}});
  const first=worker.fetch(1,env,ctx());expect(await worker.fetch(2,env,ctx())).toBe(2);unblock();expect(await first).toBe(1);
  expect(sdk.create).toHaveBeenCalledTimes(2);expect(sdk.shutdown).toHaveBeenCalledTimes(2);expect(sdk.capture.mock.calls.map(c=>c[2].receipt_id)).toEqual([undefined,receipt]);
 });
});
