import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_WORKFLOW_POLICIES,
  approvalRequired,
  nextWorkflowAction,
  type WorkflowPolicyMap,
} from "@/lib/workflow-settings/policy";

test("single-user defaults skip all four approval gates", () => {
  assert.deepEqual(DEFAULT_WORKFLOW_POLICIES, {
    search_term_approval: false,
    placement_exclusion_approval: false,
    m03_change_control_approval: false,
    m04_campaign_readiness_approval: false,
  });
});

test("missing or unavailable policy data fails closed", () => {
  assert.equal(approvalRequired(undefined, "search_term_approval"), true);
  assert.equal(approvalRequired({} as WorkflowPolicyMap, "m03_change_control_approval"), true);
});

test("disabled approval advances locally while enabled approval waits", () => {
  assert.equal(nextWorkflowAction(false), "auto_approve");
  assert.equal(nextWorkflowAction(true), "await_approval");
});
