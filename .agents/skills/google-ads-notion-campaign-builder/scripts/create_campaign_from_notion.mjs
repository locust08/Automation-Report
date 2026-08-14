#!/usr/bin/env node
/**
 * Create paused Google Ads Search or Performance Max campaigns from Notion setup rows.
 * Child entities are created enabled so the setup can go live by enabling only the campaign.
 *
 * Usage:
 *   doppler run -- node .agents/skills/google-ads-notion-campaign-builder/scripts/create_campaign_from_notion.mjs \
 *     --page-ids <notion_page_id_1>,<notion_page_id_2> --validate-only
 *
 *   doppler run -- node .agents/skills/google-ads-notion-campaign-builder/scripts/create_campaign_from_notion.mjs \
 *     --page-ids <notion_page_ids> --execute-paused
 */

import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const DEFAULT_NOTION_VERSION = "2022-06-28";
const DEFAULT_GOOGLE_ADS_VERSION = "v24";
const DEFAULT_COUNTRY_CODE = "MY";
const DEFAULT_DATABASE_ID = "8adaf03ad617472780f0b34e5ca6ef08";

const REQUIRED_ENV = [
  "NOTION_TOKEN",
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_OAUTH_REFRESH_TOKEN",
];

const LANGUAGE_FALLBACKS = new Map([
  ["english", "languageConstants/1000"],
  ["malay", "languageConstants/1019"],
  ["chinese", "languageConstants/1017"],
]);

