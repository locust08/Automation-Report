import type { OptimizationResult } from "../lib/search-term-optimization/types";

const [loadedSupabaseRepository,loadedRest]=await Promise.all([import("../lib/search-term-optimization/supabase-repository"),import("../lib/optimization/supabase-rest")]);
const {stableSearchTermKey}=((loadedSupabaseRepository as unknown as {default?:typeof loadedSupabaseRepository}).default??loadedSupabaseRepository);
const {supabaseRest,jsonBody}=((loadedRest as unknown as {default?:typeof loadedRest}).default??loadedRest);

const accountId=(process.argv[2]??"").replace(/\D/g,"");
if(accountId.length!==10)throw new Error("A 10-digit account ID is required.");
const runs=await supabaseRest<Array<{recommendations:OptimizationResult[]}>>(`ad_automation_search_term_analysis_runs?google_customer_id=eq.${accountId}&select=recommendations&order=analyzed_at.desc&limit=1`);
const rows=runs[0]?.recommendations??[];if(!rows.length)throw new Error("No recovered JSON results were found.");
const jobs=await supabaseRest<Array<{id:string}>>(`ad_automation_search_term_analysis_jobs?google_customer_id=eq.${accountId}&select=id&order=created_at.desc&limit=1`);if(!jobs[0])throw new Error("No durable job was found.");
const batches=await supabaseRest<Array<{id:string;run_number:number;term_count:number;status:string}>>(`ad_automation_search_term_analysis_batches?job_id=eq.${jobs[0].id}&term_count=eq.${rows.length}&select=*&order=run_number.desc`);
const batch=batches.find(item=>item.status!=="completed")??batches[0];if(!batch)throw new Error("No compatible batch was found.");
const result=await supabaseRest("rpc/commit_search_term_analysis_batch",{method:"POST",body:jsonBody({requested_job_id:jobs[0].id,requested_batch_id:batch.id,expected_row_count:rows.length,reviewed_rows:rows.map(row=>({...row,stableTermKey:stableSearchTermKey(row)})),requested_checksum:"recovered-json-backfill"})});
console.log(JSON.stringify({accountId,jobId:jobs[0].id,batch:batch.run_number,result}));
