import { qs, supabaseRest } from "@/lib/optimization/supabase-rest";
import { collectPagedResults } from "./paged-results";

export async function loadProtectedSearchTermKeys(customerId: string): Promise<Set<string>> {
  const formattedId = `${customerId.slice(0,3)}-${customerId.slice(3,6)}-${customerId.slice(6)}`;
  // A new analysis must not overwrite a human's previous keep/review decision.
  const reviewed = await collectPagedResults(({limit,offset}) => supabaseRest<Array<{stable_term_key:string}>>(
    `ad_automation_search_term_analysis_rows?select=stable_term_key,ad_automation_search_term_analysis_jobs!inner(google_customer_id)&ad_automation_search_term_analysis_jobs.google_customer_id=eq.${qs(customerId)}&or=(review_status.not.is.null,review_decision.not.is.null)&order=id.asc&limit=${limit}&offset=${offset}`), 1000, Number.MAX_SAFE_INTEGER);
  const legacy = await collectPagedResults(({limit,offset}) => supabaseRest<Array<{item_key:string|null}>>(
    `ad_automation_search_term_decisions?select=item_key,ad_automation_search_term_analysis_runs!inner(google_customer_id)&ad_automation_search_term_analysis_runs.google_customer_id=in.(${qs(customerId)},${qs(formattedId)})&order=id.asc&limit=${limit}&offset=${offset}`), 1000, Number.MAX_SAFE_INTEGER);
  return new Set([...reviewed.map(row=>row.stable_term_key), ...legacy.map(row=>row.item_key).filter((key): key is string=>Boolean(key))]);
}
