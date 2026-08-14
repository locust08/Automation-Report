import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const databasePath = resolve(process.env.SEARCH_TERM_SQLITE_PATH || "data/search-term-optimization.sqlite");
const database = new DatabaseSync(databasePath);

try {
  database.exec("pragma foreign_keys = on; begin;");
  const searchTerm = database.prepare(`
    insert into ad_automation_search_terms (
      google_customer_id, customer_name, campaign_name, ad_group_name, search_term
    ) values (?, ?, ?, ?, ?)
  `).run("test-customer", "SQLite Test", "Test Campaign", "Test Ad Group", "test search term");
  const recommendation = database.prepare(`
    insert into ad_automation_search_term_recommendations (
      search_term_id, proposed_action, safety_score, safety_band
    ) values (?, ?, ?, ?)
  `).run(searchTerm.lastInsertRowid, "negative exact", 90, "auto-safe");

  database.prepare(`
    insert into ad_automation_search_term_reviews (
      recommendation_id, reviewer_user_id, reviewer_email, reviewer_role,
      action, resulting_status
    ) values (?, ?, ?, ?, ?, ?)
  `).run(recommendation.lastInsertRowid, "test-user", "test@example.com", "pms", "exclude", "ready_for_approval");

  const review = database.prepare(`
    select r.action, r.resulting_status, s.search_term
    from ad_automation_search_term_reviews r
    join ad_automation_search_term_recommendations rec on rec.id = r.recommendation_id
    join ad_automation_search_terms s on s.id = rec.search_term_id
    where r.id = last_insert_rowid()
  `).get();
  if (!review || review.action !== "exclude" || review.resulting_status !== "ready_for_approval") {
    throw new Error("SQLite recommendation/review relationship failed.");
  }
  database.exec("rollback;");
  console.log("SQLite search-term smoke test passed; test transaction was rolled back.");
} catch (error) {
  try { database.exec("rollback;"); } catch {}
  throw error;
} finally {
  database.close();
}
