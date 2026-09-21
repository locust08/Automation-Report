import test from "node:test";
import assert from "node:assert/strict";
import { inspectGoogleAdsSource } from "./check-google-ads-migration.mjs";

test("scanner detects legacy secrets, endpoints, and browser exposure", () => {
  for (const source of ["GOOGLE_ADS_" + "DEVELOPER_TOKEN", "developer" + "_token", 'fetch("https://googleads.googleapis.com/' + 'v24/customers")', "NEXT_PUBLIC_" + "GOOGLE_ADS_REFRESH_TOKEN", '"use client";\nimport { googleAdsClient } from "@/lib/google-ads/client"']) {
    assert.ok(inspectGoogleAdsSource("fixture.ts", source).length, source);
  }
  assert.deepEqual(inspectGoogleAdsSource("meta.ts", 'const META_GRAPH_API_VERSION = "v24.0";'), []);
});
