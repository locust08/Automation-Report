import "server-only";
import { getReportingAuthBaseUrl, getSupabaseServerKey } from "@/lib/auth/config";
import { REPORT_DISPLAY_DEFAULTS, type ReportDisplayPreferences } from "./display-preferences";
export async function reportingPreferences(userId: string, patch?: Partial<ReportDisplayPreferences>): Promise<ReportDisplayPreferences> {
  const origin = getReportingAuthBaseUrl();
  const { secretKey, serviceRoleKey } = getSupabaseServerKey();
  if (!origin || !secretKey) throw new Error("Report preferences storage is not configured.");
  const url = new URL(`${origin}/rest/v1/ads_reporting_user_preferences`);
  url.searchParams.set("select", "overall,campaign,advanced");
  if (patch) url.searchParams.set("on_conflict", "user_id");
  else url.searchParams.set("user_id", `eq.${userId}`);
  const response = await fetch(url, {
    method: patch ? "POST" : "GET",
    headers: { apikey: secretKey, ...(secretKey === serviceRoleKey ? { Authorization: `Bearer ${secretKey}` } : {}), "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=representation,missing=default" },
    ...(patch ? { body: JSON.stringify({ user_id: userId, ...patch, updated_at: new Date().toISOString() }) } : {}),
    cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Unable to access report display preferences.");
  const [row] = await response.json() as ReportDisplayPreferences[];
  return { ...REPORT_DISPLAY_DEFAULTS, ...row };
}
