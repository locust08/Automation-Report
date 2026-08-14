import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth/session";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const isLoginPage = request.nextUrl.pathname === "/";
  // Navigation must not block on a remote profile lookup. The profile and role
  // were validated when this signed session was created.
  const session = token ? await verifyAuthToken(token) : null;
  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const isBilling = request.nextUrl.pathname.startsWith("/billing");
  const isSearchTermOptimization = request.nextUrl.pathname.startsWith("/search-term-optimization");
  const isUserManagement = request.nextUrl.pathname.startsWith("/user-management");
  const isGoogleManagement = request.nextUrl.pathname.startsWith("/manage/google");

  if (!session && (isDashboard || isBilling || isSearchTermOptimization || isUserManagement || isGoogleManagement)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (session && session.role !== "admin" && isUserManagement) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (session && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/billing/:path*", "/search-term-optimization/:path*", "/user-management/:path*", "/manage/google/:path*"],
};
