// Read-only UI QA against a running dev server, with synthetic API fixtures.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.REPORT_QA_BASE_URL ?? "http://localhost:3105";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.setDefaultNavigationTimeout(120000);
page.on("pageerror", (error) => console.error("UI error:", error.message));
const values = { impressions: 100, views: 100, clicks: 10, spend: 5, conversions: 2, ctr: 10, cpc: .5, cpm: 50 };
const creativeUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQ1cAAAAASUVORK5CYII=";
const demand = { account: { id: "1234567890", name: "Fixture Google", currency: "MYR", timezone: "Asia/Kuala_Lumpur" }, startDate: "2026-09-01", endDate: "2026-09-30", campaigns: [{ id: "1", name: "Demand A" }, { id: "2", name: "Demand B" }], campaignId: "1", ads: [{ id: "ad1", name: "Demand ad", campaignName: "Demand A", imageUrls: [creativeUrl], metrics: values }], inMarket: [{ id: "i", name: "Furniture", metrics: values }], affinity: [{ id: "a", name: "Home enthusiasts", metrics: values }], cells: ["In-feed", "In-stream", "Shorts"].flatMap((format) => ["Desktop", "Mobile", "Tablet", "TV"].map((device) => ({ format, device, metrics: values }))), unmapped: [], unresolved: [], warnings: [], complete: true };
const dateRange = { startDate: "2026-09-01", endDate: "2026-09-30", previousStartDate: "2026-08-01", previousEndDate: "2026-08-31", currentLabel: "September 2026", previousLabel: "August 2026" };
demand.inMarket.push(...Array.from({ length: 11 }, (_, index) => ({ id: `i${index}`, name: `Interest ${String(index).padStart(2, "0")}`, metrics: values })));
const campaign = { id: "c", platform: "meta", campaignType: "Lead", campaignName: "Fixture campaign", resultActionType: "lead", resultLabel: "Lead", impressions: 1000, videoViews: 500, clicks: 100, spend: 50, results: 20, ctr: 10, cpm: 50, costPerResult: 2.5, conversions: 20, avgCpc: .5, youtubeEarnedLikes: 0, youtubeEarnedShares: 0 };
const overall = { companyName: "Fixture", dateRange, accountIds: { metaAccountId: "96906550", googleAccountId: null, metaAccountIds: ["96906550"], googleAccountIds: [] }, summaries: [], campaignGroups: [{ id: "meta-lead", platform: "meta", campaignType: "Lead", rows: [campaign], totals: campaign }], warnings: [], diagnostics: [], audienceClickBreakdown: { age: [], gender: [], location: { country: [], region: [], city: [] } } };
const performance = { resultLabel: "Lead", results: 2, impressions: 100, videoViews: 50, clicks: 10, spend: 5, ctr: 10, cpm: 50, cpc: .5, costPerResult: 2.5, landingPageViews: 0, linkClicks: 0 };
let demandRequests = 0, failHierarchy = false, partialHierarchy = false;
const requests = [];
await page.route("**/api/**", async (route) => {
  const url = new URL(route.request().url()); requests.push(url);
  let data = {};
  if (url.pathname.includes("tiktok-insights")) return route.fulfill({ status: 503, json: { error: "Fixture insights unavailable" } });
  if (url.pathname === "/api/auth/session") data = { user: { role: "admin" } };
  else if (url.pathname === "/api/reporting/demand-gen") { demandRequests++; data = { ...demand, campaignId: url.searchParams.get("campaignId") }; }
  else if (url.pathname.includes("/ad-groups") || url.pathname.includes("/ads")) {
    if (failHierarchy) return route.fulfill({ status: 503, json: { error: "Fixture retry failure" } });
    data = { ...overall, sections: [{ platform: "meta", campaigns: [{ id: "c", name: "Fixture campaign", status: "Paused", details: [], children: [{ id: "s", name: "Historical set", status: "Paused", details: [], performance, ads: [{ id: "a", name: "Historical ad", status: "Paused", details: [], creative: { id: "creative1", imageUrl: creativeUrl }, performance: { ...performance, spend: 3, results: 1 } }] }] }] }], warnings: partialHierarchy ? ["Fixture partial coverage"] : [] };
  } else if (url.pathname.includes("/api/reports/") || url.pathname === "/api/reporting") data = url.searchParams.get("googleAccountId") ? { ...overall, accountIds: { metaAccountId: null, metaAccountIds: [], googleAccountId: "1234567890", googleAccountIds: ["1234567890"] }, campaignGroups: [{ ...overall.campaignGroups[0], id: "google-search", platform: "google", campaignType: "Search", rows: [{ ...campaign, platform: "google", campaignType: "Search", campaignName: "Google campaign only" }] }] } : overall;
  else if (url.pathname.endsWith("/final-url-performance")) data = { section: { rows: [{ id: "url", campaign: "Demand Gen campaign with a readable name", finalUrl: "https://example.com/landing-page?utm_source=google&utm_campaign=demand-gen", spend: 2007.59, impressions: 289568, clicks: 21237, conversions: 1256, ctr: 7.33, cpc: .09, cpa: 1.60, conversionRate: 5.92 }], otherRow: null, totalUrlCount: 1 }, warnings: [] };
  else if (url.pathname.includes("/advanced") || url.pathname === "/api/reporting/advanced") return route.fulfill({ status: 503, json: { error: "Fixture analysis unavailable" } });
  else if (url.pathname.includes("/accounts/search")) data = { accounts: [] };
  if (url.searchParams.get("platform") === "tiktok") {
    data = JSON.parse(JSON.stringify(data).replaceAll('"meta"', '"tiktok"').replaceAll('"Paused"', '"ENABLE"'));
  }
  if (url.pathname.includes("/api/reports/") && url.searchParams.get("googleAccountId")) await new Promise((resolve) => setTimeout(resolve, 1500));
  await route.fulfill({ json: data });
});

