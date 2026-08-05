import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type LeadQualityValues = {
  qualifiedLeads: number | null;
  spamLeads: number | null;
  invalidLeads: number | null;
  clientComplaints: number | null;
};

export type LeadQualityImportRow = LeadQualityValues & {
  customerId: string;
  campaign: string;
  adGroup: string;
  searchTerm: string;
  rowNumber: number;
};

export interface LeadQualityRepository {
  update(searchTermId: number, values: LeadQualityValues): void;
  import(rows: LeadQualityImportRow[]): { updated: number; errors: Array<{ row: number; message: string }> };
}

function openDatabase() {
  const databasePath = resolve(process.env.SEARCH_TERM_SQLITE_PATH || "data/search-term-optimization.sqlite");
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(readFileSync(resolve("lib/search-term-optimization/sqlite-schema.sql"), "utf8"));
  database.exec("pragma foreign_keys = on;");
  return database;
}

export class SqliteLeadQualityRepository implements LeadQualityRepository {
  update(searchTermId: number, values: LeadQualityValues) {
    const database = openDatabase();
    try {
      const result = database.prepare(`
        update ad_automation_search_terms
        set qualified_leads=?, spam_leads=?, invalid_leads=?, client_complaints=?, updated_at=datetime('now')
        where id=?
      `).run(values.qualifiedLeads, values.spamLeads, values.invalidLeads, values.clientComplaints, searchTermId);
      if (result.changes !== 1) throw new Error("Search term was not found.");
    } finally { database.close(); }
  }

  import(rows: LeadQualityImportRow[]) {
    const database = openDatabase();
    const errors: Array<{ row: number; message: string }> = [];
    let updated = 0;
    try {
      const find = database.prepare(`
        select id from ad_automation_search_terms
        where replace(google_customer_id, '-', '') = ?
          and lower(trim(campaign_name)) = ? and lower(trim(ad_group_name)) = ? and lower(trim(search_term)) = ?
      `);
      const update = database.prepare(`
        update ad_automation_search_terms
        set qualified_leads=?, spam_leads=?, invalid_leads=?, client_complaints=?, updated_at=datetime('now') where id=?
      `);
      database.exec("begin immediate;");
      for (const row of rows) {
        const matches = find.all(normalizeCustomerId(row.customerId), normalize(row.campaign), normalize(row.adGroup), normalize(row.searchTerm)) as Array<{ id: number }>;
        if (matches.length === 0) { errors.push({ row: row.rowNumber, message: "No matching search term was found." }); continue; }
        if (matches.length > 1) { errors.push({ row: row.rowNumber, message: "Multiple matching search terms were found." }); continue; }
        update.run(row.qualifiedLeads, row.spamLeads, row.invalidLeads, row.clientComplaints, matches[0].id);
        updated += 1;
      }
      database.exec("commit;");
      return { updated, errors };
    } catch (error) {
      try { database.exec("rollback;"); } catch { /* transaction may already be closed */ }
      throw error;
    } finally { database.close(); }
  }
}

export function parseLeadQualityCsv(source: string): { rows: LeadQualityImportRow[]; errors: Array<{ row: number; message: string }> } {
  const records = parseCsv(source);
  if (records.length === 0) return { rows: [], errors: [{ row: 1, message: "CSV is empty." }] };
  const headers = records[0].map((value) => normalizeHeader(value));
  const required = ["customer_id", "campaign", "ad_group", "search_term"];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length) return { rows: [], errors: [{ row: 1, message: `Missing columns: ${missing.join(", ")}` }] };
  const index = (name: string) => headers.indexOf(name);
  const errors: Array<{ row: number; message: string }> = [];
  const rows: LeadQualityImportRow[] = [];
  for (let offset = 1; offset < records.length; offset += 1) {
    const values = records[offset];
    if (values.every((value) => !value.trim())) continue;
    const rowNumber = offset + 1;
    const identity = required.map((name) => values[index(name)]?.trim() ?? "");
    if (identity.some((value) => !value)) { errors.push({ row: rowNumber, message: "Customer ID, campaign, ad group and search term are required." }); continue; }
    try {
      rows.push({
        customerId: identity[0], campaign: identity[1], adGroup: identity[2], searchTerm: identity[3], rowNumber,
        qualifiedLeads: parseNullableCount(values[index("qualified_leads")]),
        spamLeads: parseNullableCount(values[index("spam_leads")]),
        invalidLeads: parseNullableCount(values[index("invalid_leads")]),
        clientComplaints: parseNullableCount(values[index("client_complaints")]),
      });
    } catch (error) { errors.push({ row: rowNumber, message: error instanceof Error ? error.message : "Invalid lead value." }); }
  }
  return { rows, errors };
}

function parseNullableCount(value?: string) {
  if (value == null || value.trim() === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error("Lead values must be non-negative whole numbers or blank.");
  return number;
}

function parseCsv(source: string) {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' && quoted && source[index + 1] === '"') { field += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { row.push(field); field = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += character;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function normalize(value: string) { return value.trim().toLowerCase().replace(/\s+/g, " "); }
function normalizeCustomerId(value: string) { return value.replace(/\D/g, ""); }
function normalizeHeader(value: string) { return value.trim().toLowerCase().replace(/[\s-]+/g, "_"); }
