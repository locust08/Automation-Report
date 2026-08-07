import assert from "node:assert/strict";
import test from "node:test";
import { formatFocusedSitelinkAuditValue, formatSitelinkAuditValue, formatSitelinkCompletionValue, summarizeSitelinkChanges } from "@/lib/ads-management/sitelink-display";

const original = {
  id: "sitelink-1",
  linkText: "Our Products",
  description1: "See our complete range",
  description2: "Products for every need",
  finalUrls: ["https://example.com/products"],
  finalMobileUrls: [],
  startDate: "",
  endDate: "",
  scope: "campaign",
};

test("shows complete sitelink details in audit values", () => {
  const output = formatSitelinkAuditValue([original]);
  assert.match(output, /Final URL: https:\/\/example.com\/products/);
  assert.match(output, /Description line 1: See our complete range/);
  assert.match(output, /Description line 2: Products for every need/);
  assert.match(output, /Scope: Campaign/);
});

test("identifies the exact sitelink field that changed", () => {
  const output = summarizeSitelinkChanges([original], [{ ...original, description1: "Browse our complete range" }]);
  assert.equal(output, "Edited “Our Products” (description line 1)");
});

test("focused audit values hide unrelated sitelinks and unchanged fields", () => {
  const unrelated = { ...original, id: "sitelink-2", linkText: "Contact", description1: "Talk to our team" };
  const proposed = [{ ...original, description1: "Browse our complete range" }, unrelated];
  const output = formatFocusedSitelinkAuditValue([original, unrelated], proposed, proposed);
  assert.equal(output, "Our Products\n   Description line 1: Browse our complete range");
  assert.doesNotMatch(output, /Contact/);
  assert.doesNotMatch(output, /Final URL/);
});

test("includes descriptions in completion values", () => {
  const output = formatSitelinkCompletionValue([original]);
  assert.match(output, /Description 1: See our complete range/);
  assert.match(output, /Description 2: Products for every need/);
});
