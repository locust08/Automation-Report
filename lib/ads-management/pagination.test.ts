import assert from "node:assert/strict";
import test from "node:test";

import { paginateRows } from "./pagination";

test("Meta list pagination defaults to ten rows and clamps an invalid page", () => {
  const rows = Array.from({ length: 23 }, (_, index) => index + 1);

  assert.deepEqual(paginateRows(rows, 99, 10), {
    items: [21, 22, 23],
    page: 3,
    pageSize: 10,
    total: 23,
    totalPages: 3,
    start: 21,
    end: 23,
  });
});

test("Meta list pagination supports the approved larger page sizes", () => {
  const rows = Array.from({ length: 61 }, (_, index) => index + 1);

  assert.deepEqual(paginateRows(rows, 2, 25), {
    items: rows.slice(25, 50),
    page: 2,
    pageSize: 25,
    total: 61,
    totalPages: 3,
    start: 26,
    end: 50,
  });
  assert.equal(paginateRows(rows, 1, 50).items.length, 50);
});
