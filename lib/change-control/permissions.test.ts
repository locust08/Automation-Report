import assert from "node:assert/strict";
import test from "node:test";

import {
  canPerformM03Action,
  m03CapabilitiesForRole,
  type M03PermissionAction,
} from "./permissions";

const actions: M03PermissionAction[] = ["view", "create", "edit", "validate", "approve"];

test("assigns the complete M03 role capability matrix", () => {
  const expected = {
    user: [],
    pms: ["view", "create", "edit", "validate"],
    co: ["view", "create", "edit", "validate"],
    specialist: ["view", "create", "edit", "validate"],
    approver: ["view", "approve"],
    tl: ["view", "approve"],
    pm: ["view"],
    admin: actions,
  } as const;

  for (const [role, allowed] of Object.entries(expected)) {
    for (const action of actions) {
      assert.equal(canPerformM03Action(role, action), allowed.includes(action as never), `${role}:${action}`);
    }
  }
});

test("allows draft operators and administrators to cancel before approval", () => {
  for (const role of ["pms", "co", "specialist", "admin"]) {
    assert.equal(canPerformM03Action(role, "cancel", { status: "draft" }), true, role);
    assert.equal(canPerformM03Action(role, "cancel", { status: "validation_failed" }), true, role);
    assert.equal(canPerformM03Action(role, "cancel", { status: "awaiting_approval" }), true, role);
  }
  for (const role of ["user", "approver", "tl", "pm"]) {
    assert.equal(canPerformM03Action(role, "cancel", { status: "draft" }), false, role);
  }
});

test("allows only administrators to cancel an approved request", () => {
  assert.equal(canPerformM03Action("admin", "cancel", { status: "approved" }), true);
  for (const role of ["user", "pms", "co", "specialist", "approver", "tl", "pm"]) {
    assert.equal(canPerformM03Action(role, "cancel", { status: "approved" }), false, role);
  }
});

test("rejects non-admin self approval and permits administrator self approval", () => {
  assert.equal(canPerformM03Action("approver", "approve", { actorId: "same", creatorId: "same" }), false);
  assert.equal(canPerformM03Action("tl", "approve", { actorId: "same", creatorId: "same" }), false);
  assert.equal(canPerformM03Action("approver", "approve", { actorId: "approver", creatorId: "creator" }), true);
  assert.equal(canPerformM03Action("admin", "approve", { actorId: "same", creatorId: "same" }), true);
});

test("returns a stable capability object for UI composition", () => {
  assert.deepEqual(m03CapabilitiesForRole("pm"), {
    view: true,
    create: false,
    edit: false,
    validate: false,
    approve: false,
  });
});
