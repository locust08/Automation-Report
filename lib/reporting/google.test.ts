import test from "node:test";
import assert from "node:assert/strict";

import { buildGoogleCampaignRowsQueries } from "./google";

test("campaign performance queries include paused campaigns for historical spend", () => {
  const queries = buildGoogleCampaignRowsQueries("2026-05-01", "2026-05-31");

  assert.equal(queries.length, 2);
  for (const query of queries) {
    assert.match(query, /campaign\.status != 'REMOVED'/);
    assert.doesNotMatch(query, /campaign\.status = 'ENABLED'/);
    assert.match(query, /segments\.date BETWEEN '2026-05-01' AND '2026-05-31'/);
  }
});
