import { jsonBody, qs, supabaseRest } from "@/lib/optimization/supabase-rest";
import type { M03DraftInput, ReviewInput } from "@/lib/traffic-quality/decision-service";
import type { PriorityThresholds } from "@/lib/traffic-quality/priority";
import { calculateTrafficQualityPriority, priorityCadence } from "@/lib/traffic-quality/priority";
import { normalizeTrafficQualityRecommendation } from "@/lib/traffic-quality/contracts";
import type { PlacementOptimizationRow } from "@/lib/placement-optimization/types";

type RecommendationRow = {
  id: string;
  account_id: string;
  source_kind: string;
  item_value: string;
  item_type: string | null;
  source_snapshot: Record<string, unknown>;
  current_status: string;
  recommended_action: string;
  source_item_key?: string;
  campaign_id?: string | null;
  campaign_name?: string | null;
  ad_group_id?: string | null;
  ad_group_name?: string | null;
  classification?: string | null;
  ai_confidence?: number | null;
  explanation?: string | null;
};

const STATUS_BY_ACTION = {
  keep: "kept",
  exclude: "excluded",
  reject: "rejected",
  kiv: "kiv",
  request_pm_feedback: "awaiting_pm_feedback",
  request_client_feedback: "awaiting_client_feedback",
  add_agency_risk: "excluded",
} as const;

export async function saveTrafficQualityDecision(input: ReviewInput) {
  return saveTrafficQualityDecisionWithStatus(input);
}

async function saveTrafficQualityDecisionWithStatus(input: ReviewInput, statusOverride?: string) {
  const rows = await supabaseRest<RecommendationRow[]>(`traffic_quality_recommendations?id=eq.${qs(input.recommendationId)}&account_id=eq.${qs(input.accountId)}&select=*`);
  const recommendation = rows[0];
  if (!recommendation) throw new Error("Traffic-quality recommendation was not found in this account.");
  const snapshot = { ...recommendation };
  const created = await supabaseRest<Array<{ id: string }>>("traffic_quality_decision_events", {
    method: "POST",
    body: jsonBody({
      recommendation_id: recommendation.id,
      account_id: recommendation.account_id,
      action: input.action,
      comment: input.comment?.trim() || null,
      actor_id: input.actor.id,
      actor_email: input.actor.email,
      actor_role: input.actor.role,
      recommendation_snapshot: snapshot,
    }),
  });
  await supabaseRest(`traffic_quality_recommendations?id=eq.${qs(recommendation.id)}&account_id=eq.${qs(input.accountId)}`, {
    method: "PATCH",
    body: jsonBody({ current_status: statusOverride ?? STATUS_BY_ACTION[input.action], last_reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });
  if (input.action === "add_agency_risk") {
    await supabaseRest("traffic_quality_agency_placement_risks?on_conflict=placement_key,placement_type", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: jsonBody({
        placement_key: recommendation.item_value,
        placement_type: recommendation.item_type || "UNKNOWN",
        reason: input.comment?.trim() || "Authorised traffic-quality risk decision.",
        source_recommendation_id: recommendation.id,
        authorised_by_id: input.actor.id,
        authorised_by_email: input.actor.email,
        authorised_by_role: input.actor.role,
        status: "active",
      }),
    });
  }
  return { id: created[0]?.id ?? "", ...input };
}

export async function createTrafficQualityM03Draft(input: M03DraftInput) {
  const existing = await supabaseRest<Array<{ id: string }>>(`ads_change_sets?idempotency_key=eq.${qs(input.idempotencyKey)}&select=id&limit=1`);
  if (existing[0]) return { changeSetId: existing[0].id, duplicate: true };
  const response = await supabaseRest<string>("rpc/create_traffic_quality_m03_draft", {
    method: "POST",
    body: jsonBody({
      p_account_id: input.accountId,
      p_account_name: input.accountName,
      p_recommendation_ids: input.recommendationIds,
      p_idempotency_key: input.idempotencyKey,
      p_actor_id: input.actor.id,
      p_actor_name: input.actor.email,
    }),
  });
  return { changeSetId: response, duplicate: false };
}

export async function getTrafficQualityPolicy(accountId: string) {
  const rows = await supabaseRest<Record<string, unknown>[]>(`traffic_quality_account_policies?account_id=eq.${qs(accountId)}&select=*`);
  return rows[0] ?? null;
}

export async function upsertTrafficQualityPolicy(accountId: string, thresholds: PriorityThresholds, actor: { id: string; email: string }) {
  const rows = await supabaseRest<Record<string, unknown>[]>("traffic_quality_account_policies?on_conflict=account_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: jsonBody({
      account_id: accountId,
      spend_threshold: thresholds.spendThreshold,
      clicks_threshold: thresholds.clicksThreshold,
      invalid_leads_threshold: thresholds.invalidLeadsThreshold,
      complaints_threshold: thresholds.complaintsThreshold,
      recency_days: thresholds.recencyDays,
      cross_campaign_threshold: thresholds.crossCampaignThreshold,
      cross_client_threshold: thresholds.crossClientThreshold,
      updated_by_id: actor.id,
      updated_by_email: actor.email,
      updated_at: new Date().toISOString(),
    }),
  });
  return rows[0];
}

