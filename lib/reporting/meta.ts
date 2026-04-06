import { emptyCampaignRow } from "@/lib/reporting/metrics";
import { CampaignRow } from "@/lib/reporting/types";

interface MetaFetchInput {
  accountId: string;
  accessToken: string;
  startDate: string;
  endDate: string;
  activeCampaignIds?: Set<string>;
}

interface MetaAccountNameInput {
  accountId: string;
  accessToken: string;
}

interface MetaInsightsResponse {
  data?: MetaInsightRow[];
  paging?: {
    next?: string;
  };
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
  };
}

interface MetaCampaignsResponse {
  data?: MetaCampaignRow[];
  paging?: {
    next?: string;
  };
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
  };
}

interface MetaCampaignRow {
  id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
}

interface MetaInsightRow {
  campaign_id?: string;
  campaign_name?: string;
  objective?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpm?: string;
  spend?: string;
  actions?: Array<{
    action_type?: string;
    value?: string;
  }>;
}

interface ParsedMetaResponse {
  status: number;
  ok: boolean;
  contentType: string;
  json: MetaInsightsResponse | null;
  textSnippet: string;
  parseError: string | null;
}

const RESULT_ACTION_PRIORITY = [
  "lead",
  "omni_lead",
  "purchase",
  "complete_registration",
  "omni_complete_registration",
  "landing_page_view",
  "link_click",
] as const;

export async function fetchMetaActiveCampaignIds({
  accountId,
  accessToken,
}: MetaAccountNameInput): Promise<Set<string>> {
  const params = new URLSearchParams({
    access_token: accessToken,
    limit: "200",
    fields: ["id", "status", "effective_status"].join(","),
  });

  let nextUrl = `https://graph.facebook.com/v22.0/act_${accountId}/campaigns?${params.toString()}`;
  const activeCampaignIds = new Set<string>();

  while (nextUrl) {
    const response = await fetch(nextUrl, { cache: "no-store" });
    const parsed = await parseMetaResponse(response);

    if (parsed.parseError) {
      throw new Error(
        `Meta API returned non-JSON response (status ${parsed.status}, content-type ${parsed.contentType || "unknown"}). ${parsed.parseError}. Response starts with: ${parsed.textSnippet}`
      );
    }

    const json = parsed.json as MetaCampaignsResponse | null;

    if (!parsed.ok || json?.error) {
      const message =
        json?.error?.message ??
        `Meta API request failed with status ${parsed.status}. The ad account may not be accessible.`;
      throw new Error(message);
    }

    const data = json?.data ?? [];
    data.forEach((item) => {
      if (!item.id) {
        return;
      }

      if (isActiveMetaCampaign(item)) {
        activeCampaignIds.add(item.id);
      }
    });

    nextUrl = json?.paging?.next ?? "";
  }

  return activeCampaignIds;
}

