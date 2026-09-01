import assert from "node:assert/strict";
import test from "node:test";

import { toTikTokManagementPerformancePoints } from "./tiktok-management-performance";

test("TikTok management charts use all-click engagements without overwriting destination clicks", () => {
  const points = toTikTokManagementPerformancePoints([
    {
      date: "2026-08-27",
      spend: 12.5,
      results: 100,
      clicks: 2,
      engagements: 19,
      resultLabel: "Reach",
    },
  ]);

  assert.deepEqual(points, [
    { date: "2026-08-27", cost: 12.5, results: 100, clicks: 19 },
  ]);
});

test("TikTok management charts fall back to destination clicks for cached legacy points", () => {
  const points = toTikTokManagementPerformancePoints([
    { date: "2026-08-27", spend: 4, results: 1, clicks: 3, resultLabel: "Results" },
  ]);

  assert.equal(points[0]?.clicks, 3);
});
