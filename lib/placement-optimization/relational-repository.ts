import type { GoogleCampaignTypeOverview, GooglePlacementPerformanceRow } from "@/lib/reporting/google";
import { jsonBody, qs, supabaseRest } from "@/lib/optimization/supabase-rest";
import type { PlacementDashboardPayload, PlacementOptimizationRow } from "@/lib/placement-optimization/types";

export type PlacementJobStatus = {
  id: string;
  google_customer_id: string;
  customer_name: string | null;
  reporting_start_date: string;
  reporting_end_date: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  stage: string;
  processed_rows: number;
  total_rows: number | null;
  error: string | null;
  cancellation_requested: boolean;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
};

type PlacementRun = {
  id: number;
  google_customer_id: string;
  customer_name: string;
  reporting_start_date: string;
  reporting_end_date: string;
  analyzed_at: string;
  campaign_types: PlacementDashboardPayload["campaignTypes"];
  placement_count: number;
  total_impressions: number;
  total_spend: number;
  unique_sites: number;
  top_sites: PlacementDashboardPayload["placementOverview"]["topSites"];
};

type StoredPlacementRow = {
  id: number; run_id: number; source_view: string; resource_name: string; placement: string; display_name: string;
  placement_type: string; target_url: string | null; campaign_id: string | null; campaign_name: string; campaign_type: string;
  ad_group_id: string | null; ad_group_name: string; impressions: number; clicks: number; spend: number; conversions: number;
  video_views: number; classification: string; recommended_action: "exclude" | "keep" | "kiv"; confidence: number; reason: string;
  confirmation_required: boolean; ai_status: "generated" | "rules_fallback" | "not_required"; review_status: string;
  current_decision: string | null; reviewed_at: string | null; reviewer_email: string | null; reviewer_role: string | null;
};

export async function createPlacementJob(input: { id: string; customerId: string; customerName?: string; startDate: string; endDate: string }) {
  const rows = await supabaseRest<PlacementJobStatus[]>("ad_automation_placement_jobs", { method: "POST", body: jsonBody({
    id: input.id, google_customer_id: input.customerId, customer_name: input.customerName ?? null,
    reporting_start_date: input.startDate, reporting_end_date: input.endDate, status: "queued", stage: "Queued for placement analysis",
  }) });
  return rows[0];
}

export async function getPlacementJob(jobId: string) {
  const rows = await supabaseRest<PlacementJobStatus[]>(`ad_automation_placement_jobs?id=eq.${qs(jobId)}&select=*&limit=1`);
  return rows[0] ?? null;
}

export async function getActivePlacementJob(customerId: string) {
  const rows = await supabaseRest<PlacementJobStatus[]>(`ad_automation_placement_jobs?google_customer_id=eq.${qs(customerId)}&status=in.(queued,running)&select=*&order=started_at.desc&limit=1`);
  return rows[0] ?? null;
}

export async function updatePlacementJob(jobId: string, values: Record<string, unknown>) {
  const rows = await supabaseRest<PlacementJobStatus[]>(`ad_automation_placement_jobs?id=eq.${qs(jobId)}`, { method: "PATCH", body: jsonBody({ ...values, updated_at: new Date().toISOString() }) });
  return rows[0] ?? null;
}

export async function requestPlacementJobCancellation(jobId: string) {
  return updatePlacementJob(jobId, { cancellation_requested: true, stage: "Cancellation requested" });
}

export async function getLatestPlacementRun(customerId: string, startDate: string, endDate: string) {
  const rows = await supabaseRest<PlacementRun[]>(`ad_automation_placement_runs_v2?google_customer_id=eq.${qs(customerId)}&reporting_start_date=eq.${startDate}&reporting_end_date=eq.${endDate}&select=*&limit=1`);
  return rows[0] ?? null;
}

