import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { OptimizationDashboardPayload, OptimizationResult } from "@/lib/search-term-optimization/types";

type StoredResult = {
  search_term_id: number;
  recommendation_id: number | null;
  google_customer_id: string;
  campaign_name: string;
  ad_group_name: string;
  search_term: string;
  current_decision: string | null;
  review_status: string | null;
};

export type SpecialistDecision = "approved" | "rejected" | "to_be_determined";

function openDatabase() {
  const databasePath = resolve(process.env.SEARCH_TERM_SQLITE_PATH || "data/search-term-optimization.sqlite");
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(readFileSync(resolve("lib/search-term-optimization/sqlite-schema.sql"), "utf8"));
  database.exec("pragma foreign_keys = on;");
  return database;
}

function identity(customerId: string, row: Pick<OptimizationResult, "campaign" | "adGroup" | "searchTerm">) {
  return `${customerId}\u0000${row.campaign}\u0000${row.adGroup}\u0000${row.searchTerm}`;
}

export function persistDashboardToSqlite(payload: OptimizationDashboardPayload): OptimizationDashboardPayload {
  const database = openDatabase();
  try {
    const upsertSearchTerm = database.prepare(`
      insert into ad_automation_search_terms (
        google_customer_id, customer_name, campaign_name, ad_group_name, search_term,
        triggering_keyword, match_type, destination_url, impressions, clicks, spend,
        conversions, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      on conflict do update set
        customer_name = excluded.customer_name,
        triggering_keyword = excluded.triggering_keyword,
        match_type = excluded.match_type,
        destination_url = excluded.destination_url,
        impressions = excluded.impressions,
        clicks = excluded.clicks,
        spend = excluded.spend,
        conversions = excluded.conversions,
        updated_at = datetime('now')
      returning id
    `);
    const upsertRecommendation = database.prepare(`
      insert into ad_automation_search_term_recommendations (
        search_term_id, classification, mismatch_category, ai_reason, proposed_action,
        safety_score, safety_band, score_breakdown, hard_gate_failures, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      on conflict do update set
        classification = excluded.classification,
        mismatch_category = excluded.mismatch_category,
        ai_reason = excluded.ai_reason,
        proposed_action = excluded.proposed_action,
        safety_score = excluded.safety_score,
        safety_band = excluded.safety_band,
        score_breakdown = excluded.score_breakdown,
        hard_gate_failures = excluded.hard_gate_failures,
        updated_at = datetime('now')
    `);
    const removeRecommendation = database.prepare(`
      delete from ad_automation_search_term_recommendations where search_term_id = ?
    `);

    database.exec("begin immediate;");
    for (const row of payload.results) {
      const savedTerm = upsertSearchTerm.get(
        payload.account.customerId, payload.account.customerName, row.campaign, row.adGroup,
        row.searchTerm, row.triggeringKeyword, row.matchType, row.destinationUrl,
        row.impressions, row.clicks, row.spend, row.conversions,
      ) as { id: number };
      if (row.proposedAction === "no action") {
        removeRecommendation.run(savedTerm.id);
      } else {
        upsertRecommendation.run(
          savedTerm.id, row.classification, row.mismatchCategory, row.explanation,
          row.proposedAction, row.safetyScore, row.safetyBand,
          JSON.stringify(row.scoreBreakdown), JSON.stringify(row.hardGateFailures),
        );
      }
    }
    database.exec("commit;");

    const stored = database.prepare(`
      select st.id as search_term_id, rec.id as recommendation_id,
             st.google_customer_id, st.campaign_name, st.ad_group_name, st.search_term,
             rec.current_decision, rec.review_status
      from ad_automation_search_terms st
      left join ad_automation_search_term_recommendations rec on rec.search_term_id = st.id
      where st.google_customer_id = ?
    `).all(payload.account.customerId) as unknown as StoredResult[];
    const byIdentity = new Map(stored.map((row) => [identity(row.google_customer_id, {
      campaign: row.campaign_name, adGroup: row.ad_group_name, searchTerm: row.search_term,
    }), row]));

    return {
      ...payload,
      results: payload.results.map((row) => {
        const saved = byIdentity.get(identity(payload.account.customerId, row));
        if (!saved) return row;
        return {
          ...row,
          id: saved.recommendation_id ? String(saved.recommendation_id) : `term-${saved.search_term_id}`,
          recommendationId: saved.recommendation_id ? String(saved.recommendation_id) : undefined,
          reviewStatus: saved.review_status ?? undefined,
          reviewDecision: saved.current_decision === "submit_for_approval"
            ? "approved"
            : saved.current_decision === "reject"
              ? "rejected"
              : saved.current_decision === "kiv" ? "to_be_determined" : undefined,
        };
      }),
    };
  } catch (error) {
    try { database.exec("rollback;"); } catch { /* transaction may already be closed */ }
    throw error;
  } finally {
    database.close();
  }
}

export function saveSpecialistDecision(input: {
  recommendationIds: number[];
  decision: SpecialistDecision;
  reviewer: { id: string; email: string; role: string };
}) {
  const database = openDatabase();
  try {
    const current = database.prepare(`
      select id, review_status, current_decision
      from ad_automation_search_term_recommendations
      where id = ?
    `);
    const update = database.prepare(`
      update ad_automation_search_term_recommendations
      set review_status = ?, current_decision = ?, last_reviewed_by_user_id = ?,
          last_reviewed_at = datetime('now'), updated_at = datetime('now')
      where id = ?
    `);
    const insertReview = database.prepare(`
      insert into ad_automation_search_term_reviews (
        recommendation_id, reviewer_user_id, reviewer_email, reviewer_role,
        action, previous_status, resulting_status, metadata
      ) values (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const resultingStatus = input.decision === "approved"
      ? "ready_for_approval"
      : input.decision === "rejected" ? "rejected" : "kiv";
    const currentDecision = input.decision === "approved"
      ? "submit_for_approval"
      : input.decision === "rejected" ? "reject" : "kiv";
    const action = input.decision === "approved"
      ? "submit_for_approval"
      : input.decision === "rejected" ? "reject" : "mark_kiv";
    let updated = 0;
    let skipped = 0;

    database.exec("begin immediate;");
    for (const recommendationId of input.recommendationIds) {
      const row = current.get(recommendationId) as {
        id: number;
        review_status: string;
        current_decision: string | null;
      } | undefined;
      if (!row) throw new Error(`Recommendation ${recommendationId} was not found.`);
      if (row.review_status === resultingStatus && row.current_decision === currentDecision) {
        skipped += 1;
        continue;
      }
      update.run(resultingStatus, currentDecision, input.reviewer.id, recommendationId);
      insertReview.run(
        recommendationId, input.reviewer.id, input.reviewer.email, input.reviewer.role,
        action, row.review_status, resultingStatus,
        JSON.stringify({ source: "search-term-optimization", decision: input.decision }),
      );
      updated += 1;
    }
    database.exec("commit;");
    return { updated, skipped, decision: input.decision };
  } catch (error) {
    try { database.exec("rollback;"); } catch { /* transaction may already be closed */ }
    throw error;
  } finally {
    database.close();
  }
}
