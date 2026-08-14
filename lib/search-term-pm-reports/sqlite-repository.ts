import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { SearchTermPmReport, SearchTermPmReportItem, SearchTermPmReportList, SearchTermPmReportSummary } from "./types";

type Row = Record<string, string | number | null>;

function openDatabase() {
  const databasePath = resolve(/* turbopackIgnore: true */ process.env.SEARCH_TERM_SQLITE_PATH || "data/search-term-optimization.sqlite");
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(readFileSync(resolve("lib/search-term-optimization/sqlite-schema.sql"), "utf8"));
  const columns = new Set((database.prepare("pragma table_info(ad_automation_search_term_change_sets)").all() as Array<{ name: string }>).map((column) => column.name));
  const additions: Array<[string, string]> = [
    ["published_by_user_id", "text"], ["published_by_email", "text"], ["published_at", "text"],
    ["verification_status", "text not null default 'pending'"], ["verified_at", "text"], ["verification_details", "text"],
  ];
  for (const [name, type] of additions) if (!columns.has(name)) database.exec(`alter table ad_automation_search_term_change_sets add column ${name} ${type}`);
  database.exec("pragma foreign_keys = on;");
  return database;
}

export function listSearchTermPmReports(input: { accountId?: string; startDate?: string; endDate?: string; limit?: number; offset?: number } = {}): SearchTermPmReportList {
  const database = openDatabase();
  try {
    const limit = Math.min(50, Math.max(1, input.limit ?? 10));
    const offset = Math.max(0, input.offset ?? 0);
    const filters: string[] = [];
    const values: Array<string | number> = [];
    if (input.accountId) { filters.push("google_customer_id = ?"); values.push(input.accountId); }
    if (input.startDate) { filters.push("date(published_at) >= date(?)"); values.push(input.startDate); }
    if (input.endDate) { filters.push("date(published_at) <= date(?)"); values.push(input.endDate); }
    const where = filters.length ? `where ${filters.join(" and ")}` : "";
    const reports = database.prepare(`select * from ad_automation_search_term_pm_reports ${where} order by published_at desc, id desc limit ? offset ?`).all(...values, limit, offset) as Row[];
    const total = database.prepare(`select count(*) as count from ad_automation_search_term_pm_reports ${where}`).get(...values) as { count: number };
    const accounts = database.prepare(`select google_customer_id as id, max(customer_name) as name from ad_automation_search_term_pm_reports group by google_customer_id order by name`).all() as Array<{ id: string; name: string }>;
    const verifiedRows = database.prepare(`
      select cs.id, cs.google_customer_id, cs.item_count, cs.verified_at, reports.id as report_id,
             coalesce(max(st.customer_name), cs.google_customer_id) as customer_name
      from ad_automation_search_term_change_sets cs
      join ad_automation_search_term_change_set_items items on items.change_set_id = cs.id
      join ad_automation_search_term_recommendations rec on rec.id = items.recommendation_id
      join ad_automation_search_terms st on st.id = rec.search_term_id
      left join ad_automation_search_term_pm_reports reports on reports.change_set_id = cs.id
      where cs.status = 'published' and cs.verification_status = 'verified'
      group by cs.id, cs.google_customer_id, cs.item_count, cs.verified_at, reports.id
      order by cs.verified_at desc, cs.id desc
    `).all() as Row[];
    const verifiedChangeSets = verifiedRows.map((row) => ({
      id: String(row.id),
      googleCustomerId: String(row.google_customer_id),
      customerName: String(row.customer_name),
      itemCount: Number(row.item_count),
      verifiedAt: String(row.verified_at),
      reportId: row.report_id ? String(row.report_id) : null,
    }));
    return { reports: reports.map(mapSummary), accounts, verifiedChangeSets, total: Number(total.count), limit, offset };
  } finally { database.close(); }
}

export function getSearchTermPmReport(reportId: number): SearchTermPmReport | null {
  const database = openDatabase();
  try { return getReport(database, reportId); }
  finally { database.close(); }
}