async function downloadPdf(file) {
  await page.getByRole("button", { name: "Report", exact: true }).click();
  const downloadPromise = page.waitForEvent("download", { timeout: 120000 });
  await page.getByRole("menuitem", { name: "Download PDF", exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(`tmp/${file}.pdf`);
  assert.equal(await download.failure(), null);
  await page.waitForURL((url) => !url.searchParams.has("screenshot"), { timeout: 30000 });
}
try {
  await page.goto(`${base}/demand-gen?googleAccountId=1234567890&platform=google&startDate=2026-09-01&endDate=2026-09-30`);
  await page.getByRole("cell", { name: "Furniture", exact: true }).waitFor();
  await page.getByRole("button", { name: "Navigation", exact: true }).click();
  await page.getByRole("menuitem", { name: "Campaign Breakdown", exact: true }).waitFor();
  await page.getByRole("menuitem", { name: "Demand Gen Analysis", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  let accountSearchRequests = 0;
  await page.route("**/api/notion/accounts/search?**", async (route) => { accountSearchRequests++; await route.fulfill({ json: { accounts: [{ notionPageId: "cache-account", accountName: "Cache Account", adAccountId: "1234567890", platform: "google" }] } }); });
  await page.locator('button[aria-haspopup="listbox"]').first().click();
  const accountSearch = page.getByRole("textbox", { name: "Search accounts", exact: true });
  await accountSearch.fill("cache account");
  await page.getByText("Cache Account | 1234567890", { exact: true }).waitFor();
  await accountSearch.fill("");
  await page.getByText("Cache Account | 1234567890", { exact: true }).waitFor({ state: "hidden" });
  await accountSearch.fill("cache account");
  await page.getByText("Cache Account | 1234567890", { exact: true }).waitFor();
  assert.equal(accountSearchRequests, 1, "repeated account searches reuse cached results");
  await accountSearch.press("Escape");

  assert.ok(await page.getByRole("heading", { level: 1 }).innerText().then((text) => text.includes("Fixture Google") && text.includes("1234567890")));
  await page.getByRole("img", { name: "Demand ad creative", exact: true }).waitFor();
  assert.ok(await page.getByRole("columnheader", { name: "Creative", exact: true }).count());
  await page.getByRole("button", { name: "Select campaigns", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Demand A", exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Search campaigns", exact: true }).fill("Demand B");
  assert.equal(await page.getByRole("menuitemcheckbox").count(), 1);
  await page.getByRole("menuitemcheckbox", { name: "Demand B", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.getAll("campaignId").length === 2);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Show all", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.getAll("campaignId").length === 2);
  assert.ok(requests.some((url) => url.pathname.endsWith("demand-gen") && url.searchParams.getAll("campaignId").length === 2));
  const matrix = page.locator("section").filter({ has: page.getByRole("heading", { name: "Ad format × Device", exact: true }) }).last();
  await matrix.getByRole("row", { name: /Overall total/ }).waitFor();
  assert.ok((await matrix.getByRole("row").nth(1).innerText()).includes("8.33%"));
  assert.ok((await matrix.getByRole("row").nth(1).innerText()).includes("33.33%"));
  assert.ok((await matrix.getByRole("row").last().innerText()).includes("1,200"));
  const before = demandRequests;
  await page.getByRole("combobox", { name: "Metric", exact: true }).click();
  await page.getByRole("option", { name: "CTR (%)", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("metric") === "ctr");
  assert.equal(demandRequests, before);
  await page.screenshot({ path: "tmp/demand-improvements-desktop.png", fullPage: true });
  await downloadPdf("demand-improvements");
  assert.equal(new URL(page.url()).searchParams.getAll("campaignId").length, 2);
  assert.equal(new URL(page.url()).searchParams.get("metric"), "ctr");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: "tmp/demand-improvements-mobile.png", fullPage: true });
  await downloadPdf("demand-improvements-mobile");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "mobile layout restores after export");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${base}/campaign-breakdown?metaAccountId=96906550&platform=meta&startDate=2026-09-01&endDate=2026-09-30`);
  await page.getByRole("button", { name: "Expand Fixture campaign", exact: true }).waitFor();
  assert.equal(requests.filter((url) => url.pathname.includes("/ad-groups/") || url.pathname.includes("/campaigns/c/ad-groups")).length, 0);
  await page.getByRole("combobox", { name: "Filter comparison", exact: true }).click();
  await page.getByRole("option", { name: "Less than", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Filter value", exact: true }).fill("4");
  await page.getByRole("button", { name: "Apply value filter", exact: true }).click();
  await page.getByText("Historical ad", { exact: true }).waitFor();
  await page.getByRole("img", { name: "Historical ad creative", exact: true }).waitFor();
  const links = await page.getByRole("link", { name: "View ↗", exact: true }).evaluateAll((items) => items.map((item) => item.href));
  assert.ok(links.some((link) => link.includes("/manage/campaigns?") && link.includes("selected_campaign_ids=c")));
  assert.ok(links.some((link) => link.includes("/manage/adsets?") && link.includes("selected_adset_ids=s")));
  assert.ok(links.some((link) => link.includes("/manage/ads?") && link.includes("selected_ad_ids=a")));
  const campaignRow = page.getByRole("row").filter({ has: page.getByRole("button", { name: "Collapse Fixture campaign", exact: true }) });
  assert.ok((await campaignRow.innerText()).includes("50"), "ancestor retains its own spend");
  assert.ok((await page.getByRole("row").filter({ has: page.getByText("Historical ad", { exact: true }) }).last().innerText()).includes("3"));
  assert.equal(await page.getByRole("columnheader", { name: "Views", exact: true }).count(), 3);
  const stageRequestCount = () => requests.filter((url) => url.pathname.includes("/campaigns/c/ad-groups") || url.pathname.includes("/ad-groups/s/ads")).length;
  const previous = stageRequestCount();
  await page.getByRole("spinbutton", { name: "Filter value", exact: true }).fill("5");
  await page.getByRole("button", { name: "Apply value filter", exact: true }).click();
  await page.waitForURL((url) => JSON.parse(url.searchParams.get("valueFilter") || "{}").value === 5);
  await page.getByText("Historical ad", { exact: true }).waitFor();
  await page.getByRole("img", { name: "Historical ad creative", exact: true }).waitFor();
  assert.equal(stageRequestCount(), previous, "local value changes reuse loaded stages");
  await page.screenshot({ path: "tmp/breakdown-improvements-desktop.png", fullPage: true });
  await downloadPdf("breakdown-improvements");
  assert.ok(new URL(page.url()).searchParams.has("valueFilter"));
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: "tmp/breakdown-improvements-mobile.png", fullPage: true });
  await downloadPdf("breakdown-improvements-mobile");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "mobile layout restores after export");
  console.log("Improvement QA passed: multi-select, shares/totals, side-by-side charts, no presentation refetch, filtering unopened branches with retained ancestors, views, native PDF downloads, preserved state, mobile scrolling.");
} catch (error) { console.log((await page.locator("body").innerText()).slice(0, 6500)); throw error; }
finally { await browser.close(); }
