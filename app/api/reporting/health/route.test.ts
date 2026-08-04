import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "./route";

test("GET requires an account", async () => {
  const response = await GET(new Request("https://app.test/api/reporting/health?stage=core"));

  assert.equal(response.status, 400);
  assert.match(JSON.stringify(await response.json()), /select a google ads account/i);
});

test("GET validates the requested scan stage", async () => {
  const response = await GET(
    new Request("https://app.test/api/reporting/health?accountId=6972528848&stage=history")
  );

  assert.equal(response.status, 400);
  assert.match(JSON.stringify(await response.json()), /invalid google ads health stage/i);
});

test("GET validates the Google Ads customer ID before reading credentials", async () => {
  const response = await GET(
    new Request("https://app.test/api/reporting/health?accountId=act_123&stage=core")
  );

  assert.equal(response.status, 400);
  assert.match(JSON.stringify(await response.json()), /valid 10-digit google ads customer id/i);
});
