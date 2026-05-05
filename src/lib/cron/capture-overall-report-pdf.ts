import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { jsPDF } from "jspdf";
import { chromium } from "playwright";

export interface OverallReportCaptureTarget {
  clientName: string;
  googleAccountId: string | null;
  metaAccountId: string | null;
}

export interface CapturedOverallReportPdf {
  pdfBuffer: Buffer;
  pdfPath: string;
  pngPath: string;
  reportMonthKey: string;
  reportMonthLabel: string;
}

export async function captureOverallReportPdf(
  target: OverallReportCaptureTarget
): Promise<CapturedOverallReportPdf> {
  const reportMonthKey = resolvePreviousMonthKey(new Date());
  const reportMonthLabel = resolvePreviousMonthLabel(new Date());
  const { startDate, endDate } = resolvePreviousMonthRange(new Date());
  const query = new URLSearchParams({
    startDate,
    endDate,
    screenshot: "1",
  });

  if (target.googleAccountId) {
    query.set("googleAccountId", target.googleAccountId);
    query.set("platform", "google");
  }

  if (target.metaAccountId) {
    query.set("metaAccountId", target.metaAccountId);
    if (!target.googleAccountId) {
      query.set("platform", "meta");
    }
  }

  const baseUrl = resolveMonthlyReportAppBaseUrl();
  const pageUrl = `${baseUrl}/overall?${query.toString()}`;
  const outputDir = path.join(process.cwd(), "artifacts", "monthly-report-tests");

  await mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 2200 },
      deviceScaleFactor: 1.5,
    });
    const page = await context.newPage();

    console.log(`Monthly report screenshot open url=${pageUrl}`);
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForResponse(
      (response) => response.url().includes("/api/reporting?") && response.request().method() === "GET",
      { timeout: 120000 }
    );
    await page.waitForLoadState("networkidle", { timeout: 120000 });

    const captureRoot = page.locator("[data-report-capture-root='true']");
    await captureRoot.waitFor({ state: "visible", timeout: 120000 });
    await page.addStyleTag({
      content: `
        [data-report-export-exclude='true'] {
          display: none !important;
        }

        [data-report-export-header-panel='true'] {
          min-height: 0 !important;
        }

        [data-report-export-header-inner='true'] {
          padding-top: 1.25rem !important;
          padding-bottom: 1.25rem !important;
        }

        [data-report-export-title='true'] {
          text-wrap: balance;
        }
      `,
    });
    await page.waitForTimeout(2000);

    const pngBuffer = await captureRoot.screenshot({ type: "png" });
    const baseFileName = buildCaptureFileName(target, reportMonthKey);
    const pngPath = path.join(outputDir, `${baseFileName}.png`);
    await writeFile(pngPath, pngBuffer);

    const pdfBuffer = buildPdfFromPngBuffer(pngBuffer);
    const pdfPath = path.join(outputDir, `${baseFileName}.pdf`);
    await writeFile(pdfPath, pdfBuffer);

    console.log(`Monthly report screenshot saved png=${pngPath}`);
    console.log(`Monthly report pdf saved pdf=${pdfPath}`);

    return {
      pdfBuffer,
      pdfPath,
      pngPath,
      reportMonthKey,
      reportMonthLabel,
    };
  } finally {
    await browser.close();
  }
}

function buildPdfFromPngBuffer(pngBuffer: Buffer): Buffer {
  const dataUrl = `data:image/png;base64,${pngBuffer.toString("base64")}`;
  const probe = new jsPDF({ orientation: "portrait", unit: "px", format: "a4" });
  const image = probe.getImageProperties(dataUrl);
  const pdf = new jsPDF({
    orientation: image.width > image.height ? "landscape" : "portrait",
    unit: "px",
    format: [image.width, image.height],
  });

  pdf.addImage(dataUrl, "PNG", 0, 0, image.width, image.height, undefined, "FAST");
  return Buffer.from(pdf.output("arraybuffer"));
}

function resolveMonthlyReportAppBaseUrl(): string {
  const configured =
    process.env.MONTHLY_REPORT_APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim();

  if (!configured) {
    return "http://127.0.0.1:3000";
  }

  return configured.startsWith("http://") || configured.startsWith("https://")
    ? configured.replace(/\/$/, "")
    : `https://${configured.replace(/\/$/, "")}`;
}

function buildCaptureFileName(target: OverallReportCaptureTarget, reportMonthKey: string): string {
  const accountId = target.googleAccountId ?? target.metaAccountId ?? "unknown-account";
  const slug = target.clientName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return `${slug || "overall-report"}-${accountId.replace(/[^a-z0-9-]+/gi, "")}-${reportMonthKey}`;
}

function resolvePreviousMonthRange(referenceDate: Date): {
  startDate: string;
  endDate: string;
} {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function resolvePreviousMonthKey(referenceDate: Date): string {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const start = new Date(Date.UTC(year, month - 1, 1));

  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
}

function resolvePreviousMonthLabel(referenceDate: Date): string {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const start = new Date(Date.UTC(year, month - 1, 1));

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(start);
}