export function generateSearchTermPmReport(changeSetId: number): SearchTermPmReport {
  const database = openDatabase();
  try {
    database.exec("begin immediate;");
    const existing = database.prepare("select id from ad_automation_search_term_pm_reports where change_set_id = ?").get(changeSetId) as { id: number } | undefined;
    if (existing) { database.exec("commit;"); return getReport(database, existing.id)!; }
    const changeSet = database.prepare("select * from ad_automation_search_term_change_sets where id = ?").get(changeSetId) as Row | undefined;
    if (!changeSet) throw new Error("Change set was not found.");
    if (changeSet.status !== "published" || changeSet.verification_status !== "verified" || !changeSet.published_at || !changeSet.verified_at || !changeSet.published_by_user_id || !changeSet.published_by_email) {
      throw new Error("A PM report requires a published and verified change set.");
    }
    const sourceItems = database.prepare(`
      select csi.id as change_set_item_id, csi.recommendation_id, csi.snapshot_json,
             csi.search_term, csi.campaign_name, csi.ad_group_name, csi.proposed_action,
             rec.classification, rec.ai_reason,
             st.customer_name, st.match_type, st.spend, st.clicks, st.conversions,
             st.reporting_start_date, st.reporting_end_date
      from ad_automation_search_term_change_set_items csi
      join ad_automation_search_term_recommendations rec on rec.id = csi.recommendation_id
      join ad_automation_search_terms st on st.id = rec.search_term_id
      where csi.change_set_id = ? order by csi.id
    `).all(changeSetId) as Row[];
    if (!sourceItems.length) throw new Error("Published change set has no reportable items.");
    const normalized = sourceItems.map(normalizeSourceItem);
    const campaigns = new Set(normalized.map((item) => item.campaignName));
    const first = sourceItems[0];
    const totals = normalized.reduce((value, item) => ({ spend: value.spend + item.spend, clicks: value.clicks + item.clicks, conversions: value.conversions + item.conversions }), { spend: 0, clicks: 0, conversions: 0 });
    const headerSnapshot = {
      changeSetId, googleCustomerId: String(changeSet.google_customer_id), customerName: String(first.customer_name || changeSet.google_customer_id),
      reportingStartDate: first.reporting_start_date, reportingEndDate: first.reporting_end_date,
      publishedByEmail: changeSet.published_by_email, publishedAt: changeSet.published_at,
      verifiedAt: changeSet.verified_at, verificationStatus: "verified", itemCount: normalized.length,
      affectedCampaignCount: campaigns.size, totals,
    };
    const reportResult = database.prepare(`
      insert into ad_automation_search_term_pm_reports (
        change_set_id, google_customer_id, customer_name, reporting_start_date, reporting_end_date,
        published_by_user_id, published_by_email, published_at, verification_status, verified_at,
        item_count, affected_campaign_count, total_spend, total_clicks, total_conversions, snapshot_json
      ) values (?, ?, ?, ?, ?, ?, ?, ?, 'verified', ?, ?, ?, ?, ?, ?, ?)
    `).run(changeSetId, changeSet.google_customer_id, headerSnapshot.customerName, first.reporting_start_date, first.reporting_end_date,
      changeSet.published_by_user_id, changeSet.published_by_email, changeSet.published_at, changeSet.verified_at,
      normalized.length, campaigns.size, totals.spend, totals.clicks, totals.conversions, JSON.stringify(headerSnapshot));
    const reportId = Number(reportResult.lastInsertRowid);
    const insertItem = database.prepare(`
      insert into ad_automation_search_term_pm_report_items (
        report_id, change_set_item_id, recommendation_id, campaign_name, ad_group_name, search_term,
        optimization_type, negative_match_type, classification, reason, spend, clicks, conversions, snapshot_json
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    normalized.forEach((item, index) => insertItem.run(reportId, sourceItems[index].change_set_item_id, item.recommendationId, item.campaignName, item.adGroupName, item.searchTerm, item.optimizationType, item.negativeMatchType, item.classification, item.reason, item.spend, item.clicks, item.conversions, JSON.stringify(item)));
    database.exec("commit;");
    return getReport(database, reportId)!;
  } catch (error) {
    try { database.exec("rollback;"); } catch { /* transaction may already be closed */ }
    throw error;
  } finally { database.close(); }
}

function normalizeSourceItem(row: Row): Omit<SearchTermPmReportItem, "id"> {
  let snapshot: Row = {};
  try { snapshot = JSON.parse(String(row.snapshot_json || "{}")) as Row; } catch { snapshot = {}; }
  const proposedAction = String(snapshot.proposed_action || row.proposed_action || "negative exact");
  return {
    recommendationId: String(row.recommendation_id), campaignName: String(snapshot.campaign_name || row.campaign_name),
    adGroupName: String(snapshot.ad_group_name || row.ad_group_name), searchTerm: String(snapshot.search_term || row.search_term),
    optimizationType: "Search-term exclusion", negativeMatchType: proposedAction === "negative phrase" ? "Negative phrase" : "Negative exact",
    classification: String(snapshot.classification || row.classification || "Unclear"), reason: String(snapshot.ai_reason || row.ai_reason || "Approved traffic-quality exclusion"),
    spend: Number(snapshot.spend ?? row.spend ?? 0), clicks: Number(snapshot.clicks ?? row.clicks ?? 0), conversions: Number(snapshot.conversions ?? row.conversions ?? 0),
  };
}

function getReport(database: DatabaseSync, reportId: number): SearchTermPmReport | null {
  const report = database.prepare("select * from ad_automation_search_term_pm_reports where id = ?").get(reportId) as Row | undefined;
  if (!report) return null;
  const items = database.prepare("select * from ad_automation_search_term_pm_report_items where report_id = ? order by id").all(reportId) as Row[];
  return { ...mapSummary(report), verificationStatus: "verified", items: items.map((row) => ({ id: String(row.id), recommendationId: String(row.recommendation_id), campaignName: String(row.campaign_name), adGroupName: String(row.ad_group_name), searchTerm: String(row.search_term), optimizationType: String(row.optimization_type), negativeMatchType: String(row.negative_match_type), classification: String(row.classification), reason: String(row.reason), spend: Number(row.spend), clicks: Number(row.clicks), conversions: Number(row.conversions) })) };
}

function mapSummary(row: Row): SearchTermPmReportSummary {
  return { id: String(row.id), changeSetId: String(row.change_set_id), googleCustomerId: String(row.google_customer_id), customerName: String(row.customer_name), reportingStartDate: row.reporting_start_date ? String(row.reporting_start_date) : null, reportingEndDate: row.reporting_end_date ? String(row.reporting_end_date) : null, publishedByEmail: String(row.published_by_email), publishedAt: String(row.published_at), verifiedAt: String(row.verified_at), itemCount: Number(row.item_count), affectedCampaignCount: Number(row.affected_campaign_count), totalSpend: Number(row.total_spend), totalClicks: Number(row.total_clicks), totalConversions: Number(row.total_conversions), generatedAt: String(row.generated_at) };
}
