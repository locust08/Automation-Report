import test from "node:test";
import assert from "node:assert/strict";

import {
  audienceAgeOrder,
  audienceGenderOrder,
  coerceAudienceClicks,
  createAudienceClickBreakdownItem,
  createEmptyAudienceClickBreakdownResponse,
  createEmptyGoogleAudienceClickBreakdownResponse,
  limitAudienceItemsWithOthers,
  limitLocationRowsWithOthers,
  normalizeAudienceAgeLabel,
  normalizeAudienceGenderLabel,
  summarizeAudienceItemsForChart,
} from "./audience-breakdown.ts";

test("age ordering preserves logical audience sequence", () => {
  const labels = ["Unknown", "55-64", "18-24", "65+", "35-44", "25-34", "45-54"];
  const sorted = [...labels].sort((left, right) => audienceAgeOrder(left) - audienceAgeOrder(right));
  assert.deepEqual(sorted, ["18-24", "25-34", "35-44", "45-54", "55-64", "65+", "Unknown"]);
});

test("gender ordering preserves male female unknown", () => {
  const labels = ["Unknown", "Female", "Male"];
  const sorted = [...labels].sort(
    (left, right) => audienceGenderOrder(left) - audienceGenderOrder(right)
  );
  assert.deepEqual(sorted, ["Male", "Female", "Unknown"]);
});

test("location grouping keeps top 10 rows and appends others", () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    label: `Location ${index + 1}`,
    clicks: 120 - index,
  }));
  const grouped = limitLocationRowsWithOthers(rows, 10);
  assert.equal(grouped.length, 11);
  assert.equal(grouped[0]?.label, "Location 1");
  assert.equal(grouped[9]?.label, "Location 10");
  assert.deepEqual(grouped[10], {
    label: "Others",
    clicks: rows[10].clicks + rows[11].clicks,
  });
});

test("empty audience response returns stable empty arrays", () => {
  const response = createEmptyAudienceClickBreakdownResponse();
  assert.deepEqual(response, {
    age: [],
    gender: [],
    location: {
      country: [],
      region: [],
      city: [],
    },
  });
});

test("google audience fallback response stays stable on partial failure", () => {
  const response = createEmptyGoogleAudienceClickBreakdownResponse();
  assert.deepEqual(response, {
    age: [],
    gender: [],
    location: {
      country: [],
      region: [],
      city: [],
    },
    sources: {
      keywords: [],
      content: [],
    },
  });
});

test("string clicks are converted to numbers and labels are normalized", () => {
  assert.equal(coerceAudienceClicks("42"), 42);
  assert.equal(normalizeAudienceAgeLabel("AGE_RANGE_25_34"), "25-34");
  assert.equal(normalizeAudienceGenderLabel("FEMALE"), "Female");
});

test("chart summary aggregates platforms by label", () => {
  const items = [
    createAudienceClickBreakdownItem({
      platform: "google",
      dimension: "region",
      label: "Selangor",
      clicks: 10,
    }),
    createAudienceClickBreakdownItem({
      platform: "meta",
      dimension: "region",
      label: "Selangor",
      clicks: 15,
    }),
  ];

  const rows = summarizeAudienceItemsForChart(items, "region");
  assert.deepEqual(rows, [{ label: "Selangor", clicks: 25 }]);
});

test("location item grouping keeps top 10 entries and appends others", () => {
  const items = Array.from({ length: 12 }, (_, index) =>
    createAudienceClickBreakdownItem({
      platform: "google",
      dimension: "region",
      label: `Region ${index + 1}`,
      clicks: 50 - index,
    })
  );

  const grouped = limitAudienceItemsWithOthers(items, 10);
  assert.equal(grouped.length, 11);
  assert.equal(grouped[0]?.label, "Region 1");
  assert.equal(grouped[9]?.label, "Region 10");
  assert.deepEqual(grouped[10], {
    platform: "google",
    dimension: "region",
    label: "Others",
    clicks: items[10].clicks + items[11].clicks,
  });
});
