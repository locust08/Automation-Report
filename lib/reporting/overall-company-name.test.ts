import assert from "node:assert/strict";
import test from "node:test";

import { resolveOverallPerformanceCompanyName } from "./overall-company-name";

test("uses the live TikTok advertiser name for a TikTok-only report", () => {
  const companyName = resolveOverallPerformanceCompanyName({
    fallbackCompanyName: "Company Name",
    metaAccountIds: [],
    googleAccountIds: [],
    tiktokAccountIds: ["7512268241088299015"],
    tiktokAccounts: [
      {
        advertiserId: "7512268241088299015",
        advertiserName: "Bellamy's Organic Singapore",
      },
    ],
  });

  assert.equal(companyName, "Bellamy's Organic Singapore");
});
