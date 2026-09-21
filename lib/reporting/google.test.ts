import test from "node:test";
import assert from "node:assert/strict";

import { buildGoogleCampaignRowsQueries, fetchGoogleCampaignRows } from "./google";

test("campaign performance queries include paused campaigns for historical spend", () => {
  const queries = buildGoogleCampaignRowsQueries("2026-05-01", "2026-05-31");

  assert.equal(queries.length, 2);
  for (const query of queries) {
    assert.match(query, /campaign\.status != 'REMOVED'/);
    assert.doesNotMatch(query, /campaign\.status = 'ENABLED'/);
    assert.match(query, /segments\.date BETWEEN '2026-05-01' AND '2026-05-31'/);
  }
});

test("sanitized GAQL errors retain compatibility fallback behavior", async () => {
  const original = globalThis.fetch;
  const queries = buildGoogleCampaignRowsQueries("2026-05-01", "2026-05-31");
  const seen: string[] = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("oauth2")) return Response.json({ access_token: "fixture", expires_in: 3600 });
    if (String(url).endsWith("listAccessibleCustomers")) return Response.json({ resourceNames: ["customers/1234567890"] });
    const query = JSON.parse(String(options?.body)).query as string;
    seen.push(query);
    if (query === queries[0]) return Response.json({ error: { details: [{ errors: [{ errorCode: { queryError: "PROHIBITED_FIELD_COMBINATION" } }] }] } }, { status: 400 });
    return Response.json([{ results: query === queries[1] ? [] : [{ customer: { id: "1234567890" } }] }]);
  };
  try {
    await fetchGoogleCampaignRows({ customerId: "1234567890", apiVersion: "v25", accessToken: null, clientId: crypto.randomUUID(), clientSecret: "fixture", refreshToken: "fixture", loginCustomerId: null, accessPath: "Personal", startDate: "2026-05-01", endDate: "2026-05-31" });
    assert.ok(seen.includes(queries[0]));
    assert.ok(seen.includes(queries[1]));
  } finally { globalThis.fetch = original; }
});
