import { cookies } from "next/headers";

import { getCurrentAuthSession } from "@/lib/auth/current-session";
import { AUTH_COOKIE_NAME } from "@/lib/auth/session";

export async function getServerAuthSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  return token ? getCurrentAuthSession(token) : null;
}
