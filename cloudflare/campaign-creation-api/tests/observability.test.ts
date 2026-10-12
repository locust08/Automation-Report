import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {ErrorEvent} from '@sentry/cloudflare';
const sdk=vi.hoisted(()=>({enabled:true,capture:vi.fn(),wrap:vi.fn((_options:unknown,handler:object)=>handler)}));
vi.mock('@sentry/cloudflare',()=>({isEnabled:()=>sdk.enabled,captureException:sdk.capture,withScope:(fn:(scope:{setTags:ReturnType<typeof vi.fn>})=>void)=>fn({setTags:vi.fn()}),getIsolationScope:()=>({setTag:vi.fn()}),withSentry:sdk.wrap}));
import {captureUnexpected,expectedError,filterEvent,markExpected,observeWorker,releaseFor,sentryOptions} from '../src/observability';
const env={SENTRY_DSN:'https://'+'a'.repeat(32)+'@o1.ingest.de.sentry.io/123',SENTRY_ENVIRONMENT:'production',SENTRY_RELEASE:'digitalbee-mcp@abcdef1'};
const receipt='11111111-1111-4111-8111-111111111111';
beforeEach(()=>{sdk.enabled=true;sdk.capture.mockReset();sdk.wrap.mockReset().mockImplementation((_options,handler)=>handler);});
describe('strict privacy policy',()=>{
  it('rebuilds the event without request, identity, account, OAuth, ad content, causes, source context or arbitrary fields',()=>{
    const secret='SENSITIVE_SENTINEL';
    const event={type:undefined,event_id:'a'.repeat(32),request:{url:'https://test/?code='+secret,headers:{Cookie:secret,Authorization:secret},data:secret},user:{email:secret},extra:{body:secret,account:secret},contexts:{advertising:{creative:secret}},breadcrumbs:[{message:secret}],message:secret,tags:{operation:'campaign.operation',correlation_id:receipt,receipt_id:receipt,employee:secret},exception:{values:[{type:secret,value:secret,stacktrace:{frames:[{filename:secret,vars:{token:secret}},{filename:'index.js',lineno:50,colno:3,function:secret,context_line:secret,vars:{token:secret}}]}}]},debug_meta:{images:[{type:'sourcemap',code_file:secret,debug_id:secret}]}} as ErrorEvent;
    const filtered=filterEvent(event,{originalException:new TypeError(secret)},'digitalbee-mcp','production',env.SENTRY_RELEASE);
    expect(JSON.stringify(filtered)).not.toContain(secret);
    expect(filtered?.tags).toEqual({service:'digitalbee-mcp',operation:'campaign.operation',error_category:'TypeError',correlation_id:receipt,receipt_id:receipt});
    expect(filtered?.exception?.values?.[0]?.stacktrace?.frames).toEqual([{filename:'index.js',lineno:50,colno:3,in_app:true}]);
  });
  it('drops expected denials, validation failures, disabled capabilities and provider validation rejections',()=>{
    class Denied extends Error{};class ZodError extends Error{};class ProviderError extends Error{outcome='rejected';}
    for(const error of [new Denied(),new ZodError(),new Error('access_denied'),new Error('invalid_request'),new Error('provider_creation_disabled'),new Error('stale_revision'),new ProviderError()]){
      expect(expectedError(error)).toBe(true);captureUnexpected(error,'campaign.operation');
      expect(filterEvent({type:undefined},{originalException:error},'m04','production','m04@abcdef1')).toBeNull();
    }
    expect(sdk.capture).not.toHaveBeenCalled();
  });
  it('disables all automatic collection, integrations, breadcrumbs, logs, metrics and tracing',()=>{
    const options=sentryOptions(env,'digitalbee-mcp');
    expect(options.enabled).toBe(true);expect(options.defaultIntegrations).toEqual([]);expect(options.integrations).toEqual([]);
    expect(options.maxBreadcrumbs).toBe(0);expect(options.beforeBreadcrumb?.({},{})).toBeNull();
    expect(options.dataCollection).toMatchObject({userInfo:false,cookies:false,httpHeaders:false,httpBodies:[],urlQueryParams:false,queues:false,stackFrameVariables:false,frameContextLines:0});
    expect(options.tracesSampleRate).toBeUndefined();expect(options.tracesSampler).toBeUndefined();expect(options.tracePropagationTargets).toEqual([]);
    expect(options.beforeSendLog).toBeDefined();expect(options.beforeSendMetric).toBeDefined();expect(options.sendClientReports).toBe(false);expect(options.cacheClient).toBe(false);
  });
  it('only retains UUID references and trusted service release/environment',()=>{
    const filtered=filterEvent({type:undefined,tags:{operation:'employee_name',correlation_id:'employee_name',receipt_id:'account123'}},{},'m04','production','m04@abcdef1');
    expect(filtered?.tags).toEqual({service:'m04',operation:'http.fetch',error_category:'unexpected_error'});
    expect(releaseFor({CF_VERSION_METADATA:{id:receipt}},'m04')).toBe('m04@'+receipt);
    expect(releaseFor({SENTRY_RELEASE:'m04@'+receipt},'m04')).toBe('m04@'+receipt);
    expect(sentryOptions({...env,SENTRY_DSN:'invalid'},'digitalbee-mcp').enabled).toBe(false);
    expect(sentryOptions({...env,SENTRY_ENVIRONMENT:'employee_name'},'digitalbee-mcp').enabled).toBe(false);
    expect(sentryOptions({...env,SENTRY_RELEASE:'m04@abcdef1'},'digitalbee-mcp').enabled).toBe(false);
  });
  it('distinguishes malformed client JSON from unexpected internal JSON corruption',()=>{
    const invalidInput=new SyntaxError('invalid JSON');markExpected(invalidInput);
    expect(expectedError(invalidInput)).toBe(true);
    expect(expectedError(new SyntaxError('stored JSON corruption'))).toBe(false);
    class GatewayError extends Error{outcome='insufficient_scope';}
    expect(expectedError(new GatewayError('missing grants'))).toBe(true);
  });
});
describe('non-interference',()=>{
  it('bypasses Sentry without configuration',async()=>{
    const fetch=vi.fn(async(..._args:unknown[])=>new Response('unchanged',{status:202}));
    const worker=observeWorker('digitalbee-mcp',{fetch});
    expect((await worker.fetch({}, {}, {})).status).toBe(202);expect(fetch).toHaveBeenCalledTimes(1);expect(sdk.wrap).not.toHaveBeenCalled();
  });
  it.each(['fetch','queue','scheduled'] as const)('preserves %s results if SDK setup or post-handler instrumentation fails',async name=>{
    const handler=vi.fn(async(..._args:unknown[])=>42);
    const worker=observeWorker('digitalbee-mcp',{[name]:handler});
    sdk.wrap.mockImplementationOnce(()=>{throw new Error('SDK initialization failed');});
    expect(await worker[name]?.({},env,{})).toBe(42);expect(handler).toHaveBeenCalledTimes(1);
    handler.mockClear();sdk.wrap.mockImplementationOnce((_options,original)=>({[name]:async(...args:unknown[])=>{await (original as Record<string,Function>)[name]!(...args);throw new Error('SDK after-handler failed');}}));
    expect(await worker[name]?.({},env,{})).toBe(42);expect(handler).toHaveBeenCalledTimes(1);
  });
  it('preserves queue rejection and never repeats a dispatched mutation on SDK failure',async()=>{
    const error=new Error('original failure'),queue=vi.fn(async(..._args:unknown[])=>{throw error;});
    sdk.wrap.mockImplementationOnce((_options,original)=>({queue:async(...args:unknown[])=>{try{await (original as {queue:Function}).queue(...args);}catch{throw new Error('SDK failure');}}}));
    const worker=observeWorker('digitalbee-mcp',{queue});
    await expect(worker.queue({},env,{})).rejects.toBe(error);expect(queue).toHaveBeenCalledTimes(1);
  });
  it('swallows capture failures and skips capture when disabled',()=>{
    sdk.capture.mockImplementationOnce(()=>{throw new Error('SDK unavailable');});
    expect(()=>captureUnexpected(new Error('failure'),'campaign.create',{receiptId:receipt})).not.toThrow();
    sdk.enabled=false;captureUnexpected(new Error('failure'),'campaign.create');expect(sdk.capture).toHaveBeenCalledTimes(1);
  });
});