async function fetchWithTimeout(url, options = {}, timeoutMs = 45_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function usage() {
  return `
Usage:
  node create_campaign_from_notion.mjs --page-ids <ids> --plan-only|--validate-only|--execute-paused
  node create_campaign_from_notion.mjs --database-id <id> --status "Ready for Setup" --plan-only|--validate-only|--execute-paused

Options:
  --page-ids <ids>          Comma-separated Notion page IDs. Can be repeated.
  --database-id <id>        Notion database ID to query.
  --status <name>           Status filter for database query. Defaults to "Ready for Setup".
  --plan-only               Build and print the campaign plan without Google Ads API calls.
  --validate-only           Send Google Ads mutate request with validateOnly=true.
  --execute-paused          Create live paused campaigns with enabled child entities.
  --allow-existing          Allow creating even if a campaign with the same name exists.
  --request-policy-exemptions
                            Retry exemptible keyword policy violations with returned exemption keys.
  --skip-optional-assets    Skip Search logo/image/business-name assets. Sitelinks still run.
  --out-plan <path>         Write the non-secret plan JSON to a file.
  --self-test               Run local parser and validator tests.
`;
}

function stripDashes(value) {
  return String(value || "").replace(/-/g, "");
}

function normalizeSpace(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function escapeGaql(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function toMicros(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid budget or CPA number: ${value}`);
  return String(Math.round(n * 1_000_000));
}

function dateToGoogleAdsStartDateTime(dateString) {
  const raw = String(dateString || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`Invalid Notion date: ${raw}`);
  return `${raw} 00:00:00`;
}

function parseArgs(argv) {
  const args = {
    pageIds: [],
    databaseId: "",
    status: "Ready for Setup",
    planOnly: false,
    validateOnly: false,
    executePaused: false,
    allowExisting: false,
    requestPolicyExemptions: false,
    skipOptionalAssets: false,
    outPlan: "",
    selfTest: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--page-ids") {
      const raw = String(argv[++i] || "");
      args.pageIds.push(...raw.split(",").map((x) => x.trim()).filter(Boolean));
    } else if (a === "--database-id") {
      args.databaseId = String(argv[++i] || "").trim();
    } else if (a === "--status") {
      args.status = String(argv[++i] || "").trim();
    } else if (a === "--plan-only") {
      args.planOnly = true;
    } else if (a === "--validate-only") {
      args.validateOnly = true;
    } else if (a === "--execute-paused") {
      args.executePaused = true;
    } else if (a === "--allow-existing") {
      args.allowExisting = true;
    } else if (a === "--request-policy-exemptions") {
      args.requestPolicyExemptions = true;
    } else if (a === "--skip-optional-assets") {
      args.skipOptionalAssets = true;
    } else if (a === "--out-plan") {
      args.outPlan = String(argv[++i] || "").trim();
    } else if (a === "--self-test") {
      args.selfTest = true;
    } else if (a === "--help" || a === "-h") {
      console.log(usage().trim());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }

  if (args.selfTest) return args;

  const modeCount = [args.planOnly, args.validateOnly, args.executePaused].filter(Boolean).length;
  if (modeCount !== 1) throw new Error("Specify exactly one mode: --plan-only, --validate-only, or --execute-paused.");
  if (!args.pageIds.length && !args.databaseId) {
    throw new Error("Provide --page-ids or --database-id.");
  }
  if (args.databaseId && !args.status) args.status = "Ready for Setup";

  args.pageIds = Array.from(new Set(args.pageIds.map((id) => id.replace(/-/g, ""))));
  return args;
}

function requireEnv(keys = REQUIRED_ENV) {
  for (const key of keys) {
    if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
  }
}

function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Notion-Version": DEFAULT_NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

async function notionRequest(pathname, { method = "GET", body } = {}) {
  const res = await fetchWithTimeout(`https://api.notion.com/v1${pathname}`, {
    method,
    headers: notionHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Notion API failed (${res.status}): ${text}`);
  return text ? JSON.parse(text) : {};
}

async function queryNotionPages(databaseId, status) {
  const pages = [];
  let startCursor = undefined;
  do {
    const data = await notionRequest(`/databases/${databaseId}/query`, {
      method: "POST",
      body: {
        page_size: 100,
        start_cursor: startCursor,
        filter: {
          property: "65 Status",
          select: { equals: status },
        },
      },
    });
    pages.push(...(data.results || []));
    startCursor = data.has_more ? data.next_cursor : undefined;
  } while (startCursor);
  return pages;
}

function textFromRichText(items = []) {
  return (items || []).map((x) => x.plain_text || x.text?.content || "").join("").trim();
}

function propTitle(props, name) {
  return textFromRichText(props[name]?.title || []);
}

function propText(props, name) {
  return textFromRichText(props[name]?.rich_text || []);
}

function firstValue(props, names, getter) {
  for (const name of names) {
    const value = getter(props, name);
    if (Array.isArray(value) ? value.length : value !== null && value !== undefined && value !== "") return value;
  }
  return Array.isArray(getter(props, names[0])) ? [] : "";
}

function propTitleAny(props, names) {
  return firstValue(props, names, propTitle);
}

function propTextAny(props, names) {
  return firstValue(props, names, propText);
}

function propSelect(props, name) {
  return props[name]?.select?.name || "";
}

function propSelectAny(props, names) {
  return firstValue(props, names, propSelect);
}

function propMulti(props, name) {
  return (props[name]?.multi_select || []).map((x) => x.name).filter(Boolean);
}

function propMultiAny(props, names) {
  return firstValue(props, names, propMulti);
}

function propNumber(props, name) {
  const value = props[name]?.number;
  return typeof value === "number" ? value : null;
}

function propNumberAny(props, names) {
  for (const name of names) {
    const value = propNumber(props, name);
    if (value !== null) return value;
  }
  return null;
}

function propUrl(props, name) {
  return props[name]?.url || "";
}

function propUrlAny(props, names) {
  return firstValue(props, names, propUrl);
}

function propDateStart(props, name) {
  return props[name]?.date?.start || "";
}

function propDateStartAny(props, names) {
  return firstValue(props, names, propDateStart);
}

function propRelations(props, name) {
  return (props[name]?.relation || []).map((x) => x.id).filter(Boolean);
}

function propRelationsAny(props, names) {
  return firstValue(props, names, propRelations);
}

function propFiles(props, name) {
  return (props[name]?.files || [])
    .map((file) => ({
      name: file.name || "asset",
      url: file.type === "external" ? file.external?.url : file.file?.url,
      type: file.type,
    }))
    .filter((file) => file.url);
}

function headlineTexts(props) {
  const out = [];
  for (let i = 1; i <= 15; i++) {
    const oldNo = i + 19;
    const newNo = i + 29;
    const value = propTextAny(props, [`${newNo} Headline ${i}`, `${oldNo} Headline ${i}`]);
    if (value) out.push(value);
  }
  return out;
}

function descriptionTexts(props) {
  const out = [];
  for (let i = 1; i <= 4; i++) {
    const oldNo = i + 34;
    const newNo = i + 44;
    const value = propTextAny(props, [`${newNo} Description ${i}`, `${oldNo} Description ${i}`]);
    if (value) out.push(value);
  }
  return out;
}

function keywordTexts(props) {
  const out = [];
  for (let i = 1; i <= 10; i++) {
    const oldNo = i + 62;
    const newNo = i + 17;
    const value = propTextAny(props, [`${newNo} Keyword ${i}`, `${oldNo} Keyword ${i}`]);
    if (value) out.push(value);
  }
  return out;
}

function sitelinks(props) {
  const pairs = [
    [43, 44, 53, 54, 1],
    [45, 46, 55, 56, 2],
    [47, 48, 57, 58, 3],
    [49, 50, 59, 60, 4],
    [51, 52, 61, 62, 5],
    [53, 54, 63, 64, 6],
  ];
  return pairs
    .map(([oldTitleNo, oldUrlNo, newTitleNo, newUrlNo, index]) => ({
      title: propTextAny(props, [`${newTitleNo} Sitelink ${index} Title`, `${oldTitleNo} Sitelink ${index} Title`]),
      url: propUrlAny(props, [`${newUrlNo} Sitelink ${index} URL`, `${oldUrlNo} Sitelink ${index} URL`]),
    }))
    .filter((x) => x.title && x.url);
}

function parseKeyword(raw) {
  const value = normalizeSpace(raw);
  if (!value) return null;
  if (value.startsWith("[") && value.endsWith("]")) {
    const text = normalizeSpace(value.slice(1, -1));
    if (!text) return null;
    return { text, matchType: "EXACT" };
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    const text = normalizeSpace(value.slice(1, -1));
    if (!text) return null;
    return { text, matchType: "PHRASE" };
  }
  return { text: value, matchType: "BROAD" };
}

function uniqBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function sanitizeLabel(value) {
  return normalizeSpace(value).replace(/[^\w .|:-]/g, "").slice(0, 80) || "Asset";
}

function fileKey(file) {
  return String(file?.name || file?.url || "asset").trim().toLowerCase();
}

function validateTextLength(values, max, label) {
  for (const value of values) {
    if (value.length > max) throw new Error(`${label} exceeds ${max} characters: "${value}" (${value.length}).`);
  }
}

function validateRow(row) {
  const required = [
    ["01 Ad Group Name", row.adGroupName],
    ["07 Campaign Type", row.campaignType],
    ["11 Start Date", row.startDate],
    ["12 Average Daily Budget", row.dailyBudget],
    ["02 Client / Ad Account", row.adAccountPageId],
    ["05 Campaign Name", row.campaignName],
    ["10 Final URL", row.finalUrl],
  ];
  for (const [label, value] of required) {
    if (value === null || value === undefined || value === "") throw new Error(`Missing required field ${label} on ${row.pageId}.`);
  }
  if (!["Search", "Performance Max"].includes(row.campaignType)) {
    throw new Error(`Unsupported campaign type "${row.campaignType}" on ${row.pageId}.`);
  }
  validateTextLength(row.headlines, 30, `Headline on ${row.adGroupName}`);
  validateTextLength(row.descriptions, 90, `Description on ${row.adGroupName}`);
  validateTextLength([row.displayPath1, row.displayPath2].filter(Boolean), 15, `Display path on ${row.adGroupName}`);
  validateTextLength(row.sitelinks.map((s) => s.title), 25, `Sitelink title on ${row.adGroupName}`);
  if (row.campaignType === "Search") {
    if (row.headlines.length < 3) throw new Error(`Search row ${row.adGroupName} needs at least 3 headlines.`);
    if (row.descriptions.length < 2) throw new Error(`Search row ${row.adGroupName} needs at least 2 descriptions.`);
    if (!row.keywords.length) throw new Error(`Search row ${row.adGroupName} needs at least 1 keyword.`);
  }
}

function rowFromPage(page) {
  const props = page.properties || {};
  const relations = propRelationsAny(props, ["02 Client / Ad Account", "09 Client / Ad Account"]);
  const row = {
    pageId: page.id,
    pageUrl: page.url,
    adGroupName: propTitleAny(props, ["01 Ad Group Name"]),
    objective: propSelectAny(props, ["06 Campaign Objective", "02 Campaign Objective"]),
    campaignType: propSelectAny(props, ["07 Campaign Type", "03 Campaign Type"]),
    websiteUrl: propUrlAny(props, ["09 Website URL", "04 Website URL"]),
    optimizationFocus: propSelectAny(props, ["08 Optimization Focus", "08 Campaign Focus", "05 Campaign Focus"]),
    targetCpa: propNumberAny(props, ["13 Target CPA", "06 Target CPA"]),
    startDate: propDateStartAny(props, ["11 Start Date", "07 Start Date"]),
    dailyBudget: propNumberAny(props, ["12 Average Daily Budget", "08 Average Daily Budget"]),
    adAccountPageId: relations[0] || "",
    brandName: propTextAny(props, ["04 Brand / Client Name", "10 Brand / Client Name"]),
    campaignName: propTextAny(props, ["05 Campaign Name", "12 Campaign Name"]),
    network: propMultiAny(props, ["14 Network", "13 Network"]),
    networkNotes: propTextAny(props, ["15 Network Notes", "14 Network Notes"]),
    locations: propMultiAny(props, ["16 Target Location", "15 Target Location"]),
    languages: propMultiAny(props, ["17 Language", "16 Language"]),
    finalUrl: propUrlAny(props, ["10 Final URL", "17 Final URL"]),
    displayPath1: propTextAny(props, ["28 Display Path 1", "18 Display Path 1"]),
    displayPath2: propTextAny(props, ["29 Display Path 2", "19 Display Path 2"]),
    headlines: headlineTexts(props),
    descriptions: descriptionTexts(props),
    businessName: propTextAny(props, ["49 Business Name", "39 Business Name"]),
    logoFiles: firstValue(props, ["50 Logo", "40 Logo"], propFiles),
    productImageFiles: firstValue(props, ["51 Product / Service Image", "41 Product / Service Image"], propFiles),
    imageNotes: propTextAny(props, ["52 Image Notes", "42 Image Notes"]),
    sitelinks: sitelinks(props),
    status: propSelectAny(props, ["65 Status", "55 Status"]),
    setupNotes: propTextAny(props, ["69 Setup Notes", "59 Setup Notes"]),
    reviewNotes: propTextAny(props, ["70 Review Notes", "60 Review Notes"]),
    keywords: keywordTexts(props).map(parseKeyword).filter(Boolean),
  };
  validateRow(row);
  return row;
}

function accountFromPage(page) {
  const props = page.properties || {};
  const id = propText(props, "ID") || propTitle(props, "ID");
  const accessPath = propText(props, "Access Path") || propSelect(props, "Access Path");
  const accountName = propTitle(props, "Account Name") || propText(props, "Account Name");
  const platform = propSelect(props, "Platform") || propText(props, "Platform");
  const status = propSelect(props, "Status") || propText(props, "Status");
  if (!id) throw new Error(`Linked Ad Account page ${page.id} is missing ID.`);
  if (platform && platform.toLowerCase() !== "google") {
    throw new Error(`Linked Ad Account ${accountName || page.id} is not Google platform: ${platform}.`);
  }
  return {
    pageId: page.id,
    accountName,
    customerId: stripDashes(id),
    customerIdDisplay: id,
    loginCustomerId: accessPath && accessPath.toLowerCase() !== "personal" ? stripDashes(accessPath) : "",
    accessPath,
    status,
  };
}

async function loadRows(args) {
  let pages = [];
  if (args.pageIds.length) {
    pages = await Promise.all(args.pageIds.map((id) => notionRequest(`/pages/${id}`)));
  } else {
    pages = await queryNotionPages(args.databaseId || DEFAULT_DATABASE_ID, args.status);
  }
  if (!pages.length) throw new Error("No Notion setup rows found.");

  const rows = pages.map(rowFromPage);
  const accountIds = Array.from(new Set(rows.map((row) => row.adAccountPageId)));
  const accounts = new Map();
  for (const accountId of accountIds) {
    const page = await notionRequest(`/pages/${accountId.replace(/-/g, "")}`);
    accounts.set(accountId, accountFromPage(page));
  }
  return { rows, accounts };
}

function groupRows(rows, accounts) {
  const groups = new Map();
  for (const row of rows) {
    const account = accounts.get(row.adAccountPageId);
    if (!account) throw new Error(`Missing resolved account for ${row.adAccountPageId}.`);
    const key = [account.customerId, row.campaignType, row.campaignName].join("||");
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        campaignName: row.campaignName,
        campaignType: row.campaignType,
        startDate: row.startDate,
        dailyBudget: row.dailyBudget,
        targetCpa: row.targetCpa,
        objective: row.objective,
        optimizationFocus: row.optimizationFocus,
        account,
        rows: [],
      });
    }
    const group = groups.get(key);
    if (group.startDate !== row.startDate) throw new Error(`Rows in ${group.campaignName} have different start dates.`);
    if (group.dailyBudget !== row.dailyBudget) throw new Error(`Rows in ${group.campaignName} have different daily budgets.`);
    if (group.account.customerId !== account.customerId) throw new Error(`Rows in ${group.campaignName} have different customer IDs.`);
    if (group.objective !== row.objective) throw new Error(`Rows in ${group.campaignName} have different campaign objectives.`);
    if (group.optimizationFocus !== row.optimizationFocus) throw new Error(`Rows in ${group.campaignName} have different optimization focuses.`);
    group.rows.push(row);
  }
  return Array.from(groups.values());
}

function groupPlanSummary(group) {
  return {
    customerId: group.account.customerIdDisplay,
    loginCustomerId: group.account.loginCustomerId || null,
    accountName: group.account.accountName,
    campaignName: group.campaignName,
    campaignType: group.campaignType,
    campaignObjective: group.objective,
    optimizationFocus: group.optimizationFocus,
    googleAdsObjectiveMapping: campaignObjectiveMapping(group),
    startDate: group.startDate,
    dailyBudget: group.dailyBudget,
    targetCpa: group.targetCpa,
    rowCount: group.rows.length,
    rows: group.rows.map((row) => ({
      adGroupName: row.adGroupName,
      finalUrl: row.finalUrl,
      locations: row.locations,
      languages: row.languages,
      headlines: row.headlines.length,
      descriptions: row.descriptions.length,
      keywords: row.keywords.length,
      sitelinks: row.sitelinks.length,
      logoFiles: row.logoFiles.map((f) => f.name),
      productImageFiles: row.productImageFiles.map((f) => f.name),
    })),
  };
}

async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  const res = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OAuth token request failed (${res.status}): ${text}`);
  return JSON.parse(text).access_token;
}

function googleAdsVersion() {
  return process.env.GOOGLE_ADS_API_VERSION || DEFAULT_GOOGLE_ADS_VERSION;
}

function googleAdsHeaders(accessToken, loginCustomerId) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    "Content-Type": "application/json",
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;
  return headers;
}

async function googleAdsRequest({ customerId, loginCustomerId, accessToken, pathSuffix, method = "POST", body }) {
  const version = googleAdsVersion();
  const endpoint = `https://googleads.googleapis.com/${version}/customers/${customerId}${pathSuffix}`;
  const res = await fetchWithTimeout(endpoint, {
    method,
    headers: googleAdsHeaders(accessToken, loginCustomerId),
    body: body ? JSON.stringify(body) : undefined,
  }, 60_000);
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`Google Ads API failed (${version}, ${res.status}): ${text}`);
    err.status = res.status;
    err.responseText = text;
    try {
      err.responseJson = JSON.parse(text);
    } catch {
      err.responseJson = null;
    }
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

async function googleAdsSearch({ customerId, loginCustomerId, accessToken, query }) {
  const data = await googleAdsRequest({
    customerId,
    loginCustomerId,
    accessToken,
    pathSuffix: "/googleAds:search",
    body: { query },
  });
  return data.results || [];
}

async function googleAdsMutate({ customerId, loginCustomerId, accessToken, mutateOperations, validateOnly }) {
  return googleAdsRequest({
    customerId,
    loginCustomerId,
    accessToken,
    pathSuffix: "/googleAds:mutate",
    body: {
      partialFailure: false,
      validateOnly: Boolean(validateOnly),
      mutateOperations,
    },
  });
}

function googleAdsErrorsFromException(err) {
  const details = err?.responseJson?.error?.details || [];
  return details.flatMap((detail) => detail.errors || []);
}

function operationIndexFromError(error) {
  const elements = error?.location?.fieldPathElements || [];
  const op = elements.find((x) => x.fieldName === "mutate_operations");
  return Number.isInteger(op?.index) ? op.index : null;
}

function addPolicyExemptionKeys(mutateOperations, googleAdsErrors) {
  let policyErrorCount = 0;
  let addedCount = 0;
  const byOperation = new Map();

  for (const error of googleAdsErrors) {
    const details = error?.details?.policyViolationDetails;
    if (!details) continue;
    policyErrorCount += 1;
    if (!details.isExemptible || !details.key) continue;
    const index = operationIndexFromError(error);
    if (index === null) continue;
    if (!byOperation.has(index)) byOperation.set(index, []);
    byOperation.get(index).push(details.key);
  }

  if (!policyErrorCount || policyErrorCount !== Array.from(byOperation.values()).reduce((sum, keys) => sum + keys.length, 0)) {
    return { canRetry: false, policyErrorCount, addedCount };
  }

  for (const [index, keys] of byOperation.entries()) {
    const operation = mutateOperations[index];
    const targetOperation = operation?.adGroupCriterionOperation;
    if (!targetOperation) return { canRetry: false, policyErrorCount, addedCount };
    targetOperation.exemptPolicyViolationKeys = uniqBy(
      [...(targetOperation.exemptPolicyViolationKeys || []), ...keys],
      (key) => `${key.policyName}|${key.violatingText}`
    );
    addedCount += keys.length;
  }

  return { canRetry: true, policyErrorCount, addedCount };
}

async function googleAdsMutateWithOptionalPolicyExemptions({
  customerId,
  loginCustomerId,
  accessToken,
  mutateOperations,
  validateOnly,
  requestPolicyExemptions,
}) {
  try {
    const response = await googleAdsMutate({ customerId, loginCustomerId, accessToken, mutateOperations, validateOnly });
    return { response, policyExemptionsRequested: 0 };
  } catch (err) {
    if (!requestPolicyExemptions) throw err;
    const errors = googleAdsErrorsFromException(err);
    const result = addPolicyExemptionKeys(mutateOperations, errors);
    if (!result.canRetry || !result.addedCount) throw err;
    const response = await googleAdsMutate({ customerId, loginCustomerId, accessToken, mutateOperations, validateOnly });
    return { response, policyExemptionsRequested: result.addedCount };
  }
}

async function assertNoExistingCampaign({ group, accessToken, allowExisting }) {
  if (allowExisting) return;
  const query = `
SELECT campaign.id, campaign.name, campaign.status
FROM campaign
WHERE campaign.name = '${escapeGaql(group.campaignName)}'
  AND campaign.status != 'REMOVED'
LIMIT 1
`;
  const rows = await googleAdsSearch({
    customerId: group.account.customerId,
    loginCustomerId: group.account.loginCustomerId,
    accessToken,
    query,
  });
  if (rows.length) {
    const c = rows[0].campaign || {};
    throw new Error(`Campaign already exists: ${c.name || group.campaignName} (${c.id || "unknown"}, ${c.status || "unknown"}).`);
  }
}

async function resolveGeoTarget({ group, accessToken, name }) {
  const queryName = name === "Malaysia Nationwide" ? "Malaysia" : name;
  const baseSelect = `
SELECT geo_target_constant.id,
  geo_target_constant.resource_name,
  geo_target_constant.name,
  geo_target_constant.canonical_name,
  geo_target_constant.country_code,
  geo_target_constant.target_type,
  geo_target_constant.status
FROM geo_target_constant
WHERE geo_target_constant.status = 'ENABLED'
  AND geo_target_constant.country_code = '${DEFAULT_COUNTRY_CODE}'
`;
  const exactNameQuery = `${baseSelect}
  AND geo_target_constant.name = '${escapeGaql(queryName)}'
LIMIT 20
`;
  let rows = await googleAdsSearch({
    customerId: group.account.customerId,
    loginCustomerId: group.account.loginCustomerId,
    accessToken,
    query: exactNameQuery,
  });

  if (!rows.length) {
    const nameLikeQuery = `${baseSelect}
  AND geo_target_constant.name LIKE '%${escapeGaql(queryName)}%'
ORDER BY geo_target_constant.target_type
LIMIT 50
`;
    rows = await googleAdsSearch({
      customerId: group.account.customerId,
      loginCustomerId: group.account.loginCustomerId,
      accessToken,
      query: nameLikeQuery,
    });
  }

  if (!rows.length) {
    const canonicalQuery = `${baseSelect}
  AND geo_target_constant.canonical_name LIKE '%${escapeGaql(queryName)}%'
ORDER BY geo_target_constant.target_type
LIMIT 50
`;
    rows = await googleAdsSearch({
      customerId: group.account.customerId,
      loginCustomerId: group.account.loginCustomerId,
      accessToken,
      query: canonicalQuery,
    });
  }

  const candidates = rows.map((r) => r.geoTargetConstant).filter(Boolean);
  if (!candidates.length) throw new Error(`Could not resolve geo target: ${name}`);

  const exactName = candidates.find((c) => String(c.name || "").toLowerCase() === queryName.toLowerCase());
  if (exactName) return exactName;

  const preferredOrder = new Map([
    ["Country", 0],
    ["State", 1],
    ["Federal District", 2],
    ["Province", 3],
    ["City", 4],
    ["District", 5],
    ["Region", 6],
  ]);
  const wanted = queryName.toLowerCase();
  const scored = candidates.map((c) => {
    const typeScore = preferredOrder.has(c.targetType) ? preferredOrder.get(c.targetType) : 50;
    const exact = String(c.name || "").toLowerCase() === wanted ? 0 : 1;
    const canonical = String(c.canonicalName || "").toLowerCase();
    const textScore = canonical.includes(wanted) ? 0 : 5;
    return { c, score: exact * 100 + typeScore * 10 + textScore };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0].c;
}

async function resolveLanguage({ group, accessToken, name }) {
  const query = `
SELECT language_constant.id, language_constant.resource_name, language_constant.name, language_constant.code
FROM language_constant
WHERE language_constant.name = '${escapeGaql(name)}'
LIMIT 5
`;
  const rows = await googleAdsSearch({
    customerId: group.account.customerId,
    loginCustomerId: group.account.loginCustomerId,
    accessToken,
    query,
  });
  const first = rows.map((r) => r.languageConstant).find(Boolean);
  if (first?.resourceName) return first;

  const fallback = LANGUAGE_FALLBACKS.get(name.toLowerCase());
  if (fallback) return { resourceName: fallback, name, fallback: true };
  throw new Error(`Could not resolve language: ${name}`);
}

async function downloadFile(file) {
  const res = await fetchWithTimeout(file.url, {}, 30_000);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!res.ok) throw new Error(`Could not download Notion file ${file.name}: ${res.status}`);
  return { ...file, bytes, base64: Buffer.from(bytes).toString("base64"), dimensions: imageDimensions(bytes, file.name) };
}

function imageDimensions(bytes, name = "image") {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20), format: "png" };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset < bytes.length - 9) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return {
          width: (bytes[offset + 7] << 8) + bytes[offset + 8],
          height: (bytes[offset + 5] << 8) + bytes[offset + 6],
          format: "jpeg",
        };
      }
      offset += 2 + length;
    }
  }
  throw new Error(`Unsupported or unreadable image dimensions for ${name}. Use PNG or JPEG.`);
}

