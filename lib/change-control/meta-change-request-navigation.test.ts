import assert from "node:assert/strict";
import test from "node:test";

import { metaChangeFieldsForNavigationFilter } from "@/lib/change-control/meta-change-request-navigation";

test("campaign and ad-set filters expose only their supported direct-update fields", () => {
  assert.deepEqual(
    metaChangeFieldsForNavigationFilter("campaign").map((field) => field.field_path),
    ["campaign.name", "campaign.status", "campaign.budget.daily", "campaign.budget.lifetime", "campaign.bid.strategy"],
  );
  assert.deepEqual(
    metaChangeFieldsForNavigationFilter("ad_set").map((field) => field.entity_type),
    Array(13).fill("ad_set"),
  );
});

test("ad and creative filters keep direct updates separate from creative replacements", () => {
  assert.deepEqual(
    metaChangeFieldsForNavigationFilter("ad").map((field) => field.field_path),
    ["ad.name", "ad.status"],
  );
  assert.deepEqual(
    metaChangeFieldsForNavigationFilter("creative").map((field) => field.field_path),
    ["ad.copy.primary_text", "ad.copy.headline", "ad.copy.description", "ad.creative.call_to_action", "ad.creative.destination_url"],
  );
});
