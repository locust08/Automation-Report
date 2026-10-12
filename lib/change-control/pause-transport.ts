import { getCredentials } from "@/lib/reporting/env";
import { resolveGoogleAccountsFromNotion } from "@/lib/reporting/notion";
import { googleAdsClient } from "@/lib/google-ads/client";
import type { PauseTarget, PauseTransport } from "./scoped-pause";

// Uses existing provider clients and access-path routing, without enabling the
// broad legacy Google management-write switch. Mutations are attempted once.
export async function officialPauseTransport(scope: PauseTarget): Promise<PauseTransport> {
  if (scope.platform === "google") {
    if (!/^\d{10}$/.test(scope.account_identity) || !/^\d+$/.test(scope.campaign_identity)) throw new Error("Invalid Google pause identity.");
    const credentials = getCredentials();
    const resolved = await resolveGoogleAccountsFromNotion({ googleAccountIds: [scope.account_identity], googleLookupTerms: [scope.account_identity], notionAccessToken: credentials.notionAccessToken, notionDatabaseId: process.env.NOTION_AD_ACCOUNTS_DATABASE_ID?.trim() || credentials.notionDatabaseId, fallbackLoginCustomerId: credentials.googleLoginCustomerId });
    const client = googleAdsClient(credentials); const options = { loginCustomerId: resolved.loginCustomerIdByAccount[scope.account_identity] ?? null };
    const resource = `customers/${scope.account_identity}/campaigns/${scope.campaign_identity}`;
    return {
      read: async () => {
        const result = await client.search<{ campaign: { id: string; resourceName: string; status: string } }>(scope.account_identity, `SELECT campaign.id, campaign.resource_name, campaign.status FROM campaign WHERE campaign.id = ${scope.campaign_identity}`, options);
        if (result.nextPageToken || result.results?.length !== 1 || result.results[0]!.campaign.resourceName !== resource) throw new Error("Exact Google campaign readback unavailable.");
        return { account_id: scope.account_identity, campaign_id: result.results[0]!.campaign.id, status: result.results[0]!.campaign.status };
      },
      pause: async () => {
        const result = await client.mutate<{ results?: { resourceName?: string }[]; partialFailureError?: unknown }>(scope.account_identity, "campaigns", [{ update: { resourceName: resource, status: "PAUSED" }, updateMask: "status" }], options);
        if (result.partialFailureError || result.results?.length !== 1 || result.results[0]!.resourceName !== resource) throw new Error("Google pause response needs reconciliation.");
      },
    };
  }
  const token = getCredentials().metaAccessToken;
  const version = process.env.META_GRAPH_API_VERSION?.trim() || "v24.0";
  if (!token || !/^v\d+\.\d+$/.test(version) || !/^\d+$/.test(scope.campaign_identity)) throw new Error("Meta pause configuration unavailable.");
  const origin = `https://graph.facebook.com/${version}/${scope.campaign_identity}`;
  async function request(url: string, body?: URLSearchParams) {
    const response = await fetch(url, { method: body ? "POST" : "GET", body, headers: { authorization: `Bearer ${token}` }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const reader = response.body?.getReader(); let text = ""; let size = 0; const decoder = new TextDecoder();
    if (reader) { try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 64 * 1024) { await reader.cancel(); throw new Error("Meta pause response too large."); } text += decoder.decode(chunk.value, { stream: true }); } text += decoder.decode(); } finally { reader.releaseLock(); } }
    const row = JSON.parse(text || "{}") as Record<string, unknown>;
    if (!response.ok || row.error) throw new Error("Meta pause request requires reconciliation.");
    return row;
  }
  return {
    read: async () => {
      const row = await request(`${origin}?fields=id,account_id,status`);
      if (row.id !== scope.campaign_identity || row.account_id !== scope.account_identity || typeof row.status !== "string") throw new Error("Meta campaign ownership does not match.");
      return { account_id: row.account_id as string, campaign_id: row.id as string, status: row.status };
    },
    pause: async () => { const row = await request(origin, new URLSearchParams({ status: "PAUSED" })); if (row.success !== true) throw new Error("Meta pause response needs reconciliation."); },
  };
}