function classifyImage(asset) {
  const { width, height } = asset.dimensions;
  const ratio = width / height;
  if (Math.abs(ratio - 1) <= 0.05) return "square";
  if (Math.abs(ratio - 1.91) <= 0.18 || ratio > 1.4) return "landscape";
  if (ratio < 0.9) return "portrait";
  return "other";
}

async function loadGroupFiles(group) {
  const allFiles = uniqBy(
    group.rows.flatMap((row) => [...row.logoFiles, ...row.productImageFiles]),
    fileKey
  );
  const loaded = new Map();
  for (const file of allFiles) {
    loaded.set(fileKey(file), await downloadFile(file));
  }
  return loaded;
}

function firstRowValues(group) {
  const locations = uniqBy(group.rows.flatMap((row) => row.locations), (x) => x.toLowerCase());
  const languages = uniqBy(group.rows.flatMap((row) => row.languages), (x) => x.toLowerCase());
  return {
    locations: locations.length ? locations : ["Malaysia Nationwide"],
    languages: languages.length ? languages : ["English"],
  };
}

async function resolveTargeting(group, accessToken) {
  const { locations, languages } = firstRowValues(group);
  const geoTargets = [];
  for (const name of locations) {
    geoTargets.push(await resolveGeoTarget({ group, accessToken, name }));
  }
  const languageTargets = [];
  for (const name of languages) {
    languageTargets.push(await resolveLanguage({ group, accessToken, name }));
  }
  return { geoTargets, languageTargets };
}

