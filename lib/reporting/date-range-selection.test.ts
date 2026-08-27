import assert from "node:assert/strict";
import test from "node:test";

import { selectDateRangeDay } from "./date-range-selection";

test("the first click always replaces the applied range with a new start date", () => {
  assert.deepEqual(
    selectDateRangeDay(
      {
        startDate: "2026-07-29",
        endDate: "2026-08-27",
        selectionStart: null,
      },
      "2026-01-01",
    ),
    {
      startDate: "2026-01-01",
      endDate: null,
      selectionStart: "2026-01-01",
    },
  );
});

test("the second click after the start completes the range in click order", () => {
  assert.deepEqual(
    selectDateRangeDay(
      {
        startDate: "2026-01-01",
        endDate: null,
        selectionStart: "2026-01-01",
      },
      "2026-06-30",
    ),
    {
      startDate: "2026-01-01",
      endDate: "2026-06-30",
      selectionStart: null,
    },
  );
});

test("an earlier second click restarts selection instead of reversing the dates", () => {
  assert.deepEqual(
    selectDateRangeDay(
      {
        startDate: "2026-06-30",
        endDate: null,
        selectionStart: "2026-06-30",
      },
      "2026-01-01",
    ),
    {
      startDate: "2026-01-01",
      endDate: null,
      selectionStart: "2026-01-01",
    },
  );
});

test("clicking the same day twice creates a valid one-day range", () => {
  assert.deepEqual(
    selectDateRangeDay(
      {
        startDate: "2026-01-01",
        endDate: null,
        selectionStart: "2026-01-01",
      },
      "2026-01-01",
    ),
    {
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      selectionStart: null,
    },
  );
});
