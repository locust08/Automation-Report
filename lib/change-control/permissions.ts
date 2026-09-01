import type { AuthRole } from "@/lib/auth/roles";
import type { M03Status } from "@/lib/change-control/types";

export type M03PermissionAction = "view" | "create" | "edit" | "validate" | "approve" | "cancel";

export type M03RoleCapabilities = {
  view: boolean;
  create: boolean;
  edit: boolean;
  validate: boolean;
  approve: boolean;
};

const capabilityMatrix: Record<AuthRole, M03RoleCapabilities> = {
  user: capability(),
  pms: capability("view", "create", "edit", "validate"),
  co: capability("view", "create", "edit", "validate"),
  specialist: capability("view", "create", "edit", "validate"),
  approver: capability("view", "approve"),
  tl: capability("view", "approve"),
  pm: capability("view"),
  admin: capability("view", "create", "edit", "validate", "approve"),
};

const preApprovalCancellationStatuses = new Set<M03Status>([
  "draft",
  "validation_failed",
  "awaiting_approval",
]);

export function m03CapabilitiesForRole(role: string): M03RoleCapabilities {
  return capabilityMatrix[normalizeRole(role)];
}

export function canPerformM03Action(
  role: string,
  action: M03PermissionAction,
  context: { status?: M03Status; actorId?: string; creatorId?: string } = {},
): boolean {
  const normalizedRole = normalizeRole(role);
  if (action === "cancel") {
    if (!context.status) return false;
    if (normalizedRole === "admin") return context.status !== "cancelled";
    return ["pms", "co", "specialist"].includes(normalizedRole)
      && preApprovalCancellationStatuses.has(context.status);
  }
  if (action === "approve"
    && normalizedRole !== "admin"
    && context.actorId
    && context.creatorId
    && context.actorId === context.creatorId) return false;
  return capabilityMatrix[normalizedRole][action];
}

function normalizeRole(role: string): AuthRole {
  return Object.hasOwn(capabilityMatrix, role) ? role as AuthRole : "user";
}

function capability(...allowed: Array<keyof M03RoleCapabilities>): M03RoleCapabilities {
  return {
    view: allowed.includes("view"),
    create: allowed.includes("create"),
    edit: allowed.includes("edit"),
    validate: allowed.includes("validate"),
    approve: allowed.includes("approve"),
  };
}
