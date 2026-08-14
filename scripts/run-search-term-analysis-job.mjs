import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const [jobId, accountId, startDate, endDate] = process.argv.slice(2);
if (!jobId || !/^[-\w]+$/.test(jobId) || !/^\d{10}$/.test(accountId ?? "")) process.exit(2);

const root=process.cwd(),jobsDir=path.join(root,"tmp","search-term-analysis-jobs");
const statusPath=path.join(jobsDir,`${jobId}.json`),logPath=path.join(jobsDir,`${jobId}.log`);
const manifestPath=path.join(jobsDir,`${jobId}.manifest.json`),inputDir=path.join(jobsDir,jobId,"input");
const localObjectDir=path.join(jobsDir,"local-object-storage",jobId);
const startedAt=new Date().toISOString();
const supabaseUrl=process.env.SUPABASE_URL?.replace(/\/$/,"");
const supabaseKey=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET;
const workerUrl=process.env.SEARCH_TERM_ANALYSIS_WORKER_URL?.replace(/\/$/,"");
const workerSecret=process.env.WORKER_API_SECRET;
const maxRunMs=Number(process.env.SEARCH_TERM_ANALYSIS_TIMEOUT_MS||20*60*1000);
const maxBatches=Math.min(10,Math.max(1,Number(process.env.SEARCH_TERM_ANALYSIS_MAX_BATCHES||10)));
const batchSize=250;
const runnerEnv={...process.env,GOOGLE_OAUTH_CLIENT_ID:process.env.GOOGLE_OAUTH_CLIENT_ID||process.env.GOOGLE_ADS_CLIENT_ID||"",GOOGLE_OAUTH_CLIENT_SECRET:process.env.GOOGLE_OAUTH_CLIENT_SECRET||process.env.GOOGLE_ADS_CLIENT_SECRET||"",GOOGLE_OAUTH_REFRESH_TOKEN:process.env.GOOGLE_OAUTH_REFRESH_TOKEN||process.env.GOOGLE_ADS_REFRESH_TOKEN||""};
let status={},writeQueue=Promise.resolve(),stopped=false,activeChild=null;

