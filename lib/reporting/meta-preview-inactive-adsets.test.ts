import assert from "node:assert/strict";
import test from "node:test";

import { fetchMetaPreviewData } from "./meta";

test("inactive preview fetch keeps synchronized ad sets that have no ads", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/campaigns?")) return json({ data: [{ id: "campaign-1", name: "Campaign", status: "ACTIVE", effective_status: "ACTIVE" }] });
    if (url.includes("/ads?")) return json({ data: [] });
    if (url.includes("/adsets?")) return json({ data: [{ id: "adset-empty", campaign_id: "campaign-1", name: "Empty inactive", status: "PAUSED", effective_status: "PAUSED" }] });
    throw new Error(`Unexpected Meta request: ${url}`);
  };
  try {
    const result = await fetchMetaPreviewData({
      accountId: "123",
      accessToken: "test-token",
      startDate: "2026-08-01",
      endDate: "2026-08-26",
      previewStage: "ad-groups",
      includeInactive: true,
    });
    assert.equal(result.data[0]?.children[0]?.id, "adset-empty");
    assert.equal(result.data[0]?.children[0]?.status, "Paused");
    assert.equal(result.data[0]?.children[0]?.ads.length, 0);
    assert.ok(urls.some((url) => url.includes("/act_123/adsets?")), "ad sets must be fetched directly from the account");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function json(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}
