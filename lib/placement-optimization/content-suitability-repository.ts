import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { ContentSuitabilityPayload } from "@/lib/placement-optimization/types";

function openDatabase() {
  const databasePath = resolve(
    process.env.SEARCH_TERM_SQLITE_PATH || "data/search-term-optimization.sqlite",
  );
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(
    readFileSync(resolve("lib/placement-optimization/sqlite-schema.sql"), "utf8"),
  );
  return database;
}

export function getContentSuitabilitySnapshot(customerId: string) {
  const database = openDatabase();
  try {
    const row = database
      .prepare(
        `SELECT payload_json, refreshed_at
         FROM ad_automation_content_suitability_snapshots
         WHERE google_customer_id = ?`,
      )
      .get(customerId) as
      | { payload_json: string; refreshed_at: string }
      | undefined;
    if (!row) return null;
    return {
      payload: JSON.parse(row.payload_json) as ContentSuitabilityPayload,
      refreshedAt: row.refreshed_at,
    };
  } finally {
    database.close();
  }
}

export function saveContentSuitabilitySnapshot(
  payload: ContentSuitabilityPayload,
) {
  const database = openDatabase();
  try {
    database
      .prepare(
        `INSERT INTO ad_automation_content_suitability_snapshots
           (google_customer_id, customer_name, payload_json, refreshed_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(google_customer_id) DO UPDATE SET
           customer_name = excluded.customer_name,
           payload_json = excluded.payload_json,
           refreshed_at = excluded.refreshed_at`,
      )
      .run(
        payload.account.customerId,
        payload.account.customerName,
        JSON.stringify(payload),
        payload.refreshedAt,
      );
  } finally {
    database.close();
  }
}
