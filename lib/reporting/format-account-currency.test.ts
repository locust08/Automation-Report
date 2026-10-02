import assert from "node:assert/strict";
import test from "node:test";
import { formatAccountCurrency } from "./format";
test("ad/asset spend preserves native currency, zero and unavailable values", () => {
  assert.equal(formatAccountCurrency(2.345,"MYR"),"RM 2.35");
  assert.equal(formatAccountCurrency(2.345,"SGD"),"SGD 2.35");
  assert.equal(formatAccountCurrency(0,"MYR"),"RM 0.00");
  assert.equal(formatAccountCurrency(null,"MYR"),"—");
  assert.equal(formatAccountCurrency(NaN,"MYR"),"—");
});
