// @ts-nocheck
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { jsPDF } from "jspdf";
import { chromium } from "playwright";

import { sendMonthlyReportEmail } from "@/src/lib/email/send-monthly-report-email";
import type { MonthlyReportAccount } from "@/src/lib/notion/get-monthly-report-accounts";

async function main() {
  process.env.MONTHLY_REPORT_TEST_MODE = process.env.MONTHLY_REPORT_TEST_MODE?.trim() || "false";

  const googleAdsAccountId = process.env.MONTHLY_REPORT_GOOGLE_ACCOUNT_ID?.trim() || "183-160-3281";
  const metaAdsAccountId = process.env.MONTHLY_REPORT_META_ACCOUNT_ID?.trim() || null;
  const clientEmail =
    process.env.MONTHLY_REPORT_PRIMARY_RECIPIENT?.trim() ||
    process.env.MONTHLY_REPORT_TEST_RECIPIENT?.trim() ||
    "ava@locus-t.com.my";
  const picEmail = process.env.MONTHLY_REPORT_CC_RECIPIENT?.trim() || null;
  const clientName =
    process.env.MONTHLY_REPORT_CLIENT_NAME?.trim() ||
    `Overall Report ${googleAdsAccountId}${metaAdsAccountId ? ` / ${metaAdsAccountId}` : ""}`;

  const account: MonthlyReportAccount = {
    notionPageId: `manual-overall-page-${googleAdsAccountId}${metaAdsAccountId ? `-${metaAdsAccountId}` : ""}`,
    clientName,
    googleAdsAccountId,
    metaAdsAccountId,
    clientEmail,
    picEmail,
    status: "Active",
    monthlyReportEnabled: true,
    platform: metaAdsAccountId ? "Google, Meta" : "Google",
    reportType: "Overall",
    isValid: true,
    skipReason: null,
  };

  const reportMonthKey = resolvePreviousMonthKey(new Date());
  const reportMonthLabel = resolvePreviousMonthLabel(new Date());
  const { startDate, endDate } = resolvePreviousMonthRange(new Date());
  const query = new URLSearchParams({
    startDate,
    endDate,
    screenshot: "1",
  });
  if (account.googleAdsAccountId) {
    query.set("googleAccountId", account.googleAdsAccountId);
  }
  if (account.metaAdsAccountId) {
    query.set("metaAccountId", account.metaAdsAccountId);
  }
  query.set("platform", account.metaAdsAccountId ? "overall" : "google");
  const pageUrl = `http://127.0.0.1:3000/overall?${query.toString()}`;
  const outputDir = path.join(process.cwd(), "artifacts", "monthly-report-tests");

  await mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 2200 },
      deviceScaleFactor: 1.5,
    });
    const page = await context.newPage();

    console.log(`OPEN_URL=${pageUrl}`);
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForResponse(
      (response) => response.url().includes("/api/reporting?") && response.request().method() === "GET",
      { timeout: 120000 }
    );
    await page.waitForLoadState("networkidle", { timeout: 120000 });

    const captureRoot = page.locator("[data-report-capture-root='true']");
    await captureRoot.waitFor({ state: "visible", timeout: 120000 });
    await page.waitForTimeout(2000);

    const pngBuffer = await captureRoot.screenshot({ type: "png" });
    const safeAccountId = [googleAdsAccountId, metaAdsAccountId]
      .filter(Boolean)
      .join("-")
      .replace(/[^a-z0-9-]+/gi, "");
    const pngPath = path.join(outputDir, `overall-page-${safeAccountId}-${reportMonthKey}.png`);
    await writeFile(pngPath, pngBuffer);

    const pdfBuffer = buildPdfFromPngBuffer(pngBuffer);
    const pdfPath = path.join(outputDir, `overall-page-${safeAccountId}-${reportMonthKey}.pdf`);
    await writeFile(pdfPath, pdfBuffer);

    console.log(`PNG_SAVED=${pngPath}`);
    console.log(`PDF_SAVED=${pdfPath}`);
    console.log(`PDF_BYTES=${pdfBuffer.byteLength}`);

    const emailResult = await sendMonthlyReportEmail({
      account,
      pdfBuffer,
      reportMonthKey,
      reportMonthLabel,
    });

    console.log(`EMAIL_SUCCESS=${emailResult.success}`);
    console.log(`EMAIL_RECIPIENT=${emailResult.recipientEmail ?? ""}`);
    console.log(`EMAIL_RESEND_ID=${emailResult.resendEmailId ?? ""}`);
    console.log(`EMAIL_ERROR=${emailResult.errorMessage ?? ""}`);
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

main().catch((error) => {
  console.error("MANUAL_OVERALL_PAGE_SCREENSHOT_EMAIL_FAILED", error);
  process.exitCode = 1;
});
