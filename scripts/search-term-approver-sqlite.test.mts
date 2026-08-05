import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const { saveApproverDecision } = require("../lib/search-term-optimization/sqlite-repository") as typeof import("../lib/search-term-optimization/sqlite-repository");

const temporaryDirectory = mkdtempSync(join(tmpdir(), "search-term-approver-"));
const databasePath = join(temporaryDirectory, "test.sqlite");
process.env.SEARCH_TERM_SQLITE_PATH = databasePath;

function seedRecommendation(database: DatabaseSync, term: string) {
  const searchTerm = database.prepare(`
    insert into ad_automation_search_terms (
      google_customer_id, source_run_id, campaign_name, ad_group_name, search_term
    ) values ('1234567890', ?, 'Campaign', 'General', ?)
  `).run(new Date().toISOString(), term);
  const recommendation = database.prepare(`
    insert into ad_automation_search_term_recommendations (
      search_term_id, proposed_action, review_status, current_decision
    ) values (?, 'negative exact', 'ready_for_approval', 'submit_for_approval')
    returning id
  `).get(searchTerm.lastInsertRowid) as { id: number };
  return recommendation.id;
}

try {
  const database = new DatabaseSync(databasePath);
  database.exec(readFileSync(resolve("lib/search-term-optimization/sqlite-schema.sql"), "utf8"));
  const approvedIds = [seedRecommendation(database, "approve one"), seedRecommendation(database, "approve two")];
  const rejectId = seedRecommendation(database, "reject one");
  const returnId = seedRecommendation(database, "return one");
  const untouchedId = seedRecommendation(database, "untouched one");
  database.close();

  const reviewer = { id: "approver-test", email: "approver@example.com", role: "approver" };
  const approval = saveApproverDecision({ recommendationIds: approvedIds, decision: "approved", approver: reviewer });
  if (approval.updated !== 2 || !approval.changeSetId) throw new Error("Approval did not create one change set.");
  const duplicate = saveApproverDecision({ recommendationIds: approvedIds, decision: "approved", approver: reviewer });
  if (duplicate.updated !== 0 || duplicate.skipped !== 2) throw new Error("Duplicate approval was not idempotent.");
  saveApproverDecision({ recommendationIds: [rejectId], decision: "rejected", approver: reviewer });
  saveApproverDecision({ recommendationIds: [returnId], decision: "returned", approver: reviewer });

  let mixedFailed = false;
  try {
    saveApproverDecision({ recommendationIds: [approvedIds[0], untouchedId], decision: "rejected", approver: reviewer });
  } catch {
    mixedFailed = true;
  }
  if (!mixedFailed) throw new Error("Mixed-status approval should fail validation.");

  const verification = new DatabaseSync(databasePath);
  const changeSets = verification.prepare("select count(*) as count from ad_automation_search_term_change_sets").get() as { count: number };
  const changeSetItems = verification.prepare("select count(*) as count from ad_automation_search_term_change_set_items").get() as { count: number };
  const history = verification.prepare("select count(*) as count from ad_automation_search_term_reviews").get() as { count: number };
  const untouched = verification.prepare("select review_status from ad_automation_search_term_recommendations where id = ?").get(untouchedId) as { review_status: string };
  verification.close();
  if (changeSets.count !== 1 || changeSetItems.count !== 2 || history.count !== 4 || untouched.review_status !== "ready_for_approval") {
    throw new Error("Approver persistence verification failed.");
  }
  console.log("Approver SQLite workflow test passed.");
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