export async function upsertPlacementRun(input: { jobId: string; customerId: string; customerName: string; startDate: string; endDate: string; analyzedAt: string; campaignTypes: PlacementDashboardPayload["campaignTypes"]; rows: GooglePlacementPerformanceRow[] }) {
  const websites = input.rows.filter((row) => row.placementType === "WEBSITE");
  const topSites = [...websites].sort((a, b) => b.impressions - a.impressions).slice(0, 5).map((row, index) => ({
    id: `pending:${index}`, displayName: row.displayName, placement: row.placement, targetUrl: row.targetUrl,
    campaignName: row.campaignName, campaignType: row.campaignType, impressions: row.impressions,
  }));
  const runs = await supabaseRest<PlacementRun[]>("ad_automation_placement_runs_v2?on_conflict=google_customer_id,reporting_start_date,reporting_end_date", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: jsonBody({
      job_id: input.jobId, google_customer_id: input.customerId, customer_name: input.customerName,
      reporting_start_date: input.startDate, reporting_end_date: input.endDate, analyzed_at: input.analyzedAt,
      campaign_types: input.campaignTypes, placement_count: input.rows.length,
      total_impressions: input.rows.reduce((sum, row) => sum + row.impressions, 0),
      total_spend: input.rows.reduce((sum, row) => sum + row.spend, 0),
      unique_sites: new Set(websites.map((row) => row.placement)).size, top_sites: topSites,
    }),
  });
  return runs[0];
}

export async function replacePlacementRowsInBatches(runId: number, jobId: string, rows: GooglePlacementPerformanceRow[], batchSize = 250) {
  await supabaseRest(`ad_automation_placement_rows_v2?run_id=eq.${runId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const job = await getPlacementJob(jobId);
    if (job?.cancellation_requested) throw new PlacementJobCancelledError();
    const batch = rows.slice(offset, offset + batchSize).map((row) => ({
      run_id: runId, source_view: row.sourceView ?? "detail_placement_view", resource_name: row.resourceName,
      placement: row.placement, display_name: row.displayName, placement_type: row.placementType, target_url: row.targetUrl,
      campaign_id: row.campaignId, campaign_name: row.campaignName, campaign_type: row.campaignType,
      ad_group_id: row.adGroupId, ad_group_name: row.adGroupName, impressions: row.impressions, clicks: row.clicks,
      spend: row.spend, conversions: row.conversions, video_views: row.videoViews,
    }));
    await supabaseRest("ad_automation_placement_rows_v2?on_conflict=run_id,source_view,resource_name", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(batch),
    });
    await updatePlacementJob(jobId, { stage: "Saving placement batches", processed_rows: Math.min(offset + batch.length, rows.length), total_rows: rows.length });
  }
}

export class PlacementJobCancelledError extends Error {
  constructor() { super("Placement analysis was cancelled."); }
}

export async function loadPlacementSummary(input: { customerId: string; customerName: string; startDate: string; endDate: string; campaignTypeOverview?: GoogleCampaignTypeOverview[]; warnings?: string[] }): Promise<PlacementDashboardPayload> {
  const run = await getLatestPlacementRun(input.customerId, input.startDate, input.endDate);
  const campaignTypes = run?.campaign_types ?? (input.campaignTypeOverview ?? []).map((item) => ({
    channelType: item.channelType, label: campaignTypeLabel(item.channelType), campaignCount: item.campaignCount,
    placementCount: 0, impressions: 0, spend: 0, available: false,
  }));
  const placementCount = run?.placement_count ?? 0;
  return {
    account: { customerId: input.customerId, customerName: run?.customer_name ?? input.customerName, startDate: input.startDate, endDate: input.endDate, refreshedAt: run?.analyzed_at ?? new Date().toISOString() },
    summary: { total: placementCount, needsReview: placementCount, awaitingApproval: 0, kept: 0, kiv: 0, approved: 0, rejected: 0 },
    performanceMax: { available: campaignTypes.some((item) => item.channelType === "PERFORMANCE_MAX" && item.available), campaignCount: campaignTypes.find((item) => item.channelType === "PERFORMANCE_MAX")?.campaignCount ?? 0, totalImpressions: campaignTypes.find((item) => item.channelType === "PERFORMANCE_MAX")?.impressions ?? 0, uniqueSites: run?.unique_sites ?? 0, topSites: (run?.top_sites ?? []).map(({ campaignType: _campaignType, ...site }) => site) },
    campaignTypes, placementOverview: { campaignCount: campaignTypes.reduce((sum, item) => sum + item.campaignCount, 0), placementCount, totalImpressions: run?.total_impressions ?? 0, totalSpend: run?.total_spend ?? 0, uniqueSites: run?.unique_sites ?? 0, topSites: run?.top_sites ?? [] },
    rows: [], changeSets: [], reports: [], warnings: input.warnings ?? [],
  };
}

export async function loadPlacementRowsPage(input: { customerId: string; startDate: string; endDate: string; page: number; pageSize: number; campaignType?: string; placementType?: string; reviewStatus?: string }) {
  const run = await getLatestPlacementRun(input.customerId, input.startDate, input.endDate);
  if (!run) return { rows: [] as PlacementOptimizationRow[], page: input.page, pageSize: input.pageSize, total: 0, pageCount: 0 };
  const filters = [`run_id=eq.${run.id}`];
  if (input.campaignType && input.campaignType !== "all") filters.push(`campaign_type=eq.${qs(input.campaignType)}`);
  if (input.placementType && input.placementType !== "all") filters.push(`placement_type=eq.${qs(input.placementType)}`);
  if (input.reviewStatus && input.reviewStatus !== "all") filters.push(`review_status=eq.${qs(input.reviewStatus)}`);
  const from = Math.max(0, (input.page - 1) * input.pageSize);
  const response = await supabaseRest<StoredPlacementRow[]>(`ad_automation_placement_rows_v2?${filters.join("&")}&select=*&order=impressions.desc,id.asc&offset=${from}&limit=${input.pageSize}`);
  const countResponse = await fetchCount(`ad_automation_placement_rows_v2?${filters.join("&")}&select=id`);
  return { rows: response.map(hydrateRow), page: input.page, pageSize: input.pageSize, total: countResponse, pageCount: Math.ceil(countResponse / input.pageSize) };
}

async function fetchCount(path: string) {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET;
  if (!url || !key) throw new Error("Supabase is not configured for optimization storage.");
  const response = await fetch(`${url}/rest/v1/${path}`, { method: "HEAD", headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact", Range: "0-0" }, cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to count placement rows (${response.status}).`);
  return Number(response.headers.get("content-range")?.split("/")[1] ?? 0);
}