export async function listTrafficQualityHistory(accountId: string) {
  return supabaseRest<Record<string, unknown>[]>(`traffic_quality_decision_events?account_id=eq.${qs(accountId)}&select=*,traffic_quality_recommendations(item_value,item_type,source_kind,m03_change_set_id)&order=created_at.desc&limit=500`);
}

export async function listAgencyPlacementRisks() {
  return supabaseRest<Record<string, unknown>[]>("traffic_quality_agency_placement_risks?select=*&order=created_at.desc");
}

export async function generateVerifiedTrafficQualityReport(input: { changeSetId: string; actor: { id: string; email: string } }) {
  const sets = await supabaseRest<Array<Record<string, unknown> & { ads_field_changes?: Array<Record<string, unknown>> }>>(`ads_change_sets?id=eq.${qs(input.changeSetId)}&source_module=eq.M01&status=eq.verified&select=*,ads_field_changes(*)&limit=1`);
  const changeSet = sets[0];
  if (!changeSet) throw new Error("A verified M01-originated M03 change set is required.");
  const fields = changeSet.ads_field_changes ?? [];
  const reportSnapshot = {
    accountId: changeSet.account_id,
    accountName: changeSet.account_name,
    verifiedAt: changeSet.verified_at,
    items: fields.map((field) => ({
      campaign: field.entity_name,
      optimizationType: field.value_type,
      excludedItem: field.proposed_value,
      reason: changeSet.reason,
      date: changeSet.verified_at,
      outcome: field.verification_status,
      publishOutcome: field.publish_status,
      attempts: field.publish_attempts,
      error: field.last_error_message,
    })),
  };
  const rows = await supabaseRest<Record<string, unknown>[]>("traffic_quality_reports?on_conflict=m03_change_set_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: jsonBody({ account_id: String(changeSet.account_id), m03_change_set_id: input.changeSetId, status: "generated", report_snapshot: reportSnapshot, generated_by_id: input.actor.id, generated_by_email: input.actor.email }),
  });
  return rows[0];
}

export async function getTrafficQualityReport(reportId: string) {
  const rows = await supabaseRest<Array<Record<string, unknown>>>(`traffic_quality_reports?id=eq.${qs(reportId)}&select=*&limit=1`);
  return rows[0] ?? null;
}

