import assert from "node:assert/strict";
import test from "node:test";

import { flattenCampaignDetail } from "./campaign-detail-table";

test("flattens nested provider details into table columns without section rows", () => {
  assert.deepEqual(flattenCampaignDetail({
    bidding_strategy: "target_cpa",
    network_settings: { google_search: true, search_partners: false },
    keywords: [{ text: "crm demo", match_type: "phrase" }],
  }), [
    { key: "bidding_strategy", label: "Bidding Strategy", value: "Target Cpa" },
    { key: "network_settings.google_search", label: "Network Settings · Google Search", value: "Yes" },
    { key: "network_settings.search_partners", label: "Network Settings · Search Partners", value: "No" },
    { key: "keywords", label: "Keywords", value: "Text: crm demo · Match Type: phrase" },
  ]);
});
