import { NextResponse } from "next/server";

import { buildReportingErrorResponse } from "@/lib/reporting/api-error";
import { getCredentials } from "@/lib/reporting/env";
import {
  searchNotionAdAccounts,
  type NotionAccountSearchSuggestion,
} from "@/lib/reporting/notion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json({ accounts: [] });
  }

  try {
    const workerAccounts = await searchWorkerAccountDirectory(query);
    if (workerAccounts.length > 0) {
      return NextResponse.json({ accounts: workerAccounts });
    }

    const credentials = getCredentials();
    const notionDatabaseId =
      process.env.NOTION_AD_ACCOUNTS_DATABASE_ID?.trim() || credentials.notionDatabaseId;
    const payload = await searchNotionAdAccounts({
      query,
      notionAccessToken: credentials.notionAccessToken,
      notionDatabaseId,
      limit: 10,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return buildReportingErrorResponse(error, "Unexpected error while searching Notion accounts.");
  }
}

async function searchWorkerAccountDirectory(query: string): Promise<NotionAccountSearchSuggestion[]> {
  const workerUrl = process.env.MONTHLY_REPORT_WORKER_URL?.trim()
    || process.env.REPORT_AUTOMATION_WORKER_URL?.trim();
  const workerSecret = process.env.WORKER_API_SECRET?.trim();
  if (!workerUrl || !workerSecret) return [];

  try {
    const endpoint = new URL("/ad-accounts/search", ensureTrailingSlash(workerUrl));
    endpoint.searchParams.set("q", query);
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${workerSecret}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    const payload = await response.json().catch(() => null) as {
      success?: boolean;
      accounts?: unknown[];
    } | null;
    if (!response.ok || !payload?.success || !Array.isArray(payload.accounts)) return [];
    return payload.accounts.flatMap(normalizeWorkerSuggestion).slice(0, 10);
  } catch {
    return [];
  }
}

function normalizeWorkerSuggestion(value: unknown): NotionAccountSearchSuggestion[] {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const accountName = String(row.accountName ?? "").trim();
  const adAccountId = String(row.adAccountId ?? "").trim();
  const notionPageId = String(row.notionPageId ?? "").trim();
  if (!accountName || !adAccountId || !notionPageId) return [];
  const rawPlatform = String(row.platform ?? "").trim().toLowerCase();
  const platform = rawPlatform.includes("tiktok")
    ? "tiktok"
    : rawPlatform.includes("meta")
      ? "meta"
      : rawPlatform.includes("google")
        ? "google"
        : null;
  const rawCountry = String(row.country ?? "").trim().toUpperCase();
  const country = rawCountry === "MY" || rawCountry === "SG" || rawCountry === "AU" || rawCountry === "US"
    ? rawCountry
    : null;
  return [{
    accountName,
    adAccountId,
    notionPageId,
    platform,
    country,
    accessPath: String(row.accessPath ?? "").trim() || null,
  }];
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
