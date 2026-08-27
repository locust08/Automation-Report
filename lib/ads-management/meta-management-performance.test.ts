import assert from "node:assert/strict";
import test from "node:test";

import {
  groupMetaDailyPerformance,
  mergeMetaDailyPerformanceSeries,
  resolveMetaManagementCostPerResult,
} from "./meta-management-performance";

test("Meta daily performance groups duplicate entity dates without double-counting other dates", () => {
  const grouped = groupMetaDailyPerformance([
    { entityId: "ad-1", date: "2026-08-01", spend: 10, results: 2, clicks: 4, resultLabel: "Leads" },
    { entityId: "ad-1", date: "2026-08-01", spend: 5, results: 1, clicks: 2, resultLabel: "Leads" },
    { entityId: "ad-1", date: "2026-08-02", spend: 8, results: 4, clicks: 3, resultLabel: "Leads" },
    { entityId: "ad-2", date: "2026-08-01", spend: 7, results: 1, clicks: 1, resultLabel: "Purchases" },
  ]);

  assert.deepEqual(grouped.get("ad-1"), [
    { date: "2026-08-01", spend: 15, results: 3, clicks: 6, resultLabel: "Leads" },
    { date: "2026-08-02", spend: 8, results: 4, clicks: 3, resultLabel: "Leads" },
  ]);
  assert.deepEqual(grouped.get("ad-2"), [
    { date: "2026-08-01", spend: 7, results: 1, clicks: 1, resultLabel: "Purchases" },
  ]);
});

test("Meta parent daily performance merges child dates and falls back to Results for mixed labels", () => {
  const merged = mergeMetaDailyPerformanceSeries([
    [
      { date: "2026-08-01", spend: 10, results: 2, clicks: 4, resultLabel: "Leads" },
      { date: "2026-08-02", spend: 5, results: 1, clicks: 2, resultLabel: "Leads" },
    ],
    [
      { date: "2026-08-01", spend: 7, results: 3, clicks: 1, resultLabel: "Purchases" },
    ],
  ]);

  assert.deepEqual(merged, [
    { date: "2026-08-01", spend: 17, results: 5, clicks: 5, resultLabel: "Results" },
    { date: "2026-08-02", spend: 5, results: 1, clicks: 2, resultLabel: "Leads" },
  ]);
});

test("Meta management uses the provider cost per result for a consistent result type", () => {
  assert.equal(
    resolveMetaManagementCostPerResult([
      { resultLabel: "Reach", results: 207_109, costPerResult: 1.3490480652699786 },
      { resultLabel: "Reach", results: 0, costPerResult: null },
    ]),
    1.3490480652699786,
  );
});

test("Meta management weights provider cost per result across matching result types", () => {
  assert.equal(
    resolveMetaManagementCostPerResult([
      { resultLabel: "Leads", results: 2, costPerResult: 5 },
      { resultLabel: "Leads", results: 3, costPerResult: 10 },
    ]),
    8,
  );
});
