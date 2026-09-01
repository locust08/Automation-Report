import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { M03StatusSummary } from "./m03-status-summary";
import type { M03RequestListPayload } from "@/lib/change-control/types";

test("Change Control renders one uniform five-card status summary", () => {
  const payload = {
    requests: [],
    summary: {
      all: 9,
      draft: 2,
      validation_in_progress: 0,
      validation_failed: 0,
      awaiting_approval: 3,
      approved: 4,
      conflict_detected: 0,
      ready_to_publish: 0,
      publishing: 0,
      published: 0,
      verification_in_progress: 0,
      verified: 0,
      partially_completed: 0,
      failed: 0,
      reverted: 0,
      cancelled: 0,
      provider_execution_locked: 0,
    },
    pagination: { page: 1, page_size: 10, total: 9, total_pages: 1 },
    provider_execution_locked: true,
  } satisfies M03RequestListPayload;

  const html = renderToStaticMarkup(<M03StatusSummary payload={payload} />);
  const labels = ["All requests", "Draft", "Awaiting approval", "Approved", "Cancelled"];

  assert.equal((html.match(/data-slot="card"/g) ?? []).length, 5);
  assert.equal(labels.every((label, index) => html.indexOf(label) >= 0 && (index === 0 || html.indexOf(labels[index - 1]!) < html.indexOf(label))), true);
  assert.match(html, /auto-rows-fr/);
  assert.equal((html.match(/min-h-\[116px\]/g) ?? []).length, 5);
  assert.equal((html.match(/tabular-nums/g) ?? []).length, 5);
});
