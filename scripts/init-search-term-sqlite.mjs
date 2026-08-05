import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const databasePath = resolve(process.env.SEARCH_TERM_SQLITE_PATH || "data/search-term-optimization.sqlite");
const schemaPath = resolve("lib/search-term-optimization/sqlite-schema.sql");

mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);

try {
  const legacyRecommendations = database.prepare(`
    select name from sqlite_master
    where type = 'table' and name = 'ad_automation_search_term_recommendations'
  `).get();
  if (legacyRecommendations) {
    const columns = database.prepare("pragma table_info(ad_automation_search_term_recommendations)").all();
    if (!columns.some((column) => column.name === "search_term_id")) {
      database.exec(`
        pragma foreign_keys = off;
        drop table if exists ad_automation_search_term_reviews;
        drop table if exists ad_automation_search_term_recommendations;
        pragma foreign_keys = on;
      `);
      console.log("Migrated legacy combined search-term table to the separated data model.");
    }
  }
  database.exec(readFileSync(schemaPath, "utf8"));
  const tables = database.prepare(`
    select name
    from sqlite_master
    where type = 'table'
      and name in (
        'ad_automation_search_terms',
        'ad_automation_search_term_recommendations',
        'ad_automation_search_term_reviews'
      )
    order by name
  `).all();
  console.log(`SQLite search-term database ready: ${databasePath}`);
  console.log(`Tables: ${tables.map((table) => table.name).join(", ")}`);
} finally {
  database.close();
}
