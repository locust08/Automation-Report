import assert from "node:assert/strict";
import test from "node:test";

import { getMetaPreviewFailureMessage } from "./meta-preview-failure";

test("explains Meta ad-account rate limiting instead of treating it as empty data", () => {
  assert.equal(
    getMetaPreviewFailureMessage({
      metaFatalErrors: [{
        label: "meta-preview-campaigns",
        required: true,
        fields: ["id", "name"],
        accountId: "132472815649146",
        errorCode: 80004,
        errorSubcode: 2446079,
        message: "There have been too many calls to this ad-account.",
      }],
    }),
    "Meta temporarily rate-limited this ad account. Wait a few minutes, then refresh official data."
  );
});

test("returns no failure for a successful preview payload", () => {
  assert.equal(getMetaPreviewFailureMessage({ metaFatalErrors: [] }), null);
});
