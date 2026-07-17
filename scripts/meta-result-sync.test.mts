import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { fetchMetaCampaignRows } = require("../lib/reporting/meta.ts") as typeof import("../lib/reporting/meta");

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

  assert.equal(rows.length, 1);
  assert.equal(rows[0].results, 902);
  assert.equal(rows[0].costPerResult, 4.748902);
} finally {
  globalThis.fetch = originalFetch;
}
