import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const databasePath = resolve(process.env.SEARCH_TERM_SQLITE_PATH || "data/search-term-optimization.sqlite");
const database = new DatabaseSync(databasePath);
const dueAccounts = database.prepare(`
  select google_customer_id as googleCustomerId
  from ad_automation_search_term_account_settings
  where schedule_frequency <> 'manual' and next_run_at is not null and next_run_at <= ?
  order by next_run_at asc
`).all(new Date().toISOString());
database.close();

if (dueAccounts.length === 0) {
  console.log("No search-term accounts are due for analysis.");
  process.exit(0);
}

function nextRun(frequency, completedAt) {
  if (frequency === "manual") return null;
  const next = new Date(completedAt);
  if (frequency === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  if (frequency === "biweekly") next.setUTCDate(next.getUTCDate() + 14);
  if (frequency === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toISOString();
}

let failures = 0;
for (const account of dueAccounts) {
  const jobId = randomUUID();
  console.log(`Starting scheduled search-term analysis for ${account.googleCustomerId}.`);
  const result = spawnSync(process.execPath, [resolve("scripts/run-search-term-analysis-job.mjs"), jobId, account.googleCustomerId], {
    cwd: process.cwd(), env: process.env, stdio: "inherit",
  });
  if (result.status !== 0) {
    failures += 1;
    console.error(`Scheduled analysis failed for ${account.googleCustomerId}.`);
    continue;
  }
  const importResult = spawnSync(process.execPath, [
    resolve("node_modules/tsx/dist/cli.mjs"),
    resolve("scripts/import-search-term-analysis.mts"),
    account.googleCustomerId,
  ], { cwd: process.cwd(), env: process.env, stdio: "inherit" });
  if (importResult.status !== 0) {
    failures += 1;
    console.error(`Scheduled analysis completed but SQLite import failed for ${account.googleCustomerId}.`);
    continue;
  }
  const status = JSON.parse(readFileSync(resolve("tmp/search-term-analysis-jobs", `${jobId}.json`), "utf8"));
  const completedAt = status.finishedAt ?? new Date().toISOString();
  const updateDatabase = new DatabaseSync(databasePath);
  const settings = updateDatabase.prepare(`select schedule_frequency from ad_automation_search_term_account_settings where google_customer_id = ?`).get(account.googleCustomerId);
  updateDatabase.prepare(`
    update ad_automation_search_term_account_settings
    set last_run_at = ?, next_run_at = ?, updated_at = datetime('now')
    where google_customer_id = ?
  `).run(completedAt, nextRun(settings?.schedule_frequency ?? "manual", completedAt), account.googleCustomerId);
  updateDatabase.close();
}

if (failures > 0) process.exit(1);
