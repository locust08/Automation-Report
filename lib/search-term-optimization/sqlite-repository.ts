import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { OptimizationDashboardPayload, OptimizationResult } from "@/lib/search-term-optimization/types";
import { safetyBand } from "@/lib/search-term-optimization/scoring";
import { getSearchTermAccountSettings } from "@/lib/search-term-optimization/account-settings";

type StoredResult = {
  search_term_id: number;
  recommendation_id: number | null;
  google_customer_id: string;
  campaign_name: string;
  ad_group_name: string;
  search_term: string;
  qualified_leads: number | null;
  spam_leads: number | null;
  invalid_leads: number | null;
  client_complaints: number | null;
  first_detected_at: string | null;
  last_reviewed_at: string | null;
  previous_decision: string | null;
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

export type SpecialistDecision = "approved" | "rejected";
export type ApproverDecision = "accepted" | "rejected";

export type SearchTermDecisionSummaryRow = {
  customerId: string;
  customerName: string;
  searchTerm: string;
  campaign: string;
  outcome: "approved" | "negative";
  clicks: number;
  spend: number;
  conversions: number;
  classification: string;
  decidedAt: string | null;
};

function openDatabase() {
  const databasePath = resolve(process.env.SEARCH_TERM_SQLITE_PATH || "data/search-term-optimization.sqlite");
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  const schema = readFileSync(resolve("lib/search-term-optimization/sqlite-schema.sql"), "utf8");
  migrateApproverSchema(database, schema);
  ensureSearchTermColumns(database);
  database.exec("pragma foreign_keys = on;");
  return database;
}

export function listSearchTermDecisionSummaryRows(): SearchTermDecisionSummaryRow[] {
  const database = openDatabase();
  try {
    return (database.prepare(`
      select
        st.google_customer_id as customerId,
        coalesce(nullif(st.customer_name, ''), 'Google Ads account') as customerName,
        st.search_term as searchTerm,
        st.campaign_name as campaign,
        case
          when rec.review_status = 'approved_for_publishing' then 'approved'
          else 'negative'
        end as outcome,
        st.clicks as clicks,
        st.spend as spend,
        st.conversions as conversions,
        rec.classification as classification,
        rec.last_reviewed_at as decidedAt
      from ad_automation_search_term_recommendations rec
      join ad_automation_search_terms st on st.id = rec.search_term_id
      where rec.review_status in ('approved_for_publishing', 'approver_rejected')
      order by customerName collate nocase, outcome, rec.last_reviewed_at desc, rec.id desc
    `).all() as Array<Record<string, string | number | null>>).map((row) => ({
      customerId: String(row.customerId),
      customerName: String(row.customerName),
      searchTerm: String(row.searchTerm),
      campaign: String(row.campaign),
      outcome: row.outcome === "approved" ? "approved" : "negative",
      clicks: Number(row.clicks ?? 0),
      spend: Number(row.spend ?? 0),
      conversions: Number(row.conversions ?? 0),
      classification: String(row.classification ?? "Unclear"),
      decidedAt: row.decidedAt ? String(row.decidedAt) : null,
    }));
  } finally {
    database.close();
  }
}

function ensureSearchTermColumns(database: DatabaseSync) {
  const existing = new Set((database.prepare("pragma table_info(ad_automation_search_terms)").all() as Array<{ name: string }>).map((column) => column.name));
  const columns: Array<[string, string]> = [
    ["source_resource_name", "text"], ["asset_group_name", "text"],
    ["added_excluded_status", "text"], ["data_retrieved_at", "text"],
    ["reporting_start_date", "text"], ["reporting_end_date", "text"],
  ];
  for (const [name, type] of columns) if (!existing.has(name)) database.exec(`alter table ad_automation_search_terms add column ${name} ${type}`);
  const recommendationColumns = new Set((database.prepare("pragma table_info(ad_automation_search_term_recommendations)").all() as Array<{ name: string }>).map((column) => column.name));
  if (!recommendationColumns.has("source_action")) database.exec("alter table ad_automation_search_term_recommendations add column source_action text");
  const changeSetColumns = new Set((database.prepare("pragma table_info(ad_automation_search_term_change_sets)").all() as Array<{ name: string }>).map((column) => column.name));
  const publishingColumns: Array<[string, string]> = [
    ["published_by_user_id", "text"], ["published_by_email", "text"], ["published_at", "text"],
    ["verification_status", "text not null default 'pending'"], ["verified_at", "text"], ["verification_details", "text"],
  ];
  for (const [name, type] of publishingColumns) if (!changeSetColumns.has(name)) database.exec(`alter table ad_automation_search_term_change_sets add column ${name} ${type}`);
  // The prototype now uses a single review stage. Migrate proposals left in
  // the former Final Review queue into their terminal category.
  database.exec(`
    update ad_automation_search_term_recommendations
    set review_status = case
          when current_decision in ('submit_for_approval', 'approver_approved') then 'approved_for_publishing'
          when current_decision in ('reject', 'approver_rejected') then 'approver_rejected'
          else review_status
        end,
        current_decision = case
          when current_decision in ('submit_for_approval', 'approver_approved') then 'approver_approved'
          when current_decision in ('reject', 'approver_rejected') then 'approver_rejected'
          else current_decision
        end,
        updated_at = datetime('now')
    where review_status = 'ready_for_approval'
  `);
  // KIV was removed from the two-stage search-term workflow. Existing KIV rows
  // return to the first-review queue with no proposed decision.
  database.exec(`
    update ad_automation_search_term_recommendations
    set previous_decision = coalesce(previous_decision, current_decision),
        review_status = 'pending', current_decision = null, updated_at = datetime('now')
    where review_status = 'kiv' or current_decision = 'kiv'
  `);
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
        google_customer_id, customer_name, source_run_id, source_resource_name,
        campaign_id, campaign_name, ad_group_id, ad_group_name, asset_group_name, search_term,
        triggering_keyword, match_type, added_excluded_status, destination_url, impressions, clicks, spend,
        conversions, data_retrieved_at, reporting_start_date, reporting_end_date, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      on conflict do update set
        customer_name = excluded.customer_name,
        source_run_id = excluded.source_run_id,
        source_resource_name = excluded.source_resource_name,
        campaign_id = excluded.campaign_id,
        ad_group_id = excluded.ad_group_id,
        asset_group_name = excluded.asset_group_name,
        triggering_keyword = excluded.triggering_keyword,
        match_type = excluded.match_type,
        added_excluded_status = excluded.added_excluded_status,
        destination_url = excluded.destination_url,
        impressions = excluded.impressions,
        clicks = excluded.clicks,
        spend = excluded.spend,
        conversions = excluded.conversions,
        data_retrieved_at = excluded.data_retrieved_at,
        reporting_start_date = excluded.reporting_start_date,
        reporting_end_date = excluded.reporting_end_date,
        updated_at = datetime('now')
      returning id
    `);
    const upsertRecommendation = database.prepare(`
      insert into ad_automation_search_term_recommendations (
        search_term_id, classification, mismatch_category, ai_reason, proposed_action, source_action,
        safety_score, safety_band, score_breakdown, hard_gate_failures, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      on conflict do update set
        classification = excluded.classification,
        mismatch_category = excluded.mismatch_category,
        ai_reason = excluded.ai_reason,
        proposed_action = excluded.proposed_action,
        source_action = excluded.source_action,
        safety_score = excluded.safety_score,
        safety_band = excluded.safety_band,
        score_breakdown = excluded.score_breakdown,
        hard_gate_failures = excluded.hard_gate_failures,
        updated_at = datetime('now')
    `);
    database.exec("begin immediate;");
    for (const row of payload.results) {
      const savedTerm = upsertSearchTerm.get(
        payload.account.customerId, payload.account.customerName, payload.account.lastAnalysisAt, row.searchTermResourceName,
        row.campaignId, row.campaign, row.adGroupId, row.adGroup, row.assetGroup, row.searchTerm,
        row.triggeringKeyword, row.matchType, row.addedExcludedStatus, row.destinationUrl,
        row.impressions, row.clicks, row.spend, row.conversions, row.dataRetrievedAt,
        payload.account.reportingPeriod.startDate, payload.account.reportingPeriod.endDate,
      ) as { id: number };
      upsertRecommendation.run(
        savedTerm.id, row.classification, row.mismatchCategory, row.explanation,
        row.proposedAction === "no action" ? "special review needed" : row.proposedAction,
        row.proposedAction, row.safetyScore, row.safetyBand,
        JSON.stringify(row.scoreBreakdown), JSON.stringify(row.hardGateFailures),
      );
    }
    database.exec("commit;");

    const stored = database.prepare(`
      select st.id as search_term_id, rec.id as recommendation_id,
             st.google_customer_id, st.campaign_name, st.ad_group_name, st.search_term,
             st.qualified_leads, st.spam_leads, st.invalid_leads, st.client_complaints,
             st.first_detected_at, rec.last_reviewed_at, rec.previous_decision,
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
    const settings = getSearchTermAccountSettings(payload.account.customerId, payload.account.lastAnalysisAt);
    return {
      ...payload,
      account: { ...payload.account, nextRunAt: settings.nextRunAt },
      settings,
      results: payload.results.map((row) => {
        const saved = byIdentity.get(identity(payload.account.customerId, row));
        if (!saved) return row;
        return applyAccountSettings(applyStoredContext({
          ...row,
          searchTermId: String(saved.search_term_id),
          qualifiedLeads: saved.qualified_leads,
          spamLeads: saved.spam_leads,
          invalidLeads: saved.invalid_leads,
          clientComplaints: saved.client_complaints,
          firstDetectedAt: saved.first_detected_at,
          lastReviewedAt: saved.last_reviewed_at,
          previousDecision: saved.previous_decision,
          id: saved.recommendation_id ? String(saved.recommendation_id) : `term-${saved.search_term_id}`,
          recommendationId: saved.recommendation_id ? String(saved.recommendation_id) : undefined,
          reviewStatus: saved.review_status ?? undefined,
          reviewDecision: saved.current_decision === "submit_for_approval" || saved.current_decision === "approver_approved"
            ? "approved"
            : saved.current_decision === "keep"
              ? "approved"
            : saved.current_decision === "reject" || saved.current_decision === "approver_rejected"
              ? "rejected"
              : undefined,
          approverDecision: saved.current_decision === "approver_approved" || saved.current_decision === "approver_rejected"
            ? "accepted"
            : saved.current_decision === "return_to_specialist" ? "rejected" : undefined,
        }), settings);
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

function applyAccountSettings(row: OptimizationResult, settings: OptimizationDashboardPayload["settings"]): OptimizationResult {
  const safetyBand = row.safetyScore >= settings.autoSafeScoreThreshold
    ? "auto-safe" as const
    : row.safetyScore >= settings.reviewScoreThreshold ? "review-recommended" as const : "no-automatic-action" as const;
  const critical = (row.clientComplaints ?? 0) > 0 || (row.spamLeads ?? 0) > 0 || row.spend >= settings.highSpendThreshold * 2;
  const high = row.spend >= settings.highSpendThreshold || row.clicks >= settings.minimumClicksThreshold;
  const priority = critical ? "critical" as const : high ? "high" as const : row.clicks > 0 || row.spend > 0 ? "medium" as const : "normal" as const;
  return {
    ...row,
    safetyBand,
    executionEligibility: row.safetyScore >= settings.autoSafeScoreThreshold && row.hardGateFailures.length === 0,
    priority,
  };
}

function applyStoredContext(row: OptimizationResult): OptimizationResult {
  const qualifiedSignal = row.qualifiedLeads === null ? null : row.qualifiedLeads === 0;
  const scoreBreakdown = row.scoreBreakdown.map((item) => item.signal === "No available qualified-lead signal"
    ? { ...item, applied: qualifiedSignal === true, status: qualifiedSignal === null ? "unknown" as const : qualifiedSignal ? "yes" as const : "no" as const }
    : item);
  const safetyScore = Math.max(0, Math.min(100, scoreBreakdown.reduce((total, item) => total + (item.applied ? item.points : 0), 0)));
  const unknownGate = "Required signal is unknown: qualified-lead signal";
  const hardGateFailures = row.hardGateFailures.filter((failure) => failure !== unknownGate && failure !== "Search term has qualified leads");
  if (row.qualifiedLeads === null) hardGateFailures.push(unknownGate);
  else if (row.qualifiedLeads > 0) hardGateFailures.push("Search term has qualified leads");
  const executionEligibility = safetyScore >= 90 && hardGateFailures.length === 0;
  return { ...row, scoreBreakdown, safetyScore, safetyBand: safetyBand(safetyScore), hardGateFailures, executionEligibility };
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
             rec.safety_score, rec.classification, rec.ai_reason,
             st.google_customer_id, st.customer_name, st.search_term,
             st.campaign_name, st.ad_group_name, st.source_run_id, st.match_type,
             st.impressions, st.clicks, st.spend, st.conversions,
             st.reporting_start_date, st.reporting_end_date
      from ad_automation_search_term_recommendations rec
      join ad_automation_search_terms st on st.id = rec.search_term_id
      where rec.id in (${placeholders})
      order by rec.id
    `).all(...input.recommendationIds) as Array<Record<string, string | number | null>>;
    if (rows.length !== input.recommendationIds.length) throw new Error("One or more recommendations were not found.");
    const accounts = new Set(rows.map((row) => String(row.google_customer_id)));
    if (accounts.size !== 1) throw new Error("A change set can contain recommendations from only one account.");
    const approvalRows = rows.filter((row) => row.current_decision === "submit_for_approval");
    const rejectionRows = rows.filter((row) => row.current_decision === "reject");
    const alreadyAccepted = rows.every((row) =>
      row.current_decision === "approver_approved" || row.current_decision === "approver_rejected"
    );
    const alreadyReturned = rows.every((row) => row.current_decision === "return_to_specialist");
    if ((input.decision === "accepted" && alreadyAccepted) || (input.decision === "rejected" && alreadyReturned)) {
      const existing = database.prepare(`
        select change_set_id from ad_automation_search_term_change_set_items
        where recommendation_id in (${placeholders}) order by id desc limit 1
      `).get(...input.recommendationIds) as { change_set_id?: number } | undefined;
      return { updated: 0, skipped: rows.length, decision: input.decision, changeSetId: existing?.change_set_id ? String(existing.change_set_id) : null };
    }
    if (rows.some((row) => row.review_status !== "ready_for_approval")) {
      throw new Error("Every selected recommendation must be awaiting final review.");
    }
    if (approvalRows.length + rejectionRows.length !== rows.length) {
      throw new Error("Every selected recommendation must preserve an Approve or Reject proposal.");
    }
    const sourceTimes = approvalRows.map((row) => Date.parse(String(row.source_run_id ?? "")));
    if (input.decision === "accepted" && sourceTimes.some((timestamp) => !Number.isFinite(timestamp) || Date.now() - timestamp > 48 * 60 * 60 * 1000)) {
      throw new Error("The Google Ads analysis is stale. Refresh the analysis before approval.");
    }
    const update = database.prepare(`
      update ad_automation_search_term_recommendations
      set review_status = ?, previous_decision = current_decision, current_decision = ?, last_reviewed_by_user_id = ?,
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
    if (input.decision === "accepted" && approvalRows.length > 0) {
      const idempotencyKey = `${String(rows[0].google_customer_id)}:${approvalRows.map((row) => row.id).join("-")}`;
      const changeSet = database.prepare(`
        insert into ad_automation_search_term_change_sets (
          google_customer_id, approved_by_user_id, approved_by_email, item_count, idempotency_key
        ) values (?, ?, ?, ?, ?)
      `).run(String(rows[0].google_customer_id), input.approver.id, input.approver.email, approvalRows.length, idempotencyKey);
      changeSetId = changeSet.lastInsertRowid;
      const insertItem = database.prepare(`
        insert into ad_automation_search_term_change_set_items (
          change_set_id, recommendation_id, search_term, campaign_name, ad_group_name,
          proposed_action, safety_score, snapshot_json
        ) values (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const row of approvalRows) {
        insertItem.run(
          changeSetId, row.id, row.search_term, row.campaign_name, row.ad_group_name,
          row.proposed_action, row.safety_score, JSON.stringify(row),
        );
      }
    }
    for (const row of rows) {
      const acceptedApproval = input.decision === "accepted" && row.current_decision === "submit_for_approval";
      const acceptedRejection = input.decision === "accepted" && row.current_decision === "reject";
      const resultingStatus = acceptedApproval
        ? "approved_for_publishing"
        : acceptedRejection ? "approver_rejected" : "returned_for_clarification";
      const currentDecision = acceptedApproval
        ? "approver_approved"
        : acceptedRejection ? "approver_rejected" : "return_to_specialist";
      const historyAction = acceptedApproval
        ? "approver_approve"
        : acceptedRejection ? "approver_reject" : "return_for_clarification";
      const result = update.run(resultingStatus, currentDecision, input.approver.id, row.id);
      if (result.changes !== 1) throw new Error(`Recommendation ${row.id} changed before approval completed.`);
      insertHistory.run(
        row.id, input.approver.id, input.approver.email, input.approver.role,
        historyAction, resultingStatus, JSON.stringify({ decision: input.decision, proposedDecision: row.current_decision, changeSetId }),
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
      select id, review_status, current_decision, source_action
      from ad_automation_search_term_recommendations
      where id = ?
    `);
    const update = database.prepare(`
      update ad_automation_search_term_recommendations
      set review_status = ?, previous_decision = current_decision, current_decision = ?, last_reviewed_by_user_id = ?,
          last_reviewed_at = datetime('now'), updated_at = datetime('now')
      where id = ?
    `);
    const insertReview = database.prepare(`
      insert into ad_automation_search_term_reviews (
        recommendation_id, reviewer_user_id, reviewer_email, reviewer_role,
        action, previous_status, resulting_status, metadata
      ) values (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let updated = 0;
    let skipped = 0;

    database.exec("begin immediate;");
    for (const recommendationId of input.recommendationIds) {
      const row = current.get(recommendationId) as {
        id: number;
        review_status: string;
        current_decision: string | null;
        source_action: string | null;
      } | undefined;
      if (!row) throw new Error(`Recommendation ${recommendationId} was not found.`);
      // One-stage prototype: the specialist decision is terminal immediately.
      const resultingStatus = input.decision === "approved" ? "approved_for_publishing" : "approver_rejected";
      const currentDecision = input.decision === "approved" ? "approver_approved" : "approver_rejected";
      const action = input.decision === "approved" ? "submit_for_approval" : "reject";
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
