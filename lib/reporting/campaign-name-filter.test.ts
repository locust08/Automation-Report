import test from "node:test";
import assert from "node:assert/strict";

import {
  campaignNameMatchesFilter,
  filterRowsByCampaignName,
  formatCampaignNameFilterLabel,
  getCampaignNameOptions,
  parseCampaignNameFilter,
  writeCampaignNameFilterParams,
} from "./campaign-name-filter";

test("parses repeated campaign name filter query params", () => {
  const params = new URLSearchParams();
  params.set("campaignNameFilterMode", "exclude");
  params.append("campaignNameFilterValue", "Boarding, KL");
  params.append("campaignNameFilterValue", "Brand Search");

  assert.deepEqual(parseCampaignNameFilter(params), {
    mode: "exclude",
    values: ["Boarding, KL", "Brand Search"],
  });
});

test("parses old single campaign name filter query param as one selection", () => {
  const params = new URLSearchParams({
    campaignNameFilterMode: "include",
    campaignNameFilterValue: "Brand Search",
  });

  assert.deepEqual(parseCampaignNameFilter(params), {
    mode: "include",
    values: ["Brand Search"],
  });
});

test("writes repeated campaign name filter query params without comma splitting", () => {
  const params = new URLSearchParams("accountId=123&campaignNameFilterValue=old");

  writeCampaignNameFilterParams(params, {
    mode: "include",
    values: ["Boarding, KL", "Brand Search"],
  });

  assert.equal(params.get("campaignNameFilterMode"), "include");
  assert.deepEqual(params.getAll("campaignNameFilterValue"), ["Boarding, KL", "Brand Search"]);
});

test("matches campaign names exactly for include and exclude modes", () => {
  const filter = {
    mode: "include" as const,
    values: ["SEM | Boarding | KL, SEL"],
  };

  assert.equal(campaignNameMatchesFilter("SEM | Boarding | KL, SEL", filter), true);
  assert.equal(campaignNameMatchesFilter("SEM | Boarding | KL, SEL #2", filter), false);
  assert.equal(
    campaignNameMatchesFilter("SEM | Boarding | KL, SEL", {
      mode: "exclude",
      values: ["SEM | Boarding | KL, SEL"],
    }),
    false
  );
});

test("matches final url rows when any source campaign is selected", () => {
  assert.equal(
    campaignNameMatchesFilter(["Brand Search", "SEM | Boarding | KL, SEL"], {
      mode: "include",
      values: ["SEM | Boarding | KL, SEL"],
    }),
    true
  );
});

test("filters rows by selected campaign names without changing rows when filter is empty", () => {
  const rows = [
    { campaignName: "SEM | Boarding | KL, SEL" },
    { campaignName: "LT | Search | Brand" },
    { campaignName: "Boarding Awareness" },
  ];

  assert.deepEqual(
    filterRowsByCampaignName(rows, (row) => row.campaignName, {
      mode: "include",
      values: ["SEM | Boarding | KL, SEL", "Boarding Awareness"],
    }),
    [rows[0], rows[2]]
  );
  assert.equal(filterRowsByCampaignName(rows, (row) => row.campaignName, null), rows);
});

test("dedupes campaign name options while preserving first-seen order", () => {
  assert.deepEqual(
    getCampaignNameOptions(["Brand Search", "", "SEM | Boarding | KL, SEL", "brand search"]),
    ["Brand Search", "SEM | Boarding | KL, SEL"]
  );
});

test("formats applied filter labels for compact report controls", () => {
  assert.equal(
    formatCampaignNameFilterLabel({
      mode: "include",
      values: ["Boarding"],
    }),
    "Includes: Boarding"
  );
  assert.equal(
    formatCampaignNameFilterLabel({
      mode: "exclude",
      values: ["Competitor A", "Competitor B", "Competitor C"],
    }),
    "Excludes: Competitor A, Competitor B +1"
  );
});
