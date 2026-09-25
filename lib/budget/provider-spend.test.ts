import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSpendRows, readGoogleDailySpend, readMetaDailySpend, type SpendRequest } from "./provider-spend";
import type { GoogleAdsRestClient } from "@/lib/google-ads/rest-client";

const google: SpendRequest = { platform: "google", accountId: "2315114913", currency: "MYR", timezone: "Asia/Kuala_Lumpur",
  start: "2026-09-20", end: "2026-09-22", googleLoginCustomerId: "1234567890" };

test("M05 keeps an omitted provider day missing while retaining an explicit zero", () => {
  const result = normalizeSpendRows(google, [{ date: "2026-09-20", amount: 5.5 }, { date: "2026-09-22", amount: 0 }], []);
  assert.deepEqual(result.daily, [{ date: "2026-09-20", amount: 5.5 }, { date: "2026-09-22", amount: 0 }]);
  assert.deepEqual(result.missingDays, ["2026-09-21"]);
  assert.throws(() => normalizeSpendRows(google, [{ date: "2026-09-20", amount: 1 }, { date: "2026-09-20", amount: 1 }], []));
});

test("Google account currency is checked before daily spend is accepted", async () => {
  const calls: string[] = [];
  const client = { searchAll: async (_id: string, query: string) => {
    calls.push(query);
    return [{ customer: { id: google.accountId, currencyCode: "USD", timeZone: google.timezone } }];
  } } as unknown as GoogleAdsRestClient;
  await assert.rejects(readGoogleDailySpend(google, client), /currency/);
  assert.equal(calls.length, 1);
});

test("Meta sparse daily insights never become estimated spend", async () => {
  const previousToken = process.env.META_ACCESS_TOKEN;
  const previousVersion = process.env.META_GRAPH_API_VERSION;
  process.env.META_ACCESS_TOKEN = "local-test-token";
  process.env.META_GRAPH_API_VERSION = "v24.0";
  try {
    const request: SpendRequest = { ...google, platform: "meta", accountId: "321606578570386" };
    const fetcher = async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      return Response.json(url.pathname.endsWith("/insights")
        ? { data: [{ date_start: request.start, spend: "14.25" }], paging: {} }
        : { account_id: request.accountId, currency: request.currency, timezone_name: request.timezone });
    };
    const result = await readMetaDailySpend(request, fetcher as typeof fetch);
    assert.deepEqual(result.daily, [{ date: request.start, amount: 14.25 }]);
    assert.deepEqual(result.missingDays, ["2026-09-21", "2026-09-22"]);
  } finally {
    if (previousToken === undefined) delete process.env.META_ACCESS_TOKEN; else process.env.META_ACCESS_TOKEN = previousToken;
    if (previousVersion === undefined) delete process.env.META_GRAPH_API_VERSION; else process.env.META_GRAPH_API_VERSION = previousVersion;
  }
});
