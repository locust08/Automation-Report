import assert from "node:assert/strict";
import { test } from "node:test";
import { budgetSlot, dateBefore, localYesterday, pilotNotionAccountId } from "./schedule";

test("dashboard independently matches the approved Malaysia health slots", () => {
  assert.deepEqual(budgetSlot("2026-09-25T00:00:00.000Z")?.platforms, ["google", "meta"]);
  assert.deepEqual(budgetSlot("2026-09-25T00:15:00.000Z")?.platforms, ["tiktok"]);
  assert.equal(budgetSlot("2026-09-25T00:30:00.000Z"), null);
});

test("account-local complete-day window spans exactly 30 days", () => {
  const end = localYesterday("Asia/Kuala_Lumpur", new Date("2026-09-25T00:00:00Z"));
  assert.equal(end, "2026-09-24");
  assert.equal(dateBefore(end, 29), "2026-08-26");
});

test("pilot dispatcher accepts exactly one explicit Notion account UUID", () => {
  assert.equal(pilotNotionAccountId("3584fcc4-f701-8003-843e-d7e3316fc758"), "3584fcc4-f701-8003-843e-d7e3316fc758");
  assert.equal(pilotNotionAccountId(undefined), null);
  assert.equal(pilotNotionAccountId("all"), null);
});
