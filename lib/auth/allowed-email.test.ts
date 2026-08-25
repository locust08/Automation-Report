import assert from "node:assert/strict";
import test from "node:test";

import { isAllowedOrganizationEmail } from "./allowed-email";

test("allows organization domains but rejects the former CRM08 Gmail exception", () => {
  assert.equal(isAllowedOrganizationEmail("person@locus-t.com.my"), true);
  assert.equal(isAllowedOrganizationEmail("person@digitalbee.ai"), true);
  assert.equal(isAllowedOrganizationEmail("locust.crm08@gmail.com"), false);
});
