import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const database = new DatabaseSync(resolve(process.env.SEARCH_TERM_SQLITE_PATH || "data/search-term-optimization.sqlite"));

try {
  console.log("Recommendation states");
  console.table(database.prepare(`
    select review_status, current_decision, count(*) as count
    from ad_automation_search_term_recommendations
    group by review_status, current_decision
    order by count desc
  `).all());

  console.log("Latest review history");
  console.table(database.prepare(`
    select id, recommendation_id, reviewer_email, reviewer_role, action,
           previous_status, resulting_status, created_at
    from ad_automation_search_term_reviews
    order by id desc
    limit 20
  `).all());
} finally {
  database.close();
}
