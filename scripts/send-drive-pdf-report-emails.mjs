#!/usr/bin/env node

import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { Client } from "@notionhq/client";

import emailModule from "../src/lib/email/send-monthly-report-email.ts";

const { parseEmailList, sendMonthlyReportEmail } = emailModule;

const DEFAULT_DATABASE_ID = "2cc4fcc4f7018009a090cb6208a601d3";
const DEFAULT_DOWNLOAD_DIR = path.join(process.cwd(), "artifacts", "monthly-report-drive-pdfs");

let refreshedGoogleDriveAccessToken = null;

main().catch((error) => {
  console.error("SEND_DRIVE_PDF_REPORT_EMAILS_FAILED", formatError(error));
  process.exitCode = 1;
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const notionToken = readRequiredEnv("NOTION_TOKEN");
  const databaseId = normalizeNotionId(
    options.databaseId ||
      process.env.NOTION_AD_ACCOUNTS_DATABASE_ID ||
      process.env.NOTION_DATABASE_ID ||
      DEFAULT_DATABASE_ID
  );
  const reportMonthLabel = options.reportMonthLabel || resolvePreviousMonthLabel(new Date());
  const reportMonthKey = options.reportMonthKey || resolvePreviousMonthKey(new Date());
  const downloadDir = path.resolve(options.downloadDir || DEFAULT_DOWNLOAD_DIR);

  if (options.execute) {
    if (options.routeTo) {
      process.env.MONTHLY_REPORT_TEST_MODE = "true";
      process.env.MONTHLY_REPORT_TEST_RECIPIENT = options.routeTo;
    } else {
      process.env.MONTHLY_REPORT_TEST_MODE = "false";
    }
  }

  const notion = new Client({ auth: notionToken });
  const rows = await readAdAccountRows(notion, databaseId);
  const items = buildSendItems(rows, options);

  console.log(`ROWS_READ=${rows.length}`);
  console.log(`MATCHED_PDF_ITEMS=${items.length}`);
  console.log(`REPORT_MONTH=${reportMonthLabel}`);
  console.log(`DOWNLOAD_DIR=${downloadDir}`);
  console.log(`EXECUTE=${options.execute ? "true" : "false"}`);
  if (options.routeTo) {
    console.log(`ROUTE_TO=${options.routeTo}`);
  }

  if (items.length === 0) {
    console.log("No matching Notion rows with Email and Google/Meta PDF links were found.");
    return;
  }

  await mkdir(downloadDir, { recursive: true });

  const limitedItems = options.limit ? items.slice(0, options.limit) : items;
  const results = [];

  for (const item of limitedItems) {
    const localPath = path.join(
      downloadDir,
      `${sanitizeFilenameSegment(item.account.clientName)}-${item.platform.toLowerCase()}-${item.fileId}.pdf`
    );

    console.log(
      [
        `ITEM platform=${item.platform}`,
        `page=${item.account.notionPageId}`,
        `client="${item.account.clientName}"`,
        `to="${item.account.clientEmail}"`,
        `drive_file=${item.fileId}`,
      ].join(" ")
    );

    if (!options.execute) {
      results.push({ item, status: "dry_run", localPath });
      continue;
    }

    try {
      const pdfBuffer = await downloadDrivePdf(item.pdfUrl, localPath, options.forceDownload);
      const emailResult = await sendMonthlyReportEmail({
        account: item.account,
        pdfBuffer,
        reportMonthKey,
        reportMonthLabel,
      });

      results.push({ item, status: emailResult.success ? "sent" : "failed", localPath, emailResult });
      console.log(`EMAIL_SUCCESS=${emailResult.success}`);
      console.log(`EMAIL_RECIPIENT=${emailResult.recipientEmail ?? ""}`);
      console.log(`EMAIL_RESEND_ID=${emailResult.resendEmailId ?? ""}`);
      console.log(`EMAIL_ERROR=${emailResult.errorMessage ?? ""}`);
    } catch (error) {
      results.push({ item, status: "failed", localPath, error });
      console.error(`ITEM_FAILED page=${item.account.notionPageId} error=${formatError(error)}`);
    }
  }

  const sent = results.filter((result) => result.status === "sent").length;
  const failed = results.filter((result) => result.status === "failed").length;
  const dryRun = results.filter((result) => result.status === "dry_run").length;

  console.log(`SUMMARY sent=${sent} failed=${failed} dry_run=${dryRun}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

async function readAdAccountRows(notion, databaseId) {
  const database = await notion.databases.retrieve({ database_id: databaseId });
  const dataSourceId = "data_sources" in database ? database.data_sources?.[0]?.id : undefined;

  if (!dataSourceId) {
    throw new Error(`No Notion data source found for database ${databaseId}.`);
  }

  const rows = [];
  let startCursor;

  do {
    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: startCursor,
    });
    rows.push(...response.results);
    startCursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (startCursor);

  return rows;
}

function buildSendItems(rows, options) {
  const emailFilters = options.onlyEmail.map((value) => normalizeEmailKey(parseEmailList(value)));
  const accountFilters = options.onlyAccount.map(normalizeSearchText);
  const skippedPages = new Set(options.skipPage.map(normalizeNotionId));
  const platformFilter = options.platform;
  const items = [];

  for (const row of rows) {
    const properties = row && typeof row === "object" && "properties" in row ? row.properties : null;
    if (!properties) {
      continue;
    }

    const clientEmail = getPropertyValue(properties, ["Email", "Client Email"]);
    const parsedEmails = parseEmailList(clientEmail);
    if (parsedEmails.length === 0) {
      continue;
    }

    const emailKey = normalizeEmailKey(parsedEmails);
    if (emailFilters.length > 0 && !emailFilters.includes(emailKey)) {
      continue;
    }

    const accountName =
      getPropertyValue(properties, ["Account Name", "Name", "Client Name", "Client"]) ||
      `Notion ${String(row.id || "").slice(0, 8)}`;
    if (
      accountFilters.length > 0 &&
      !accountFilters.some((filter) => normalizeSearchText(accountName).includes(filter))
    ) {
      continue;
    }

    const pageId = String(row.id || "");
    if (skippedPages.has(normalizeNotionId(pageId))) {
      continue;
    }

    const platform = getPropertyValue(properties, ["Platform"]) || null;
    const googleAccountId = normalizeOptionalAccountId(
      getPropertyValue(properties, [
        "Google Ads Account ID",
        "Google Ads ID",
        "Google Account ID",
        "Google Ads Customer ID",
        "Account ID",
        "ID",
      ])
    );
    const metaAccountId = normalizeOptionalAccountId(
      getPropertyValue(properties, [
        "Meta Ads Account ID",
        "Meta Ads ID",
        "Meta Account ID",
        "Facebook Ads Account ID",
        "Facebook Account ID",
        "Account ID",
        "ID",
      ])
    );
    const account = {
      notionPageId: pageId,
      clientName: stripPlatformPrefix(accountName),
      googleAdsAccountId: platform?.toLowerCase().includes("google") ? googleAccountId : null,
      metaAdsAccountId: platform?.toLowerCase().includes("meta") || platform?.toLowerCase().includes("facebook") ? metaAccountId : null,
      clientEmail: parsedEmails.join(", "),
      picEmail: getPropertyValue(properties, ["PIC Email", "Person in Charge Email", "Person-In-Charge Email"]),
      status: getPropertyValue(properties, ["Status"]),
      monthlyReportEnabled: getBooleanPropertyValue(properties, ["Monthly Report Enabled"]),
      platform,
      reportType: getPropertyValue(properties, ["Report Type", "Platform Report Type", "Platform/Report Type"]) || "Overall",
      isValid: true,
      skipReason: null,
    };

    const googlePdfUrl = getPropertyValue(properties, ["Google PDF Link"]);
    const metaPdfUrl = getPropertyValue(properties, ["Meta PDF Link"]);

    if (googlePdfUrl && (!platformFilter || platformFilter === "google")) {
      items.push(buildSendItem(account, "Google", googlePdfUrl));
    }
    if (metaPdfUrl && (!platformFilter || platformFilter === "meta")) {
      items.push(buildSendItem(account, "Meta", metaPdfUrl));
    }
  }

  return items.filter(Boolean);
}

function buildSendItem(account, platform, pdfUrl) {
  const fileId = extractGoogleDriveFileId(pdfUrl);
  if (!fileId) {
    console.warn(`SKIP_INVALID_DRIVE_URL page=${account.notionPageId} platform=${platform} url=${pdfUrl}`);
    return null;
  }

  return {
    account: {
      ...account,
      platform,
      googleAdsAccountId: platform === "Google" ? account.googleAdsAccountId : null,
      metaAdsAccountId: platform === "Meta" ? account.metaAdsAccountId : null,
    },
    platform,
    pdfUrl,
    fileId,
  };
}

async function downloadDrivePdf(pdfUrl, localPath, forceDownload) {
  if (!forceDownload) {
    try {
      const existing = await readFile(localPath);
      if (existing.byteLength > 0) {
        console.log(`PDF_REUSED=${localPath}`);
        return existing;
      }
    } catch {
      // Missing local file, download it below.
    }
  }

  const fileId = extractGoogleDriveFileId(pdfUrl);
  if (!fileId) {
    throw new Error(`Could not extract Google Drive file ID from ${pdfUrl}.`);
  }

  const buffer = await fetchDriveFile(fileId);
  await writeFile(localPath, buffer);
  console.log(`PDF_DOWNLOADED=${localPath}`);
  console.log(`PDF_BYTES=${buffer.byteLength}`);
  return buffer;
}

async function fetchDriveFile(fileId) {
  const accessToken =
    process.env.GOOGLE_DRIVE_ACCESS_TOKEN?.trim() ||
    process.env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim() ||
    process.env.GOOGLE_WORKSPACE_OAUTH_ACCESS_TOKEN?.trim() ||
    "";

  if (accessToken) {
    const apiResponse = await fetchDriveFileWithAccessToken(fileId, accessToken);
    if (apiResponse.ok) {
      return Buffer.from(await apiResponse.arrayBuffer());
    }

    if (apiResponse.status === 401) {
      const refreshedAccessToken = await getRefreshedGoogleDriveAccessToken();
      if (refreshedAccessToken) {
        const refreshedResponse = await fetchDriveFileWithAccessToken(fileId, refreshedAccessToken);
        if (refreshedResponse.ok) {
          return Buffer.from(await refreshedResponse.arrayBuffer());
        }
        console.warn(
          `GOOGLE_DRIVE_REFRESHED_DOWNLOAD_FAILED status=${refreshedResponse.status}; falling back to public download.`
        );
      }
    }

    console.warn(`GOOGLE_DRIVE_API_DOWNLOAD_FAILED status=${apiResponse.status}; falling back to public download.`);
  }

  const apiKey = process.env.GOOGLE_DRIVE_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || "";
  if (apiKey) {
    const apiKeyResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&key=${encodeURIComponent(apiKey)}`,
      { redirect: "follow" }
    );
    const apiKeyBuffer = Buffer.from(await apiKeyResponse.arrayBuffer());
    if (isPdfResponse(apiKeyResponse, apiKeyBuffer)) {
      return apiKeyBuffer;
    }
    console.warn(`GOOGLE_DRIVE_API_KEY_DOWNLOAD_FAILED status=${apiKeyResponse.status}; falling back to public download.`);
  }

  const firstUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
  const firstResponse = await fetch(firstUrl, { redirect: "follow" });
  const firstBuffer = Buffer.from(await firstResponse.arrayBuffer());

  if (isPdfResponse(firstResponse, firstBuffer)) {
    return firstBuffer;
  }

  const firstText = firstBuffer.toString("utf8");
  const confirmToken = firstText.match(/confirm=([0-9A-Za-z_-]+)/)?.[1];
  const cookie = firstResponse.headers.get("set-cookie") || "";
  const downloadWarning = cookie.match(/download_warning_[^=]+=([^;]+)/)?.[1];
  const token = confirmToken || downloadWarning;

  if (token) {
    const confirmedUrl = `${firstUrl}&confirm=${encodeURIComponent(token)}`;
    const confirmedResponse = await fetch(confirmedUrl, {
      redirect: "follow",
      headers: cookie ? { Cookie: cookie } : undefined,
    });
    const confirmedBuffer = Buffer.from(await confirmedResponse.arrayBuffer());
    if (isPdfResponse(confirmedResponse, confirmedBuffer)) {
      return confirmedBuffer;
    }
  }

  throw new Error(
    `Google Drive did not return a PDF for file ${fileId}. The file may require Drive authentication or link sharing.`
  );
}

