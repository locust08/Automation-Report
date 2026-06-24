import test from "node:test";
import assert from "node:assert/strict";

import {
  extractAdAccountIdFromAccountSearchInput,
  formatAccountSuggestionLabel,
} from "./home-account-search";

test("formats account search suggestion as name pipe id", () => {
  assert.equal(
    formatAccountSuggestionLabel({
      accountName: "Google - Toi Toi Services Sdn Bhd",
      adAccountId: "596-791-2936",
    }),
    "Google - Toi Toi Services Sdn Bhd | 596-791-2936"
  );
});

test("extracts ad account id from combined account search input", () => {
  assert.equal(
    extractAdAccountIdFromAccountSearchInput("Google - Toi Toi Services Sdn Bhd | 596-791-2936"),
    "596-791-2936"
  );
});

test("uses raw typed id when no combined account label is selected", () => {
  assert.equal(extractAdAccountIdFromAccountSearchInput("596-791-2936"), "596-791-2936");
  assert.equal(extractAdAccountIdFromAccountSearchInput("act_123456789"), "act_123456789");
});

test("does not treat a plain account name as an account id", () => {
  assert.equal(extractAdAccountIdFromAccountSearchInput("Google - Toi Toi Services Sdn Bhd"), "");
});
