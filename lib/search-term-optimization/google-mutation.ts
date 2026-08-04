import { getCredentials } from "@/lib/reporting/env";
import { resolveGoogleAccountsFromNotion } from "@/lib/reporting/notion";
import type { SearchTermOptimizationRecord } from "@/lib/search-term-optimization/types";

export interface ExactNegativeMutationResult {
  status: "verified" | "skipped" | "failed";
  resourceName: string | null;
  message: string;
}

export async function publishExactNegative(
  record: SearchTermOptimizationRecord
): Promise<ExactNegativeMutationResult> {
  if (process.env.GOOGLE_SEARCH_TERM_AUTO_PUBLISH_ENABLED !== "true") {
    return { status: "skipped", resourceName: null, message: "Live automatic publishing is disabled by server configuration." };
  }
  if (!record.executionEligibility || record.proposedAction !== "negative exact") {
    return { status: "failed", resourceName: null, message: "Record is not eligible for automatic exact-negative publishing." };
  }

  const context = await googleContext(record.accountId);
  const existing = await findExactNegative(record, context);
  if (existing) {
    return { status: "verified", resourceName: existing, message: "Exact negative already exists and was verified." };
  }

  const endpoint = `${context.baseUrl}/customers/${context.customerId}/adGroupCriteria:mutate`;
  const response = await googleFetch(endpoint, context, {
    method: "POST",
    body: JSON.stringify({
      operations: [
        {
          create: {
            adGroup: `customers/${context.customerId}/adGroups/${record.adGroupId}`,
            status: "ENABLED",
            negative: true,
            keyword: { text: record.searchTerm, matchType: "EXACT" },
          },
        },
      ],
      partialFailure: false,
      validateOnly: false,
    }),
  });
  const payload = (await response.json()) as { results?: Array<{ resourceName?: string }>; error?: { message?: string } };
  if (!response.ok) {
    return { status: "failed", resourceName: null, message: payload.error?.message || `Google Ads mutate failed (${response.status}).` };
  }
  const resourceName = payload.results?.[0]?.resourceName ?? null;
  const verified = await findExactNegative(record, context);
  return verified
    ? { status: "verified", resourceName: verified, message: "Exact negative published and verified." }
    : { status: "failed", resourceName, message: "Google Ads accepted the mutation but verification did not find the criterion." };
}

export async function undoExactNegative(record: SearchTermOptimizationRecord): Promise<ExactNegativeMutationResult> {
  if (process.env.GOOGLE_SEARCH_TERM_UNDO_ENABLED !== "true") {
    return { status: "skipped", resourceName: record.googleResourceName, message: "Live Undo is disabled by server configuration." };
  }
  const context = await googleContext(record.accountId);
  const resourceName = record.googleResourceName || (await findExactNegative(record, context));
  if (!resourceName) return { status: "verified", resourceName: null, message: "Exact negative is already absent." };
  const response = await googleFetch(
    `${context.baseUrl}/customers/${context.customerId}/adGroupCriteria:mutate`,
    context,
    { method: "POST", body: JSON.stringify({ operations: [{ remove: resourceName }], partialFailure: false }) }
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { status: "failed", resourceName, message: payload?.error?.message || `Google Ads Undo failed (${response.status}).` };
  }
  const stillPresent = await findExactNegative(record, context);
  return stillPresent
    ? { status: "failed", resourceName, message: "Undo was accepted but the criterion is still present." }
    : { status: "verified", resourceName: null, message: "Exact negative removed and verified." };
}

interface GoogleContext {
  customerId: string;
  loginCustomerId: string | null;
  developerToken: string;
  accessToken: string;
  baseUrl: string;
}

async function googleContext(accountId: string): Promise<GoogleContext> {
  const credentials = getCredentials();
  if (!credentials.googleDeveloperToken) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN is missing.");
  const resolved = await resolveGoogleAccountsFromNotion({
    googleAccountIds: [accountId],
    googleLookupTerms: [accountId],
    notionAccessToken: credentials.notionAccessToken,
    notionDatabaseId: credentials.notionDatabaseId,
    fallbackLoginCustomerId: credentials.googleLoginCustomerId,
  });
  const customerId = accountId.replace(/\D/g, "");
  const accessToken = await resolveAccessToken({
    accessToken: credentials.googleAccessToken,
    refreshToken: credentials.googleRefreshToken,
    clientId: credentials.googleClientId,
    clientSecret: credentials.googleClientSecret,
  });
  return {
    customerId,
    loginCustomerId: resolved.loginCustomerIdByAccount[customerId] ?? null,
    developerToken: credentials.googleDeveloperToken,
    accessToken,
    baseUrl: `https://googleads.googleapis.com/${credentials.googleAdsApiVersion}`,
  };
}

async function findExactNegative(record: SearchTermOptimizationRecord, context: GoogleContext): Promise<string | null> {
  const escaped = record.searchTerm.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
  const response = await googleFetch(
    `${context.baseUrl}/customers/${context.customerId}/googleAds:search`,
    context,
    {
      method: "POST",
      body: JSON.stringify({
        query: `SELECT ad_group_criterion.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.negative FROM ad_group_criterion WHERE ad_group.id = ${record.adGroupId} AND ad_group_criterion.status != 'REMOVED' AND ad_group_criterion.negative = TRUE AND ad_group_criterion.keyword.match_type = 'EXACT' AND ad_group_criterion.keyword.text = '${escaped}' LIMIT 1`,
      }),
    }
  );
  if (!response.ok) throw new Error(`Google Ads preflight failed (${response.status}).`);
  const payload = (await response.json()) as { results?: Array<{ adGroupCriterion?: { resourceName?: string } }> };
  return payload.results?.[0]?.adGroupCriterion?.resourceName ?? null;
}

async function googleFetch(url: string, context: GoogleContext, init: RequestInit) {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${context.accessToken}`,
      "developer-token": context.developerToken,
      ...(context.loginCustomerId ? { "login-customer-id": context.loginCustomerId } : {}),
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

async function resolveAccessToken(input: {
  accessToken: string | null;
  refreshToken: string | null;
  clientId: string | null;
  clientSecret: string | null;
}): Promise<string> {
  if (input.refreshToken && input.clientId && input.clientSecret) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: input.refreshToken,
        client_id: input.clientId,
        client_secret: input.clientSecret,
        grant_type: "refresh_token",
      }),
    });
    const payload = (await response.json()) as { access_token?: string; error_description?: string };
    if (!response.ok || !payload.access_token) throw new Error(payload.error_description || "Google OAuth refresh failed.");
    return payload.access_token;
  }
  if (input.accessToken) return input.accessToken;
  throw new Error("Google Ads OAuth credentials are missing.");
}