function campaignBidding(group) {
  const mapping = campaignObjectiveMapping(group);
  if (mapping.biddingStrategyType === "TARGET_SPEND") {
    return { biddingStrategyType: "TARGET_SPEND", targetSpend: {} };
  }
  if (mapping.biddingStrategyType === "MAXIMIZE_CONVERSIONS" && group.targetCpa) {
    return {
      biddingStrategyType: "MAXIMIZE_CONVERSIONS",
      maximizeConversions: { targetCpaMicros: toMicros(group.targetCpa) },
    };
  }
  if (mapping.biddingStrategyType === "MAXIMIZE_CONVERSIONS") {
    return { biddingStrategyType: "MAXIMIZE_CONVERSIONS", maximizeConversions: {} };
  }
  throw new Error(`Unsupported Google Ads bidding mapping for objective "${group.objective || "blank"}".`);
}

function campaignObjectiveMapping(group) {
  const objective = normalizeSpace(group.objective).toLowerCase();
  const focus = normalizeSpace(group.optimizationFocus).toLowerCase();
  if (focus === "reach" || focus === "engagement") {
    return {
      sourceProperty: "06 Campaign Objective / 08 Optimization Focus",
      objective: group.objective || "",
      optimizationFocus: group.optimizationFocus || "",
      appliedApiSettings: [],
      biddingStrategyType: "",
      uiMarketingObjectiveWritableByApi: false,
      note: `No supported API mapping configured for optimization focus "${group.optimizationFocus}".`,
    };
  }
  if (objective === "website traffic" || objective === "traffic" || focus === "clicks" || focus === "maximize clicks" || focus === "website traffic") {
    return {
      sourceProperty: "06 Campaign Objective / 08 Optimization Focus",
      objective: group.objective || "",
      optimizationFocus: group.optimizationFocus || "",
      appliedApiSettings: ["TARGET_SPEND"],
      biddingStrategyType: "TARGET_SPEND",
      uiMarketingObjectiveWritableByApi: false,
      note: "Website traffic objectives or Clicks optimization map to Maximize clicks in Google Ads, represented by TARGET_SPEND in the API. Target CPA is only applied for conversion objectives.",
    };
  }
  if (!objective || objective === "leads" || objective === "sales" || focus === "conversions" || focus === "maximize conversions") {
    return {
      sourceProperty: "06 Campaign Objective / 08 Optimization Focus",
      objective: group.objective || "",
      optimizationFocus: group.optimizationFocus || "",
      appliedApiSettings: ["MAXIMIZE_CONVERSIONS", "campaign conversion goals"],
      biddingStrategyType: "MAXIMIZE_CONVERSIONS",
      uiMarketingObjectiveWritableByApi: false,
      note: "Google Ads API does not expose a writable Campaign Marketing Objective UI field.",
    };
  }
  return {
    sourceProperty: "06 Campaign Objective / 08 Optimization Focus",
    objective: group.objective,
    optimizationFocus: group.optimizationFocus || "",
    appliedApiSettings: [],
    biddingStrategyType: "",
    uiMarketingObjectiveWritableByApi: false,
    note: `No supported API mapping configured for campaign objective "${group.objective}" with optimization focus "${group.optimizationFocus || ""}".`,
  };
}

