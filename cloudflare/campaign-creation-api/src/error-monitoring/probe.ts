import {WorkerEntrypoint} from 'cloudflare:workers';
import {observeWorker,captureUnexpected,releaseFor,type ObservabilityEnv} from '../observability';
export class ErrorProbeEntrypoint extends WorkerEntrypoint<ObservabilityEnv>{async test(){const worker=observeWorker('m04',{async fetch(){return {eventId:captureUnexpected(new Error('Synthetic diagnostic'),'diagnostic.synthetic'),release:releaseFor(thisEnv,'m04')};}});const thisEnv=this.env;return Reflect.apply(worker.fetch,worker,[undefined,this.env,this.ctx]);}}
