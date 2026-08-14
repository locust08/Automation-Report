type RepositoryModule=typeof import("../lib/search-term-optimization/repository");
type SupabaseRepositoryModule=typeof import("../lib/search-term-optimization/supabase-repository");
const loadedRepository=await import("../lib/search-term-optimization/repository");
const loadedSupabaseRepository=await import("../lib/search-term-optimization/supabase-repository");
const repository=((loadedRepository as unknown as {default?:RepositoryModule}).default??loadedRepository) as RepositoryModule;
const supabaseRepository=((loadedSupabaseRepository as unknown as {default?:SupabaseRepositoryModule}).default??loadedSupabaseRepository) as SupabaseRepositoryModule;
const {ManualRunnerOutputRepository,readLatestCurrentSearchTerms}=repository;
const {getLatestDashboardFromSupabase,mergeIncrementalDashboard,persistDashboardToSupabase}=supabaseRepository;

const accountId=(process.argv[2]??"").replace(/\D/g,"");
const queuedNewTerms=Math.max(0,Number(process.argv[3]??0));
if(!/^\d{10}$/.test(accountId))throw new Error("A valid Google Ads account ID is required.");
const cached=await getLatestDashboardFromSupabase(accountId);
const newlyAnalyzed=await new ManualRunnerOutputRepository().getDashboard(accountId);
const current=await readLatestCurrentSearchTerms(accountId);
const checkedAt=new Date().toISOString();
const merged=await mergeIncrementalDashboard({cached,newlyAnalyzed,currentRows:current.rows,checkedAt,queuedNewTerms});
const saved=await persistDashboardToSupabase(merged);
console.log(JSON.stringify({event:"search_term_progress_saved",accountId,terms:saved.results.length,queuedNewTerms}));
