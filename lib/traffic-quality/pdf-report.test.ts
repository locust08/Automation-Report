import assert from "node:assert/strict";
import test from "node:test";

import { createTrafficQualityReportPdf } from "./pdf-report";

test("creates a non-empty PM PDF from a verified M03 report snapshot", () => {
  const pdf = createTrafficQualityReportPdf({
    accountId: "1234567890",
    accountName: "Example account",
    verifiedAt: "2026-08-19T03:00:00.000Z",
    items: [{ campaign: "Search", optimizationType: "negative_keyword", excludedItem: { text: "free", matchType: "PHRASE" }, reason: "Wrong intent", outcome: "verified", attempts: 1, error: null }],
  });
  assert.ok(pdf.byteLength > 1_000);
});