export type LivePlacementReview = {
  placement: string;
  placementType: string;
  campaignId: string;
  campaignName: string;
  campaignType: string;
  adGroupId?: string | null;
  adGroupName?: string;
  impressions?: number;
  clicks?: number;
  spend?: number;
  conversions?: number;
  targetUrl?: string | null;
  classification?: string;
  recommendedAction?: string;
  recommendedNegativeMatchType?: string | null;
  confidence?: number;
  reason?: string;
  clientConfirmationRequired?: boolean;
};

export async function saveLivePlacementReviews(input: {
  accountId: string;
  accountName: string;
  placements: LivePlacementReview[];
  action: ReviewInput["action"];
  comment?: string;
  actor: ReviewInput["actor"];
  approvalRequired?: boolean;
}) {
  if (input.action === "add_agency_risk" && !["tl", "approver", "admin"].includes(input.actor.role)) {
    throw new Error("Only an authorised team lead or administrator can add a placement to the agency risk list.");
  }
  const rows = await supabaseRest<Array<{ id: string }>>("traffic_quality_recommendations?on_conflict=account_id,source_kind,source_item_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: jsonBody(input.placements.map((placement) => {
      const recommendation = normalizeTrafficQualityRecommendation({
        classification: placement.classification,
        recommendedAction: placement.recommendedAction,
        recommendedNegativeMatchType: placement.recommendedNegativeMatchType ?? null,
        confidence: placement.confidence,
        reason: placement.reason,
        clientConfirmationRequired: placement.clientConfirmationRequired,
      });
      const priority = calculateTrafficQualityPriority({ spend: placement.spend ?? 0, clicks: placement.clicks ?? 0, hasNoQualifiedLeads: (placement.conversions ?? 0) === 0, aiConfidence: recommendation.confidence });
      return {
        account_id: input.accountId,
        account_name: input.accountName,
        source_kind: "placement",
        source_item_key: `${placement.campaignId}|${placement.placementType}|${placement.placement}`,
        item_value: placement.placement,
        item_type: placement.placementType,
        campaign_id: placement.campaignId,
        campaign_name: placement.campaignName,
        ad_group_id: placement.adGroupId ?? null,
        ad_group_name: placement.adGroupName ?? null,
        source_snapshot: placement,
        classification: recommendation.classification,
        recommended_action: recommendation.recommendedAction,
        recommended_negative_match_type: recommendation.recommendedNegativeMatchType,
        ai_confidence: recommendation.confidence,
        explanation: recommendation.reason,
        client_confirmation_required: recommendation.clientConfirmationRequired,
        priority_score: priority.score,
        priority: priority.priority,
        review_cadence: priorityCadence(priority.priority),
        priority_breakdown: priority.breakdown,
        updated_at: new Date().toISOString(),
      };
    })),
  });
  const awaitingApproval = input.action === "exclude" && input.approvalRequired === true;
  const decisions = await Promise.all(rows.map((row) => saveTrafficQualityDecisionWithStatus({ recommendationId: row.id, accountId: input.accountId, itemType: "placement", action: input.action, comment: input.comment, actor: input.actor }, awaitingApproval ? "ready_for_approval" : undefined)));
  return { updated: decisions.length, decision: input.action, recommendationIds: rows.map((row) => row.id), status: awaitingApproval ? "ready_for_approval" : "saved_for_m03_review", googleMutationRequested: false, approvalBypassed: input.action === "exclude" && !awaitingApproval };
}

