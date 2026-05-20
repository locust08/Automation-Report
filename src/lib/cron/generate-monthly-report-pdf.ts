import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { chromium, type Browser, type Page } from "playwright";

import {
  resolveMonthlyReportDateRange,
  type MonthlyReportDateRange,
} from "@/src/lib/cron/monthly-report-date";
import { parseBooleanEnv } from "@/src/lib/cron/monthly-report-targets";
import type { MonthlyReportAccount } from "@/src/lib/notion/get-monthly-report-accounts";

const DEFAULT_CONCURRENCY = 3;
const PDF_RENDER_TIMEOUT_MS = 180000;
const TEN_MINUTES_MS = 10 * 60 * 1000;
const EMAIL_SAFE_PDF_SIZE_BYTES = 35 * 1024 * 1024;

export interface MonthlyReportPdfResult {
  status: "generated" | "failed" | "skipped";
  account: MonthlyReportAccount;
  accountId: string | null;
  accountName: string;
  reportType: "overall" | "google" | "meta" | "advanced";
  reportMonthKey: string;
  reportMonthLabel: string;
  pdfBuffer: Buffer | null;
  pdfPath: string | null;
  pdfSizeBytes: number;
  durationMs: number;
  startedAt: string;
  endedAt: string;
  errorMessage: string | null;
}

export interface MonthlyReportPdfBatchResult {
  totalAccounts: number;
  processed: number;
  generated: number;
  failed: number;
  skipped: number;
  totalDurationMs: number;
  withinTenMinutes: boolean;
  warning: string | null;
  slowestAccounts: Array<{
    accountId: string | null;
    accountName: string;
    durationMs: number;
    status: MonthlyReportPdfResult["status"];
    errorMessage: string | null;
  }>;
  results: MonthlyReportPdfResult[];
}

export async function generateMonthlyReportPdfForAccount(
  account: MonthlyReportAccount,
  input?: {
    browser?: Browser;
    dateRange?: MonthlyReportDateRange;
    outputDir?: string;
    saveToDisk?: boolean;
  }
): Promise<MonthlyReportPdfResult> {
  const dateRange = input?.dateRange ?? resolveMonthlyReportDateRange();
  const accountId = resolvePrimaryAccountId(account);
  const accountName = account.clientName || accountId || "Unknown account";
  let browser: Browser;

  try {
    browser = input?.browser ?? (await launchPdfBrowser());
  } catch (error) {
    return buildSkippedOrFailedResult(
      account,
      dateRange,
      "failed",
      toErrorMessage(error, "Browser launch failure.")
    );
  }

  const ownsBrowser = !input?.browser;

  try {
    return await generateMonthlyReportPdfWithBrowser(account, browser, {
      dateRange,
      outputDir: input?.outputDir,
      saveToDisk: input?.saveToDisk,
    });
  } finally {
    if (ownsBrowser) {
      await browser.close().catch((error: unknown) => {
        console.warn(
          `[monthly-report] pdf browser close failed account_id=${accountId ?? "missing"} account_name=${accountName} ${toErrorMessage(error)}`
        );
      });
    }
  }
}

export async function generateMonthlyReportPdfBatch(input: {
  accounts: MonthlyReportAccount[];
  dateRange?: MonthlyReportDateRange;
  concurrency?: number;
  outputDir?: string;
  saveToDisk?: boolean;
}): Promise<MonthlyReportPdfBatchResult> {
  const startedAt = Date.now();
  const concurrency = resolvePdfGenerationConcurrency(input.concurrency);
  const dateRange = input.dateRange ?? resolveMonthlyReportDateRange();
  let browser: Browser;

  try {
    browser = await launchPdfBrowser();
  } catch (error) {
    const message = toErrorMessage(error, "Browser launch failure.");
    const results = input.accounts.map((account) =>
      buildSkippedOrFailedResult(account, dateRange, "failed", message)
    );

    return summarizePdfResults(results, Date.now() - startedAt);
  }

  try {
    const results = await mapWithConcurrency(input.accounts, concurrency, (account) =>
      generateMonthlyReportPdfWithBrowser(account, browser, {
        dateRange,
        outputDir: input.outputDir,
        saveToDisk: input.saveToDisk,
      })
    );

    return summarizePdfResults(results, Date.now() - startedAt);
  } finally {
    await browser.close();
  }
}

async function generateMonthlyReportPdfWithBrowser(
  account: MonthlyReportAccount,
  browser: Browser,
  input: {
    dateRange: MonthlyReportDateRange;
    outputDir?: string;
    saveToDisk?: boolean;
  }
): Promise<MonthlyReportPdfResult> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const accountId = resolvePrimaryAccountId(account);
  const accountName = account.clientName || accountId || "Unknown account";
  const reportType = normalizeReportType(account.reportType ?? account.platform);

  console.info(
    `[monthly-report] pdf start report_type=${reportType} period=${input.dateRange.reportMonthKey} account_id=${accountId ?? "missing"} account_name=${accountName} started_at=${startedAt} pdf_status=started`
  );

  if (!accountId || !account.isValid) {
    const result = buildSkippedOrFailedResult(
      account,
      input.dateRange,
      "skipped",
      account.skipReason ?? "Account data missing."
    );
    logPdfResult(result);
    return result;
  }

  const page = await browser.newPage({
    viewport: isAdvancedReportAccount(account) ? { width: 1440, height: 2200 } : { width: 794, height: 1123 },
    deviceScaleFactor: 1,
  });

  try {
    const pageUrl = isAdvancedReportAccount(account)
      ? buildAdvancedReportUrl(account, input.dateRange)
      : buildPrintReportUrl(account, input.dateRange);
    const response = await page.goto(pageUrl, {
      waitUntil: "domcontentloaded",
      timeout: PDF_RENDER_TIMEOUT_MS,
    });

    if (!response) {
      throw new Error("Print route failed: no response was returned.");
    }
    if (!response.ok()) {
      throw new Error(`Print route failed: HTTP ${response.status()} ${response.statusText()}.`);
    }

    const pdfBuffer = isAdvancedReportAccount(account)
      ? await renderAdvancedReportPdf(page)
      : await renderPrintReportPdf(page);
    const pdfPath =
      input.saveToDisk === true
        ? await saveMonthlyReportPdf({
            account,
            buffer: pdfBuffer,
            dateRange: input.dateRange,
            outputDir: input.outputDir,
          })
        : null;
    const endedAtMs = Date.now();
    const result: MonthlyReportPdfResult = {
      status: "generated",
      account,
      accountId,
      accountName,
      reportType,
      reportMonthKey: input.dateRange.reportMonthKey,
      reportMonthLabel: input.dateRange.reportMonthLabel,
      pdfBuffer,
      pdfPath,
      pdfSizeBytes: pdfBuffer.byteLength,
      durationMs: endedAtMs - startedAtMs,
      startedAt,
      endedAt: new Date(endedAtMs).toISOString(),
      errorMessage: null,
    };

    logPdfResult(result);
    return result;
  } catch (error) {
    const endedAtMs = Date.now();
    const result: MonthlyReportPdfResult = {
      status: "failed",
      account,
      accountId,
      accountName,
      reportType,
      reportMonthKey: input.dateRange.reportMonthKey,
      reportMonthLabel: input.dateRange.reportMonthLabel,
      pdfBuffer: null,
      pdfPath: null,
      pdfSizeBytes: 0,
      durationMs: endedAtMs - startedAtMs,
      startedAt,
      endedAt: new Date(endedAtMs).toISOString(),
      errorMessage: classifyPdfError(error),
    };

    logPdfResult(result);
    return result;
  } finally {
    await page.close().catch((error: unknown) => {
      console.warn(`[monthly-report] pdf page close failed ${toErrorMessage(error)}`);
    });
  }
}

async function renderPrintReportPdf(page: Page): Promise<Buffer> {
  await waitForReportReadyMarker(page);
  await waitForPrintReadiness(page);

  return page.pdf({
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    margin: {
      top: "0",
      right: "0",
      bottom: "0",
      left: "0",
    },
  });
}

async function renderAdvancedReportPdf(page: Page): Promise<Buffer> {
  await waitForAdvancedReportReadyMarker(page);
  await waitForPrintReadiness(page);
  await downsampleLargeImagesForPdf(page);
  await page.addStyleTag({
    content: `
      html, body {
        margin: 0 !important;
        background: #f3f4f6 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      [data-report-export-exclude='true'],
      [data-report-download-overlay='true'] {
        display: none !important;
      }
      [data-advanced-export-only='true'] {
        display: block !important;
      }
    `,
  });
  const pageSize = await page.$eval("[data-report-capture-root='true']", (element) => {
    const target = element as HTMLElement;
    const rect = target.getBoundingClientRect();
    return {
      width: Math.ceil(Math.max(rect.width, target.scrollWidth)),
      height: Math.ceil(Math.max(rect.height, target.scrollHeight)),
    };
  });
  await page.addStyleTag({
    content: `
      @page {
        size: ${pageSize.width}px ${pageSize.height}px;
        margin: 0;
      }
    `,
  });

  const pdfBuffer = await page.pdf({
    width: `${pageSize.width}px`,
    height: `${pageSize.height}px`,
    printBackground: true,
    scale: 1,
    margin: {
      top: "0",
      right: "0",
      bottom: "0",
      left: "0",
    },
  });

  if (pdfBuffer.byteLength <= EMAIL_SAFE_PDF_SIZE_BYTES) {
    return pdfBuffer;
  }

  await replaceImagesWithPdfPlaceholders(page);
  await waitForPrintReadiness(page);
  return page.pdf({
    width: `${pageSize.width}px`,
    height: `${pageSize.height}px`,
    printBackground: true,
    scale: 1,
    margin: {
      top: "0",
      right: "0",
      bottom: "0",
      left: "0",
    },
  });
}

async function downsampleLargeImagesForPdf(page: Page) {
  await page.evaluate(async () => {
    const maxEdge = 900;
    const quality = 0.68;
    const images = Array.from(document.images);

    await Promise.all(
      images.map(
        (image) =>
          new Promise<void>((resolve) => {
            if (image.complete) {
              resolve();
              return;
            }
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          })
      )
    );

    for (const image of images) {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (!width || !height || Math.max(width, height) <= maxEdge) {
        continue;
      }

      const scale = maxEdge / Math.max(width, height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        continue;
      }

      try {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        image.src = canvas.toDataURL("image/jpeg", quality);
        image.removeAttribute("srcset");
        image.setAttribute("decoding", "sync");
      } catch {
        // Cross-origin images without canvas access are left untouched.
      }
    }
  });
}

