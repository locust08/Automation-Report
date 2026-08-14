import { cookies } from "next/headers";

import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth/session";

export async function getServerAuthSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  // Login validates the database profile before issuing this signed token.
  // Reading it locally prevents every page and API request from waiting on a
  // second remote Supabase profile lookup.
  return token ? verifyAuthToken(token) : null;
}
