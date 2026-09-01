import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ReportHeaderMonthPicker } from "@/components/reporting/report-header-month-picker";

test("date picker changes ranges explicitly without previous or next range jump buttons", () => {
  const html = renderToStaticMarkup(
    <ReportHeaderMonthPicker
      startDate="2026-01-01"
      endDate="2026-08-28"
      onChange={() => undefined}
      variant="compact"
    />,
  );

  assert.doesNotMatch(html, /aria-label="Previous date range"/);
  assert.doesNotMatch(html, /aria-label="Next date range"/);
  assert.match(html, /aria-label="Open date range picker"/);
});
