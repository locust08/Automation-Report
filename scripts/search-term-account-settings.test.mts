import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "search-term-settings-"));
process.env.SEARCH_TERM_SQLITE_PATH = join(temporaryDirectory, "test.sqlite");
const require = createRequire(import.meta.url);
const settingsRepository = require("../lib/search-term-optimization/account-settings") as typeof import("../lib/search-term-optimization/account-settings");

try {
  const defaults = settingsRepository.getSearchTermAccountSettings("1234567890", "2026-08-01T00:00:00.000Z");
  assert.equal(defaults.scheduleFrequency, "monthly");
  assert.equal(defaults.nextRunAt, null);

  const saved = settingsRepository.saveSearchTermAccountSettings({
    googleCustomerId: "1234567890",
    automationEnabled: false,
    scheduleFrequency: "weekly",
    autoSafeScoreThreshold: 92,
    highSpendThreshold: 750,
    minimumClicksThreshold: 8,
  });
  assert.equal(saved.autoSafeScoreThreshold, 92);
  assert.equal(saved.nextRunAt, null);

  const enabled = settingsRepository.saveSearchTermAccountSettings({
    googleCustomerId: "1234567890",
    automationEnabled: true,
    scheduleFrequency: "weekly",
    autoSafeScoreThreshold: 92,
    highSpendThreshold: 750,
    minimumClicksThreshold: 8,
  });
  assert.ok(enabled.nextRunAt);

  const database = new DatabaseSync(process.env.SEARCH_TERM_SQLITE_PATH);
  database.prepare(`update ad_automation_search_term_account_settings set next_run_at = '2026-01-01T00:00:00.000Z' where google_customer_id = ?`).run("1234567890");
  database.close();
  const due = settingsRepository.listDueSearchTermAccounts(new Date("2026-08-06T00:00:00.000Z"));
  assert.equal(due.length, 1);
  assert.equal(due[0]?.googleCustomerId, "1234567890");

  const completed = settingsRepository.recordSearchTermAnalysisCompleted("1234567890", "2026-08-06T00:00:00.000Z");
  assert.equal(completed?.lastRunAt, "2026-08-06T00:00:00.000Z");
  assert.equal(completed?.nextRunAt, "2026-08-13T00:00:00.000Z");
  console.log("Search-term account settings and scheduling test passed.");
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