function hydrateRow(row: StoredPlacementRow): PlacementOptimizationRow {
  return { id: `v2:${row.id}`, resourceName: row.resource_name, placement: row.placement, displayName: row.display_name,
    placementType: row.placement_type, targetUrl: row.target_url, campaignId: row.campaign_id ?? undefined, campaignName: row.campaign_name,
    campaignType: row.campaign_type, adGroupId: row.ad_group_id, adGroupName: row.ad_group_name, impressions: Number(row.impressions),
    clicks: Number(row.clicks), spend: Number(row.spend), conversions: Number(row.conversions), videoViews: Number(row.video_views),
    classification: row.classification, recommendedAction: row.recommended_action, confidence: Number(row.confidence), reason: row.reason,
    confirmationRequired: row.confirmation_required, aiStatus: row.ai_status, reviewStatus: row.review_status,
    currentDecision: row.current_decision, reviewHistory: row.reviewed_at ? [{ id: `v2-review:${row.id}`, reviewerEmail: row.reviewer_email ?? "", reviewerRole: row.reviewer_role ?? "", action: row.current_decision ?? row.review_status, resultingStatus: row.review_status, createdAt: row.reviewed_at }] : [], };
}

function campaignTypeLabel(value: string) { if (value === "VIDEO") return "Video / YouTube"; if (value === "PERFORMANCE_MAX") return "Performance Max"; if (value === "DEMAND_GEN" || value === "DISCOVERY") return "Demand Gen"; return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }
