import { generateMonthlyReportPdfForAccount } from "@/src/lib/cron/generate-monthly-report-pdf";
import { resolveMonthlyReportDateRange } from "@/src/lib/cron/monthly-report-date";
import type { MonthlyReportAccount } from "@/src/lib/notion/get-monthly-report-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const account = buildAccountFromSearchParams(url.searchParams);

  if (!account.isValid) {
    return Response.json(
      {
        success: false,
        error: account.skipReason ?? "Missing account data.",
      },
      { status: 400 }
    );
  }

  const dateRange = resolveDateRange(url.searchParams);
  const result = await generateMonthlyReportPdfForAccount(account, {
    dateRange,
    saveToDisk: false,
  });

  if (result.status !== "generated" || !result.pdfBuffer) {
    return Response.json(
      {
        success: false,
        error: result.errorMessage ?? "PDF generation failed.",
      },
      { status: 500 }
    );
  }

  return new Response(new Uint8Array(result.pdfBuffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${buildPdfFileName(account.clientName, result.reportMonthLabel)}"`,
      "content-length": String(result.pdfSizeBytes),
      "cache-control": "no-store",
    },
  });
}

function buildAccountFromSearchParams(searchParams: URLSearchParams): MonthlyReportAccount {
  const rawAccountId = searchParams.get("accountId");
  const platform = searchParams.get("platform");
  const explicitGoogleAccountId = normalizeGoogleId(searchParams.get("googleAccountId"));
  const explicitMetaAccountId = normalizeMetaId(searchParams.get("metaAccountId"));
  const classified = classifyAccountId(rawAccountId);
  const googleAdsAccountId =
    explicitGoogleAccountId ?? (classified.platform === "google" ? classified.accountId : null);
  const metaAdsAccountId =
    explicitMetaAccountId ?? (classified.platform === "meta" ? classified.accountId : null);
  const clientName = searchParams.get("clientName")?.trim() || rawAccountId?.trim() || "Monthly Report";

  return {
    notionPageId: "interactive-monthly-report-download",
    clientName,
    googleAdsAccountId,
    metaAdsAccountId,
    clientEmail: null,
    picEmail: null,
    status: "Active",
    monthlyReportEnabled: true,
    platform: platform?.trim() || (metaAdsAccountId && !googleAdsAccountId ? "Meta" : "Google"),
    reportType: platform?.trim() || "Overall",
    isValid: Boolean(googleAdsAccountId || metaAdsAccountId),
    skipReason: googleAdsAccountId || metaAdsAccountId ? null : "Missing account data.",
  };
}

function classifyAccountId(value: string | null): {
  platform: "google" | "meta" | null;
  accountId: string | null;
} {
  const trimmed = value?.trim();
  if (!trimmed) {
    return { platform: null, accountId: null };
  }

  const lowered = trimmed.toLowerCase();
  if (lowered.startsWith("meta:") || lowered.startsWith("m:")) {
    return { platform: "meta", accountId: normalizeMetaId(trimmed.split(":").slice(1).join(":")) };
  }
  if (lowered.startsWith("google:") || lowered.startsWith("g:")) {
    return { platform: "google", accountId: normalizeGoogleId(trimmed.split(":").slice(1).join(":")) };
  }
  if (lowered.startsWith("act_")) {
    return { platform: "meta", accountId: normalizeMetaId(trimmed) };
  }
  if (/^\d{3}-\d{3}-\d{4}$/.test(trimmed) || trimmed.replace(/\D/g, "").length === 10) {
    return { platform: "google", accountId: normalizeGoogleId(trimmed) };
  }

  return { platform: "meta", accountId: normalizeMetaId(trimmed) };
}

function normalizeGoogleId(value: string | null): string | null {
  const cleaned = value?.replace(/[^\d-]+/g, "").trim();
  return cleaned || null;
}

function normalizeMetaId(value: string | null): string | null {
  const cleaned = value?.replace(/\D/g, "").trim();
  return cleaned || null;
}

function resolveDateRange(searchParams: URLSearchParams) {
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const month = searchParams.get("month");

  if (startDate && endDate) {
    return {
      startDate,
      endDate,
      reportMonthKey: startDate.slice(0, 7),
      reportMonthLabel: new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${startDate}T00:00:00.000Z`)),
    };
  }

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [yearPart, monthPart] = month.split("-");
    const year = Number.parseInt(yearPart, 10);
    const monthNumber = Number.parseInt(monthPart, 10);
    const start = new Date(Date.UTC(year, monthNumber - 1, 1));
    const end = new Date(Date.UTC(year, monthNumber, 0));

    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      reportMonthKey: month,
      reportMonthLabel: new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(start),
    };
  }

  return resolveMonthlyReportDateRange();
}

function buildPdfFileName(clientName: string, reportMonthLabel: string): string {
  const safeClientName = clientName
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const safeMonth = reportMonthLabel.replace(/[<>:"/\\|?*\u0000-\u001F]+/g, " ");

  return `Monthly Report-${safeClientName || "Client"}-${safeMonth}.pdf`;
}
