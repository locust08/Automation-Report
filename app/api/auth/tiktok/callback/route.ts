import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { getDopplerTarget, dopplerSetSecrets } from "@/lib/doppler";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { TIKTOK_OAUTH_STATE_COOKIE } from "@/app/api/auth/tiktok/route";
import {
  exchangeTikTokBusinessCode,
  getAuthorizedTikTokAdvertisers,
  getTikTokBusinessCredentials,
} from "@/lib/tiktok/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function equalState(expected: string, received: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  }
  const url = new URL(request.url);
  const code = url.searchParams.get("auth_code")?.trim() || url.searchParams.get("code")?.trim() || "";
  const receivedState = url.searchParams.get("state")?.trim() || "";
  const cookieHeader = request.headers.get("cookie") ?? "";
  const stateCookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${TIKTOK_OAUTH_STATE_COOKIE}=`))
    ?.slice(TIKTOK_OAUTH_STATE_COOKIE.length + 1) ?? "";

  if (!code || !receivedState || !stateCookie || !equalState(decodeURIComponent(stateCookie), receivedState)) {
    return NextResponse.json({ error: "TikTok OAuth state validation failed." }, { status: 400 });
  }

  try {
    const { appId, appSecret } = getTikTokBusinessCredentials();
    const tokens = await exchangeTikTokBusinessCode({ authCode: code, appId, appSecret });
    const advertisers = await getAuthorizedTikTokAdvertisers({
      accessToken: tokens.access_token,
      appId,
      appSecret,
    });
    const { project, config } = getDopplerTarget();
    await dopplerSetSecrets({
      project,
      config,
      secrets: {
        TIKTOK_BUSINESS_ACCESS_TOKEN: tokens.access_token,
        TIKTOK_BUSINESS_AUTHORIZED_ADVERTISERS: JSON.stringify(advertisers),
        TIKTOK_BUSINESS_GRANTED_SCOPES: JSON.stringify(tokens.scope),
        TIKTOK_BUSINESS_TOKEN_UPDATED_AT: new Date().toISOString(),
      },
    });
    const response = NextResponse.redirect(new URL("/auth/tiktok?connected=1", url.origin));
    response.cookies.set(TIKTOK_OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api/auth/tiktok/callback",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TikTok authorization failed." },
      { status: 502 },
    );
  }
}
