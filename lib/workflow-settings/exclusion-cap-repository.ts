import { jsonBody, supabaseRest } from "@/lib/optimization/supabase-rest";
import { exclusionCapMutationSchema, type ExclusionCapSetting } from "./exclusion-cap";

type Row = { search_term_exclusion_cap: number; lock_version: number; updated_at: string; updated_by: string | null };
const map = (row: Row): ExclusionCapSetting => ({ cap: row.search_term_exclusion_cap, version: row.lock_version, updatedAt: row.updated_at, updatedBy: row.updated_by });

export async function getExclusionCap(): Promise<ExclusionCapSetting> {
  const rows = await supabaseRest<Row[]>("ads_dashboard_automation_settings?id=eq.global&select=*");
  if (!rows[0]) throw new Error("Shared automation settings are unavailable.");
  return map(rows[0]);
}

export async function saveExclusionCap(input: { cap: number; expectedVersion: number }, actor: string): Promise<ExclusionCapSetting> {
  const parsed = exclusionCapMutationSchema.parse(input);
  const rows = await supabaseRest<Row[]>(`ads_dashboard_automation_settings?id=eq.global&lock_version=eq.${parsed.expectedVersion}`, {
    method: "PATCH",
    body: jsonBody({ search_term_exclusion_cap: parsed.cap, lock_version: parsed.expectedVersion + 1, updated_at: new Date().toISOString(), updated_by: actor }),
  });
  if (!rows[0]) throw new Error("Settings changed in another session. Reload and try again.");
  return map(rows[0]);
}