function fetchDriveFileWithAccessToken(fileId, accessToken) {
  return fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function getRefreshedGoogleDriveAccessToken() {
  if (refreshedGoogleDriveAccessToken) {
    return refreshedGoogleDriveAccessToken;
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || "";
  const refreshToken =
    process.env.GOOGLE_WORKSPACE_OAUTH_REFRESH_TOKEN?.trim() ||
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim() ||
    "";

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const payload = await response.json();

  if (!response.ok || !payload.access_token) {
    console.warn(`GOOGLE_DRIVE_TOKEN_REFRESH_FAILED status=${response.status}`);
    return null;
  }

  refreshedGoogleDriveAccessToken = payload.access_token;
  return refreshedGoogleDriveAccessToken;
}

function isPdfResponse(response, buffer) {
  const contentType = response.headers.get("content-type") || "";
  return response.ok && (contentType.includes("application/pdf") || buffer.subarray(0, 4).toString() === "%PDF");
}

function parseArgs(args) {
  const options = {
    databaseId: "",
    downloadDir: "",
    execute: false,
    forceDownload: false,
    limit: 0,
    onlyAccount: [],
    onlyEmail: [],
    platform: null,
    reportMonthKey: "",
    reportMonthLabel: "",
    routeTo: "",
    skipPage: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = () => {
      index += 1;
      if (index >= args.length) {
        throw new Error(`Missing value for ${arg}.`);
      }
      return args[index];
    };

    switch (arg) {
      case "--database-id":
      case "--database":
        options.databaseId = next();
        break;
      case "--download-dir":
        options.downloadDir = next();
        break;
      case "--execute":
        options.execute = true;
        break;
      case "--force-download":
        options.forceDownload = true;
        break;
      case "--limit":
        options.limit = Number.parseInt(next(), 10) || 0;
        break;
      case "--only-account":
        options.onlyAccount.push(next());
        break;
      case "--only-email":
        options.onlyEmail.push(next());
        break;
      case "--platform": {
        const value = next().trim().toLowerCase();
        if (!["google", "meta", "all"].includes(value)) {
          throw new Error("--platform must be google, meta, or all.");
        }
        options.platform = value === "all" ? null : value;
        break;
      }
      case "--report-month-key":
        options.reportMonthKey = next();
        break;
      case "--report-month-label":
        options.reportMonthLabel = next();
        break;
      case "--route-to":
        options.routeTo = next();
        break;
      case "--skip-page":
      case "--skip-page-id":
        options.skipPage.push(next());
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument ${arg}. Run with --help for usage.`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Usage:
  npm run send:drive-pdf-emails -- [options]

Options:
  --execute                         Send emails. Without this, only prints matched items.
  --only-email "a@x.com, b@y.com"   Only rows whose Email property exactly matches this email set.
  --only-account "Risegroupe"       Only rows whose Account Name contains this text.
  --platform google|meta|all        Send only Google or Meta PDF links. Default: all.
  --route-to email@example.com      Route all sends to one test recipient using MONTHLY_REPORT_TEST_MODE.
  --skip-page PAGE_ID               Skip a Notion page ID. Repeatable.
  --report-month-label "April 2026" Override the email subject/template month label.
  --report-month-key "2026-04"      Override the internal month key.
  --download-dir ./artifacts/...    Override local PDF download directory.
  --force-download                  Re-download PDFs even when local files already exist.
  --limit 2                         Process only the first N matched PDF items.
`.trim());
}

function getPropertyValue(properties, aliases) {
  for (const alias of aliases) {
    const property = findProperty(properties, alias);
    const value = getNotionPropertyText(property);
    if (value) {
      return value;
    }
  }
  return null;
}

function getBooleanPropertyValue(properties, aliases) {
  for (const alias of aliases) {
    const property = findProperty(properties, alias);
    if (property && property.type === "checkbox") {
      return Boolean(property.checkbox);
    }
  }
  return false;
}

function findProperty(properties, alias) {
  const normalizedAlias = normalizePropertyKey(alias);
  return Object.entries(properties).find(([key]) => normalizePropertyKey(key) === normalizedAlias)?.[1];
}

function getNotionPropertyText(property) {
  if (!property || typeof property !== "object" || !("type" in property)) {
    return null;
  }

  switch (property.type) {
    case "title":
      return joinRichText(property.title);
    case "rich_text":
      return joinRichText(property.rich_text);
    case "select":
      return property.select?.name || null;
    case "status":
      return property.status?.name || null;
    case "email":
      return property.email || null;
    case "url":
      return property.url || null;
    case "phone_number":
      return property.phone_number || null;
    case "number":
      return property.number === null || property.number === undefined ? null : String(property.number);
    case "formula":
      return getFormulaText(property.formula);
    default:
      return null;
  }
}

function getFormulaText(formula) {
  if (!formula || typeof formula !== "object") {
    return null;
  }

  if (formula.type === "string") {
    return formula.string || null;
  }
  if (formula.type === "number" && formula.number !== null && formula.number !== undefined) {
    return String(formula.number);
  }
  return null;
}

function joinRichText(values) {
  if (!Array.isArray(values)) {
    return null;
  }

  const text = values
    .map((value) => value?.plain_text || value?.text?.content || "")
    .join("")
    .trim();

  return text || null;
}

function extractGoogleDriveFileId(value) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const patterns = [
    /drive\.google\.com\/file\/d\/([^/?#]+)/,
    /drive\.google\.com\/open\?id=([^&#]+)/,
    /drive\.google\.com\/uc\?[^#]*id=([^&#]+)/,
    /^[0-9A-Za-z_-]{20,}$/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      return decodeURIComponent(match[1] || match[0]);
    }
  }

  return null;
}

function normalizeOptionalAccountId(value) {
  return value?.trim() || null;
}

function normalizeEmailKey(emails) {
  return Array.from(new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))).sort().join(",");
}

function normalizeNotionId(value) {
  return value
    .trim()
    .replace(/^https?:\/\/www\.notion\.so\//, "")
    .split("?")[0]
    .split("/")[0]
    .replace(/-/g, "");
}

function normalizePropertyKey(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchText(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripPlatformPrefix(value) {
  return value
    .replace(/^Google\s*-\s*/i, "")
    .replace(/^Google\s+\-\s*/i, "")
    .replace(/^Facebook\s*-\s*/i, "")
    .replace(/^Facebook\s+\-\s*/i, "")
    .replace(/^Meta\s*-\s*/i, "")
    .trim();
}

function sanitizeFilenameSegment(value) {
  const trimmed = value.trim().replace(/[<>:"/\\|?*\u0000-\u001F]+/g, " ");
  return trimmed.replace(/\s+/g, " ").trim() || "client";
}

function resolvePreviousMonthKey(referenceDate) {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const start = new Date(Date.UTC(year, month - 1, 1));

  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
}

function resolvePreviousMonthLabel(referenceDate) {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const start = new Date(Date.UTC(year, month - 1, 1));

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(start);
}

function readRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var ${name}. Run with Doppler or set it in your environment.`);
  }
  return value;
}

function formatError(error) {
  return error instanceof Error ? error.stack || error.message : String(error);
}
