import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateTikTokDailyRows,
  createTikTokWorkerReporting,
  readTikTokWorkerRuntimeContext,
  splitTikTokReportDateRange,
  summarizeTikTokDailyBudget,
} from "../../lib/tiktok/worker-reporting";

const env = {
  DOPPLER_TOKEN: "dp.st.worker-test",
  DOPPLER_PROJECT: "billing-worker",
  DOPPLER_CONFIG: "prd",
};

function dopplerSecrets() {
  return {
    secrets: {
      TIKTOK_BUSINESS_ACCESS_TOKEN: { computed: "token-for-test" },
      TIKTOK_BUSINESS_AUTHORIZED_ADVERTISERS: { computed: JSON.stringify([{ advertiser_id: "123", advertiser_name: "Bellamy" }]) },
      TIKTOK_BUSINESS_GRANTED_SCOPES: { computed: "[1,2]" },
      TIKTOK_BUSINESS_TOKEN_UPDATED_AT: { computed: "2026-08-10T00:00:00.000Z" },
      TIKTOK_BUSINESS_RATE_LIMIT_LEVEL: { computed: "basic" },
      TIKTOK_BUSINESS_MAX_QPS: { computed: "8" },
      TIKTOK_BUSINESS_MAX_QPM: { computed: "480" },
      TIKTOK_BUSINESS_MAX_CONCURRENCY: { computed: "1" },
    },
  };
}

test("aggregates campaign rows by advertiser date and zero-fills missing dates", () => {
  const rows = aggregateTikTokDailyRows([
    { dimensions: { stat_time_day: "2026-08-01 00:00:00", campaign_id: "1" }, metrics: { spend: "2.5", conversion: "1" } },
    { dimensions: { stat_time_day: "2026-08-01 00:00:00", campaign_id: "2" }, metrics: { spend: "3", conversion: "2" } },
    { dimensions: { stat_time_day: "2026-08-03 00:00:00", campaign_id: "1" }, metrics: { spend: "4", conversion: "0" } },
  ], "2026-08-01", "2026-08-03");
  assert.deepEqual(rows, [
    { date: "2026-08-01", spend: 5.5, conversions: 3, results: 0 },
    { date: "2026-08-02", spend: 0, conversions: 0, results: 0 },
    { date: "2026-08-03", spend: 4, conversions: 0, results: 0 },
  ]);
});

test("splits long report ranges into contiguous inclusive 30-day windows", () => {
  assert.deepEqual(splitTikTokReportDateRange("2025-10-31", "2026-01-28"), [
    { startDate: "2025-10-31", endDate: "2025-11-29" },
    { startDate: "2025-11-30", endDate: "2025-12-29" },
    { startDate: "2025-12-30", endDate: "2026-01-28" },
  ]);
  assert.deepEqual(splitTikTokReportDateRange("2026-08-01", "2026-08-30"), [
    { startDate: "2026-08-01", endDate: "2026-08-30" },
  ]);
  assert.throws(() => splitTikTokReportDateRange("2026-08-31", "2026-08-01"), /after end date/);
});

test("loads and clamps every runtime rate control from Doppler", async () => {
  let requestedSecrets = "";
  const runtime = await readTikTokWorkerRuntimeContext(env, async (input) => {
    requestedSecrets = new URL(String(input)).searchParams.get("secrets") ?? "";
    const body = dopplerSecrets();
    body.secrets.TIKTOK_BUSINESS_MAX_QPS.computed = "999";
    body.secrets.TIKTOK_BUSINESS_MAX_QPM.computed = "999999";
    return Response.json(body);
  });
  assert.match(requestedSecrets, /TIKTOK_BUSINESS_RATE_LIMIT_LEVEL/);
  assert.match(requestedSecrets, /TIKTOK_BUSINESS_MAX_CONCURRENCY/);
  assert.equal(runtime.rateLimitConfig.level, "basic");
  assert.equal(runtime.rateLimitConfig.qps, 10);
  assert.equal(runtime.rateLimitConfig.qpm, 600);
  assert.equal(runtime.rateLimitConfig.maxConcurrency, 1);
});

test("fails closed when a Doppler rate control is missing", async () => {
  await assert.rejects(
    readTikTokWorkerRuntimeContext(env, async () => {
      const body = dopplerSecrets();
      delete (body.secrets as Partial<typeof body.secrets>).TIKTOK_BUSINESS_MAX_QPM;
      return Response.json(body);
    }),
    /TIKTOK_BUSINESS_MAX_QPM/,
  );
});