function headers(extra={}){return {apikey:supabaseKey,Authorization:`Bearer ${supabaseKey}`,"Content-Type":"application/json",...extra};}
async function rest(resource,options={}){if(!supabaseUrl||!supabaseKey)throw new Error("Supabase service credentials are required");const response=await fetch(`${supabaseUrl}/rest/v1/${resource}`,{...options,headers:headers(options.headers)});if(!response.ok)throw new Error(`Supabase ${response.status}: ${await response.text()}`);const text=await response.text();return text?JSON.parse(text):null;}
async function durableJob(values){await rest(`ad_automation_search_term_analysis_jobs?id=eq.${encodeURIComponent(jobId)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({...values,last_worker_ping_at:new Date().toISOString(),updated_at:new Date().toISOString()})});}
async function writeStatusNow(values){status={...status,...values,updatedAt:new Date().toISOString()};await fs.mkdir(jobsDir,{recursive:true});const temporary=`${statusPath}.${process.pid}.tmp`;await fs.writeFile(temporary,JSON.stringify({jobId,accountId,startedAt,...status},null,2));await fs.rename(temporary,statusPath);await durableJob({status:status.status||"running",stage:status.stage||"Running",total_terms:Number(status.totalTerms||0),planned_runs:Number(status.plannedRuns||0),current_run:Number(status.currentBatch||0),completed_runs:Number(status.completedBatches||0),terms_processed:Number(status.termsProcessed||0),error:status.error||null,started_at:startedAt,completed_at:status.finishedAt||null});}
function writeStatus(values){writeQueue=writeQueue.then(()=>writeStatusNow(values));return writeQueue;}
function run(command,args,output){return new Promise(resolve=>{const child=spawn(command,args,{cwd:root,env:runnerEnv,windowsHide:true,stdio:["ignore",output.fd,output.fd],shell:command==="npx"&&process.platform==="win32"});activeChild=child;child.once("error",()=>resolve(1));child.once("exit",code=>{activeChild=null;resolve(code??1);});});}
async function r2(runNumber,method,body){
  const suffix=runNumber==null?"manifest":`input/${runNumber}`;
  if(workerUrl&&workerSecret)return fetch(`${workerUrl}/search-term-analysis/jobs/${jobId}/${suffix}`,{method,headers:{Authorization:`Bearer ${workerSecret}`,"Content-Type":"application/json"},body});
  const file=runNumber==null?path.join(localObjectDir,"manifest.json"):path.join(localObjectDir,"input",`${String(runNumber).padStart(3,"0")}.json`);
  if(method==="PUT"){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,body);return new Response(JSON.stringify({stored:true,key:file,local:true}),{status:201,headers:{"content-type":"application/json"}});}
  if(method==="GET"){const payload=await fs.readFile(file).catch(()=>null);return payload?new Response(payload,{status:200,headers:{"content-type":"application/json"}}):new Response(JSON.stringify({error:"Batch input not found"}),{status:404,headers:{"content-type":"application/json"}});}
  if(method==="DELETE"){await fs.unlink(file).catch(()=>undefined);return new Response(JSON.stringify({deleted:true,local:true}),{status:200,headers:{"content-type":"application/json"}});}
  return new Response(JSON.stringify({error:"Method not allowed"}),{status:405,headers:{"content-type":"application/json"}});
}
function stableKey(row){return `${row.campaignId??""}|${row.adGroupId??""}|${String(row.searchTerm??"").trim().toLowerCase().replace(/\s+/g," ")}`;}

async function restoreOrPrepare(output){
  await fs.mkdir(inputDir,{recursive:true});
  let manifest=null;
  const restored=await r2(null,"GET").catch(()=>null);
  if(restored?.ok){manifest=await restored.json();for(const batch of manifest.batches){const response=await r2(batch.runNumber,"GET");if(!response.ok)continue;const local=path.join(inputDir,`${String(batch.runNumber).padStart(3,"0")}.json`);await fs.writeFile(local,await response.text());batch.file=local;}}
  if(manifest)return manifest;
  await writeStatus({status:"fetching",stage:"Retrieving and splitting Google search terms into 250-term batches"});
  const args=["run","--project",path.join(root,"lib","search-term-optimization","python"),"--group","ads","--group","ads-agent","python",path.join(root,"scripts","order-search-term-candidates.py"),accountId,manifestPath,"--batch-dir",inputDir,"--batch-size",String(batchSize)];
  if(startDate)args.push("--start-date",startDate);if(endDate)args.push("--end-date",endDate);
  if(await run("uv",args,output)!==0){const diagnostic=await fs.readFile(logPath,"utf8").catch(()=>"");if(diagnostic.includes("USER_PERMISSION_DENIED"))throw new Error(`Google Ads access denied for account ${accountId}. Its configured manager account does not have permission.`);throw new Error("Google Ads search-term retrieval failed");}
  manifest=JSON.parse(await fs.readFile(manifestPath,"utf8"));manifest.batches=manifest.batches.slice(0,maxBatches);manifest.totalTerms=manifest.batches.reduce((sum,b)=>sum+b.termCount,0);manifest.expiresAt=new Date(Date.now()+86400000).toISOString();
  for(const batch of manifest.batches){const payload=await fs.readFile(batch.file);const response=await r2(batch.runNumber,"PUT",payload);if(!response.ok)throw new Error(`Could not store input for run ${batch.runNumber}`);batch.r2Key=`search-term-jobs/${jobId}/input/${String(batch.runNumber).padStart(3,"0")}.json`;batch.file=path.join(inputDir,`${String(batch.runNumber).padStart(3,"0")}.json`);}
  const manifestResponse=await r2(null,"PUT",JSON.stringify({...manifest,batches:manifest.batches.map(batch=>({runNumber:batch.runNumber,termCount:batch.termCount,checksum:batch.checksum,r2Key:batch.r2Key}))}));if(!manifestResponse.ok)throw new Error("Could not store job manifest");
  for(const batch of manifest.batches)await rest("ad_automation_search_term_analysis_batches?on_conflict=job_id,run_number",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({job_id:jobId,run_number:batch.runNumber,term_offset:(batch.runNumber-1)*batchSize,term_count:batch.termCount,status:"queued",input_r2_key:batch.r2Key,input_checksum:batch.checksum,input_expires_at:manifest.expiresAt,updated_at:new Date().toISOString()})});
  const malaysiaDate=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  if(manifest.totalTerms>0)await rest(`ad_automation_search_term_daily_slots?malaysia_run_date=eq.${malaysiaDate}&google_customer_id=eq.${accountId}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"used",used_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
  else{
    const slots=await rest(`ad_automation_search_term_daily_slots?malaysia_run_date=eq.${malaysiaDate}&google_customer_id=eq.${accountId}&select=source`);
    if(slots?.[0]?.source==="scheduled")await rest(`ad_automation_search_term_daily_slots?malaysia_run_date=eq.${malaysiaDate}&google_customer_id=eq.${accountId}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"reserved",fulfillment_source:null,claimed_at:null,used_at:null,updated_at:new Date().toISOString()})});
    else await rest(`ad_automation_search_term_daily_slots?malaysia_run_date=eq.${malaysiaDate}&google_customer_id=eq.${accountId}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});
  }
  return manifest;
}

