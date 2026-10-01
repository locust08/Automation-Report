import assert from "node:assert/strict";
import test from "node:test";
import { fetchMetaPreviewData } from "./meta";

test("staged historical Meta children carry own period metrics and selected events", async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input); urls.push(url);
    const data = url.includes("/campaigns?") ? [{ id: "c", name: "Campaign", status: "PAUSED" }]
      : url.includes("/adsets?") ? [{ id: "s", name: "Historical set", campaign_id: "c", status: "PAUSED" }]
      : url.includes("/insights?") ? [{ adset_id: "s", impressions: "100", clicks: "10", spend: "5", actions: [{ action_type: "lead", value: "20" }, { action_type: "onsite_conversion.lead_grouped", value: "2" }] }] : [];
    return Response.json({ data });
  };
  try {
    const report = await fetchMetaPreviewData({ accountId: "123", accessToken: "fixture", startDate: "2026-09-01", endDate: "2026-09-30", previewStage: "ad-groups", managementStage: "ad-groups", includeInactive: true, periodPerformance: true, resultActionType: "onsite_conversion.lead_grouped", previewSelection: { platform: "meta", campaignId: "c", adGroupId: null, adId: null } });
    const child = report.data[0].children[0];
    assert.equal(child.status.toUpperCase(), "PAUSED");
    assert.equal(child.performance?.spend, 5);
    assert.equal(child.performance?.results, 2);
    assert.equal(child.performance?.ctr, 10);
    assert.equal(child.performance?.costPerResult, 2.5);
    assert.ok(urls.some((url) => url.includes("level=adset") && decodeURIComponent(url).includes("2026-09-01")));
    assert.ok(urls.filter((url) => url.includes("/insights?")).every((url) => !url.includes("time_increment")), "monthly results must use period-level unique reach");
  } finally { globalThis.fetch = original; }
});

test("Meta continuation failure retains earlier children and reports incomplete coverage", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/campaigns?")) return Response.json({ data: [{ id: "c", name: "Campaign" }] });
    if (url.includes("/adsets?")) return Response.json({ data: [{ id: "s", name: "Retained set", campaign_id: "c" }], paging: { next: "https://graph.facebook.com/fixture-next" } });
    if (url.includes("fixture-next")) return Response.json({ error: { code: 100, message: "Page failed" } }, { status: 400 });
    return Response.json({ data: [] });
  };
  try {
    const report = await fetchMetaPreviewData({ accountId: "123", accessToken: "fixture", startDate: "2026-09-01", endDate: "2026-09-30", previewStage: "ad-groups", managementStage: "ad-groups", includeInactive: true, previewSelection: { platform: "meta", campaignId: "c", adGroupId: null, adId: null } });
    assert.equal(report.data[0].children[0].id, "s");
    assert.equal(report.data[0].children[0].performance, null);
    assert.ok(report.fatalErrors.some((issue) => issue.message.includes("Loaded rows are retained")));
  } finally { globalThis.fetch = original; }
});