test("accepts values injected directly by doppler run without requiring its CLI token", async () => {
  const secrets = dopplerSecrets().secrets;
  const injected = Object.fromEntries(Object.entries(secrets).map(([name, value]) => [name, value.computed]));
  const runtime = await readTikTokWorkerRuntimeContext(injected);
  assert.equal(runtime.authorization.advertisers[0].advertiser_id, "123");
  assert.equal(runtime.rateLimitConfig.qps, 8);
  assert.equal(runtime.rateLimitConfig.qpm, 480);
});

test("deduplicates campaign daily budgets and rejects active lifetime budgets", () => {
  const campaigns = [{ campaign_id: "c1", operation_status: "ENABLE", budget_mode: "BUDGET_MODE_DAY", budget: 100 }];
  const safe = summarizeTikTokDailyBudget(campaigns, [
    { campaign_id: "c1", operation_status: "ENABLE", budget_mode: "BUDGET_MODE_DAY", budget: 50 },
    { campaign_id: "c2", operation_status: "ENABLE", budget_mode: "BUDGET_MODE_DAY", budget: 25 },
    { campaign_id: "c3", operation_status: "DISABLE", budget_mode: "BUDGET_MODE_DAY", budget: 999 },
  ]);
  assert.equal(safe.comparisonAvailable, true);
  assert.equal(safe.liveDailyBudget, 125);

  const unsafe = summarizeTikTokDailyBudget([], [
    { campaign_id: "c2", operation_status: "ENABLE", budget_mode: "BUDGET_MODE_TOTAL", budget: 300 },
  ]);
  assert.equal(unsafe.comparisonAvailable, false);
  assert.equal(unsafe.liveDailyBudget, null);
});

test("paginates the v1.3 daily report and retains metadata and request IDs", async () => {
  const seenReportPages: string[] = [];
  const reporting = createTikTokWorkerReporting(env, {
    sleepFn: async () => {},
    fetchFn: async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === "api.doppler.com") return Response.json(dopplerSecrets());
      assert.equal(init?.headers && new Headers(init.headers).get("Access-Token"), "token-for-test");
      if (url.pathname.endsWith("/advertiser/info/")) {
        return Response.json({ code: 0, request_id: "account-request", data: { list: [{ advertiser_id: "123", currency: "MYR", timezone: "Asia/Kuala_Lumpur" }] } });
      }
      const page = url.searchParams.get("page") ?? "1";
      seenReportPages.push(page);
      return Response.json({
        code: 0,
        request_id: `report-${page}`,
        data: {
          list: [{ dimensions: { stat_time_day: `2026-08-0${page} 00:00:00` }, metrics: { spend: page, conversion: "1" } }],
          page_info: { total_page: 2 },
        },
      });
    },
  });
  const result = await reporting.fetchDailyPerformance("123", "2026-08-01", "2026-08-02");
  assert.deepEqual(seenReportPages, ["1", "2"]);
  assert.equal(result.apiVersion, "v1.3");
  assert.equal(result.currency, "MYR");
  assert.equal(result.timezone, "Asia/Kuala_Lumpur");
  assert.deepEqual(result.requestIds, ["account-request", "report-1", "report-2"]);
  assert.deepEqual(result.rows.map((row) => [row.spend, row.conversions]), [[1, 1], [2, 1]]);
});

test("fetches long daily reports sequentially across bounded windows", async () => {
  const windows: Array<[string | null, string | null]> = [];
  const reporting = createTikTokWorkerReporting(env, {
    sleepFn: async () => {},
    fetchFn: async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "api.doppler.com") return Response.json(dopplerSecrets());
      if (url.pathname.endsWith("/advertiser/info/")) {
        return Response.json({ code: 0, request_id: "account-request", data: { list: [{ advertiser_id: "123", currency: "MYR", timezone: "Asia/Kuala_Lumpur" }] } });
      }
      const startDate = url.searchParams.get("start_date");
      const endDate = url.searchParams.get("end_date");
      windows.push([startDate, endDate]);
      return Response.json({
        code: 0,
        request_id: `report-${windows.length}`,
        data: {
          list: [{ dimensions: { stat_time_day: `${startDate} 00:00:00` }, metrics: { spend: "1", conversion: "0" } }],
          page_info: { total_page: 1 },
        },
      });
    },
  });
  const result = await reporting.fetchDailyPerformance("123", "2025-10-31", "2026-01-28");
  assert.deepEqual(windows, [
    ["2025-10-31", "2025-11-29"],
    ["2025-11-30", "2025-12-29"],
    ["2025-12-30", "2026-01-28"],
  ]);
  assert.equal(result.rows.length, 90);
  assert.equal(result.rows.reduce((sum, row) => sum + row.spend, 0), 3);
  assert.deepEqual(result.requestIds, ["account-request", "report-1", "report-2", "report-3"]);
});

