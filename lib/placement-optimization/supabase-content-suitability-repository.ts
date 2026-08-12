import type { ContentSuitabilityPayload } from "@/lib/placement-optimization/types";
import { jsonBody, qs, supabaseRest } from "@/lib/optimization/supabase-rest";

type Row={payload_json:ContentSuitabilityPayload;refreshed_at:string};
export async function getContentSuitabilitySnapshot(customerId:string){const rows=await supabaseRest<Row[]>(`ad_automation_content_suitability_snapshots?google_customer_id=eq.${qs(customerId)}&select=payload_json,refreshed_at`);return rows[0]?{payload:rows[0].payload_json,refreshedAt:rows[0].refreshed_at}:null;}
export async function saveContentSuitabilitySnapshot(payload:ContentSuitabilityPayload){await supabaseRest("ad_automation_content_suitability_snapshots?on_conflict=google_customer_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:jsonBody({google_customer_id:payload.account.customerId,customer_name:payload.account.customerName,payload_json:payload,refreshed_at:payload.refreshedAt})});}
