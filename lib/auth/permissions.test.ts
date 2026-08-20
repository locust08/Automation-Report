import assert from "node:assert/strict";
import { test } from "node:test";
import { canEditAds } from "@/lib/auth/permissions";

test("Google Ads mutations are admin-only", () => {
  assert.equal(canEditAds("admin"), true);
  for (const role of ["pms", "co", "specialist", "approver", "tl", "pm", "user", "viewer"]) {
    assert.equal(canEditAds(role), false, `${role} must remain read-only`);
  }
});
