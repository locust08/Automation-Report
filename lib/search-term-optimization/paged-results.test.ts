import assert from "node:assert/strict";
import test from "node:test";

import { collectPagedResults } from "./paged-results";

test("loads every saved result when Supabase returns more than one page", async () => {
  const source = Array.from({ length: 1_190 }, (_, index) => ({ id: index + 1 }));
  const requestedOffsets: number[] = [];

  const rows = await collectPagedResults(async ({ limit, offset }) => {
    requestedOffsets.push(offset);
    return source.slice(offset, offset + limit);
  }, 1_000);

  assert.equal(rows.length, 1_190);
  assert.deepEqual(requestedOffsets, [0, 1_000]);
});
