import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import {
  buildTikTokBusinessAuthUrl,
  getRequestedTikTokBusinessScopes,
  getTikTokBusinessCredentials,
  getTikTokBusinessRedirectUri,
  randomTikTokState,
} from "@/lib/tiktok/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const TIKTOK_OAUTH_STATE_COOKIE = "tiktok_business_oauth_state";

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  }

  try {
    const { appId } = getTikTokBusinessCredentials();
    const origin = new URL(request.url).origin;
    const state = randomTikTokState();
    const response = NextResponse.redirect(buildTikTokBusinessAuthUrl({
      appId,
      redirectUri: getTikTokBusinessRedirectUri(origin),
      state,
      scopes: getRequestedTikTokBusinessScopes(),
    }));
    response.cookies.set(TIKTOK_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api/auth/tiktok/callback",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start TikTok authorization." },
      { status: 500 },
    );
  }
}
