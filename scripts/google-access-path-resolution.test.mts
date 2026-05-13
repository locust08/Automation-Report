import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_GOOGLE_ADS_FALLBACK_LOGIN_CUSTOMER_ID,
  formatGoogleAdsAccessPathErrorMessage,
  resolveGoogleAdsAccessPath,
} from "../lib/reporting/google-access-path";

test("Personal access path uses direct mode", () => {
  const resolved = resolveGoogleAdsAccessPath({
    accountId: "123-456-7890",
    originalAccessPath: "Personal",
  });

  assert.deepEqual(resolved, {
    accountId: "1234567890",
    customerId: "1234567890",
    originalAccessPath: "Personal",
    resolvedAccessPath: "Personal",
    fallbackUsed: false,
    loginCustomerId: null,
    resolutionMode: "direct",
  });
});

test("MCC 411-468-5827 is preserved when valid", () => {
  const resolved = resolveGoogleAdsAccessPath({
    accountId: "1234567890",
    originalAccessPath: "411-468-5827",
  });

  assert.equal(resolved.loginCustomerId, "4114685827");
  assert.equal(resolved.resolvedAccessPath, "411-468-5827");
  assert.equal(resolved.fallbackUsed, false);
  assert.equal(resolved.resolutionMode, "manager");
});

test("MCC 366-613-7525 is preserved when valid", () => {
  const resolved = resolveGoogleAdsAccessPath({
    accountId: "1234567890",
    originalAccessPath: "366-613-7525",
  });

  assert.equal(resolved.loginCustomerId, "3666137525");
  assert.equal(resolved.resolvedAccessPath, "366-613-7525");
  assert.equal(resolved.fallbackUsed, false);
});

test("Missing access path falls back to MCC 366-613-7525", () => {
  const resolved = resolveGoogleAdsAccessPath({
    accountId: "1234567890",
    originalAccessPath: null,
  });

  assert.equal(resolved.loginCustomerId, DEFAULT_GOOGLE_ADS_FALLBACK_LOGIN_CUSTOMER_ID);
  assert.equal(resolved.resolvedAccessPath, "366-613-7525");
  assert.equal(resolved.fallbackUsed, true);
});

test("Invalid access path falls back to MCC 366-613-7525", () => {
  const resolved = resolveGoogleAdsAccessPath({
    accountId: "1234567890",
    originalAccessPath: "bad-path",
  });

  assert.equal(resolved.loginCustomerId, DEFAULT_GOOGLE_ADS_FALLBACK_LOGIN_CUSTOMER_ID);
  assert.equal(resolved.resolvedAccessPath, "366-613-7525");
  assert.equal(resolved.fallbackUsed, true);
});

test("Fallback failure message stays structured and explicit", () => {
  const message = formatGoogleAdsAccessPathErrorMessage({
    accountId: "1234567890",
    originalAccessPath: "bad-path",
    resolvedAccessPath: "366-613-7525",
    fallbackUsed: true,
    errorCode: "AUTHORIZATION_ERROR",
    errorMessage:
      "Google Ads preview account resolution failed: customer 1234567890 is not reachable under manager 3666137525.",
  });

  assert.match(message, /123-456-7890/);
  assert.match(message, /originalAccessPath=bad-path/);
  assert.match(message, /resolvedAccessPath=366-613-7525/);
  assert.match(message, /fallbackUsed=yes/);
  assert.match(message, /errorCode=AUTHORIZATION_ERROR/);
  assert.match(message, /not reachable under manager 3666137525/);
});
