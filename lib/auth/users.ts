import { randomUUID } from "node:crypto";

import { hash } from "bcryptjs";

import { getAuthTableUrl, getSupabaseBaseUrl, getSupabaseServerKey } from "@/lib/auth/config";
import type { AuthRole } from "@/lib/auth/roles";

export type ManagedUser = {
  userId: string;
  email: string;
  fullName: string | null;
  role: AuthRole;
  isActive: boolean;
};

type ProfileRow = { id: string; full_name: string | null; role: AuthRole; is_active: boolean };
type LegacyAuthRow = {
  user_id: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  role: AuthRole;
  is_active: boolean;
};
type SupabaseAuthUser = { id: string; email?: string };

function getHeaders() {
  const { serviceRoleKey, secretKey } = getSupabaseServerKey();
  if (!secretKey) throw new Error("User management is not configured on the server.");
  return {
    apikey: secretKey,
    ...(secretKey === serviceRoleKey && serviceRoleKey ? { Authorization: `Bearer ${serviceRoleKey}` } : {}),
    "Content-Type": "application/json",
  };
}

function getLegacyAccess() {
  const tableUrl = process.env.SUPABASE_ADS_REPORTING_AUTH_URL?.trim();
  return tableUrl ? { tableUrl, headers: getHeaders() } : null;
}

function getProfileAccess() {
  const tableUrl = getAuthTableUrl();
  const baseUrl = getSupabaseBaseUrl();
  const { serviceRoleKey } = getSupabaseServerKey();
  if (!tableUrl || !baseUrl || !serviceRoleKey) throw new Error("User management is not configured on the server.");
  return {
    tableUrl,
    baseUrl,
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
  };
}

function mapLegacyUser(user: LegacyAuthRow): ManagedUser {
  return {
    userId: user.user_id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    isActive: user.is_active,
  };
}

function mapUser(profile: ProfileRow, authUser?: SupabaseAuthUser): ManagedUser {
  return {
    userId: profile.id,
    email: authUser?.email ?? "Email unavailable",
    fullName: profile.full_name,
    role: profile.role,
    isActive: profile.is_active,
  };
}

export async function listManagedUsers() {
  const legacy = getLegacyAccess();
  if (legacy) {
    const query = new URL(legacy.tableUrl);
    query.searchParams.set("select", "user_id,email,full_name,role,is_active");
    query.searchParams.set("order", "full_name.asc.nullslast,email.asc");
    const response = await fetch(query, { headers: legacy.headers, cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to retrieve users (${response.status}).`);
    return ((await response.json()) as LegacyAuthRow[]).map(mapLegacyUser);
  }

  const { tableUrl, baseUrl, headers } = getProfileAccess();
  const profileQuery = new URL(tableUrl);
  profileQuery.searchParams.set("select", "id,full_name,role,is_active");
  profileQuery.searchParams.set("order", "full_name.asc.nullslast");
  const [profileResponse, authResponse] = await Promise.all([
    fetch(profileQuery, { headers, cache: "no-store" }),
    fetch(`${baseUrl}/auth/v1/admin/users?per_page=1000`, { headers, cache: "no-store" }),
  ]);
  if (!profileResponse.ok) throw new Error(`Unable to retrieve user profiles (${profileResponse.status}).`);
  if (!authResponse.ok) throw new Error(`Unable to retrieve Supabase Auth users (${authResponse.status}).`);
  const profiles = (await profileResponse.json()) as ProfileRow[];
  const authPayload = (await authResponse.json()) as { users?: SupabaseAuthUser[] };
  const authById = new Map((authPayload.users ?? []).map((user) => [user.id, user]));
  return profiles.map((profile) => mapUser(profile, authById.get(profile.id))).sort((left, right) => left.email.localeCompare(right.email));
}

export async function createManagedUser(input: { email: string; password: string; fullName: string; role: AuthRole; isActive: boolean }) {
  const legacy = getLegacyAccess();
  if (legacy) {
    const row: LegacyAuthRow = {
      user_id: randomUUID(),
      email: input.email,
      password_hash: await hash(input.password, 12),
      full_name: input.fullName,
      role: input.role,
      is_active: input.isActive,
    };
    const response = await fetch(legacy.tableUrl, {
      method: "POST",
      headers: { ...legacy.headers, Prefer: "return=representation" },
      body: JSON.stringify(row),
      cache: "no-store",
    });
    if (!response.ok) {
      if (response.status === 409) throw new Error("A user with this email already exists.");
      throw new Error(`Unable to create user (${response.status}).`);
    }
    const [created] = (await response.json()) as LegacyAuthRow[];
    return mapLegacyUser(created ?? row);
  }

  const { tableUrl, baseUrl, headers } = getProfileAccess();
  const authResponse = await fetch(`${baseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: input.email, password: input.password, email_confirm: true, user_metadata: { full_name: input.fullName } }),
    cache: "no-store",
  });
  const authPayload = (await authResponse.json()) as { id?: string; email?: string; msg?: string };
  if (!authResponse.ok || !authPayload.id) {
    if (authResponse.status === 422) throw new Error("A user with this email already exists.");
    throw new Error(authPayload.msg || `Unable to create Supabase Auth user (${authResponse.status}).`);
  }
  const profile: ProfileRow = { id: authPayload.id, full_name: input.fullName, role: input.role, is_active: input.isActive };
  const profileResponse = await fetch(tableUrl, { method: "POST", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify(profile), cache: "no-store" });
  if (!profileResponse.ok) {
    await fetch(`${baseUrl}/auth/v1/admin/users/${authPayload.id}`, { method: "DELETE", headers, cache: "no-store" });
    throw new Error(`Unable to create application user profile (${profileResponse.status}).`);
  }
  return mapUser(profile, { id: authPayload.id, email: authPayload.email || input.email });
}

