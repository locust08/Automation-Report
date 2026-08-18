import { randomBytes } from "node:crypto";

export const GOOGLE_OAUTH_STATE_COOKIE = "ads_reporting_oauth_state";
export const GOOGLE_OAUTH_STATE_SECONDS = 60 * 10;

export function getGoogleOAuthConfig() {
  const clientId = (
    process.env.GOOGLE_LOGIN_CLIENT_ID ||
    process.env.GOOGLE_OAUTH_CLIENT_ID ||
    process.env.GOOGLE_ADS_CLIENT_ID
  )?.trim();
  const clientSecret = (
    process.env.GOOGLE_LOGIN_CLIENT_SECRET ||
    process.env.GOOGLE_OAUTH_CLIENT_SECRET ||
    process.env.GOOGLE_ADS_CLIENT_SECRET
  )?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google login is not configured. Set GOOGLE_LOGIN_CLIENT_ID and GOOGLE_LOGIN_CLIENT_SECRET, or use the existing GOOGLE_OAUTH aliases.",
    );
  }
  return { clientId, clientSecret };
}

export function createOAuthState() {
  return randomBytes(32).toString("base64url");
}

export function createSupabaseGoogleTokenPayload(idToken: string, accessToken: string) {
  return {
    provider: "google",
    id_token: idToken,
    access_token: accessToken,
  };
}

export function getOAuthRedirectUri(requestUrl: string) {
  const configuredOrigin = process.env.AUTH_APP_BASE_URL?.trim().replace(/\/$/, "");
  return `${configuredOrigin || new URL(requestUrl).origin}/api/auth/google/callback`;
}
