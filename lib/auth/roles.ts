export const AUTH_ROLES = ["user", "pms", "co", "specialist", "approver", "tl", "pm", "admin"] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];

export const AUTH_ROLE_LABELS: Record<AuthRole, string> = {
  user: "User",
  pms: "Paid Media Specialist",
  co: "Campaign Optimizer",
  specialist: "Specialist",
  approver: "Approver",
  tl: "Team Lead",
  pm: "Project Manager",
  admin: "Administrator",
};

export function isAuthRole(value: unknown): value is AuthRole {
  return typeof value === "string" && AUTH_ROLES.includes(value as AuthRole);
}

export function isAdminRole(value: unknown): value is "admin" {
  return value === "admin";
}
