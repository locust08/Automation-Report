import {authenticate} from './auth';
import {boundedJson, endpoints, result} from './contracts';
import {inputs} from './inputs';
import {execute,processReservedCreation,sweepCreationOutbox,type Environment} from './service';
import {ProviderError} from './google';

export default {
  async fetch(request: Request, env: Environment): Promise<Response> {
    const url = new URL(request.url), prefix = '/v1/mcp/campaign-creation/';
    const endpoint = url.pathname.startsWith(prefix) ? endpoints[url.pathname.slice(prefix.length)] : undefined;
    if (!endpoint) return new Response('Not found', {status: 404});
    if (request.method !== endpoint.method) return new Response(null, {status: 405, headers: {Allow: endpoint.method}});
    try {
      const body = endpoint.method === 'POST' ? await boundedJson(request, 32768) :
        {request_hash: url.searchParams.get('request_hash'), input: JSON.parse(url.searchParams.get('input') ?? '')};
      if (typeof body.request_hash !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.request_hash) ||
        new TextEncoder().encode(JSON.stringify(body.input)).length > 32768) throw new Error('invalid_request');
      const scope = await authenticate(request, env, endpoint.tool, body.input, body.request_hash);
      const input = inputs[endpoint.tool].parse(body.input) as Record<string, unknown>;
      let output;
      try { output = await execute(env, scope, endpoint.tool, input, body.request_hash); }
      catch (error) {
        const diagnostic=error instanceof ProviderError?error.code:error instanceof Error&&['TimeoutError','AbortError','TypeError','RangeError'].includes(error.name)?error.name:error instanceof Error&&['invalid_request','response_limit','access_denied'].includes(error.message)?error.message:'request_failed';
        console.warn(JSON.stringify({event:'m04_backend_failure',tool:endpoint.tool,category:diagnostic}));
        if (error instanceof Error && error.message === 'access_denied') throw error;
        output = result(error instanceof Error && ['conflict', 'stale_revision', 'idempotency_conflict'].includes(error.message) ? 'conflict' : 'unavailable',
          {caveats: ['Request could not be completed. Refresh the draft or reconcile its creation receipt.'],data:{service_error:error instanceof ProviderError?error.code:'request_failed'}});
      }
      return Response.json({version: 'm18-m04-v1', scope: {...scope, allowed: true}, request_hash: body.request_hash, result: output},
        {headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
    } catch {
      console.warn(JSON.stringify({event:'m04_backend_failure',tool:endpoint.tool,category:'authentication_or_input'}));
      return Response.json({error: 'access_denied_or_invalid_request'}, {status: 403, headers: {'Cache-Control': 'no-store'}});
    }
  },
  async queue(batch:MessageBatch<{operationId:string}>,env:Environment):Promise<void>{
    for(const message of batch.messages){
      if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(message.body?.operationId??'')){message.ack();continue;}
      await processReservedCreation(env,message.body.operationId);
      message.ack();
    }
  },
  async scheduled(_event:ScheduledEvent,env:Environment):Promise<void>{await sweepCreationOutbox(env);},
};
