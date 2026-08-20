import assert from "node:assert/strict";
import test from "node:test";

import { formatPreviewFatalError } from "./preview-user-error";

test("replaces raw Meta provider diagnostics with a short safe message", () => {
  const message = formatPreviewFatalError("meta", {
    message: "(#200) Missing ads_read. See https://developers.facebook.com/docs/marketing-api/get-started/authorization/",
    errorCode: "200",
    errorSubcode: "n/a",
  });

  assert.equal(message, "Meta Ads access is unavailable for this account. Ask an administrator to reconnect or update its permissions.");
  assert.equal(message.includes("#200"), false);
  assert.equal(message.includes("https://"), false);
});

test("returns a concise TikTok reconnect message without provider details", () => {
  const message = formatPreviewFatalError("tiktok", {
    message: "TikTok advertiser authorization is missing or revoked; token fingerprint abc123",
  });

  assert.equal(message, "TikTok Ads access is unavailable for this account. Ask an administrator to reconnect TikTok.");
  assert.equal(message.includes("fingerprint"), false);
});

