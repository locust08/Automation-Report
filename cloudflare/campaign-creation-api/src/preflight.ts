/** Safe evidence only: provider messages and arbitrary exception text never escape. */
export type PreflightStage='authorization_before'|'scope_revision'|'provider_readiness'|'authorization_after';
export class AuthorityError extends Error{
  constructor(readonly diagnostic:{stage:string;category:string;correlation_id:string}){super('access_denied');}
}
export function preflightObservation(stage:PreflightStage,error:unknown,correlationId=crypto.randomUUID()){
  const category=error instanceof Error&&['AbortError','TimeoutError','TypeError','RangeError'].includes(error.name)?error.name:
    error instanceof Error&&['access_denied','stale_revision','provider_creation_disabled','response_limit','invalid_request'].includes(error.message)?error.message:'unavailable';
  return {stage,category,correlation_id:correlationId,timestamp:Date.now(),provider_action:false,...(error instanceof AuthorityError?{authority:error.diagnostic}:{})};
}
