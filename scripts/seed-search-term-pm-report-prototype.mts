import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const databasePath = resolve(process.env.SEARCH_TERM_SQLITE_PATH || "data/search-term-optimization.sqlite");
const database = new DatabaseSync(databasePath);
database.exec(readFileSync(resolve("lib/search-term-optimization/sqlite-schema.sql"), "utf8"));
ensureColumns(database, "ad_automation_search_terms", [
  ["reporting_start_date", "text"], ["reporting_end_date", "text"],
]);
ensureColumns(database, "ad_automation_search_term_change_sets", [
  ["published_by_user_id", "text"], ["published_by_email", "text"], ["published_at", "text"],
  ["verification_status", "text not null default 'pending'"], ["verified_at", "text"], ["verification_details", "text"],
]);

const fixtureKey = "local-prototype-pm-report-v1";
const existing = database.prepare("select id from ad_automation_search_term_change_sets where idempotency_key = ?").get(fixtureKey) as { id: number } | undefined;
let changeSetId = existing?.id;

if (!changeSetId) {
  database.exec("begin immediate;");
  try {
    const term = database.prepare(`
      insert into ad_automation_search_terms (
        source_run_id, source_resource_name, google_customer_id, customer_name,
        campaign_id, campaign_name, ad_group_id, ad_group_name, search_term,
        triggering_keyword, match_type, added_excluded_status, impressions, clicks,
        spend, conversions, data_retrieved_at, reporting_start_date, reporting_end_date
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
    `).run(
      "local-prototype-pm-report", "customers/9858507935/searchTermViews/prototype-pm-report",
      "9858507935", "JET Trading Sdn Bhd (Prototype example)", "prototype-campaign",
      "LT | SEM | High Pressure Cleaner", "prototype-ad-group", "General",
      "cheap residential plumbing repair", "high pressure cleaner", "BROAD", "NONE",
      18, 3, 12.75, 0, "2026-07-01", "2026-07-31",
    );
    const recommendation = database.prepare(`
      insert into ad_automation_search_term_recommendations (
        search_term_id, classification, mismatch_category, ai_reason, proposed_action,
        safety_score, safety_band, score_breakdown, hard_gate_failures,
        review_status, current_decision, last_reviewed_by_user_id, last_reviewed_at
      ) values (?, ?, ?, ?, 'negative exact', 95, 'auto-safe', '[]', '[]',
        'approved_for_publishing', 'approver_approved', 'prototype-approver', datetime('now'))
    `).run(term.lastInsertRowid, "Wrong service", "wrong_service", "The query asks for residential plumbing repair, which is unrelated to the advertised industrial pressure-cleaning equipment.");
    const changeSet = database.prepare(`
      insert into ad_automation_search_term_change_sets (
        google_customer_id, status, approved_by_user_id, approved_by_email, approved_at,
        published_by_user_id, published_by_email, published_at, verification_status,
        verified_at, verification_details, item_count, idempotency_key
      ) values (?, 'published', ?, ?, datetime('now', '-5 minutes'), ?, ?, datetime('now', '-2 minutes'),
        'verified', datetime('now'), ?, 1, ?)
    `).run(
      "9858507935", "prototype-approver", "prototype.approver@locus-t.com.my",
      "prototype-publisher", "prototype.publisher@locus-t.com.my",
      "LOCAL PROTOTYPE ONLY — simulated Google Ads verification", fixtureKey,
    );
    changeSetId = Number(changeSet.lastInsertRowid);
    database.prepare(`
      insert into ad_automation_search_term_change_set_items (
        change_set_id, recommendation_id, search_term, campaign_name, ad_group_name,
        proposed_action, safety_score, snapshot_json
      ) values (?, ?, ?, ?, ?, 'negative exact', 95, ?)
    `).run(
      changeSetId, recommendation.lastInsertRowid, "cheap residential plumbing repair",
      "LT | SEM | High Pressure Cleaner", "General",
      JSON.stringify({
        search_term: "cheap residential plumbing repair",
        campaign_name: "LT | SEM | High Pressure Cleaner",
        ad_group_name: "General",
        proposed_action: "negative exact",
        classification: "Wrong service",
        ai_reason: "The query asks for residential plumbing repair, which is unrelated to the advertised industrial pressure-cleaning equipment.",
        spend: 12.75, clicks: 3, conversions: 0,
      }),
    );
    database.exec("commit;");
  } catch (error) {
    database.exec("rollback;");
    throw error;
  }
}
database.close();

const { generateSearchTermPmReport } = await import("../lib/search-term-pm-reports/sqlite-repository");
const report = generateSearchTermPmReport(Number(changeSetId));
console.log(`Prototype PM report ${report.id} is ready for ${report.customerName}.`);

function ensureColumns(database: DatabaseSync, table: string, additions: Array<[string, string]>) {
  const columns = new Set((database.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name));
  for (const [name, type] of additions) if (!columns.has(name)) database.exec(`alter table ${table} add column ${name} ${type}`);
}
