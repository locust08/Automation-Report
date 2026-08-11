import assert from "node:assert/strict";
import test from "node:test";

import { parseMetaCsv, MetaCsvParseError } from "@/lib/meta-import/parser";
import { commitMetaImport, classifyMetaImportRows, listMetaImportJobs } from "@/lib/meta-import/repository";
import type { MetaImportedRow, MetaImportJob } from "@/lib/meta-import/types";
import { META_IMPORT_MAX_FILE_BYTES } from "@/lib/meta-import/types";
import { parseMetaDate, parseMetaNumber, validateMetaImportRows } from "@/lib/meta-import/validation";

const ACCOUNT_ID = "340568485376201";

test("parses a campaign-level CSV with BOM, CRLF, quoted commas, currency, and percentages", () => {
  const parsed = csv(
    "\uFEFFAccount ID,Campaign ID,Campaign name,Reporting starts,Reporting ends,Amount spent,Impressions,Clicks,CTR\r\n" +
      `${ACCOUNT_ID},1001,"Brand, Malaysia",01/06/2026,30/06/2026,"RM 1,250.50","125,000","2,500",2.00%\r\n`
  );
  const validated = validateMetaImportRows({
    rows: parsed.rows,
    mapping: parsed.mapping,
    expectedAccountId: ACCOUNT_ID,
    allowAccountMismatch: false,
  });
  assert.equal(validated.reportingLevel, "campaign");
  assert.equal(validated.rows[0].campaignName, "Brand, Malaysia");
  assert.equal(validated.rows[0].amountSpent, 1250.5);
  assert.equal(validated.rows[0].impressions, 125000);
  assert.equal(validated.rows[0].clicks, 2500);
  assert.equal(validated.rows[0].ctr, 2);
  assert.equal(validated.rows[0].validationStatus, "valid");
});

test("detects ad-set and ad reporting levels", () => {
  const adSet = validate("Campaign ID,Ad set ID,Day,Amount spent,Impressions,Clicks\n1,2,2026-06-01,10,100,5");
  const ad = validate("Campaign ID,Ad set ID,Ad ID,Day,Amount spent,Impressions,Clicks\n1,2,3,2026-06-01,10,100,5");
  assert.equal(adSet.reportingLevel, "adset");
  assert.equal(ad.reportingLevel, "ad");
});

test("accepts missing optional columns, supports campaign-name exports, and rejects missing identifiers", () => {
  const valid = validate("Campaign ID,Day,Amount spent,Impressions,Clicks\n1,2026-06-01,10,100,5");
  const nameOnly = validate("Campaign name,Day,Amount spent,Impressions,Clicks\nBrand campaign,2026-06-01,10,100,5");
  const invalid = validate("Day,Amount spent,Impressions,Clicks\n2026-06-01,10,100,5");
  assert.equal(valid.rows[0].validationStatus, "valid");
  assert.equal(nameOnly.rows[0].validationStatus, "valid");
  assert.equal(invalid.rows[0].validationStatus, "invalid");
  assert.match(invalid.rows[0].issues[0].message, /campaign, ad set, or ad ID or name/i);
});

test("maps a Meta campaign export to Overall-report metrics without broad-column collisions", () => {
  const parsed = csv(
    "Reporting starts,Reporting ends,Campaign name,Campaign delivery,Results,Result indicator,Amount spent (MYR),Impressions,\"CPM (cost per 1,000 impressions) (MYR)\",Link clicks,CPC (cost per link click) (MYR),CTR (link click-through rate),Clicks (all),CTR (all),CPC (all) (MYR),Ad set budget,Ad set budget type,Cost per results\n" +
      "2026-07-11,2026-07-11,Campaign A,active,2,actions:lead,31.75,1822,17.43,12,2.65,0.66,17,0.93,1.87,Using ad set budget,Daily,15.88"
  );
  assert.equal(parsed.mapping.amountSpent, "Amount spent (MYR)");
  assert.equal(parsed.mapping.delivery, "Campaign delivery");
  assert.equal(parsed.mapping.clicks, "Clicks (all)");
  assert.equal(parsed.mapping.ctr, "CTR (all)");
  assert.equal(parsed.mapping.cpc, "CPC (all) (MYR)");
  assert.equal(parsed.mapping.costPerResult, "Cost per results");
  assert.equal(parsed.mapping.adSetName, undefined);
  const validated = validateMetaImportRows({
    rows: parsed.rows,
    mapping: parsed.mapping,
    expectedAccountId: ACCOUNT_ID,
    allowAccountMismatch: false,
  });
  assert.equal(validated.rows[0].validationStatus, "valid");
  assert.equal(validated.rows[0].amountSpent, 31.75);
  assert.equal(validated.rows[0].clicks, 17);
  assert.equal(validated.rows[0].delivery, "active");
});

test("requires explicit confirmation for a different account", () => {
  const source = `Account ID,Campaign ID,Day,Amount spent,Impressions,Clicks\n999,1,2026-06-01,10,100,5`;
  assert.equal(validate(source).rows[0].validationStatus, "invalid");
  const parsed = csv(source);
  const confirmed = validateMetaImportRows({
    rows: parsed.rows,
    mapping: parsed.mapping,
    expectedAccountId: ACCOUNT_ID,
    allowAccountMismatch: true,
  });
  assert.equal(confirmed.rows[0].validationStatus, "warning");
});

