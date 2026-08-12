import { deleteLatestManualRunnerOutput, ManualRunnerOutputRepository, readLatestCurrentSearchTerms } from "../lib/search-term-optimization/repository";
import { getLatestDashboardFromSupabase, mergeIncrementalDashboard, persistDashboardToSupabase } from "../lib/search-term-optimization/supabase-repository";
import { recordSearchTermAnalysisCompleted } from "../lib/search-term-optimization/supabase-settings";

const accountId=(process.argv[2]??"").replace(/\D/g,"");
if(!/^\d{10}$/.test(accountId))throw new Error("A valid Google Ads account ID is required.");
const cached=await getLatestDashboardFromSupabase(accountId);
const dashboard=await new ManualRunnerOutputRepository().getDashboard(accountId);
const current=await readLatestCurrentSearchTerms(accountId);
const checkedAt=new Date().toISOString();
const merged=await mergeIncrementalDashboard({cached,newlyAnalyzed:dashboard,currentRows:current.rows,checkedAt,queuedNewTerms:current.source.queuedNewTerms??0});
await persistDashboardToSupabase(merged);
await deleteLatestManualRunnerOutput(accountId);
await recordSearchTermAnalysisCompleted(accountId,checkedAt);
console.log(JSON.stringify({accountId,terms:merged.results.length,mode:merged.refresh?.mode}));