async function replaceImagesWithPdfPlaceholders(page: Page) {
  await page.evaluate(() => {
    const placeholderSvg = encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
        <rect width="900" height="900" fill="#f7f7f7"/>
        <rect x="24" y="24" width="852" height="852" rx="28" fill="#ffffff" stroke="#dddddd" stroke-width="4"/>
        <text x="450" y="410" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700" fill="#555555">Creative image</text>
        <text x="450" y="470" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#777777">omitted in email PDF</text>
        <text x="450" y="525" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#999999">Metrics and analysis remain below</text>
      </svg>
    `);
    const placeholder = `data:image/svg+xml;charset=utf-8,${placeholderSvg}`;

    for (const image of Array.from(document.images)) {
      const src = image.currentSrc || image.src || "";
      if (!/^https?:\/\//i.test(src)) {
        continue;
      }
      image.src = placeholder;
      image.removeAttribute("srcset");
      image.setAttribute("decoding", "sync");
      image.style.objectFit = "contain";
      image.style.background = "#f7f7f7";
    }
  });
}

async function waitForPrintReadiness(page: Page) {
  await page
    .waitForLoadState("networkidle", { timeout: 30000 })
    .catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
}

async function waitForReportReadyMarker(page: Page) {
  try {
    await page.locator("[data-report-ready='true']").waitFor({
      state: "attached",
      timeout: PDF_RENDER_TIMEOUT_MS,
    });
  } catch (error) {
    const bodyText = await page
      .locator("body")
      .innerText({ timeout: 5000 })
      .catch(() => "");
    const pageMessage = bodyText.trim().replace(/\s+/g, " ").slice(0, 500);
    throw new Error(
      `Report data failed: print page did not expose data-report-ready marker.${
        pageMessage ? ` Page text: ${pageMessage}` : ""
      } ${toErrorMessage(error)}`
    );
  }
}

async function waitForAdvancedReportReadyMarker(page: Page) {
  try {
    await page.locator("[data-advanced-report-content='true'][data-report-type='advanced']").waitFor({
      state: "attached",
      timeout: PDF_RENDER_TIMEOUT_MS,
    });
    await page.locator("[data-advanced-report-ready='true']").waitFor({
      state: "attached",
      timeout: PDF_RENDER_TIMEOUT_MS,
    });
  } catch (error) {
    const bodyText = await page
      .locator("body")
      .innerText({ timeout: 5000 })
      .catch(() => "");
    const pageMessage = bodyText.trim().replace(/\s+/g, " ").slice(0, 500);
    throw new Error(
      `Advanced report data failed: page did not expose the advanced-ready marker.${
        pageMessage ? ` Page text: ${pageMessage}` : ""
      } ${toErrorMessage(error)}`
    );
  }
}

async function launchPdfBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() || undefined,
    });
  } catch (error) {
    throw new Error(`Browser launch failure: ${toErrorMessage(error)}`);
  }
}

async function saveMonthlyReportPdf(input: {
  account: MonthlyReportAccount;
  buffer: Buffer;
  dateRange: MonthlyReportDateRange;
  outputDir?: string;
}): Promise<string> {
  const outputDir = input.outputDir ?? resolveMonthlyReportPdfOutputDir();
  const filename = buildPdfFileName(input.account, input.dateRange.reportMonthKey);
  const pdfPath = path.join(outputDir, filename);

  try {
    await mkdir(outputDir, { recursive: true });
    await writeFile(pdfPath, input.buffer);
    return pdfPath;
  } catch (error) {
    throw new Error(`PDF upload/save failure: ${toErrorMessage(error)}`);
  }
}

function buildPrintReportUrl(account: MonthlyReportAccount, dateRange: MonthlyReportDateRange): string {
  const accountId = resolvePrimaryAccountId(account);
  if (!accountId) {
    throw new Error("Account data missing.");
  }

  const query = new URLSearchParams({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  const reportType = normalizeReportType(account.reportType ?? account.platform);
  if (account.googleAdsAccountId && reportType !== "meta") {
    query.set("googleAccountId", account.googleAdsAccountId);
  }
  if (account.metaAdsAccountId && reportType !== "google") {
    query.set("metaAccountId", account.metaAdsAccountId);
  }

  if (reportType !== "overall") {
    query.set("platform", reportType);
  }

  return `${resolveMonthlyReportAppBaseUrl()}/reports/print/monthly/${encodeURIComponent(
    accountId
  )}?${query.toString()}`;
}

function buildAdvancedReportUrl(account: MonthlyReportAccount, dateRange: MonthlyReportDateRange): string {
  const accountId = resolvePrimaryAccountId(account);
  if (!accountId) {
    throw new Error("Account data missing.");
  }

  const query = new URLSearchParams({
    accountId,
    country: "MY",
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    screenshot: "1",
    reportMode: "advanced",
    reportType: "advanced",
  });

  return `${resolveMonthlyReportAppBaseUrl()}/advanced?${query.toString()}`;
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

function resolveMonthlyReportPdfOutputDir(): string {
  const configured = process.env.MONTHLY_REPORT_PDF_OUTPUT_DIR?.trim();
  if (configured) {
    return configured;
  }

  if (process.env.VERCEL) {
    return path.join(os.tmpdir(), "monthly-report-pdfs");
  }

  return path.join(process.cwd(), "artifacts", "monthly-report-pdfs");
}

function resolvePrimaryAccountId(account: MonthlyReportAccount): string | null {
  return account.googleAdsAccountId ?? account.metaAdsAccountId ?? null;
}

function normalizeReportType(value: string | null | undefined): "overall" | "google" | "meta" | "advanced" {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized.includes("advance")) {
    return "advanced";
  }
  const mentionsGoogle = normalized.includes("google");
  const mentionsMeta = normalized.includes("meta");
  if (mentionsGoogle && mentionsMeta) {
    return "overall";
  }
  if (mentionsMeta) {
    return "meta";
  }
  if (mentionsGoogle) {
    return "google";
  }
  return "overall";
}

function isAdvancedReportAccount(account: MonthlyReportAccount): boolean {
  return normalizeReportType(account.reportType) === "advanced";
}

function resolvePdfGenerationConcurrency(override?: number): number {
  const raw = override ?? Number.parseInt(process.env.PDF_GENERATION_CONCURRENCY ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_CONCURRENCY;
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  worker: (item: TInput) => Promise<TOutput>
): Promise<TOutput[]> {
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker())
  );
  return results;
}

function summarizePdfResults(
  results: MonthlyReportPdfResult[],
  totalDurationMs: number
): MonthlyReportPdfBatchResult {
  const withinTenMinutes = totalDurationMs <= TEN_MINUTES_MS;
  const slowestAccounts = [...results]
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, 5)
    .map((result) => ({
      accountId: result.accountId,
      accountName: result.accountName,
      durationMs: result.durationMs,
      status: result.status,
      errorMessage: result.errorMessage,
    }));

  return {
    totalAccounts: results.length,
    processed: results.filter((result) => result.status !== "skipped").length,
    generated: results.filter((result) => result.status === "generated").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    totalDurationMs,
    withinTenMinutes,
    warning: withinTenMinutes
      ? null
      : `PDF batch exceeded the 10 minute target (${totalDurationMs}ms).`,
    slowestAccounts,
    results,
  };
}

function buildSkippedOrFailedResult(
  account: MonthlyReportAccount,
  dateRange: MonthlyReportDateRange,
  status: "failed" | "skipped",
  errorMessage: string
): MonthlyReportPdfResult {
  const now = new Date().toISOString();
  return {
    status,
    account,
    accountId: resolvePrimaryAccountId(account),
    accountName: account.clientName || resolvePrimaryAccountId(account) || "Unknown account",
    reportType: normalizeReportType(account.reportType ?? account.platform),
    reportMonthKey: dateRange.reportMonthKey,
    reportMonthLabel: dateRange.reportMonthLabel,
    pdfBuffer: null,
    pdfPath: null,
    pdfSizeBytes: 0,
    durationMs: 0,
    startedAt: now,
    endedAt: now,
    errorMessage,
  };
}

function logPdfResult(result: MonthlyReportPdfResult) {
  const log =
    `[monthly-report] pdf ${result.status}` +
    ` report_type=${result.reportType}` +
    ` period=${result.reportMonthKey}` +
    ` account_id=${result.accountId ?? "missing"}` +
    ` account_name=${result.accountName}` +
    ` started_at=${result.startedAt}` +
    ` ended_at=${result.endedAt}` +
    ` duration_ms=${result.durationMs}` +
    ` size_bytes=${result.pdfSizeBytes}` +
    ` pdf_status=${result.status}` +
    ` skipped_reason=${result.status === "skipped" ? result.errorMessage ?? "unknown" : "none"}` +
    ` reason=${result.errorMessage ?? "ok"}`;

  if (result.status === "generated") {
    console.info(log);
  } else if (result.status === "skipped") {
    console.warn(log);
  } else {
    console.error(log);
  }
}

function classifyPdfError(error: unknown): string {
  const message = toErrorMessage(error);
  if (/timeout/i.test(message)) {
    return `PDF render timeout: ${message}`;
  }
  if (/print route failed/i.test(message)) {
    return message;
  }
  if (/PDF upload\/save failure/i.test(message)) {
    return message;
  }
  if (/report data failed/i.test(message)) {
    return message;
  }
  if (/account data missing/i.test(message)) {
    return "Account data missing.";
  }
  return `Report data failed or PDF render failed: ${message}`;
}

function buildPdfFileName(account: MonthlyReportAccount, reportMonthKey: string): string {
  const accountId = resolvePrimaryAccountId(account) ?? "unknown-account";
  const slug = account.clientName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return `${slug || "monthly-report"}-${accountId.replace(/[^a-z0-9-]+/gi, "")}-${reportMonthKey}.pdf`;
}

function toErrorMessage(error: unknown, fallback = "Unknown error."): string {
  return error instanceof Error ? error.message : fallback;
}

export function isMonthlyReportDryRun(): boolean {
  return parseBooleanEnv(process.env.MONTHLY_REPORT_DRY_RUN);
}
