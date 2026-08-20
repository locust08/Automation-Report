import assert from "node:assert/strict";
import test from "node:test";

import { resolveMonthlyReportDateRange } from "./monthly-report-date";

test("monthly delivery resolves the previous calendar month", () => {
  assert.deepEqual(resolveMonthlyReportDateRange(new Date("2026-08-07T04:00:00Z"), "monthlyOverall"), {
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    reportMonthKey: "2026-07",
    reportMonthLabel: "July 2026",
  });
});

test("bi-weekly delivery resolves the current month days 1 through 14", () => {
  assert.deepEqual(resolveMonthlyReportDateRange(new Date("2026-08-15T04:00:00Z"), "biweeklyOverall"), {
    startDate: "2026-08-01",
    endDate: "2026-08-14",
    reportMonthKey: "2026-08-biweekly-01-14",
    reportMonthLabel: "August 1–14, 2026",
  });
});
