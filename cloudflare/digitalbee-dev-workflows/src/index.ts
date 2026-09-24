import {WorkerEntrypoint} from 'cloudflare:workers';
import {authenticate,type AuthEnv} from './auth';

export interface Env extends AuthEnv{}
export class M03DevEntrypoint extends WorkerEntrypoint<Env>{async call(bearer:string,input:unknown){const request=await authenticate(this.env,bearer,input);return {protocol:'digitalbee.m03-dev-draft.v1',subject:request.subject,action:request.action,provider_execution_locked:true,outcome:'foundation_ready'};}}
export class M04DevEntrypoint extends WorkerEntrypoint<Env>{async fetch(request:Request){const input=await request.json();const authenticated=await authenticate(this.env,request.headers.get('authorization')??undefined,input);return Response.json({protocol:'m18-m04-v1',subject:authenticated.subject,action:authenticated.action,provider_execution_locked:true,outcome:'foundation_ready'});}}
export default {fetch(){return new Response('Not found',{status:404});}};
