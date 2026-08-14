import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { fetchMetaCampaignRows } = require("../lib/reporting/meta.ts") as typeof import("../lib/reporting/meta");
const {
  buildMetaMonthlyOutcomeMetrics,
  normalizeMetaMonthlyCampaignRows,
} = require("../lib/reporting/meta-monthly-dashboard.ts") as typeof import("../lib/reporting/meta-monthly-dashboard");

const originalFetch = globalThis.fetch;

try {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        data: [
          {
            campaign_id: "1200000001",
            campaign_name: "LT | Lead WA | Open Day | 2026-05",
            objective: "OUTCOME_LEADS",
            optimization_goal: "CONVERSATIONS",
            impressions: "78273",
            clicks: "1445",
            ctr: "1.845",
            cpm: "17.52",
            spend: "1371.68",
            actions: [
              {
                action_type: "lead",
                value: "5",
              },
              {
                action_type: "onsite_conversion.messaging_conversation_started_7d",
                value: "902",
              },
            ],
            cost_per_result: [
              {
                indicator: "actions:onsite_conversion.messaging_conversation_started_7d",
                values: [{ value: "4.748902" }],
              },
            ],
            cost_per_action_type: [
              {
                action_type: "lead",
                value: "274.336",
              },
              {
                action_type: "onsite_conversion.messaging_conversation_started_7d",
                value: "4.748902",
              },
            ],
          },
          {
            campaign_id: "1200000002",
            campaign_name: "LT | Awareness",
            objective: "OUTCOME_AWARENESS",
            optimization_goal: "REACH",
            impressions: "100000",
            reach: "80000",
            clicks: "100",
            ctr: "0.1",
            cpm: "10",
            cpp: "12.5",
            estimated_ad_recallers: "5000",
            cost_per_estimated_ad_recallers: "0.2",
            spend: "1000",
          },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    )) as typeof fetch;

  const rows = await fetchMetaCampaignRows({
    accountId: "123456789",
    accessToken: "test-token",
    startDate: "2026-05-01",
    endDate: "2026-05-31",
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].results, 902);
  assert.equal(rows[0].costPerResult, 4.748902);
  assert.equal(rows[1].results, 80000);
  assert.equal(rows[1].costPerResult, 12.5);

  const monthlyRows = normalizeMetaMonthlyCampaignRows(rows);
  assert.equal(monthlyRows[1].results, 80000);
  assert.equal(monthlyRows[1].costPerResult, 12.5);

  const salesAndLeadRows = [
    {
      ...rows[0],
      campaignType: "Outcome Sales",
      spend: 500,
      results: 20,
    },
    {
      ...rows[0],
      id: "lead-campaign",
      campaignType: "Outcome Leads",
      spend: 300,
      results: 10,
    },
    monthlyRows[1],
    {
      ...rows[0],
      id: "traffic-campaign",
      campaignType: "Outcome Traffic",
      spend: 200,
      results: 50,
    },
  ];
  const previousSalesAndLeadRows = [
    {
      ...rows[0],
      campaignType: "Outcome Sales",
      spend: 300,
      results: 10,
    },
  ];
  const salesAndLeadMetrics = buildMetaMonthlyOutcomeMetrics(
    salesAndLeadRows,
    previousSalesAndLeadRows
  );
  assert.equal(salesAndLeadMetrics[0].value, 30);
  assert.equal(salesAndLeadMetrics[0].previousValue, 10);
  assert.equal(salesAndLeadMetrics[0].delta, 200);
  assert.equal(salesAndLeadMetrics[1].value, 800 / 30);
  assert.equal(salesAndLeadMetrics[1].previousValue, 30);
  assert.ok(
    Math.abs((salesAndLeadMetrics[1].delta ?? 0) - ((800 / 30 / 30 - 1) * 100)) < 0.0000001
  );

  const awarenessMetrics = buildMetaMonthlyOutcomeMetrics([monthlyRows[1]], [monthlyRows[1]]);
  assert.equal(awarenessMetrics[0].value, 80000);
  assert.equal(awarenessMetrics[0].previousValue, 80000);
  assert.equal(awarenessMetrics[0].delta, 0);
  assert.equal(awarenessMetrics[1].value, 12.5);
  assert.equal(awarenessMetrics[1].previousValue, 12.5);
  assert.equal(awarenessMetrics[1].delta, 0);

  const mixedMetrics = buildMetaMonthlyOutcomeMetrics(
    [monthlyRows[1], salesAndLeadRows[3]],
    []
  );
  assert.equal(mixedMetrics[0].displayValue, "Mixed");
  assert.equal(mixedMetrics[0].value, null);
  assert.equal(mixedMetrics[1].displayValue, "Mixed");

  const noPreviousOutcomeMetrics = buildMetaMonthlyOutcomeMetrics(
    [salesAndLeadRows[0]],
    [monthlyRows[1]]
  );
  assert.equal(noPreviousOutcomeMetrics[0].value, 20);
  assert.equal(noPreviousOutcomeMetrics[0].previousValue, null);
  assert.equal(noPreviousOutcomeMetrics[0].delta, null);
  assert.equal(noPreviousOutcomeMetrics[1].delta, null);
} finally {
  globalThis.fetch = originalFetch;
}
