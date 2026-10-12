import {beforeEach,expect,it,vi} from 'vitest';
import type {Environment} from '../src/service';
const dependencies=vi.hoisted(()=>({capture:vi.fn(),authenticate:vi.fn(),execute:vi.fn(),process:vi.fn(),sweep:vi.fn()}));
vi.mock('../src/observability',async importOriginal=>{const original=await importOriginal<typeof import('../src/observability')>();return {...original,captureUnexpected:(error:unknown)=>{if(!original.expectedError(error))dependencies.capture(error);},observeWorker:(_service:unknown,handler:unknown)=>handler};});
vi.mock('../src/auth',()=>({authenticate:dependencies.authenticate}));
vi.mock('../src/service',()=>({execute:dependencies.execute,processReservedCreation:dependencies.process,sweepCreationOutbox:dependencies.sweep}));
import worker from '../src/index';
const env={} as Environment;
const request=()=>new Request('https://m04.test/v1/mcp/campaign-creation/templates?request_hash='+('a'.repeat(43))+'&input='+encodeURIComponent(JSON.stringify({service_id:'11111111-1111-4111-8111-111111111111',limit:20})));
beforeEach(()=>{vi.clearAllMocks();dependencies.authenticate.mockResolvedValue({});});
it('captures unexpected caught operation errors while preserving the safe response',async()=>{
  const error=new TypeError('sensitive raw content');dependencies.execute.mockRejectedValue(error);
  const response=await worker.fetch(request(),env);
  expect(response.status).toBe(200);expect((await response.json() as {result:{outcome:string}}).result.outcome).toBe('unavailable');
  expect(dependencies.capture).toHaveBeenCalledWith(error);expect(dependencies.execute).toHaveBeenCalledTimes(1);
});
it('leaves expected authentication and input denials without events',async()=>{
  dependencies.authenticate.mockRejectedValue(new Error('access_denied'));
  expect((await worker.fetch(request(),env)).status).toBe(403);
  expect((await worker.fetch(new Request('https://m04.test/v1/mcp/campaign-creation/templates?request_hash='+('a'.repeat(43))+'&input=bad-json'),env)).status).toBe(403);
  expect(dependencies.capture).not.toHaveBeenCalled();expect(dependencies.execute).not.toHaveBeenCalled();
});
it('captures queue failure without acknowledging or repeating processing',async()=>{
  const error=new Error('storage unavailable'),ack=vi.fn();dependencies.process.mockRejectedValue(error);
  const messages=[{body:{operationId:'11111111-1111-4111-8111-111111111111'},ack}];
  const batch={messages} as unknown as MessageBatch<{operationId:string}>;
  await expect(worker.queue(batch,env)).rejects.toBe(error);
  expect(ack).not.toHaveBeenCalled();expect(dependencies.process).toHaveBeenCalledTimes(1);expect(dependencies.capture).toHaveBeenCalledWith(error);
});
it('preserves scheduled failure and performs the sweep once',async()=>{
  const error=new Error('queue unavailable');dependencies.sweep.mockRejectedValue(error);
  await expect(worker.scheduled({} as ScheduledEvent,env)).rejects.toBe(error);
  expect(dependencies.sweep).toHaveBeenCalledTimes(1);
});
