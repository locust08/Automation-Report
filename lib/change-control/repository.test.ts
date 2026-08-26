import assert from "node:assert/strict";
import test from "node:test";

import { listMockChangeRequests } from "./repository";

test("request listing scopes summary and page rows at the REST boundary", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SECRET_KEY;
  const paths: string[] = [];
  process.env.SUPABASE_URL = "https://gsmxeosdjsbujhiwhbzk.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-key";
  globalThis.fetch = (async (input) => {
    const path = String(input);
    paths.push(path);
    if (path.includes("select=status")) {
      return Response.json([{ status: "draft" }, { status: "awaiting_approval" }]);
    }
    if (path.includes("select=id")) return Response.json([{ id: "request-1" }]);
    return Response.json([]);
  }) as typeof fetch;

  try {
    const payload = await listMockChangeRequests({
      platform: "meta",
      status: "awaiting_approval",
      account_identity: "act_123 & partner",
      campaign_identity: "campaign/456",
      page: 3,
      page_size: 25,
    });

    assert.equal(payload.pagination.page, 3);
    assert.equal(payload.pagination.total, 1);
    assert.deepEqual(payload.requests, []);
    assert.equal(payload.summary.all, 2);
    assert.equal(payload.summary.awaiting_approval, 1);
    assert.equal(paths.length, 3);
    assert.ok(paths.every((path) => path.includes("platform=eq.meta")));
    assert.ok(paths.every((path) => path.includes("account_identity=eq.act_123%20%26%20partner")));
    assert.ok(paths.every((path) => path.includes("campaign_identity=eq.campaign%2F456")));
    const summaryPath = paths.find((path) => path.includes("select=status"));
    const matchingPath = paths.find((path) => path.includes("select=id"));
    const rowPath = paths.find((path) => path.includes("select=*"));
    assert.ok(!summaryPath?.includes("status=eq.awaiting_approval"));
    assert.ok(matchingPath?.includes("status=eq.awaiting_approval"));
    assert.ok(rowPath?.includes("status=eq.awaiting_approval"));
    assert.equal(payload.pagination.page_size, 25);
    assert.ok(rowPath?.includes("limit=25&offset=50"));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = originalKey;
  }
});
