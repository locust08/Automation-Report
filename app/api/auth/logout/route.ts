import { NextResponse } from "next/server";

import { AUTH_COOKIE_NAME } from "@/lib/auth/session";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(AUTH_COOKIE_NAME, "", { expires: new Date(0), path: "/" });
  return response;
}
