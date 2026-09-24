import {WorkerEntrypoint} from 'cloudflare:workers';
import {authenticate,type AuthEnv} from './auth';
import {M03Service} from './m03/service';import {M03Repository} from './m03/repository';
import {M04Service} from './m04/service';import {M04Repository} from './m04/repository';

export type Env=AuthEnv;
export class M03DevEntrypoint extends WorkerEntrypoint<Env>{async call(bearer:string,input:unknown){const request=await authenticate(this.env,bearer,input);return new M03Service(new M03Repository(this.env.DB)).handle(request);}}
export class M04DevEntrypoint extends WorkerEntrypoint<Env>{async fetch(request:Request){const input=await request.json();const authenticated=await authenticate(this.env,request.headers.get('authorization')??undefined,input);return Response.json(await new M04Service(new M04Repository(this.env.DB)).handle(authenticated));}}
export default {fetch(){return new Response('Not found',{status:404});}};
