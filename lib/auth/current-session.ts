import { isAuthRole } from "@/lib/auth/roles";
import { verifyAuthToken } from "@/lib/auth/session";
import { getAuthTableUrl, getSupabaseServerKey } from "@/lib/auth/config";

type CurrentUserRow = {
  id: string;
  full_name: string | null;
  role: string | null;
  is_active: boolean;
};

type LegacyCurrentUserRow = {
  user_id: string;
  full_name: string | null;
  role: string | null;
  is_active: boolean;
};

export async function getCurrentAuthSession(token: string) {
  const tokenSession = await verifyAuthToken(token);
  if (!tokenSession) return null;
  const legacyAuthUrl = process.env.SUPABASE_ADS_REPORTING_AUTH_URL?.trim();
  if (legacyAuthUrl) {
    const { serviceRoleKey, secretKey } = getSupabaseServerKey();
    if (!secretKey) return null;
    const query = new URL(legacyAuthUrl);
    query.searchParams.set("select", "user_id,full_name,role,is_active");
    query.searchParams.set("user_id", `eq.${tokenSession.sub}`);
    query.searchParams.set("limit", "1");
    const response = await fetch(query, {
      headers: {
        apikey: secretKey,
        ...(secretKey === serviceRoleKey ? { Authorization: `Bearer ${serviceRoleKey}` } : {}),
      },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const [user] = (await response.json()) as LegacyCurrentUserRow[];
    if (!user?.is_active || !isAuthRole(user.role)) return null;
    return { ...tokenSession, fullName: user.full_name, role: user.role };
  }
  const authUrl = getAuthTableUrl();
  const { serviceRoleKey, secretKey } = getSupabaseServerKey();
  if (!authUrl || !secretKey) return null;
  const query = new URL(authUrl);
  query.searchParams.set("select", "id,full_name,role,is_active");
  query.searchParams.set("id", `eq.${tokenSession.sub}`);
  query.searchParams.set("limit", "1");
  const response = await fetch(query, {
    headers: {
      apikey: secretKey,
      ...(secretKey === serviceRoleKey ? { Authorization: `Bearer ${serviceRoleKey}` } : {}),
    },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const [user] = (await response.json()) as CurrentUserRow[];
  if (!user?.is_active || !isAuthRole(user.role)) return null;
  return { ...tokenSession, fullName: user.full_name, role: user.role };
}
