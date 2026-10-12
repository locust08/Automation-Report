export const MONITOR_PROJECT='503297';
export const MONITOR_OBJECT='posthog:503297';
export const MONITOR_SERVICES=['digitalbee-mcp','m04','digitalbee-gateway'] as const;
export type MonitorService=typeof MONITOR_SERVICES[number];
export interface ErrorMonitorBinding {getByName(name:string):{fetch(input:Request|string,init?:RequestInit):Promise<Response>};}
export interface MonitorEnv {ERROR_MONITOR?:ErrorMonitorBinding;POSTHOG_PROJECT_TOKEN?:string;POSTHOG_ADMIN_API_KEY?:string;ERROR_MONITORING_ENABLED?:string;ERROR_MONITORING_BILLING_VERIFIED_AT?:string;ERROR_PROBE_M04?:{test():Promise<{eventId?:string;release?:string}>};ERROR_PROBE_GATEWAY?:{test():Promise<{eventId?:string;release?:string}>};}
export interface MonitorIssue {id:string;service:MonitorService;operation:string;category:string;release:string;firstSeen:number;lastSeen:number;occurrences:number;suppressed:number;pending:number;status:'active'|'resolved';eventId:string|null;transport:string;sample:Record<string,unknown>;remoteId:string|null;}
export interface MonitorFilters {service?:string;operation?:string;status?:string;hours?:number;offset?:number;}
export function monitorStub(env:MonitorEnv){return env.ERROR_MONITOR?.getByName(MONITOR_OBJECT);}
export async function monitorCall<T>(env:MonitorEnv,path:string,body?:unknown):Promise<T>{
 const stub=monitorStub(env);if(!stub)throw Object.assign(new Error('Monitoring is not deployed'),{status:503});
 const response=await stub.fetch('https://error-monitor.internal'+path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
 if(!response.ok)throw Object.assign(new Error('Monitoring request unavailable'),{status:[400,404,409,429,503].includes(response.status)?response.status:502});
 return await response.json() as T;
}
