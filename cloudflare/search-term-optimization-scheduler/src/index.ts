type RunMessage={runId:string;scheduleId:string;googleCustomerId:string;accountName:string;startDate:string;endDate:string;scheduledFor:string};
type SchedulerEnv=Omit<Env,"OPTIMIZATION_QUEUE">&{OPTIMIZATION_QUEUE:Queue<RunMessage>;REPORT_AUTOMATION_SECRET:string;GITHUB_ACTIONS_TOKEN:string};

async function claim(env:SchedulerEnv){
  const response=await fetch(`${env.VERCEL_APP_BASE_URL.replace(/\/$/,"")}/api/optimization-scheduling/claim`,{method:"POST",headers:{Authorization:`Bearer ${env.REPORT_AUTOMATION_SECRET}`}});
  if(!response.ok)throw new Error(`Claim failed (${response.status})`);
  return response.json() as Promise<{runs:RunMessage[]}>;
}

async function callback(env:SchedulerEnv,body:Record<string,unknown>){
  const response=await fetch(`${env.VERCEL_APP_BASE_URL.replace(/\/$/,"")}/api/optimization-scheduling/callback`,{method:"POST",headers:{Authorization:`Bearer ${env.REPORT_AUTOMATION_SECRET}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!response.ok)throw new Error(`Callback failed (${response.status})`);
}

export default {
  async scheduled(_controller:ScheduledController,env:SchedulerEnv,ctx:ExecutionContext){
    ctx.waitUntil((async()=>{const {runs}=await claim(env);await Promise.all(runs.map(run=>env.OPTIMIZATION_QUEUE.send(run)));console.log(JSON.stringify({event:"optimization_schedules_claimed",count:runs.length}));})());
  },
  async queue(batch:MessageBatch<RunMessage>,env:SchedulerEnv){
    for(const message of batch.messages){
      const run=message.body;
      const response=await fetch(`https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/search-term-optimization.yml/dispatches`,{method:"POST",headers:{Authorization:`Bearer ${env.GITHUB_ACTIONS_TOKEN}`,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"search-term-optimization-scheduler","Content-Type":"application/json"},body:JSON.stringify({ref:env.GITHUB_WORKFLOW_REF||"main",inputs:{run_id:run.runId,account_id:run.googleCustomerId,start_date:run.startDate,end_date:run.endDate,callback_url:`${env.VERCEL_APP_BASE_URL.replace(/\/$/,"")}/api/optimization-scheduling/callback`}})});
      if(!response.ok){message.retry();throw new Error(`GitHub dispatch failed (${response.status})`);}
      await callback(env,{runId:run.runId,status:"dispatched",dispatchId:run.runId});
      message.ack();
    }
  },
} satisfies ExportedHandler<SchedulerEnv,RunMessage>;
