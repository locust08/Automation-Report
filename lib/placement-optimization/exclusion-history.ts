import { jsonBody, qs, supabaseRest } from "@/lib/optimization/supabase-rest";
import type { PlacementOptimizationRow } from "@/lib/placement-optimization/types";

type HistoryRow = {
  id: number; google_customer_id: string; campaign_id: string; campaign_name: string; campaign_type: string;
  placement: string; normalized_placement: string; placement_type: string; reviewer_user_id: string; reviewer_role: string;
  reporting_start_date: string; reporting_end_date: string; google_resource_name: string | null; published_at: string;
};

export type ExclusionInput = Pick<PlacementOptimizationRow, "placement" | "displayName" | "placementType" | "targetUrl" | "campaignId" | "campaignName" | "campaignType" | "adGroupId" | "adGroupName" | "impressions" | "clicks" | "spend" | "conversions" | "videoViews">;

export async function existingPlacementExclusionKeys(customerId: string) {
  const rows = await supabaseRest<Array<Pick<HistoryRow, "campaign_id" | "placement_type" | "normalized_placement">>>(`ad_automation_placement_exclusion_history?google_customer_id=eq.${qs(customerId)}&select=campaign_id,placement_type,normalized_placement`);
  return new Set(rows.map(row => exclusionKey(row.campaign_id, row.placement_type, row.normalized_placement)));
}

export async function savePublishedPlacementExclusions(input: { customerId: string; startDate: string; endDate: string; reviewer: { id: string; role: string }; placements: ExclusionInput[]; resourceNames: string[] }) {
  const publishedAt = new Date().toISOString();
  const payload = input.placements.map((row, index) => ({
    google_customer_id: input.customerId,
    campaign_id: String(row.campaignId),
    campaign_name: row.campaignName,
    campaign_type: row.campaignType,
    placement: row.placement,
    normalized_placement: normalizePlacement(row.placement),
    placement_type: row.placementType,
    reviewer_user_id: input.reviewer.id,
    reviewer_role: input.reviewer.role,
    reporting_start_date: input.startDate,
    reporting_end_date: input.endDate,
    google_resource_name: input.resourceNames[index] ?? null,
    published_at: publishedAt,
  }));
  await supabaseRest("ad_automation_placement_exclusion_history?on_conflict=google_customer_id,campaign_id,placement_type,normalized_placement", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: jsonBody(payload) });
  return { published: payload.length, createdAt: publishedAt };
}

export async function loadPlacementExclusionHistory(input: { customerId: string; page: number; pageSize: number; campaignType?: string; placementType?: string }) {
  const filters = [`google_customer_id=eq.${qs(input.customerId)}`];
  if (input.campaignType && input.campaignType !== "all") filters.push(`campaign_type=eq.${qs(input.campaignType)}`);
  if (input.placementType && input.placementType !== "all") filters.push(`placement_type=eq.${qs(input.placementType)}`);
  const offset = Math.max(0, (input.page - 1) * input.pageSize);
  const rows = await supabaseRest<HistoryRow[]>(`ad_automation_placement_exclusion_history?${filters.join("&")}&select=*&order=published_at.desc,id.desc&offset=${offset}&limit=${input.pageSize}`);
  const total = await countHistory(`${filters.join("&")}&select=id`);
  return { rows: rows.map(hydrateHistory), page: input.page, pageSize: input.pageSize, total, pageCount: Math.ceil(total / input.pageSize) };
}

function hydrateHistory(row: HistoryRow): PlacementOptimizationRow {
  return { id: `history:${row.id}`, resourceName: row.google_resource_name ?? `history:${row.id}`, placement: row.placement, displayName: row.placement, placementType: row.placement_type, targetUrl: null, campaignId: row.campaign_id, campaignName: row.campaign_name, campaignType: row.campaign_type, adGroupId: null, adGroupName: "—", impressions: 0, clicks: 0, spend: 0, conversions: 0, videoViews: 0, classification: "Published exclusion", recommendedAction: "exclude", confidence: 100, reason: "This placement was excluded from Google Ads.", confirmationRequired: false, aiStatus: "not_required", reviewStatus: "published", currentDecision: "exclude", reviewHistory: [{ id: `history-event:${row.id}`, reviewerEmail: "", reviewerRole: row.reviewer_role, action: "excluded", resultingStatus: "published", createdAt: row.published_at }] };
}

async function countHistory(path: string) {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET;
  if (!url || !key) throw new Error("Supabase is not configured for exclusion history.");
  const response = await fetch(`${url}/rest/v1/ad_automation_placement_exclusion_history?${path}`, { method: "HEAD", headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact", Range: "0-0" }, cache: "no-store" });
  if (!response.ok) throw new Error("Unable to count placement exclusion history.");
  return Number(response.headers.get("content-range")?.split("/")[1] ?? 0);
}

export function normalizePlacement(value: string) { return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, ""); }
export function exclusionKey(campaignId: string, placementType: string, placement: string) { return `${campaignId}|${placementType}|${normalizePlacement(placement)}`; }
