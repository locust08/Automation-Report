import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateDeliveryAnomaly,
  evaluateEntityHealth,
  isCrossDomainDestination,
  isPrivateAddress,
  normalizeDestinationUrl,
  probeDestination,
} from "./google-health";

test("entity rules ignore paused resources and healthy entities", () => {
  assert.equal(
    evaluateEntityHealth({ resourceType: "campaign", enabled: false, primaryStatus: "NOT_ELIGIBLE" }),
    null
  );
  assert.equal(
    evaluateEntityHealth({ resourceType: "campaign", enabled: true, primaryStatus: "ELIGIBLE" }),
    null
  );
});

test("entity rules classify not-eligible and policy states", () => {
  assert.deepEqual(
    evaluateEntityHealth({ resourceType: "campaign", enabled: true, primaryStatus: "NOT_ELIGIBLE" }),
    { code: "CAMPAIGN_NOT_ELIGIBLE", severity: "high" }
  );
  assert.deepEqual(
    evaluateEntityHealth({ resourceType: "asset_group", enabled: true, primaryStatus: "NOT_ELIGIBLE" }),
    { code: "ASSET_GROUP_NOT_ELIGIBLE", severity: "critical" }
  );
  assert.deepEqual(
    evaluateEntityHealth({ resourceType: "ad", enabled: true, policyStatus: "DISAPPROVED" }),
    { code: "AD_DISAPPROVED", severity: "high" }
  );
  assert.deepEqual(
    evaluateEntityHealth({ resourceType: "ad", enabled: true, primaryStatus: "LIMITED" }),
    { code: "AD_POLICY_LIMITED", severity: "warning" }
  );
  assert.deepEqual(
    evaluateEntityHealth({ resourceType: "asset", enabled: true, policyStatus: "LIMITED" }),
    { code: "ASSET_DISAPPROVED", severity: "warning" }
  );
  assert.deepEqual(
    evaluateEntityHealth({ resourceType: "criterion", enabled: true, policyStatus: "DISAPPROVED" }),
    { code: "CRITERION_DISAPPROVED", severity: "high" }
  );
});

test("private network detection covers IPv4 and IPv6 ranges", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "100.64.0.1", "172.16.0.1", "192.168.1.1", "169.254.1.1", "192.0.2.1", "203.0.113.1", "::1", "fe80::1", "fd00::1", "ff02::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
});

test("delivery anomaly rules classify zero, severe drop, and healthy delivery", () => {
  assert.deepEqual(
    evaluateDeliveryAnomaly({ currentImpressions: 0, currentCostMicros: 0, historicalImpressions: [100, 110, 90, 105], historicalCostMicros: [20_000_000, 21_000_000, 19_000_000, 22_000_000] }),
    { code: "DELIVERY_ZERO", ratio: 0 }
  );
  assert.deepEqual(
    evaluateDeliveryAnomaly({ currentImpressions: 10, currentCostMicros: 2_000_000, historicalImpressions: [100, 110, 90, 105], historicalCostMicros: [20_000_000, 21_000_000, 19_000_000, 22_000_000] }),
    { code: "DELIVERY_SEVERE_DROP", ratio: 0.0975609756097561 }
  );
  assert.equal(
    evaluateDeliveryAnomaly({ currentImpressions: 80, currentCostMicros: 18_000_000, historicalImpressions: [100, 110, 90, 105], historicalCostMicros: [20_000_000, 21_000_000, 19_000_000, 22_000_000] }),
    null
  );
  assert.equal(
    evaluateDeliveryAnomaly({ currentImpressions: 0, currentCostMicros: 0, historicalImpressions: [1, 2, 3, 4], historicalCostMicros: [1, 2, 3, 4] }),
    null
  );
});

test("destination probing rejects non-public URLs before fetch", async () => {
  assert.equal((await probeDestination("http://127.0.0.1/admin", "desktop")).error, "unsafe_destination");
  assert.equal((await probeDestination("http://user:pass@example.com", "desktop")).error, "invalid_url");
  assert.equal((await probeDestination("file:///tmp/example", "desktop")).error, "invalid_url");
});

test("destination normalization deduplicates Google click tracking variants", () => {
  const first = normalizeDestinationUrl(
    "HTTPS://Example.com:443/landing?utm_source=google&gbraid=click-one&product=milk#details"
  );
  const second = normalizeDestinationUrl(
    "https://example.com/landing?product=milk&gad_source=5&gclid=click-two"
  );

  assert.equal(first, "https://example.com/landing?product=milk");
  assert.equal(second, first);
});

test("destination redirect classification ignores www but reports another domain", () => {
  assert.equal(
    isCrossDomainDestination("https://example.com/offer", "https://www.example.com/offer"),
    false
  );
  assert.equal(
    isCrossDomainDestination("https://example.com/offer", "https://example.org/offer"),
    true
  );
});