test("marks duplicate rows in the same CSV", () => {
  const validated = validate(
    "Campaign ID,Day,Amount spent,Impressions,Clicks\n1,2026-06-01,10,100,5\n1,2026-06-01,10,100,5"
  );
  assert.equal(validated.rows[1].validationStatus, "duplicate");
  assert.equal(validated.summary.duplicateRows, 1);
});

test("keeps same-name campaign rows distinct when a name-only export has different source values", () => {
  const validated = validate(
    "Campaign name,Day,Ad set budget,Amount spent,Impressions,Clicks\n" +
      "New messages campaign,2026-06-01,30,0,0,0\n" +
      "New messages campaign,2026-06-01,50,0,0,0"
  );
  assert.equal(validated.summary.createRows, 2);
  assert.notEqual(validated.rows[0].uniqueKey, validated.rows[1].uniqueKey);
  assert.equal(validated.rows[1].validationStatus, "valid");
});

test("normalizes RM and international numeric formats", () => {
  assert.deepEqual(parseMetaNumber("RM 1,234.56"), { value: 1234.56, invalid: false });
  assert.deepEqual(parseMetaNumber("€ 1.234,56"), { value: 1234.56, invalid: false });
  assert.deepEqual(parseMetaNumber("2.50%", true), { value: 2.5, invalid: false });
  assert.equal(parseMetaNumber("not-a-number").invalid, true);
});

test("normalizes common Meta date formats", () => {
  assert.equal(parseMetaDate("2026-06-30"), "2026-06-30");
  assert.equal(parseMetaDate("30/06/2026"), "2026-06-30");
  assert.equal(parseMetaDate("06/30/2026"), "2026-06-30");
  assert.equal(parseMetaDate("2026-02-30"), null);
});

test("rejects empty, malformed, and oversized CSV files", () => {
  assert.throws(() => parseMetaCsv({ bytes: new Uint8Array(), filename: "empty.csv" }), MetaCsvParseError);
  assert.throws(() => csv('Campaign ID,Day\n1,"unclosed'), /malformed/i);
  assert.throws(
    () => parseMetaCsv({ bytes: new Uint8Array(META_IMPORT_MAX_FILE_BYTES + 1), filename: "large.csv" }),
    /upload limit/i
  );
});

test("classifies create, update, and exact duplicate rows and records successful history", async () => {
  const row = importedRow(`test-${Date.now()}`);
  assert.equal((await classifyMetaImportRows([row])).get(row.uniqueKey), "create");
  const job = importJob(`job-${Date.now()}`);
  const first = await commitMetaImport({ job, rows: [row] });
  assert.equal(first.created, 1);
  assert.equal((await classifyMetaImportRows([row])).get(row.uniqueKey), "skip");
  const changed = { ...row, clicks: 99 };
  assert.equal((await classifyMetaImportRows([changed])).get(row.uniqueKey), "update");
  const second = await commitMetaImport({ job: importJob(`${job.id}-2`), rows: [changed] });
  assert.equal(second.updated, 1);
  assert.ok((await listMetaImportJobs(ACCOUNT_ID)).some((item) => item.id === job.id));
});

function csv(content: string) {
  return parseMetaCsv({ bytes: new TextEncoder().encode(content), filename: "meta.csv" });
}

function validate(content: string) {
  const parsed = csv(content);
  return validateMetaImportRows({
    rows: parsed.rows,
    mapping: parsed.mapping,
    expectedAccountId: ACCOUNT_ID,
    allowAccountMismatch: false,
  });
}

function importedRow(uniqueKey: string): MetaImportedRow {
  return {
    uniqueKey,
    source: "meta_csv",
    accountId: ACCOUNT_ID,
    accountName: "Test account",
    reportingLevel: "campaign",
    campaignId: "1",
    campaignName: "Test campaign",
    adSetId: null,
    adSetName: null,
    adId: null,
    adName: null,
    delivery: "Active",
    status: null,
    objective: "OUTCOME_SALES",
    buyingType: null,
    budget: null,
    budgetType: null,
    reportingStart: "2026-06-01",
    reportingEnd: "2026-06-30",
    amountSpent: 10,
    impressions: 100,
    reach: 90,
    frequency: 1.1,
    linkClicks: 5,
    clicks: 5,
    ctr: 5,
    cpc: 2,
    cpm: 100,
    results: 1,
    resultType: "Purchase",
    costPerResult: 10,
    landingPageViews: 4,
    addToCart: 2,
    initiateCheckout: 1,
    purchases: 1,
    purchaseConversionValue: 20,
    roas: 2,
    leads: 0,
    messagingConversationsStarted: 0,
    rawMetadata: {},
  };
}

function importJob(id: string): MetaImportJob {
  const now = new Date().toISOString();
  return {
    id,
    originalFilename: "test.csv",
    accountId: ACCOUNT_ID,
    importedBy: "Test user",
    uploadedAt: now,
    completedAt: now,
    reportingStart: "2026-06-01",
    reportingEnd: "2026-06-30",
    reportingLevel: "campaign",
    totalRows: 1,
    createdRows: 0,
    updatedRows: 0,
    skippedRows: 0,
    failedRows: 0,
    status: "completed",
    errorSummary: null,
  };
}
