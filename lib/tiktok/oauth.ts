import crypto from "node:crypto";

const TIKTOK_BUSINESS_AUTHORIZE_URL = "https://business-api.tiktok.com/portal/auth";
const TIKTOK_BUSINESS_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";

export type TikTokBusinessTokens = {
  access_token: string;
  advertiser_ids: string[];
  scope: number[];
};

export type TikTokAdvertiser = {
  advertiser_id: string;
  advertiser_name: string;
};

type TikTokBusinessEnvelope<T> = {
  code?: unknown;
  message?: unknown;
  request_id?: unknown;
  data?: T;
};

export class TikTokBusinessApiError extends Error {
  constructor(
    public readonly providerCode: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = "TikTokBusinessApiError";
  }
}

export function randomTikTokState(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function getTikTokBusinessCredentials() {
  const appId = process.env.TIKTOK_BUSINESS_APP_ID?.trim();
  const appSecret = process.env.TIKTOK_BUSINESS_APP_SECRET?.trim();
  if (!appId) throw new Error("Missing TIKTOK_BUSINESS_APP_ID");
  if (!appSecret) throw new Error("Missing TIKTOK_BUSINESS_APP_SECRET");
  return { appId, appSecret };
}

export function getRequestedTikTokBusinessScopes() {
  return (process.env.TIKTOK_BUSINESS_OAUTH_SCOPES ?? "")
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function getTikTokBusinessRedirectUri(baseUrl: string) {
  const redirectUri =
    process.env.TIKTOK_BUSINESS_REDIRECT_URI?.trim() ||
    `${baseUrl}/api/auth/tiktok/callback`;
  const parsed = new URL(redirectUri);
  if (parsed.protocol !== "https:") {
    throw new Error("TikTok Business OAuth requires an HTTPS redirect URI");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("TikTok Business redirect URI cannot contain a query or fragment");
  }
  return parsed.toString();
}

export function buildTikTokBusinessAuthUrl(params: {
  appId: string;
  redirectUri: string;
  state: string;
  scopes: string[];
}) {
  const url = new URL(TIKTOK_BUSINESS_AUTHORIZE_URL);
  url.searchParams.set("app_id", params.appId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  if (params.scopes.length > 0) {
    url.searchParams.set("scope", params.scopes.join(","));
  }
  return url.toString();
}

export async function exchangeTikTokBusinessCode(params: {
  authCode: string;
  appId: string;
  appSecret: string;
}) {
  const response = await fetch(`${TIKTOK_BUSINESS_API_BASE}/oauth2/access_token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      app_id: params.appId,
      secret: params.appSecret,
      auth_code: params.authCode,
    }),
    cache: "no-store",
  });
  const json = (await response.json()) as TikTokBusinessEnvelope<TikTokBusinessTokens>;
  const providerCode = typeof json.code === "number" ? json.code : undefined;
  const data = json.data;
  if (
    !response.ok ||
    providerCode !== 0 ||
    !data?.access_token ||
    !Array.isArray(data.advertiser_ids) ||
    !Array.isArray(data.scope)
  ) {
    throw new TikTokBusinessApiError(providerCode, "TikTok token request failed");
  }
  return data;
}

export async function getAuthorizedTikTokAdvertisers(params: {
  accessToken: string;
  appId: string;
  appSecret: string;
}) {
  const url = new URL(`${TIKTOK_BUSINESS_API_BASE}/oauth2/advertiser/get/`);
  url.searchParams.set("app_id", params.appId);
  url.searchParams.set("secret", params.appSecret);
  const response = await fetch(url, {
    headers: { "Access-Token": params.accessToken, Accept: "application/json" },
    cache: "no-store",
  });
  const json = (await response.json()) as TikTokBusinessEnvelope<{
    list?: Array<{ advertiser_id?: unknown; advertiser_name?: unknown }>;
  }>;
  const providerCode = typeof json.code === "number" ? json.code : undefined;
  if (!response.ok || providerCode !== 0 || !Array.isArray(json.data?.list)) {
    throw new TikTokBusinessApiError(providerCode, "TikTok advertiser verification failed");
  }
  const advertisers = json.data.list.flatMap((item) => {
    if (typeof item.advertiser_id !== "string") return [];
    return [{
      advertiser_id: item.advertiser_id,
      advertiser_name:
        typeof item.advertiser_name === "string" ? item.advertiser_name : "Unnamed advertiser",
    }];
  });
  if (advertisers.length === 0) {
    throw new TikTokBusinessApiError(providerCode, "No authorized TikTok advertisers found");
  }
  return advertisers;
}


