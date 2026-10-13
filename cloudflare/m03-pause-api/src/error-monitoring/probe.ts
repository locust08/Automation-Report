import {WorkerEntrypoint} from 'cloudflare:workers';
import {observeWorker,captureUnexpected,releaseFor,type ObservabilityEnv} from '../observability';
export class ErrorProbeEntrypoint extends WorkerEntrypoint<ObservabilityEnv>{
 async test(){const env=this.env;const worker=observeWorker('m03',{async fetch(){return {eventId:captureUnexpected(new Error('Synthetic diagnostic'),'diagnostic.synthetic'),release:releaseFor(env,'m03')};}});return Reflect.apply(worker.fetch,worker,[undefined,env,this.ctx]);}
}
