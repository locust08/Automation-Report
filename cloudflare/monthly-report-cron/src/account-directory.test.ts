import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import {
  createAdAccountDirectorySearch,
  mapAdAccountDirectorySearchRows,
} from "./account-directory";

test("searches Google, Meta, and TikTok account IDs through the same D1 directory", () => {
  const database = new Database(":memory:");
  database.exec(`CREATE TABLE ad_accounts (
    notion_page_id TEXT PRIMARY KEY,
    account_name TEXT NOT NULL,
    account_name_normalized TEXT NOT NULL,
    platform TEXT,
    country TEXT,
    google_account_id TEXT,
    meta_account_id TEXT,
    tiktok_account_id TEXT,
    access_path TEXT,
    active INTEGER NOT NULL DEFAULT 1
  )`);
  const insert = database.prepare(`INSERT INTO ad_accounts
    (notion_page_id, account_name, account_name_normalized, platform, country, google_account_id, meta_account_id, tiktok_account_id, access_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insert.run("google-page", "Google Client", "google client", "Google Ads", "MY", "1234567890", null, null, "manager");
  insert.run("meta-page", "Meta Client", "meta client", "Meta Ads", "SG", null, "act_987654321", null, null);
  insert.run("tiktok-page", "Bellamy TikTok", "bellamy tiktok", "TikTok", "MY", null, null, "7485938233214353409", null);

  const searches = [
    ["1234567890", "google", "1234567890"],
    ["987654321", "meta", "act_987654321"],
    ["7485938233214353409", "tiktok", "7485938233214353409"],
  ] as const;

  for (const [query, platform, accountId] of searches) {
    const search = createAdAccountDirectorySearch(query);
    const rows = database.prepare(search.sql).all(...search.bindings);
    const accounts = mapAdAccountDirectorySearchRows(rows);
    assert.deepEqual(accounts, [{
      accountName: platform === "tiktok" ? "Bellamy TikTok" : `${platform === "google" ? "Google" : "Meta"} Client`,
      adAccountId: accountId,
      accessPath: platform === "google" ? "manager" : null,
      country: platform === "meta" ? "SG" : "MY",
      notionPageId: `${platform}-page`,
      platform,
    }]);
  }

  database.close();
});

