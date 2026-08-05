import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { OptimizationDashboardPayload, OptimizationResult, OptimizationReviewEvent } from "@/lib/search-term-optimization/types";

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

type StoredChangeSet = {
  id: number;
  status: string;
  item_count: number;
  approved_by_email: string;
  approved_at: string;
};

type StoredReviewEvent = {
  id: number;
  recommendation_id: number;
  reviewer_email: string;
  reviewer_role: string;
  action: string;
  previous_status: string | null;
  resulting_status: string;
  created_at: string;
};

export type SpecialistDecision = "approved" | "rejected" | "to_be_determined";
export type ApproverDecision = "approved" | "rejected" | "returned";

function openDatabase() {
  const databasePath = resolve(process.env.SEARCH_TERM_SQLITE_PATH || "data/search-term-optimization.sqlite");
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  const schema = readFileSync(resolve("lib/search-term-optimization/sqlite-schema.sql"), "utf8");
  migrateApproverSchema(database, schema);
  database.exec("pragma foreign_keys = on;");
  return database;
}

function migrateApproverSchema(database: DatabaseSync, schema: string) {
  const table = database.prepare(`
    select sql from sqlite_master
    where type = 'table' and name = 'ad_automation_search_term_recommendations'
  `).get() as { sql?: string } | undefined;
  if (!table?.sql || table.sql.includes("approved_for_publishing")) {
    database.exec(schema);
    return;
  }

  database.exec(`
    pragma foreign_keys = off;
    alter table ad_automation_search_term_reviews rename to legacy_search_term_reviews;
    alter table ad_automation_search_term_recommendations rename to legacy_search_term_recommendations;
    drop index if exists ad_search_term_recommendations_status_idx;
    drop index if exists ad_search_term_recommendations_reviewer_idx;
    drop index if exists ad_search_term_reviews_recommendation_idx;
    drop index if exists ad_search_term_reviews_reviewer_idx;
  `);
  database.exec(schema);
  database.exec(`
    insert into ad_automation_search_term_recommendations
    select * from legacy_search_term_recommendations;
    insert into ad_automation_search_term_reviews
    select * from legacy_search_term_reviews;
    drop table legacy_search_term_reviews;
    drop table legacy_search_term_recommendations;
    pragma foreign_keys = on;
  `);
}

function identity(customerId: string, row: Pick<OptimizationResult, "campaign" | "adGroup" | "searchTerm">) {
  return `${customerId}\u0000${row.campaign}\u0000${row.adGroup}\u0000${row.searchTerm}`;
}

