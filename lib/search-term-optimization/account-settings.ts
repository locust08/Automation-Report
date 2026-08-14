import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { AnalysisScheduleFrequency, SearchTermAccountSettings } from "@/lib/search-term-optimization/types";

type StoredSettings = {
  google_customer_id: string;
  automation_enabled: number;
  schedule_frequency: AnalysisScheduleFrequency;
  auto_safe_score_threshold: number;
  review_score_threshold: number;
  high_spend_threshold: number;
  minimum_clicks_threshold: number;
  last_run_at: string | null;
  next_run_at: string | null;
};

function openSettingsDatabase() {
  const databasePath = resolve(/* turbopackIgnore: true */ process.env.SEARCH_TERM_SQLITE_PATH || "data/search-term-optimization.sqlite");
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(readFileSync(resolve("lib/search-term-optimization/sqlite-schema.sql"), "utf8"));
  const columns = database.prepare("pragma table_info(ad_automation_search_term_account_settings)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "automation_enabled")) {
    database.exec("alter table ad_automation_search_term_account_settings add column automation_enabled integer not null default 0 check (automation_enabled in (0, 1))");
  }
  return database;
}

function mapSettings(row: StoredSettings): SearchTermAccountSettings {
  return {
    googleCustomerId: row.google_customer_id,
    automationEnabled: Boolean(row.automation_enabled),
    scheduleFrequency: row.schedule_frequency,
    autoSafeScoreThreshold: row.auto_safe_score_threshold,
    highSpendThreshold: row.high_spend_threshold,
    minimumClicksThreshold: row.minimum_clicks_threshold,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
  };
}

export function calculateNextRun(frequency: AnalysisScheduleFrequency, from = new Date()) {
  if (frequency === "manual") return null;
  const next = new Date(from);
  if (frequency === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  if (frequency === "biweekly") next.setUTCDate(next.getUTCDate() + 14);
  if (frequency === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toISOString();
}

export function getSearchTermAccountSettings(customerId: string, lastRunAt?: string | null) {
  const database = openSettingsDatabase();
  try {
    database.prepare(`
      insert into ad_automation_search_term_account_settings (google_customer_id, last_run_at)
      values (?, ?)
      on conflict (google_customer_id) do nothing
    `).run(customerId, lastRunAt ?? null);
    let row = database.prepare(`
      select * from ad_automation_search_term_account_settings where google_customer_id = ?
    `).get(customerId) as unknown as StoredSettings;
    if (row.schedule_frequency === "manual") {
      const anchor = row.last_run_at ? new Date(row.last_run_at) : new Date();
      database.prepare(`
        update ad_automation_search_term_account_settings
        set schedule_frequency = 'monthly', next_run_at = ?, updated_at = datetime('now')
        where google_customer_id = ?
      `).run(calculateNextRun("monthly", anchor), customerId);
      row = database.prepare(`
        select * from ad_automation_search_term_account_settings where google_customer_id = ?
      `).get(customerId) as unknown as StoredSettings;
    }
    return mapSettings(row);
  } finally {
    database.close();
  }
}

export function saveSearchTermAccountSettings(input: Omit<SearchTermAccountSettings, "lastRunAt" | "nextRunAt">) {
  const database = openSettingsDatabase();
  try {
    const existing = database.prepare(`
      select last_run_at from ad_automation_search_term_account_settings where google_customer_id = ?
    `).get(input.googleCustomerId) as { last_run_at?: string | null } | undefined;
    const previousRun = existing?.last_run_at ? new Date(existing.last_run_at) : null;
    const anchor = previousRun && previousRun.getTime() > Date.now() ? previousRun : new Date();
    const nextRunAt = input.automationEnabled ? calculateNextRun(input.scheduleFrequency, anchor) : null;
    database.prepare(`
      insert into ad_automation_search_term_account_settings (
        google_customer_id, automation_enabled, schedule_frequency, auto_safe_score_threshold,
        high_spend_threshold, minimum_clicks_threshold, next_run_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      on conflict (google_customer_id) do update set
        automation_enabled = excluded.automation_enabled,
        schedule_frequency = excluded.schedule_frequency,
        auto_safe_score_threshold = excluded.auto_safe_score_threshold,
        high_spend_threshold = excluded.high_spend_threshold,
        minimum_clicks_threshold = excluded.minimum_clicks_threshold,
        next_run_at = excluded.next_run_at,
        updated_at = datetime('now')
    `).run(
      input.googleCustomerId, input.automationEnabled ? 1 : 0, input.scheduleFrequency, input.autoSafeScoreThreshold,
      input.highSpendThreshold, input.minimumClicksThreshold, nextRunAt,
    );
    return getSearchTermAccountSettingsFromDatabase(database, input.googleCustomerId);
  } finally {
    database.close();
  }
}

export function listDueSearchTermAccounts(now = new Date()) {
  const database = openSettingsDatabase();
  try {
    return (database.prepare(`
      select google_customer_id as googleCustomerId
      from ad_automation_search_term_account_settings
      where automation_enabled = 1 and schedule_frequency <> 'manual' and next_run_at is not null and next_run_at <= ?
      order by next_run_at asc
    `).all(now.toISOString()) as Array<{ googleCustomerId: string }>);
  } finally {
    database.close();
  }
}

export function recordSearchTermAnalysisCompleted(customerId: string, completedAt: string) {
  const database = openSettingsDatabase();
  try {
    const row = database.prepare(`
      select automation_enabled, schedule_frequency, last_run_at from ad_automation_search_term_account_settings where google_customer_id = ?
    `).get(customerId) as { automation_enabled: number; schedule_frequency: AnalysisScheduleFrequency; last_run_at: string | null } | undefined;
    if (!row || row.last_run_at === completedAt) return row ? getSearchTermAccountSettingsFromDatabase(database, customerId) : null;
    const nextRunAt = row.automation_enabled ? calculateNextRun(row.schedule_frequency, new Date(completedAt)) : null;
    database.prepare(`
      update ad_automation_search_term_account_settings
      set last_run_at = ?, next_run_at = ?, updated_at = datetime('now')
      where google_customer_id = ?
    `).run(completedAt, nextRunAt, customerId);
    return getSearchTermAccountSettingsFromDatabase(database, customerId);
  } finally {
    database.close();
  }
}

function getSearchTermAccountSettingsFromDatabase(database: DatabaseSync, customerId: string) {
  const row = database.prepare(`select * from ad_automation_search_term_account_settings where google_customer_id = ?`).get(customerId) as unknown as StoredSettings;
  return mapSettings(row);
}
