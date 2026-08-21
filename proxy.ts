import { NextResponse, type NextRequest } from "next/server";

import { isUserRoleRequestAllowed } from "@/lib/auth/access";
import { getCurrentAuthSession } from "@/lib/auth/current-session";
import { AUTH_COOKIE_NAME } from "@/lib/auth/session";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const isLoginPage = request.nextUrl.pathname === "/";
  const session = await getCurrentAuthSession(token);
  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const isBilling = request.nextUrl.pathname.startsWith("/billing");
  const isSearchTermOptimization = request.nextUrl.pathname.startsWith("/search-term-optimization");
  const isUserManagement = request.nextUrl.pathname.startsWith("/user-management");
  const isGoogleManagement = request.nextUrl.pathname.startsWith("/manage/google");
  const isCampaigns = request.nextUrl.pathname.startsWith("/campaigns") || request.nextUrl.pathname.startsWith("/api/campaign-planning");

  if (!session && (isDashboard || isBilling || isSearchTermOptimization || isUserManagement || isGoogleManagement || isCampaigns)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (session && session.role !== "admin" && isUserManagement) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (session?.role === "user" && !isLoginPage && !isUserRoleRequestAllowed(request.nextUrl.pathname, request.method)) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (session && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|.*\\..*).*)"],
};
