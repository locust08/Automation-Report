import assert from "node:assert/strict";
import test from "node:test";

import { formatAdsManagementUserError } from "./user-error";

test("replaces raw workflow database diagnostics with a general message", () => {
  const message = formatAdsManagementUserError(
    new Error(
      'Workflow database request failed (404): {"code":"PGRST202","details":"Searched for function public.ads_get_campaign_launch_eligibility","message":"Could not find the function"}',
    ),
    "Unable to load workflow information. Please try again later.",
  );

  assert.equal(
    message,
    "Unable to load workflow information. Please try again later.",
  );
  assert.equal(message.includes("PGRST202"), false);
  assert.equal(message.includes("public.ads_"), false);
});

test("keeps concise user-facing validation messages", () => {
  assert.equal(
    formatAdsManagementUserError(
      new Error("This change request is no longer editable."),
      "Unable to update the change request.",
    ),
    "This change request is no longer editable.",
  );
});