export async function fetchMetaCampaignRows({
  accountId,
  accessToken,
  startDate,
  endDate,
  activeCampaignIds,
}: MetaFetchInput): Promise<CampaignRow[]> {
  const params = new URLSearchParams({
    access_token: accessToken,
    level: "campaign",
    limit: "200",
    fields: [
      "campaign_id",
      "campaign_name",
      "objective",
      "impressions",
      "clicks",
      "ctr",
      "cpm",
      "spend",
      "actions",
    ].join(","),
    time_range: JSON.stringify({ since: startDate, until: endDate }),
  });

  let nextUrl = `https://graph.facebook.com/v22.0/act_${accountId}/insights?${params.toString()}`;
  const rows: CampaignRow[] = [];
  const filterToActiveCampaigns = activeCampaignIds !== undefined;

  while (nextUrl) {
    const response = await fetch(nextUrl, { cache: "no-store" });
    const parsed = await parseMetaResponse(response);

    if (parsed.parseError) {
      throw new Error(
        `Meta API returned non-JSON response (status ${parsed.status}, content-type ${parsed.contentType || "unknown"}). ${parsed.parseError}. Response starts with: ${parsed.textSnippet}`
      );
    }

    const json = parsed.json ?? {};

    if (!parsed.ok || json.error) {
      const message =
        json.error?.message ??
        `Meta API request failed with status ${parsed.status}. The ad account may not be accessible.`;
      throw new Error(message);
    }

    const data = json.data ?? [];
    data.forEach((item) => {
      const campaignId = item.campaign_id?.trim();
      if (filterToActiveCampaigns && (!campaignId || !activeCampaignIds?.has(campaignId))) {
        return;
      }

      const impressions = toNumber(item.impressions);
      const clicks = toNumber(item.clicks);
      const spend = toNumber(item.spend);
      const results = pickResultValue(item.actions);

      const campaignName = item.campaign_name?.trim() || "Untitled Campaign";
      const campaignType = normalizeCampaignType(item.objective, campaignName);
      const row = emptyCampaignRow(
        campaignId ?? `${campaignType}-${campaignName}`,
        "meta",
        campaignType,
        campaignName
      );

      row.impressions = impressions;
      row.clicks = clicks;
      row.spend = spend;
      row.results = results;
      row.ctr = toNumber(item.ctr) || (impressions > 0 ? (clicks * 100) / impressions : 0);
      row.cpm = toNumber(item.cpm) || (impressions > 0 ? (spend * 1000) / impressions : 0);
      row.costPerResult = results > 0 ? spend / results : 0;
      row.avgCpc = clicks > 0 ? spend / clicks : 0;
      row.conversions = results;

      rows.push(row);
    });

    nextUrl = json.paging?.next ?? "";
  }

  return rows;
}

export async function fetchMetaAccountName({
  accountId,
  accessToken,
}: MetaAccountNameInput): Promise<string | null> {
  const endpoint = `https://graph.facebook.com/v22.0/act_${accountId}?fields=name&access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(endpoint, { cache: "no-store" });
  const rawText = await response.text();

  if (!rawText) {
    return null;
  }

  try {
    const json = JSON.parse(rawText) as { name?: string; error?: { message?: string } };
    if (!response.ok || json.error?.message) {
      return null;
    }
    const accountName = json.name?.trim();
    return accountName || null;
  } catch {
    return null;
  }
}

function pickResultValue(
  actions: Array<{ action_type?: string; value?: string }> | undefined
): number {
  if (!actions?.length) {
    return 0;
  }

  for (const actionType of RESULT_ACTION_PRIORITY) {
    const matched = actions.find((action) => action.action_type === actionType);
    if (matched?.value) {
      return toNumber(matched.value);
    }
  }

  return toNumber(actions[0]?.value);
}

function isActiveMetaCampaign(item: MetaCampaignRow): boolean {
  return item.status === "ACTIVE" || item.effective_status === "ACTIVE";
}

function normalizeCampaignType(objective: string | undefined, campaignName: string): string {
  if (objective) {
    return objective
      .toLowerCase()
      .replaceAll("_", " ")
      .replace(/\b\w/g, (segment) => segment.toUpperCase());
  }

  if (campaignName.includes("-")) {
    return campaignName.split("-")[0].trim();
  }

  return "General";
}

function toNumber(value: string | number | undefined): number {
  if (value === undefined) {
    return 0;
  }
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : 0;
}

async function parseMetaResponse(response: Response): Promise<ParsedMetaResponse> {
  const rawText = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const textSnippet = JSON.stringify(rawText.slice(0, 120));

  if (!rawText) {
    return {
      status: response.status,
      ok: response.ok,
      contentType,
      json: null,
      textSnippet,
      parseError: null,
    };
  }

  try {
    const json = JSON.parse(rawText) as MetaInsightsResponse;
    return {
      status: response.status,
      ok: response.ok,
      contentType,
      json,
      textSnippet,
      parseError: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON response";
    return {
      status: response.status,
      ok: response.ok,
      contentType,
      json: null,
      textSnippet,
      parseError: message,
    };
  }
}