function campaignBase({ group, budgetRn, channelType }) {
  return {
    name: group.campaignName,
    status: "PAUSED",
    containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
    advertisingChannelType: channelType,
    campaignBudget: budgetRn,
    geoTargetTypeSetting: {
      positiveGeoTargetType: "PRESENCE",
      negativeGeoTargetType: "PRESENCE",
    },
    ...campaignBidding(group),
    startDateTime: dateToGoogleAdsStartDateTime(group.startDate),
  };
}

function addCampaignCriteria({ ops, campaignRn, geoTargets, languageTargets }) {
  for (const geo of geoTargets) {
    ops.push({
      campaignCriterionOperation: {
        create: {
          campaign: campaignRn,
          location: { geoTargetConstant: geo.resourceName },
        },
      },
    });
  }
  for (const lang of languageTargets) {
    ops.push({
      campaignCriterionOperation: {
        create: {
          campaign: campaignRn,
          language: { languageConstant: lang.resourceName },
        },
      },
    });
  }
}

function buildSitelinkOps({ group, ops, customerId, campaignRn, nextAssetId }) {
  const links = uniqBy(group.rows.flatMap((row) => row.sitelinks), (s) => `${s.title.toLowerCase()}|${s.url}`).slice(0, 6);
  for (const link of links) {
    const assetRn = `customers/${customerId}/assets/${nextAssetId.value--}`;
    ops.push({
      assetOperation: {
        create: {
          resourceName: assetRn,
          name: `Sitelink | ${sanitizeLabel(link.title)}`,
          finalUrls: [link.url],
          sitelinkAsset: {
            linkText: link.title,
          },
        },
      },
    });
    ops.push({
      campaignAssetOperation: {
        create: {
          campaign: campaignRn,
          asset: assetRn,
          fieldType: "SITELINK",
        },
      },
    });
  }
}

