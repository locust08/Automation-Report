import assert from "node:assert/strict";

delete process.env.OVERALL_REPORT_CACHE_TTL_SECONDS;
delete process.env.OVERALL_REPORT_CACHE_WORKER_URL;
delete process.env.REPORT_CACHE_WORKER_URL;
delete process.env.OVERALL_REPORT_CACHE_SECRET;
delete process.env.REPORT_CACHE_SECRET;

const { readOverallReportCache, writeOverallReportCache } = await import("../lib/reporting/overall-cache");

const cacheKey = `cache-disabled-${Date.now()}`;
const payload = {
  companyName: "Test Company",
  dateRange: {
    startDate: "2026-05-01",
    endDate: "2026-05-31",
    previousStartDate: "2026-04-01",
    previousEndDate: "2026-04-30",
    currentLabel: "May 2026",
    previousLabel: "Apr 2026",
  },
  accountIds: {
    metaAccountId: "123",
    googleAccountId: null,
    metaAccountIds: ["123"],
    googleAccountIds: [],
  },
  summaries: [],
  campaignGroups: [],
  audienceClickBreakdown: {
    age: [],
    gender: [],
    location: {
      country: [],
      region: [],
      city: [],
    },
  },
  warnings: [],
  diagnostics: [],
};

await writeOverallReportCache(cacheKey, payload);

assert.equal(await readOverallReportCache(cacheKey), null);
