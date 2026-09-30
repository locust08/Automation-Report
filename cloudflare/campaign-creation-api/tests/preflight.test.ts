import {describe,it,expect} from 'vitest';
import {preflightObservation} from '../src/preflight';
describe('safe preflight observations',()=>{
  it.each(['authorization_before','scope_revision','provider_readiness','authorization_after'] as const)('retains %s without arbitrary messages',stage=>{
    const value=preflightObservation(stage,new Error('synthetic-token SECRET arbitrary provider text'));
    expect(value).toMatchObject({stage,category:'unavailable',provider_action:false});
    expect(value.correlation_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(value)).not.toMatch(/SECRET|synthetic-token|provider text/);
  });
  it('recognizes timeouts without inferring native rejection',()=>{
    expect(preflightObservation('authorization_before',new DOMException('SECRET','TimeoutError'))).toMatchObject({category:'TimeoutError',provider_action:false});
  });
});
