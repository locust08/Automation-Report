// Verify the serialized export, where font embedding can change text width.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.REPORT_QA_BASE_URL ?? "http://localhost:3105";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.setDefaultNavigationTimeout(120000);
let populated = false;
const audienceRows = (labels) => populated ? labels.map((label, index) => ({ label, clicks: 100 + index, platform: "meta" })) : [];
await page.route("**/api/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  const payload = path === "/api/auth/session" ? { user: { role: "admin" } } : {
    companyName: "Audience export fixture",
    dateRange: { startDate: "2026-09-01", endDate: "2026-09-30", previousStartDate: "2026-08-01", previousEndDate: "2026-08-31", currentLabel: "September 2026", previousLabel: "August 2026" },
    accountIds: { metaAccountId: "96906550", metaAccountIds: ["96906550"], googleAccountId: null, googleAccountIds: [] },
    summaries: [], campaignGroups: [], warnings: [], diagnostics: [],
    audienceClickBreakdown: { age: audienceRows(["25–34", "35–44"]), gender: audienceRows(["Male", "Female"]), location: { country: audienceRows(["Malaysia"]), region: audienceRows(["Wilayah Persekutuan Kuala Lumpur", "Selangor"]), city: [] } },
  };
  await route.fulfill({ json: payload });
});

try {
  for (const hasData of [false, true]) {
    populated = hasData;
    await page.goto(`${base}/overall?metaAccountId=96906550&platform=meta&startDate=2026-09-01&endDate=2026-09-30`);
    await page.getByRole("heading", { name: "Age Breakdown", exact: true }).waitFor();
    // Observe the SVG passed to the real rasterizer without changing export behavior.
    await page.evaluate(() => {
      const serialize = XMLSerializer.prototype.serializeToString;
      XMLSerializer.prototype.serializeToString = function (node) {
        const result = serialize.call(this, node);
        if (result.includes("foreignObject")) window.audienceExportSvg = result;
        return result;
      };
    });
    await page.getByRole("button", { name: "Report", exact: true }).click();
    const downloadPromise = page.waitForEvent("download", { timeout: 120000 });
    await page.getByRole("menuitem", { name: "Download PNG", exact: true }).click();
    const download = await downloadPromise;
    await download.saveAs(`tmp/audience-export-${hasData ? "populated" : "empty"}.png`);
    const svg = await page.evaluate(() => window.audienceExportSvg);
    assert.ok(svg, "the actual export SVG was captured");
    const exported = await browser.newPage({ viewport: { width: 1920, height: 2400 } });
    await exported.setContent(svg);
    await exported.evaluate(() => document.fonts.ready);
    const headings = await exported.locator("h3").evaluateAll((elements) => elements.map((heading) => {
      const range = document.createRange(); range.selectNodeContents(heading);
      return { title: heading.textContent, textBottom: range.getBoundingClientRect().bottom, captionTop: heading.nextElementSibling.getBoundingClientRect().top };
    }));
    assert.equal(headings.length, 3);
    for (const heading of headings) assert.ok(heading.textBottom <= heading.captionTop, `${heading.title} text must end above its caption in the serialized export`);
    await exported.close();
    await page.waitForURL((url) => !url.searchParams.has("screenshot"), { timeout: 30000 });
    await page.getByRole("button", { name: "Report", exact: true }).click();
    const pdfPromise = page.waitForEvent("download", { timeout: 120000 });
    await page.getByRole("menuitem", { name: "Download PDF", exact: true }).click();
    const pdf = await pdfPromise;
    await pdf.saveAs(`tmp/audience-export-${hasData ? "populated" : "empty"}.pdf`);
    assert.equal(await pdf.failure(), null);
  }
  console.log("Audience export QA passed: empty/populated headings remain above captions in actual serialized exports; PNG/PDF downloads complete.");
} finally {
  await browser.close();
}