export async function saveLivePlacementApproval(input: {
  recommendationIds: string[];
  accountId?: string;
  placements?: LivePlacementReview[];
  decision: "approved" | "rejected" | "returned";
  actor: ReviewInput["actor"];
}) {
  const ids = [...new Set(input.recommendationIds.map((id) => id.trim()).filter(Boolean))];
  let rows = ids.length ? await supabaseRest<RecommendationRow[]>(`traffic_quality_recommendations?id=in.(${ids.map(qs).join(",")})&current_status=eq.ready_for_approval&select=*`) : [];
  if (rows.length !== ids.length && input.accountId && input.placements?.length) {
    rows = (await Promise.all(input.placements.map(async (placement) => {
      const key = `${placement.campaignId}|${placement.placementType}|${placement.placement}`;
      return supabaseRest<RecommendationRow[]>(`traffic_quality_recommendations?account_id=eq.${qs(input.accountId!)}&source_kind=eq.placement&source_item_key=eq.${qs(key)}&current_status=eq.ready_for_approval&select=*&limit=1`);
    }))).flat();
  }
  if (!rows.length || rows.length !== (input.placements?.length || ids.length)) throw new Error("Every selected placement must be awaiting approval.");
  const status = input.decision === "approved" ? "excluded" : input.decision === "returned" ? "returned_for_clarification" : "rejected";
  await Promise.all(rows.map(async (row) => {
    await supabaseRest("traffic_quality_decision_events", { method: "POST", body: jsonBody({ recommendation_id: row.id, account_id: row.account_id, action: `approver_${input.decision}`, actor_id: input.actor.id, actor_email: input.actor.email, actor_role: input.actor.role, recommendation_snapshot: row }) });
    await supabaseRest(`traffic_quality_recommendations?id=eq.${qs(row.id)}`, { method: "PATCH", body: jsonBody({ current_status: status, last_reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
  }));
  return { updated: rows.length, decision: input.decision, status, googleMutationRequested: false };
}

export async function loadPendingPlacementApprovalRows(input: { accountId: string; page: number; pageSize: number }) {
  const offset = Math.max(0, (input.page - 1) * input.pageSize);
  const base = `traffic_quality_recommendations?account_id=eq.${qs(input.accountId)}&source_kind=eq.placement&current_status=in.(ready_for_approval,excluded,rejected,returned_for_clarification)`;
  const { supabaseRestCount } = await import("@/lib/optimization/supabase-rest");
  const [rows, total] = await Promise.all([
    supabaseRest<RecommendationRow[]>(`${base}&select=*&order=updated_at.desc&offset=${offset}&limit=${input.pageSize}`),
    supabaseRestCount(`${base}&select=id&limit=1`),
  ]);
  return { rows: rows.map(mapPlacementApprovalRow), total };
}

function mapPlacementApprovalRow(row: RecommendationRow): PlacementOptimizationRow {
  const snapshot = row.source_snapshot as Partial<LivePlacementReview>;
  return {
    id: row.id, resourceName: String(snapshot.placement ?? row.item_value), placement: String(snapshot.placement ?? row.item_value),
    displayName: String(snapshot.placement ?? row.item_value), placementType: String(snapshot.placementType ?? row.item_type ?? "UNKNOWN"), targetUrl: snapshot.targetUrl ?? null,
    campaignId: String(snapshot.campaignId ?? row.campaign_id ?? ""), campaignName: String(snapshot.campaignName ?? row.campaign_name ?? "Unknown campaign"), campaignType: String(snapshot.campaignType ?? "UNKNOWN"),
    adGroupId: snapshot.adGroupId ?? row.ad_group_id ?? null, adGroupName: String(snapshot.adGroupName ?? row.ad_group_name ?? ""),
    impressions: Number(snapshot.impressions ?? 0), clicks: Number(snapshot.clicks ?? 0), spend: Number(snapshot.spend ?? 0), conversions: Number(snapshot.conversions ?? 0), videoViews: 0,
    classification: String(snapshot.classification ?? row.classification ?? "reviewed"), recommendedAction: "exclude",
    confidence: Number(snapshot.confidence ?? row.ai_confidence ?? 0), reason: String(snapshot.reason ?? row.explanation ?? "Placement exclusion decision."),
    confirmationRequired: Boolean(snapshot.clientConfirmationRequired), aiStatus: "not_required", reviewStatus: row.current_status,
    currentDecision: row.current_status === "ready_for_approval" ? "exclude" : row.current_status, reviewHistory: [],
  };
}