async function cancellationRequested(){const rows=await rest(`ad_automation_search_term_analysis_jobs?id=eq.${jobId}&select=cancellation_requested`);return Boolean(rows?.[0]?.cancellation_requested);}
async function patchBatch(id,values){await rest(`ad_automation_search_term_analysis_batches?id=eq.${id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({...values,last_worker_ping_at:new Date().toISOString(),updated_at:new Date().toISOString()})});}
async function analyzeBatch(batch,record,output,completed,total){
  let local=batch.file;
  try{await fs.access(local);}catch{const response=await r2(batch.runNumber,"GET");if(!response.ok)throw new Error(`Run ${batch.runNumber} input expired and requires a new retrieval`);await fs.writeFile(local,await response.text());}
  for(let attempt=Math.max(1,Number(record.attempt_count||0)+1);attempt<=3;attempt++){
    await patchBatch(record.id,{status:attempt===1?"running":"retrying",attempt_count:attempt,started_at:record.started_at||new Date().toISOString(),error:null});
    await writeStatus({status:"running",stage:`Run ${batch.runNumber} of ${total} · analyzing ${batch.termCount} terms`,currentBatch:batch.runNumber,completedBatches:completed,currentBatchSize:batch.termCount});
    const batchOutputDir=path.join(jobsDir,jobId,"output",String(batch.runNumber).padStart(3,"0"));await fs.mkdir(batchOutputDir,{recursive:true});
    const before=Date.now(),args=["run","--project",path.join(root,"lib","search-term-optimization","python"),"--group","ads","--group","ads-agent","python",path.join(root,".agents","skills","google-ads-search-term-review-agent","scripts","run_search_term_review.py"),accountId,"--out-dir",batchOutputDir,"--tmp-dir",batchOutputDir,"--job-status-path",statusPath,"--snapshot-file",local,"--max-new-terms",String(batchSize)];
    if(startDate)args.push("--start-date",startDate);if(endDate)args.push("--end-date",endDate);
    let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;activeChild?.kill();},maxRunMs);const code=await run("uv",args,output);clearTimeout(timeout);
    if(code!==0){if(attempt<3){await writeStatus({stage:`Run ${batch.runNumber} failed; retrying (${attempt} of 3)`});continue;}await patchBatch(record.id,{status:"needs_retry",error:timedOut?"Analysis timed out":"Analysis failed after three attempts"});throw new Error(`Run ${batch.runNumber} needs retry`);}
    const files=await fs.readdir(batchOutputDir);const planFile=(await Promise.all(files.filter(name=>name.endsWith(".json")).map(async name=>{const file=path.join(batchOutputDir,name),stat=await fs.stat(file);return{file,mtime:stat.mtimeMs};}))).filter(item=>item.mtime>=before).sort((a,b)=>b.mtime-a.mtime)[0]?.file;if(!planFile)throw new Error(`Run ${batch.runNumber} returned no isolated review output`);
    const plan=JSON.parse(await fs.readFile(planFile,"utf8")),rows=Array.isArray(plan.allRows)?plan.allRows:[];
    const input=JSON.parse(await fs.readFile(local,"utf8")),allowed=new Set((input.pull?.rows??[]).map(row=>`${row.campaign_id??""}|${row.ad_group_id??""}|${String(row.search_term??"").trim().toLowerCase().replace(/\s+/g," ")}`));
    const normalized=rows.map(row=>({...row,stableTermKey:stableKey(row)}));
    if(normalized.length!==batch.termCount||normalized.some(row=>!allowed.has(row.stableTermKey)))throw new Error(`Run ${batch.runNumber} output did not match its ${batch.termCount}-term input`);
    const commitResultPath=path.join(jobsDir,`${jobId}.commit-${batch.runNumber}.json`);
    const commitCode=await run("npx",["tsx",path.join(root,"scripts","commit-search-term-analysis-batch.mts"),jobId,record.id,accountId,String(batch.termCount),batch.checksum||"",commitResultPath,planFile],output);
    if(commitCode!==0)throw new Error(`Run ${batch.runNumber} could not be committed atomically`);
    const result=[JSON.parse(await fs.readFile(commitResultPath,"utf8"))];await fs.unlink(commitResultPath).catch(()=>undefined);
    await r2(batch.runNumber,"DELETE");await fs.unlink(local).catch(()=>undefined);
    return result?.[0]??{saved_row_count:batch.termCount,total_saved_rows:completed*batchSize+batch.termCount,completed_runs:completed+1};
  }
}

await fs.mkdir(jobsDir,{recursive:true});const output=await fs.open(logPath,"a");
const heartbeat=setInterval(()=>void writeStatus({heartbeatAt:new Date().toISOString()}).catch(()=>undefined),5000);
try{
  const manifest=await restoreOrPrepare(output),planned=manifest.batches.length;
  let records=await rest(`ad_automation_search_term_analysis_batches?job_id=eq.${jobId}&select=*&order=run_number.asc`);
  let completed=records.filter(row=>row.status==="completed"&&row.saved_row_count===row.term_count).length;
  let saved=Number((await rest(`ad_automation_search_term_analysis_rows?job_id=eq.${jobId}&select=id`,{headers:{Prefer:"count=exact"}}))?.length||0);
  await writeStatus({status:"running",stage:manifest.totalTerms?"Search terms cached in independent batches":"No search terms found",totalTerms:manifest.totalTerms,plannedRuns:planned,completedBatches:completed,termsProcessed:saved,queuedNewTerms:Math.max(0,manifest.totalTerms-saved)});
  if(manifest.totalTerms===0){await r2(null,"DELETE");await writeStatus({status:"completed",stage:"No search terms found; daily capacity was not used",totalTerms:0,plannedRuns:0,completedBatches:0,termsProcessed:0,queuedNewTerms:0,progressComplete:true,finishedAt:new Date().toISOString()});}
  else for(const batch of manifest.batches){
    records=await rest(`ad_automation_search_term_analysis_batches?job_id=eq.${jobId}&select=*&order=run_number.asc`);const record=records.find(row=>row.run_number===batch.runNumber);
    if(record?.status==="completed"&&record.saved_row_count===record.term_count)continue;
    if(await cancellationRequested()){stopped=true;break;}
    if(!record)throw new Error(`Run ${batch.runNumber} has no durable batch record`);
    const committed=await analyzeBatch(batch,record,output,completed,planned);completed=Number(committed.completed_runs);saved=Number(committed.total_saved_rows);
    await writeStatus({stage:`Run ${batch.runNumber} saved · ${Math.max(0,manifest.totalTerms-saved)} terms remain`,completedBatches:completed,termsProcessed:saved,currentBatch:batch.runNumber,currentBatchSize:0,queuedNewTerms:Math.max(0,manifest.totalTerms-saved)});
  }
  if(stopped){await rest(`ad_automation_search_term_analysis_batches?job_id=eq.${jobId}&status=in.(queued,retrying,needs_retry)`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"stopped",updated_at:new Date().toISOString()})});await writeStatus({status:"stopped",stage:"Analysis stopped; every completed 250-term batch was kept",finishedAt:new Date().toISOString()});}
  else{await r2(null,"DELETE");await writeStatus({status:"completed",stage:`Completed ${completed} runs · ${saved} reviewed terms saved`,completedBatches:completed,termsProcessed:saved,queuedNewTerms:Math.max(0,manifest.totalTerms-saved),progressComplete:true,finishedAt:new Date().toISOString()});}
}catch(error){
  const message=error instanceof Error?error.message:String(error);
  if(!Number(status.totalTerms||0)){
    const date=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const slots=await rest(`ad_automation_search_term_daily_slots?malaysia_run_date=eq.${date}&google_customer_id=eq.${accountId}&select=source`).catch(()=>[]);
    if(slots?.[0]?.source==="scheduled")await rest(`ad_automation_search_term_daily_slots?malaysia_run_date=eq.${date}&google_customer_id=eq.${accountId}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"reserved",fulfillment_source:null,claimed_at:null,updated_at:new Date().toISOString()})}).catch(()=>undefined);
    else await rest(`ad_automation_search_term_daily_slots?malaysia_run_date=eq.${date}&google_customer_id=eq.${accountId}`,{method:"DELETE",headers:{Prefer:"return=minimal"}}).catch(()=>undefined);
  }
  await writeStatus({status:"needs_retry",stage:"Analysis needs retry",error:message,finishedAt:new Date().toISOString()});process.exitCode=1;
}
finally{clearInterval(heartbeat);await output.close();await fs.unlink(manifestPath).catch(()=>undefined);}
