import { NextRequest, NextResponse } from "next/server";
import { isAllowedOrganizationEmail } from "@/lib/auth/allowed-email";
import { getAuthTableUrl, getReportingAuthBaseUrl, getSupabasePublicKey, getSupabaseServerKey } from "@/lib/auth/config";
import {
  getGoogleOAuthConfig,
  getOAuthRedirectUri,
  GOOGLE_OAUTH_STATE_COOKIE,
} from "@/lib/auth/google-oauth";
import { provisionOAuthReportingUser, type ReportingAuthRow } from "@/lib/auth/oauth-reporting-user";
import { AUTH_COOKIE_NAME, createAuthToken, REMEMBER_ME_SECONDS } from "@/lib/auth/session";

type GoogleUser = { sub?: string; email?: string; email_verified?: boolean; name?: string };
async function findReportingUser(email: string): Promise<ReportingAuthRow | null> {
  const authUrl = getAuthTableUrl();
  const { serviceRoleKey, secretKey } = getSupabaseServerKey();
  if (!authUrl || !secretKey) return null;
  const query = new URL(authUrl);
  query.searchParams.set("select", "user_id,email,password_hash,full_name,role,is_active");
  query.searchParams.set("email", `eq.${email}`);
  query.searchParams.set("limit", "1");
  const response = await fetch(query, {
    headers: {
      apikey: secretKey,
      ...(serviceRoleKey && secretKey === serviceRoleKey ? { Authorization: `Bearer ${serviceRoleKey}` } : {}),
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Unable to retrieve reporting user (${response.status}).`);
  const [profile] = (await response.json()) as ReportingAuthRow[];
  return profile || null;
}

async function insertReportingUser(row: ReportingAuthRow): Promise<ReportingAuthRow> {
  const authUrl = getAuthTableUrl();
  const { serviceRoleKey, secretKey } = getSupabaseServerKey();
  if (!authUrl || !secretKey) throw new Error("Reporting authentication is not configured.");
  const response = await fetch(authUrl, {
    method: "POST",
    headers: {
      apikey: secretKey,
      ...(serviceRoleKey && secretKey === serviceRoleKey ? { Authorization: `Bearer ${serviceRoleKey}` } : {}),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
    cache: "no-store",
  });
  if (response.status === 409) {
    const concurrent = await findReportingUser(row.email);
    if (concurrent) return concurrent;
  }
  if (!response.ok) throw new Error(`Unable to create reporting user (${response.status}).`);
  const [created] = (await response.json()) as ReportingAuthRow[];
  if (!created) throw new Error("Reporting user was not returned after creation.");
  return created;
}

async function exchangeGoogleIdentity(idToken: string) {
  const baseUrl = getReportingAuthBaseUrl();
  const apiKey = getSupabasePublicKey();
  if (!baseUrl || !apiKey) throw new Error("Supabase Auth is not configured.");
  const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=id_token`, {
    method: "POST",
    headers: { apikey: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "google", token: idToken }),
    cache: "no-store",
  });
  const payload = (await response.json()) as { user?: { id?: string; email?: string } };
  if (!response.ok || !payload.user?.id) throw new Error(`Supabase Google sign-in failed (${response.status}).`);
  return payload.user;
}

function redirectWithError(request: NextRequest, error: string) {
  const response = NextResponse.redirect(new URL(`/?authError=${encodeURIComponent(error)}`, request.url));
  response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  if (!code || !state || !expectedState || state !== expectedState) return redirectWithError(request, "invalid_state");

  try {
    const { clientId, clientSecret } = getGoogleOAuthConfig();
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getOAuthRedirectUri(request.url),
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });
    const token = (await tokenResponse.json()) as { access_token?: string; id_token?: string };
    if (!tokenResponse.ok || !token.access_token || !token.id_token) return redirectWithError(request, "oauth_failed");

    const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
      cache: "no-store",
    });
    const googleUser = (await userResponse.json()) as GoogleUser;
    const email = googleUser.email?.trim().toLowerCase() || "";
    if (!userResponse.ok || !googleUser.sub || !email || googleUser.email_verified !== true) {
      return redirectWithError(request, "oauth_failed");
    }
    if (!isAllowedOrganizationEmail(email)) return redirectWithError(request, "organization");

    const supabaseUser = await exchangeGoogleIdentity(token.id_token);
    if (supabaseUser.email?.trim().toLowerCase() !== email) return redirectWithError(request, "oauth_failed");
    const profile = await provisionOAuthReportingUser(
      { supabaseUserId: supabaseUser.id!, email, fullName: googleUser.name?.trim() || null },
      { findByEmail: findReportingUser, insert: insertReportingUser },
    );
    if (!profile.is_active) return redirectWithError(request, "inactive");
    const sessionToken = await createAuthToken({
      id: profile.user_id,
      email,
      role: profile.role,
      fullName: profile?.full_name || googleUser.name?.trim() || null,
    }, true);

    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    response.cookies.set(AUTH_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: REMEMBER_ME_SECONDS,
    });
    return response;
  } catch (error) {
    console.error("Google OAuth callback failed:", error);
    return redirectWithError(request, "oauth_failed");
  }
}
