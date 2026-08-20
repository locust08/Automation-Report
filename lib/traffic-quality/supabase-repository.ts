import { jsonBody, qs, supabaseRest } from "@/lib/optimization/supabase-rest";
import type { M03DraftInput, ReviewInput } from "@/lib/traffic-quality/decision-service";
import type { PriorityThresholds } from "@/lib/traffic-quality/priority";
import { calculateTrafficQualityPriority, priorityCadence } from "@/lib/traffic-quality/priority";
import { normalizeTrafficQualityRecommendation } from "@/lib/traffic-quality/contracts";

type RecommendationRow = {
  id: string;
  account_id: string;
  source_kind: string;
  item_value: string;
  item_type: string | null;
  source_snapshot: Record<string, unknown>;
  current_status: string;
  recommended_action: string;
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
    body: jsonBody({ current_status: STATUS_BY_ACTION[input.action], last_reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
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
  const decisions = await Promise.all(rows.map((row) => saveTrafficQualityDecision({ recommendationId: row.id, accountId: input.accountId, itemType: "placement", action: input.action, comment: input.comment, actor: input.actor })));
  return { updated: decisions.length, decision: input.action, recommendationIds: rows.map((row) => row.id), status: "saved_for_m03_review", googleMutationRequested: false };
}
