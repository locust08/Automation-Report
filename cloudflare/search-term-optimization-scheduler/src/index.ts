type RunMessage={runId:string;scheduleId:string;googleCustomerId:string;accountName:string;startDate:string;endDate:string;scheduledFor:string;scheduled?:boolean};
type SchedulerEnv=Omit<Env,"OPTIMIZATION_QUEUE">&{OPTIMIZATION_QUEUE:Queue<RunMessage>;WORKER_API_SECRET:string;GITHUB_ACTIONS_TOKEN:string;VERCEL_APP_BASE_URL:string};

function requireWorkerConfiguration(env:SchedulerEnv){
  if(!env.VERCEL_APP_BASE_URL?.startsWith("https://"))throw new Error("VERCEL_APP_BASE_URL is not configured");
  if(!env.WORKER_API_SECRET)throw new Error("WORKER_API_SECRET is not configured");
}

async function claim(env:SchedulerEnv){
  requireWorkerConfiguration(env);
  const response=await fetch(`${env.VERCEL_APP_BASE_URL.replace(/\/$/,"")}/api/optimization-scheduling/claim`,{method:"POST",headers:{Authorization:`Bearer ${env.WORKER_API_SECRET}`}});
  if(!response.ok)throw new Error(`Claim failed (${response.status})`);
  return response.json() as Promise<{runs:RunMessage[]}>;
}

async function callback(env:SchedulerEnv,body:Record<string,unknown>){
  requireWorkerConfiguration(env);
  const response=await fetch(`${env.VERCEL_APP_BASE_URL.replace(/\/$/,"")}/api/search-term-optimization/worker-callback`,{method:"POST",headers:{Authorization:`Bearer ${env.WORKER_API_SECRET}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!response.ok)throw new Error(`Callback failed (${response.status})`);
}

export default {
  async fetch(request:Request,env:SchedulerEnv){
    if(!await authorized(request,env.WORKER_API_SECRET))return json({error:"Unauthorized"},401);const url=new URL(request.url);
    if(request.method==="POST"&&url.pathname==="/search-term-analysis/jobs"){const body=await request.json<RunMessage>();if(!body.runId||!/^[0-9]{10}$/.test(body.googleCustomerId))return json({error:"Invalid analysis job"},400);await env.OPTIMIZATION_QUEUE.send(body);return json({queued:true},202);}
    const inputMatch=url.pathname.match(/^\/search-term-analysis\/jobs\/([-\w]+)\/input\/(\d{1,3})$/);
    if(inputMatch){const run=String(Number(inputMatch[2])).padStart(3,"0");const key=`search-term-jobs/${inputMatch[1]}/input/${run}.json`;return r2ObjectResponse(request,env,key);}
    const manifestMatch=url.pathname.match(/^\/search-term-analysis\/jobs\/([-\w]+)\/manifest$/);
    if(manifestMatch)return r2ObjectResponse(request,env,`search-term-jobs/${manifestMatch[1]}/manifest.json`);
    const match=url.pathname.match(/^\/search-term-analysis\/snapshots\/([-\w]+)$/);if(match){const key=`search-term-snapshots/${match[1]}.json`;return r2ObjectResponse(request,env,key);}
    return json({error:"Not found"},404);
  },
  async scheduled(_controller:ScheduledController,env:SchedulerEnv,ctx:ExecutionContext){
    ctx.waitUntil((async()=>{const {runs}=await claim(env);await Promise.all(runs.map(run=>env.OPTIMIZATION_QUEUE.send({...run,scheduled:true})));await deleteExpiredSnapshots(env);console.log(JSON.stringify({event:"optimization_schedules_claimed",count:runs.length}));})());
  },
  async queue(batch:MessageBatch<RunMessage>,env:SchedulerEnv){
    requireWorkerConfiguration(env);
    if(!env.GITHUB_ACTIONS_TOKEN)throw new Error("GITHUB_ACTIONS_TOKEN is not configured");
    for(const message of batch.messages){
      const run=message.body;
      const response=await fetch(`https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/search-term-optimization.yml/dispatches`,{method:"POST",headers:{Authorization:`Bearer ${env.GITHUB_ACTIONS_TOKEN}`,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"search-term-optimization-scheduler","Content-Type":"application/json"},body:JSON.stringify({ref:env.GITHUB_WORKFLOW_REF||"main",inputs:{run_id:run.runId,account_id:run.googleCustomerId,start_date:run.startDate,end_date:run.endDate,callback_url:`${env.VERCEL_APP_BASE_URL.replace(/\/$/,"")}/api/search-term-optimization/worker-callback`,scheduled:String(Boolean(run.scheduled))}})});
      if(!response.ok){message.retry();throw new Error(`GitHub dispatch failed (${response.status})`);}
      await callback(env,{runId:run.runId,status:"dispatched",dispatchId:run.runId,scheduled:Boolean(run.scheduled)});
      message.ack();
    }
  },
} satisfies ExportedHandler<SchedulerEnv,RunMessage>;

async function deleteExpiredSnapshots(env:SchedulerEnv){let cursor:string|undefined;do{const page=await env.SEARCH_TERM_SNAPSHOTS.list({cursor});const expired=page.objects.filter(object=>Date.parse(object.customMetadata?.expiresAt??"")<=Date.now()).map(object=>object.key);if(expired.length)await env.SEARCH_TERM_SNAPSHOTS.delete(expired);cursor=page.truncated?page.cursor:undefined;}while(cursor);}
async function r2ObjectResponse(request:Request,env:SchedulerEnv,key:string){
  if(request.method==="PUT"){const expiresAt=new Date(Date.now()+86400000).toISOString();await env.SEARCH_TERM_SNAPSHOTS.put(key,request.body,{httpMetadata:{contentType:"application/json"},customMetadata:{expiresAt}});return json({stored:true,key,expiresAt},201);}
  if(request.method==="GET"){const object=await env.SEARCH_TERM_SNAPSHOTS.get(key);return object?new Response(object.body,{headers:{"content-type":"application/json","x-r2-object-key":key,"x-expires-at":object.customMetadata?.expiresAt??""}}):json({error:"Batch input not found",key},404);}
  if(request.method==="DELETE"){await env.SEARCH_TERM_SNAPSHOTS.delete(key);return json({deleted:true,key});}
  return json({error:"Method not allowed"},405);
}
async function authorized(request:Request,secret:string){const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")??"";const encoder=new TextEncoder();const[left,right]=await Promise.all([crypto.subtle.digest("SHA-256",encoder.encode(token)),crypto.subtle.digest("SHA-256",encoder.encode(secret))]);const a=new Uint8Array(left),b=new Uint8Array(right);let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];return difference===0&&token.length===secret.length;}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});}
