import assert from "node:assert/strict";
import test from "node:test";

import {
  addManagementCostPerResult,
  formatManagementCostPerResult,
  summarizeManagementPerformance,
  toGoogleManagementPerformancePoints,
} from "./management-performance";

test("Google performance normalizes micros and calculates totals independently of display labels", () => {
  const points = toGoogleManagementPerformancePoints([
    { date: "2026-08-02", costMicros: 2_500_000, conversions: 2, clicks: 5 },
    { date: "2026-08-01", costMicros: 1_500_000, conversions: 1, clicks: 3 },
  ]);

  assert.deepEqual(points, [
    { date: "2026-08-01", cost: 1.5, results: 1, clicks: 3 },
    { date: "2026-08-02", cost: 2.5, results: 2, clicks: 5 },
  ]);
  assert.deepEqual(summarizeManagementPerformance(points), {
    cost: 4,
    results: 3,
    clicks: 8,
    costPerResult: 4 / 3,
  });
});

test("Management performance returns a zero cost per result when there are no results", () => {
  assert.deepEqual(
    summarizeManagementPerformance([{ date: "2026-08-01", cost: 8, results: 0, clicks: 2 }]),
    { cost: 8, results: 0, clicks: 2, costPerResult: 0 },
  );
});

test("Management performance preserves an authoritative provider cost per result", () => {
  assert.deepEqual(
    summarizeManagementPerformance(
      [{ date: "2026-01-01", cost: 279.4, results: 207_109, clicks: 235 }],
      { costPerResult: 1.3490480652699786 },
    ),
    {
      cost: 279.4,
      results: 207_109,
      clicks: 235,
      costPerResult: 1.3490480652699786,
    },
  );
});

test("Management performance does not let a zero provider summary replace a positive daily cost per result", () => {
  assert.deepEqual(
    summarizeManagementPerformance(
      [{ date: "2026-08-27", cost: 4_133.19, results: 1_552_822, clicks: 0 }],
      { costPerResult: 0 },
    ),
    {
      cost: 4_133.19,
      results: 1_552_822,
      clicks: 0,
      costPerResult: 4_133.19 / 1_552_822,
    },
  );
});

test("Management performance scales daily cost per result to the provider unit", () => {
  assert.deepEqual(
    addManagementCostPerResult(
      [
        { date: "2026-01-01", cost: 100, results: 100_000, clicks: 10 },
        { date: "2026-01-02", cost: 200, results: 100_000, clicks: 20 },
      ],
      1.5,
    ),
    [
      { date: "2026-01-01", cost: 100, results: 100_000, clicks: 10, costPerResult: 1 },
      { date: "2026-01-02", cost: 200, results: 100_000, clicks: 20, costPerResult: 2 },
    ],
  );
});

test("Management performance preserves a small positive cost per result instead of displaying zero", () => {
  assert.equal(formatManagementCostPerResult(4_133.19 / 1_552_822, "MYR"), "RM 0.0027");
  assert.equal(formatManagementCostPerResult(0, "MYR"), "RM 0.00");
  assert.equal(formatManagementCostPerResult(59.2, "MYR"), "RM 59.20");
});
