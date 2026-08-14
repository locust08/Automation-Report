import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const databasePath = join(tmpdir(), `search-term-pm-report-${process.pid}.sqlite`);
process.env.SEARCH_TERM_SQLITE_PATH = databasePath;
const schema = readFileSync("lib/search-term-optimization/sqlite-schema.sql", "utf8");
const database = new DatabaseSync(databasePath);
database.exec(schema);
const term = database.prepare(`insert into ad_automation_search_terms (google_customer_id, customer_name, campaign_name, ad_group_name, search_term, match_type, clicks, spend, conversions, reporting_start_date, reporting_end_date) values ('9858507935','JET Trading Sdn Bhd','Search Campaign','General','irrelevant example','EXACT',4,25.50,0,'2026-07-01','2026-07-31')`).run();
const recommendation = database.prepare(`insert into ad_automation_search_term_recommendations (search_term_id, classification, ai_reason, proposed_action, safety_score, safety_band) values (?, 'Wrong service', 'The query requests an unrelated service.', 'negative exact', 95, 'auto-safe')`).run(term.lastInsertRowid);
const changeSet = database.prepare(`insert into ad_automation_search_term_change_sets (google_customer_id,status,approved_by_user_id,approved_by_email,published_by_user_id,published_by_email,published_at,verification_status,verified_at,verification_details,item_count,idempotency_key) values ('9858507935','published','approver','approver@example.com','publisher','publisher@example.com','2026-08-06 08:00:00','verified','2026-08-06 08:03:00','Mutation confirmed',1,'pm-report-test')`).run();
database.prepare(`insert into ad_automation_search_term_change_set_items (change_set_id,recommendation_id,search_term,campaign_name,ad_group_name,proposed_action,safety_score,snapshot_json) values (?,?,?,?,?,?,?,?)`).run(changeSet.lastInsertRowid, recommendation.lastInsertRowid, "irrelevant example", "Search Campaign", "General", "negative exact", 95, JSON.stringify({ search_term: "irrelevant example", campaign_name: "Search Campaign", ad_group_name: "General", classification: "Wrong service", ai_reason: "The query requests an unrelated service.", spend: 25.5, clicks: 4, conversions: 0 }));
const pending = database.prepare(`insert into ad_automation_search_term_change_sets (google_customer_id,status,approved_by_user_id,approved_by_email,item_count,idempotency_key) values ('9858507935','ready_for_publishing','approver','approver@example.com',1,'pm-report-pending')`).run();
database.close();

const repository = await import("../lib/search-term-pm-reports/sqlite-repository");
const report = repository.generateSearchTermPmReport(Number(changeSet.lastInsertRowid));
assert.equal(report.itemCount, 1);
assert.equal(report.items[0].searchTerm, "irrelevant example");
assert.equal(report.items[0].negativeMatchType, "Negative exact");
assert.equal(repository.generateSearchTermPmReport(Number(changeSet.lastInsertRowid)).id, report.id, "generation must be idempotent");
assert.throws(() => repository.generateSearchTermPmReport(Number(pending.lastInsertRowid)), /published and verified/);

const mutate = new DatabaseSync(databasePath);
mutate.prepare("update ad_automation_search_terms set search_term='changed later', spend=999 where id=?").run(term.lastInsertRowid);
mutate.prepare("update ad_automation_search_term_recommendations set ai_reason='changed later' where id=?").run(recommendation.lastInsertRowid);
mutate.close();
const immutable = repository.getSearchTermPmReport(Number(report.id));
assert.equal(immutable?.items[0].searchTerm, "irrelevant example");
assert.equal(immutable?.items[0].spend, 25.5);
assert.equal(repository.listSearchTermPmReports({ accountId: "9858507935" }).total, 1);
assert.equal(repository.listSearchTermPmReports({ accountId: "0000000000" }).total, 0);

const { createSearchTermPmReportPdf } = await import("../lib/search-term-pm-reports/pdf-report");
const pdf = createSearchTermPmReportPdf(immutable!);
assert.ok(pdf.byteLength > 1000);
if (process.env.PM_REPORT_PDF_OUTPUT) {
  mkdirSync(join(process.env.PM_REPORT_PDF_OUTPUT, ".."), { recursive: true });
  writeFileSync(process.env.PM_REPORT_PDF_OUTPUT, pdf);
}
rmSync(databasePath, { force: true });
console.log("Search-term PM report SQLite tests passed.");