function buildSearchOptionalAssetOps({ group, ops, customerId, campaignRn, filesByKey, nextAssetId }) {
  const businessName = group.rows.map((row) => row.businessName).find(Boolean);
  if (businessName) {
    const businessAssetRn = `customers/${customerId}/assets/${nextAssetId.value--}`;
    ops.push({
      assetOperation: {
        create: {
          resourceName: businessAssetRn,
          name: `Business Name | ${sanitizeLabel(businessName)}`,
          textAsset: { text: businessName },
        },
      },
    });
    ops.push({
      campaignAssetOperation: {
        create: {
          campaign: campaignRn,
          asset: businessAssetRn,
          fieldType: "BUSINESS_NAME",
        },
      },
    });
  }

  const logoFile = group.rows.flatMap((row) => row.logoFiles)[0];
  if (logoFile) {
    const file = filesByKey.get(fileKey(logoFile));
    if (file) {
      const assetRn = `customers/${customerId}/assets/${nextAssetId.value--}`;
      ops.push({
        assetOperation: {
          create: {
            resourceName: assetRn,
            name: `Logo | ${sanitizeLabel(file.name)}`,
            imageAsset: { data: file.base64 },
          },
        },
      });
      ops.push({
        campaignAssetOperation: {
          create: {
            campaign: campaignRn,
            asset: assetRn,
            fieldType: "BUSINESS_LOGO",
          },
        },
      });
    }
  }

  const imageFiles = uniqBy(group.rows.flatMap((row) => row.productImageFiles), fileKey).slice(0, 20);
  for (const imageFile of imageFiles) {
    const file = filesByKey.get(fileKey(imageFile));
    if (!file) continue;
    const assetRn = `customers/${customerId}/assets/${nextAssetId.value--}`;
    ops.push({
      assetOperation: {
        create: {
          resourceName: assetRn,
          name: `Image | ${sanitizeLabel(file.name)}`,
          imageAsset: { data: file.base64 },
        },
      },
    });
    ops.push({
      campaignAssetOperation: {
        create: {
          campaign: campaignRn,
          asset: assetRn,
          fieldType: "AD_IMAGE",
        },
      },
    });
  }
}