export async function updateManagedUser(userId: string, changes: { fullName?: string; role?: AuthRole; isActive?: boolean; password?: string }) {
  const legacy = getLegacyAccess();
  if (legacy) {
    const databaseChanges: Record<string, unknown> = {};
    if (changes.fullName !== undefined) databaseChanges.full_name = changes.fullName;
    if (changes.role !== undefined) databaseChanges.role = changes.role;
    if (changes.isActive !== undefined) databaseChanges.is_active = changes.isActive;
    if (changes.password) databaseChanges.password_hash = await hash(changes.password, 12);
    const query = new URL(legacy.tableUrl);
    query.searchParams.set("user_id", `eq.${userId}`);
    const response = await fetch(query, {
      method: "PATCH",
      headers: { ...legacy.headers, Prefer: "return=representation" },
      body: JSON.stringify(databaseChanges),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Unable to update user (${response.status}).`);
    const [updated] = (await response.json()) as LegacyAuthRow[];
    if (!updated) throw new Error("User was not found.");
    return mapLegacyUser(updated);
  }

  const { tableUrl, baseUrl, headers } = getProfileAccess();
  const profileChanges: Record<string, unknown> = {};
  if (changes.fullName !== undefined) profileChanges.full_name = changes.fullName;
  if (changes.role !== undefined) profileChanges.role = changes.role;
  if (changes.isActive !== undefined) profileChanges.is_active = changes.isActive;
  let authUser: SupabaseAuthUser | undefined;
  if (changes.password) {
    const authResponse = await fetch(`${baseUrl}/auth/v1/admin/users/${userId}`, { method: "PUT", headers, body: JSON.stringify({ password: changes.password }), cache: "no-store" });
    if (!authResponse.ok) throw new Error(`Unable to reset password (${authResponse.status}).`);
    authUser = (await authResponse.json()) as SupabaseAuthUser;
  }
  const query = new URL(tableUrl);
  query.searchParams.set("id", `eq.${userId}`);
  const profileResponse = await fetch(query, { method: "PATCH", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify(profileChanges), cache: "no-store" });
  if (!profileResponse.ok) throw new Error(`Unable to update user profile (${profileResponse.status}).`);
  const [profile] = (await profileResponse.json()) as ProfileRow[];
  if (!profile) throw new Error("User was not found.");
  if (!authUser) {
    const authResponse = await fetch(`${baseUrl}/auth/v1/admin/users/${userId}`, { headers, cache: "no-store" });
    if (authResponse.ok) authUser = (await authResponse.json()) as SupabaseAuthUser;
  }
  return mapUser(profile, authUser);
}
