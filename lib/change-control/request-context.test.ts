import assert from "node:assert/strict";
import test from "node:test";

import type { AuthSession } from "@/lib/auth/session";
import type { M03ChangeRequestSummary } from "@/lib/change-control/types";
import {
  assertM03ActionAllowed,
  buildTrustedRequestContext,
  M03AccessError,
} from "./request-context";

const actorId = "11111111-1111-4111-8111-111111111111";
const creatorId = "22222222-2222-4222-8222-222222222222";

test("builds trusted M03 context for an authorized non-admin role and records its role", () => {
  const context = buildTrustedRequestContext(trustedRequest(), session("pms", actorId));
  assert.equal(context.actor_id, actorId);
  assert.equal(context.actor_role, "pms");
  assert.equal(context.trusted_ip, "203.0.113.10");
});

test("rejects actions outside the server-enforced role matrix with 403", () => {
  assert.throws(
    () => assertM03ActionAllowed(session("pm", actorId), "validate"),
    (error) => error instanceof M03AccessError && error.status === 403,
  );
  assert.throws(
    () => assertM03ActionAllowed(session("user", actorId), "view"),
    (error) => error instanceof M03AccessError && error.status === 403,
  );
});

test("rejects non-admin self approval with 409 and permits admin self approval", () => {
  assert.throws(
    () => assertM03ActionAllowed(session("approver", creatorId), "approve", requestSummary(creatorId)),
    (error) => error instanceof M03AccessError && error.status === 409,
  );
  assert.doesNotThrow(() => assertM03ActionAllowed(session("admin", creatorId), "approve", requestSummary(creatorId)));
});

test("enforces cancellation permissions from the current request status", () => {
  assert.doesNotThrow(() => assertM03ActionAllowed(session("specialist", actorId), "cancel", requestSummary(creatorId, "awaiting_approval")));
  assert.throws(
    () => assertM03ActionAllowed(session("specialist", actorId), "cancel", requestSummary(creatorId, "approved")),
    (error) => error instanceof M03AccessError && error.status === 403,
  );
  assert.doesNotThrow(() => assertM03ActionAllowed(session("admin", actorId), "cancel", requestSummary(creatorId, "approved")));
});

function trustedRequest() {
  return new Request("http://localhost/api/change-control/requests", {
    headers: {
      "cf-ray": "test",
      "cf-connecting-ip": "203.0.113.10",
      "user-agent": "test",
    },
  });
}

function session(role: AuthSession["role"], sub: string): AuthSession {
  return { sub, role, email: `${role}@locus-t.com.my`, fullName: role, iss: "test" };
}

function requestSummary(createdById: string, status: M03ChangeRequestSummary["status"] = "awaiting_approval"): M03ChangeRequestSummary {
  return {
    id: "request-1", platform: "tiktok", status, title: "Request", reason: "Reason",
    client_id: null, account_identity: "account", campaign_identity: "campaign",
    source_m04_plan_id: null, source_m04_revision_id: null, source_m05_recommendation_ref: null,
    rollback_of_request_id: null, supersedes_request_id: null,
    created_by_id: createdById, created_by_name: "Creator", created_at: "2026-08-28T00:00:00Z",
    updated_at: "2026-08-28T00:00:00Z", lock_version: 0, provider_execution_locked: true,
  };
}
