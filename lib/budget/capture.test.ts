import assert from "node:assert/strict";
import { test } from "node:test";
import { captureBudgetDay } from "./capture";
import type { SpendRead, SpendRequest } from "./provider-spend";

const account = { id: 7, m04_ad_account_id: 11, platform: "meta", provider_account_id: "321606578570386",
  currency: "MYR", timezone: "Asia/Kuala_Lumpur", google_login_customer_id: null,
  mapping_verified_at: "2026-09-25T00:00:00Z" };
const parent = { id: 11, platform: "meta", provider_account_id: account.provider_account_id,
  currency: "MYR", timezone: account.timezone, access_status: "verified", is_active: true };
const evidence: SpendRead = { platform: "meta", accountId: account.provider_account_id, currency: "MYR",
  timezone: account.timezone, start: "2020-01-01", end: "2020-01-01", daily: [],
  missingDays: ["2020-01-01"], capturedAt: "2026-09-25T00:00:00Z", providerSnapshotId: "hash",
  providerRequestIds: [] };

test("capture commits a missing day as missing, never zero spend", async () => {
  const writes: Record<string, unknown>[] = [];
  const result = await captureBudgetDay(7, "2020-01-01", {
    accountRows: async (table) => table === "m05_ads_accounts" ? [account] : [parent],
    readSpend: async (request: SpendRequest) => {
      assert.equal(request.accountId, account.provider_account_id);
      return evidence;
    },
    record: async (_name, body) => { writes.push(body); return { status: "recorded" }; },
  });
  assert.equal(result.status, "recorded");
  assert.deepEqual(result.missingDays, ["2020-01-01"]);
  assert.deepEqual(writes[0]?.p_daily, []);
  assert.deepEqual(writes[0]?.p_missing_days, ["2020-01-01"]);
});

test("capture denies an unverified parent before provider access", async () => {
  await assert.rejects(captureBudgetDay(7, "2020-01-01", {
    accountRows: async (table) => table === "m05_ads_accounts" ? [account] : [{ ...parent, access_status: "pending" }],
    readSpend: async () => { throw new Error("should not read"); },
    record: async () => { throw new Error("should not write"); },
  }), /access_denied/);
});

test("capture denies an incomplete day before provider access", async () => {
  await assert.rejects(captureBudgetDay(7, "2099-01-01", {
    accountRows: async (table) => table === "m05_ads_accounts" ? [account] : [parent],
    readSpend: async () => { throw new Error("should not read"); },
    record: async () => { throw new Error("should not write"); },
  }), /invalid_request/);
});