export function persistDashboardToSqlite(payload: OptimizationDashboardPayload): OptimizationDashboardPayload {
  const database = openDatabase();
  try {
    const upsertSearchTerm = database.prepare(`
      insert into ad_automation_search_terms (
        google_customer_id, customer_name, source_run_id, campaign_name, ad_group_name, search_term,
        triggering_keyword, match_type, destination_url, impressions, clicks, spend,
        conversions, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      on conflict do update set
        customer_name = excluded.customer_name,
        source_run_id = excluded.source_run_id,
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
        payload.account.customerId, payload.account.customerName, payload.account.lastAnalysisAt, row.campaign, row.adGroup,
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
    const changeSets = database.prepare(`
      select id, status, item_count, approved_by_email, approved_at
      from ad_automation_search_term_change_sets
      where google_customer_id = ?
      order by id desc
      limit 20
    `).all(payload.account.customerId) as unknown as StoredChangeSet[];
    const storedReviewEvents = database.prepare(`
      select reviews.id, reviews.recommendation_id, reviews.reviewer_email,
             reviews.reviewer_role, reviews.action, reviews.previous_status,
             reviews.resulting_status, reviews.created_at
      from ad_automation_search_term_reviews reviews
      join ad_automation_search_term_recommendations rec on rec.id = reviews.recommendation_id
      join ad_automation_search_terms st on st.id = rec.search_term_id
      where st.google_customer_id = ?
      order by reviews.id desc
    `).all(payload.account.customerId) as unknown as StoredReviewEvent[];
    const reviewEventsByRecommendation = new Map<number, OptimizationReviewEvent[]>();
    for (const event of storedReviewEvents) {
      const events = reviewEventsByRecommendation.get(event.recommendation_id) ?? [];
      events.push({
        id: String(event.id),
        reviewerEmail: event.reviewer_email,
        reviewerRole: event.reviewer_role,
        action: event.action,
        previousStatus: event.previous_status,
        resultingStatus: event.resulting_status,
        createdAt: event.created_at,
      });
      reviewEventsByRecommendation.set(event.recommendation_id, events);
    }

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
          approverDecision: saved.current_decision === "approver_approved"
            ? "approved"
            : saved.current_decision === "approver_rejected"
              ? "rejected"
              : saved.current_decision === "return_to_specialist" ? "returned" : undefined,
          reviewHistory: saved.recommendation_id
            ? reviewEventsByRecommendation.get(saved.recommendation_id) ?? []
            : [],
        };
      }),
      changeSets: changeSets.map((changeSet) => ({
        id: String(changeSet.id),
        status: changeSet.status,
        itemCount: changeSet.item_count,
        approvedByEmail: changeSet.approved_by_email,
        approvedAt: changeSet.approved_at,
      })),
    };
  } catch (error) {
    try { database.exec("rollback;"); } catch { /* transaction may already be closed */ }
    throw error;
  } finally {
    database.close();
  }
}

export function saveApproverDecision(input: {
  recommendationIds: number[];
  decision: ApproverDecision;
  approver: { id: string; email: string; role: string };
}) {
  const database = openDatabase();
  try {
    const placeholders = input.recommendationIds.map(() => "?").join(",");
    const rows = database.prepare(`
      select rec.id, rec.review_status, rec.current_decision, rec.proposed_action,
             rec.safety_score, st.google_customer_id, st.search_term,
             st.campaign_name, st.ad_group_name, st.source_run_id
      from ad_automation_search_term_recommendations rec
      join ad_automation_search_terms st on st.id = rec.search_term_id
      where rec.id in (${placeholders})
      order by rec.id
    `).all(...input.recommendationIds) as Array<Record<string, string | number | null>>;
    if (rows.length !== input.recommendationIds.length) throw new Error("One or more recommendations were not found.");
    const accounts = new Set(rows.map((row) => String(row.google_customer_id)));
    if (accounts.size !== 1) throw new Error("A change set can contain recommendations from only one account.");
    const sourceTimes = rows.map((row) => Date.parse(String(row.source_run_id ?? "")));
    if (input.decision === "approved" && sourceTimes.some((timestamp) => !Number.isFinite(timestamp) || Date.now() - timestamp > 48 * 60 * 60 * 1000)) {
      throw new Error("The Google Ads analysis is stale. Refresh the analysis before approval.");
    }
    const resultingStatus = input.decision === "approved"
      ? "approved_for_publishing"
      : input.decision === "rejected" ? "approver_rejected" : "returned_for_clarification";
    const currentDecision = input.decision === "approved"
      ? "approver_approved"
      : input.decision === "rejected" ? "approver_rejected" : "return_to_specialist";
    const historyAction = input.decision === "approved"
      ? "approver_approve"
      : input.decision === "rejected" ? "approver_reject" : "return_for_clarification";
    if (rows.every((row) => row.review_status === resultingStatus && row.current_decision === currentDecision)) {
      const existing = input.decision === "approved" ? database.prepare(`
        select change_set_id from ad_automation_search_term_change_set_items
        where recommendation_id = ? order by id desc limit 1
      `).get(rows[0].id) as { change_set_id?: number } | undefined : undefined;
      return { updated: 0, skipped: rows.length, decision: input.decision, changeSetId: existing?.change_set_id ? String(existing.change_set_id) : null };
    }
    if (rows.some((row) => row.review_status !== "ready_for_approval")) {
      throw new Error("Every selected recommendation must be awaiting approval.");
    }
    const update = database.prepare(`
      update ad_automation_search_term_recommendations
      set review_status = ?, current_decision = ?, last_reviewed_by_user_id = ?,
          last_reviewed_at = datetime('now'), updated_at = datetime('now')
      where id = ? and review_status = 'ready_for_approval'
    `);
    const insertHistory = database.prepare(`
      insert into ad_automation_search_term_reviews (
        recommendation_id, reviewer_user_id, reviewer_email, reviewer_role,
        action, previous_status, resulting_status, metadata
      ) values (?, ?, ?, ?, ?, 'ready_for_approval', ?, ?)
    `);

    database.exec("begin immediate;");
    let changeSetId: number | bigint | null = null;
    if (input.decision === "approved") {
      const idempotencyKey = `${String(rows[0].google_customer_id)}:${rows.map((row) => row.id).join("-")}`;
      const changeSet = database.prepare(`
        insert into ad_automation_search_term_change_sets (
          google_customer_id, approved_by_user_id, approved_by_email, item_count, idempotency_key
        ) values (?, ?, ?, ?, ?)
      `).run(String(rows[0].google_customer_id), input.approver.id, input.approver.email, rows.length, idempotencyKey);
      changeSetId = changeSet.lastInsertRowid;
      const insertItem = database.prepare(`
        insert into ad_automation_search_term_change_set_items (
          change_set_id, recommendation_id, search_term, campaign_name, ad_group_name,
          proposed_action, safety_score, snapshot_json
        ) values (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const row of rows) {
        insertItem.run(
          changeSetId, row.id, row.search_term, row.campaign_name, row.ad_group_name,
          row.proposed_action, row.safety_score, JSON.stringify(row),
        );
      }
    }
    for (const row of rows) {
      const result = update.run(resultingStatus, currentDecision, input.approver.id, row.id);
      if (result.changes !== 1) throw new Error(`Recommendation ${row.id} changed before approval completed.`);
      insertHistory.run(
        row.id, input.approver.id, input.approver.email, input.approver.role,
        historyAction, resultingStatus, JSON.stringify({ decision: input.decision, changeSetId }),
      );
    }
    database.exec("commit;");
    return { updated: rows.length, decision: input.decision, changeSetId: changeSetId ? String(changeSetId) : null };
  } catch (error) {
    try { database.exec("rollback;"); } catch { /* transaction may already be closed */ }
    throw error;
  } finally {
    database.close();
  }
}

export function resetRecommendationsForApproverTesting() {
  const database = openDatabase();
  try {
    return database.prepare(`
      update ad_automation_search_term_recommendations
      set review_status = 'ready_for_approval', current_decision = 'submit_for_approval',
          updated_at = datetime('now')
      where review_status not in ('approved_for_publishing')
    `).run().changes;
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
