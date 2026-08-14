import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const databasePath = resolve("tmp/search-term-lead-quality-test.sqlite");
rmSync(databasePath, { force: true });
process.env.SEARCH_TERM_SQLITE_PATH = databasePath;

const { parseLeadQualityCsv, SqliteLeadQualityRepository } = await import("../lib/search-term-optimization/lead-quality-repository");
const repository = new SqliteLeadQualityRepository();

// Opening the repository creates the schema; a missing row must fail clearly.
assert.throws(() => repository.update(999, { qualifiedLeads: 1, spamLeads: null, invalidLeads: null, clientComplaints: null }), /not found/i);

const database = new DatabaseSync(databasePath);
const inserted = database.prepare(`insert into ad_automation_search_terms
  (google_customer_id, campaign_name, ad_group_name, search_term)
  values ('9858507935','Campaign A','General','example term')`).run();
database.close();

repository.update(Number(inserted.lastInsertRowid), { qualifiedLeads: 2, spamLeads: 1, invalidLeads: null, clientComplaints: 0 });
const parsed = parseLeadQualityCsv(`customer_id,campaign,ad_group,search_term,qualified_leads,spam_leads,invalid_leads,client_complaints\n985-850-7935,Campaign A,General,example term,0,3,,1`);
assert.equal(parsed.errors.length, 0);
assert.equal(repository.import(parsed.rows).updated, 1);

const verify = new DatabaseSync(databasePath);
const row = verify.prepare(`select qualified_leads,spam_leads,invalid_leads,client_complaints,first_detected_at from ad_automation_search_terms`).get() as Record<string, unknown>;
assert.deepEqual({ qualified: row.qualified_leads, spam: row.spam_leads, invalid: row.invalid_leads, complaints: row.client_complaints }, { qualified: 0, spam: 3, invalid: null, complaints: 1 });
assert.ok(row.first_detected_at);
verify.close();
rmSync(databasePath, { force: true });
console.log("Search-term lead-quality SQLite and CSV test passed.");
