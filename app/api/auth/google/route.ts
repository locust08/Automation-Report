import { NextResponse } from "next/server";
import {
  createOAuthState,
  getGoogleOAuthConfig,
  getOAuthRedirectUri,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_STATE_SECONDS,
} from "@/lib/auth/google-oauth";

export async function GET(request: Request) {
  try {
    const { clientId } = getGoogleOAuthConfig();
    const state = createOAuthState();
    const authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", getOAuthRedirectUri(request.url));
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", "openid email profile");
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("prompt", "select_account");

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: GOOGLE_OAUTH_STATE_SECONDS,
    });
    return response;
  } catch (error) {
    console.error("Unable to start Google OAuth:", error);
    return NextResponse.redirect(new URL("/?authError=configuration", request.url));
  }
}

