import { randomBytes } from "node:crypto";

import { hash } from "bcryptjs";

import type { AuthRole } from "./roles";

export type ReportingAuthRow = {
  user_id: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  role: AuthRole;
  is_active: boolean;
};

type OAuthIdentity = {
  supabaseUserId: string;
  email: string;
  fullName: string | null;
};

type ProvisionDependencies = {
  findByEmail: (email: string) => Promise<ReportingAuthRow | null>;
  insert: (row: ReportingAuthRow) => Promise<ReportingAuthRow>;
  hashPassword?: (secret: string) => Promise<string>;
  createSecret?: () => string;
};

export async function provisionOAuthReportingUser(
  identity: OAuthIdentity,
  dependencies: ProvisionDependencies,
): Promise<ReportingAuthRow> {
  const email = identity.email.trim().toLowerCase();
  const existing = await dependencies.findByEmail(email);
  if (existing) return existing;

  const createSecret = dependencies.createSecret ?? (() => randomBytes(32).toString("base64url"));
  const hashPassword = dependencies.hashPassword ?? ((secret: string) => hash(secret, 12));
  const row: ReportingAuthRow = {
    user_id: identity.supabaseUserId,
    email,
    password_hash: await hashPassword(createSecret()),
    full_name: identity.fullName?.trim() || null,
    role: "user",
    is_active: true,
  };
  return dependencies.insert(row);
}