async function buildSearchOperations({ group, accessToken, skipOptionalAssets }) {
  const customerId = group.account.customerId;
  const { geoTargets, languageTargets } = await resolveTargeting(group, accessToken);
  const filesByKey = skipOptionalAssets ? new Map() : await loadGroupFiles(group);
  const ops = [];
  const budgetRn = `customers/${customerId}/campaignBudgets/-1`;
  const campaignRn = `customers/${customerId}/campaigns/-2`;
  const nextAssetId = { value: -100 };

  ops.push({
    campaignBudgetOperation: {
      create: {
        resourceName: budgetRn,
        name: `${group.campaignName} | Budget`,
        amountMicros: toMicros(group.dailyBudget),
        deliveryMethod: "STANDARD",
        explicitlyShared: false,
      },
    },
  });

  const networkGoogleOnly = group.rows.some((row) => row.network.includes("Google Search Only"));
  ops.push({
    campaignOperation: {
      create: {
        resourceName: campaignRn,
        ...campaignBase({ group, budgetRn, channelType: "SEARCH" }),
        networkSettings: {
          targetGoogleSearch: true,
          targetSearchNetwork: !networkGoogleOnly,
          targetContentNetwork: false,
          targetPartnerSearchNetwork: !networkGoogleOnly,
        },
      },
    },
  });

  addCampaignCriteria({ ops, campaignRn, geoTargets, languageTargets });
  buildSitelinkOps({ group, ops, customerId, campaignRn, nextAssetId });
  if (!skipOptionalAssets) buildSearchOptionalAssetOps({ group, ops, customerId, campaignRn, filesByKey, nextAssetId });

  let nextAdGroupId = -10;
  for (const row of group.rows) {
    const adGroupRn = `customers/${customerId}/adGroups/${nextAdGroupId--}`;
    ops.push({
      adGroupOperation: {
        create: {
          resourceName: adGroupRn,
          name: row.adGroupName,
          campaign: campaignRn,
          status: "ENABLED",
          type: "SEARCH_STANDARD",
        },
      },
    });
    ops.push({
      adGroupAdOperation: {
        create: {
          adGroup: adGroupRn,
          status: "ENABLED",
          ad: {
            finalUrls: [row.finalUrl],
            responsiveSearchAd: {
              headlines: row.headlines.slice(0, 15).map((text) => ({ text })),
              descriptions: row.descriptions.slice(0, 4).map((text) => ({ text })),
              path1: row.displayPath1 || undefined,
              path2: row.displayPath2 || undefined,
            },
          },
        },
      },
    });
    for (const keyword of uniqBy(row.keywords, (kw) => `${kw.matchType}|${kw.text.toLowerCase()}`)) {
      ops.push({
        adGroupCriterionOperation: {
          create: {
            adGroup: adGroupRn,
            status: "ENABLED",
            keyword: {
              text: keyword.text,
              matchType: keyword.matchType,
            },
          },
        },
      });
    }
  }

  return {
    ops,
    resolved: {
      geoTargets: geoTargets.map((g) => ({ name: g.name, canonicalName: g.canonicalName, targetType: g.targetType })),
      languages: languageTargets.map((l) => ({ name: l.name, resourceName: l.resourceName, fallback: Boolean(l.fallback) })),
      optionalAssetFiles: Array.from(filesByKey.values()).map((f) => ({ name: f.name, dimensions: f.dimensions })),
    },
  };
}

function pmaxAssetCandidates(group, filesByKey) {
  const logos = uniqBy(
    group.rows
      .flatMap((row) => row.logoFiles)
      .map((file) => filesByKey.get(fileKey(file)))
      .filter(Boolean),
    (file) => file.name
  );
  const productImages = uniqBy(
    group.rows
      .flatMap((row) => row.productImageFiles)
      .map((file) => filesByKey.get(fileKey(file)))
      .filter(Boolean),
    (file) => file.name
  );
  const squareImages = productImages.filter((file) => classifyImage(file) === "square");
  const landscapeImages = productImages.filter((file) => classifyImage(file) === "landscape");
  const squareLogos = logos.filter((file) => classifyImage(file) === "square");
  return { logos: squareLogos, squareImages, landscapeImages };
}

async function buildPerformanceMaxOperations({ group, accessToken }) {
  const customerId = group.account.customerId;
  const { geoTargets, languageTargets } = await resolveTargeting(group, accessToken);
  const filesByKey = await loadGroupFiles(group);
  const assets = pmaxAssetCandidates(group, filesByKey);

  if (!assets.squareImages.length || !assets.landscapeImages.length) {
    throw new Error(
      `Performance Max campaign "${group.campaignName}" needs at least one square and one landscape product/service image. ` +
        `Found ${assets.squareImages.length} square and ${assets.landscapeImages.length} landscape.`
    );
  }
  if (!assets.logos.length) {
    throw new Error(`Performance Max campaign "${group.campaignName}" needs at least one square logo image.`);
  }

  const ops = [];
  const budgetRn = `customers/${customerId}/campaignBudgets/-1`;
  const campaignRn = `customers/${customerId}/campaigns/-2`;
  const nextAssetId = { value: -100 };
  const assetRns = new Map();

  function addTextAsset(text, label) {
    const key = `TEXT|${text}`;
    if (assetRns.has(key)) return assetRns.get(key);
    const rn = `customers/${customerId}/assets/${nextAssetId.value--}`;
    assetRns.set(key, rn);
    ops.push({
      assetOperation: {
        create: {
          resourceName: rn,
          name: `${label} | ${sanitizeLabel(text)}`,
          textAsset: { text },
        },
      },
    });
    return rn;
  }

  function addImageAsset(file, label) {
    const key = `IMAGE|${file.name}|${file.url}`;
    if (assetRns.has(key)) return assetRns.get(key);
    const rn = `customers/${customerId}/assets/${nextAssetId.value--}`;
    assetRns.set(key, rn);
    ops.push({
      assetOperation: {
        create: {
          resourceName: rn,
          name: `${label} | ${sanitizeLabel(file.name)}`,
          imageAsset: { data: file.base64 },
        },
      },
    });
    return rn;
  }

  ops.push({
    campaignBudgetOperation: {
      create: {
        resourceName: budgetRn,
        name: `${group.campaignName} | Budget`,
        amountMicros: toMicros(group.dailyBudget),
        deliveryMethod: "STANDARD",
        explicitlyShared: false,
      },
    },
  });
  ops.push({
    campaignOperation: {
      create: {
        resourceName: campaignRn,
        ...campaignBase({ group, budgetRn, channelType: "PERFORMANCE_MAX" }),
      },
    },
  });
  addCampaignCriteria({ ops, campaignRn, geoTargets, languageTargets });

  let nextAssetGroupId = -10;
  for (const row of group.rows) {
    const assetGroupRn = `customers/${customerId}/assetGroups/${nextAssetGroupId--}`;
    ops.push({
      assetGroupOperation: {
        create: {
          resourceName: assetGroupRn,
          campaign: campaignRn,
          name: row.adGroupName,
          finalUrls: [row.finalUrl],
          status: "ENABLED",
        },
      },
    });

    const shortHeadlines = row.headlines.filter((h) => h.length <= 30).slice(0, 15);
    const longHeadlines = row.headlines.filter((h) => h.length <= 90).slice(0, 5);
    const descriptions = row.descriptions.slice(0, 5);
    const businessName = row.businessName || group.rows.map((r) => r.businessName).find(Boolean) || group.rows[0].brandName;

    for (const text of shortHeadlines) {
      ops.push({ assetGroupAssetOperation: { create: { assetGroup: assetGroupRn, asset: addTextAsset(text, "Headline"), fieldType: "HEADLINE" } } });
    }
    for (const text of longHeadlines) {
      ops.push({ assetGroupAssetOperation: { create: { assetGroup: assetGroupRn, asset: addTextAsset(text, "Long Headline"), fieldType: "LONG_HEADLINE" } } });
    }
    for (const text of descriptions) {
      ops.push({ assetGroupAssetOperation: { create: { assetGroup: assetGroupRn, asset: addTextAsset(text, "Description"), fieldType: "DESCRIPTION" } } });
    }
    if (businessName) {
      ops.push({
        assetGroupAssetOperation: {
          create: {
            assetGroup: assetGroupRn,
            asset: addTextAsset(businessName, "Business Name"),
            fieldType: "BUSINESS_NAME",
          },
        },
      });
    }
    for (const file of assets.logos.slice(0, 5)) {
      ops.push({ assetGroupAssetOperation: { create: { assetGroup: assetGroupRn, asset: addImageAsset(file, "Logo"), fieldType: "LOGO" } } });
    }
    for (const file of assets.landscapeImages.slice(0, 20)) {
      ops.push({
        assetGroupAssetOperation: {
          create: { assetGroup: assetGroupRn, asset: addImageAsset(file, "Marketing Image"), fieldType: "MARKETING_IMAGE" },
        },
      });
    }
    for (const file of assets.squareImages.slice(0, 20)) {
      ops.push({
        assetGroupAssetOperation: {
          create: { assetGroup: assetGroupRn, asset: addImageAsset(file, "Square Marketing Image"), fieldType: "SQUARE_MARKETING_IMAGE" },
        },
      });
    }
  }

  return {
    ops,
    resolved: {
      geoTargets: geoTargets.map((g) => ({ name: g.name, canonicalName: g.canonicalName, targetType: g.targetType })),
      languages: languageTargets.map((l) => ({ name: l.name, resourceName: l.resourceName, fallback: Boolean(l.fallback) })),
      pmaxAssets: {
        logos: assets.logos.map((f) => ({ name: f.name, dimensions: f.dimensions })),
        squareImages: assets.squareImages.map((f) => ({ name: f.name, dimensions: f.dimensions })),
        landscapeImages: assets.landscapeImages.map((f) => ({ name: f.name, dimensions: f.dimensions })),
      },
    },
  };
}

