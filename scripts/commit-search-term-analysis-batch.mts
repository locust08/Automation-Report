import { promises as fs } from "node:fs";

const [jobId,batchId,accountId,expectedRaw,checksum,resultPath,planPath]=process.argv.slice(2);
const expected=Number(expectedRaw);
if(!jobId||!batchId||!/^\d{10}$/.test(accountId??"")||!Number.isInteger(expected)||expected<1||!resultPath||!planPath)process.exit(2);

const [loadedRepository,loadedSupabaseRepository,loadedRest]=await Promise.all([
  import("../lib/search-term-optimization/repository"),
  import("../lib/search-term-optimization/supabase-repository"),
  import("../lib/optimization/supabase-rest"),
]);
const {ManualRunnerOutputRepository}=((loadedRepository as unknown as {default?:typeof loadedRepository}).default??loadedRepository);
const {stableSearchTermKey}=((loadedSupabaseRepository as unknown as {default?:typeof loadedSupabaseRepository}).default??loadedSupabaseRepository);
const {supabaseRest,jsonBody}=((loadedRest as unknown as {default?:typeof loadedRest}).default??loadedRest);
const isolatedCopy=`${process.cwd()}/tmp/google_ads_search_term_review_agent_${accountId}_${jobId}_${batchId}.json`;
await fs.copyFile(planPath,isolatedCopy);
const dashboard=await new ManualRunnerOutputRepository().getDashboard(accountId);
await fs.unlink(isolatedCopy).catch(()=>undefined);
const rows=dashboard.results.map(row=>({...row,stableTermKey:stableSearchTermKey(row)}));
if(rows.length!==expected)throw new Error(`Expected ${expected} reviewed rows, but the mapped batch contains ${rows.length}.`);
const result=await supabaseRest<Array<{saved_row_count:number;completed_runs:number;total_saved_rows:number}>>("rpc/commit_search_term_analysis_batch",{method:"POST",body:jsonBody({requested_job_id:jobId,requested_batch_id:batchId,expected_row_count:expected,reviewed_rows:rows,requested_checksum:checksum||null})});
if(!result[0]||result[0].saved_row_count!==expected)throw new Error("Supabase did not confirm the complete reviewed batch.");
await fs.writeFile(resultPath,JSON.stringify(result[0]),"utf8");