async function buildOperations(params) {
  if (params.group.campaignType === "Search") return buildSearchOperations(params);
  if (params.group.campaignType === "Performance Max") return buildPerformanceMaxOperations(params);
  throw new Error(`Unsupported campaign type: ${params.group.campaignType}`);
}

async function runMain() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    runSelfTest();
    return;
  }

  requireEnv();

  const { rows, accounts } = await loadRows(args);
  const groups = groupRows(rows, accounts);
  const plan = {
    mode: args.planOnly ? "plan-only" : args.validateOnly ? "validate-only" : "execute-paused",
    googleAdsApiVersion: googleAdsVersion(),
    groups: groups.map(groupPlanSummary),
  };
  if (args.outPlan) {
    await fs.mkdir(path.dirname(args.outPlan), { recursive: true });
    await fs.writeFile(args.outPlan, JSON.stringify(plan, null, 2));
  }
  console.log(JSON.stringify(plan, null, 2));
  if (args.planOnly) return;

  const accessToken = await getAccessToken();
  const results = [];
  for (const group of groups) {
    await assertNoExistingCampaign({ group, accessToken, allowExisting: args.allowExisting });
    const { ops, resolved } = await buildOperations({
      group,
      accessToken,
      skipOptionalAssets: args.skipOptionalAssets,
    });
    const { response, policyExemptionsRequested } = await googleAdsMutateWithOptionalPolicyExemptions({
      customerId: group.account.customerId,
      loginCustomerId: group.account.loginCustomerId,
      accessToken,
      mutateOperations: ops,
      validateOnly: args.validateOnly,
      requestPolicyExemptions: args.requestPolicyExemptions,
    });
    results.push({
      campaignName: group.campaignName,
      customerId: group.account.customerIdDisplay,
      operationCount: ops.length,
      validateOnly: args.validateOnly,
      executePaused: args.executePaused,
      policyExemptionsRequested,
      resolved,
      mutateResultCount: response.mutateOperationResponses?.length || response.results?.length || 0,
    });
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

function runSelfTest() {
  assert.deepEqual(parseKeyword("[pajak kereta]"), { text: "pajak kereta", matchType: "EXACT" });
  assert.deepEqual(parseKeyword('"refinance kereta"'), { text: "refinance kereta", matchType: "PHRASE" });
  assert.deepEqual(parseKeyword("car refinance malaysia"), { text: "car refinance malaysia", matchType: "BROAD" });
  validateTextLength(["123456789012345678901234567890"], 30, "headline");
  assert.throws(() => validateTextLength(["1234567890123456789012345678901"], 30, "headline"));

  const sampleRows = [
    { campaignName: "LT | Search | 600/d | 2026-06-04", campaignType: "Search", adAccountPageId: "a1", startDate: "2026-06-05", dailyBudget: 600 },
    { campaignName: "LT | Search | 600/d | 2026-06-04", campaignType: "Search", adAccountPageId: "a1", startDate: "2026-06-05", dailyBudget: 600 },
    { campaignName: "LT | PMax | 600/d | 2026-06-04", campaignType: "Performance Max", adAccountPageId: "a1", startDate: "2026-06-05", dailyBudget: 600 },
  ];
  const groups = groupRows(sampleRows, new Map([["a1", { customerId: "4465686564", customerIdDisplay: "446-568-6564", loginCustomerId: "4114685827" }]]));
  assert.equal(groups.length, 2);
  assert.equal(groups[0].rows.length, 2);
  assert.deepEqual(campaignBidding({ objective: "Website Traffic", optimizationFocus: "", targetCpa: 90 }), {
    biddingStrategyType: "TARGET_SPEND",
    targetSpend: {},
  });
  assert.deepEqual(campaignBidding({ objective: "Leads", optimizationFocus: "", targetCpa: 90 }), {
    biddingStrategyType: "MAXIMIZE_CONVERSIONS",
    maximizeConversions: { targetCpaMicros: "90000000" },
  });

  const pngHeader = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
    0, 0, 4, 0xb0, 0, 0, 4, 0xb0,
  ]);
  assert.deepEqual(imageDimensions(pngHeader, "test.png"), { width: 1200, height: 1200, format: "png" });
  console.log(JSON.stringify({ ok: true, selfTest: true }, null, 2));
}

runMain().catch((err) => {
  console.error(err.message || String(err));
  const message = String(err?.message || err || "");
  if (
    message.startsWith("Unknown argument") ||
    message.startsWith("Specify exactly one mode") ||
    message.startsWith("Provide --page-ids")
  ) {
    console.error(usage().trim());
  }
  process.exit(1);
});
