// Read-only UI QA against a running dev server, with synthetic API fixtures.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.REPORT_QA_BASE_URL ?? "http://localhost:3000";
await mkdir("tmp", { recursive: true });
const compactPdf = process.env.REPORT_QA_COMPACT_PDF === "1";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.setDefaultNavigationTimeout(120000);
page.on("pageerror", (error) => console.error("UI error:", error.message));
const values = { impressions: 100, views: 100, clicks: 10, spend: 5, conversions: 2, ctr: 10, cpc: .5, cpm: 50 };
const creativeUrl = await page.evaluate(() => {
  const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 160;
  const context = canvas.getContext("2d");
  context.fillStyle = "#f9cf58"; context.fillRect(0,0,320,160);
  context.fillStyle = "#e10600"; context.fillRect(0,0,40,160);
  context.fillStyle = "#315ac4"; context.fillRect(280,0,40,160);
  context.fillStyle = "#171717"; context.font = "24px Arial"; context.fillText("Creative fixture",65,90);
  return canvas.toDataURL("image/png");
});
const demand = { account: { id: "1234567890", name: "Fixture Google", currency: "MYR", timezone: "Asia/Kuala_Lumpur" }, startDate: "2026-09-01", endDate: "2026-09-30", campaigns: [{ id: "1", name: "Demand A" }, { id: "2", name: "Demand B" }], campaignId: "1", ads: [{ id: "ad1", name: "Demand ad", campaignName: "Demand A", imageUrls: [creativeUrl], metrics: values }], inMarket: [{ id: "i", name: "Furniture", metrics: values }], affinity: [{ id: "a", name: "Home enthusiasts", metrics: values }], cells: ["In-feed", "In-stream", "Shorts"].flatMap((format) => ["Desktop", "Mobile", "Tablet", "TV"].map((device) => ({ format, device, metrics: values }))), unmapped: [], unresolved: [], warnings: [], complete: true };
let flakyImageRequests = 0;
if (compactPdf) {
  const original = demand.ads[0];
  demand.ads = Array.from({length:12}, (_,index) => ({
    ...original, id: `ad${index}`,
    name: index === 1 ? "A long ad name that must wrap without overlapping its creative or numeric performance values" : `Demand ad ${index}`,
    campaignName: index % 2 ? "Demand B" : "Demand A",
    imageUrls: [index === 2 ? "data:image/png;base64,broken" : creativeUrl],
    selectedCreative: {previewUrl:index === 2 ? "data:image/png;base64,broken" : creativeUrl, selection:"top_performing", metrics:{...values, spend:2.34}},
  }));
}
await page.route("**/fixture-expiring-creative.png", async route => {
  flakyImageRequests++;
  if (flakyImageRequests > 2) return route.fulfill({status:404,body:"Thumbnail expired"});
  await route.fulfill({contentType:"image/png",body:Buffer.from(creativeUrl.split(",")[1],"base64"),headers:{"Access-Control-Allow-Origin":"*"}});
});
const dateRange = { startDate: "2026-09-01", endDate: "2026-09-30", previousStartDate: "2026-08-01", previousEndDate: "2026-08-31", currentLabel: "September 2026", previousLabel: "August 2026" };
demand.inMarket.push(...Array.from({ length: 11 }, (_, index) => ({ id: `i${index}`, name: `Interest ${String(index).padStart(2, "0")}`, metrics: values })));
const campaign = { id: "c", platform: "meta", campaignType: "Lead", campaignName: "Fixture campaign", resultActionType: "lead", resultLabel: "Lead", impressions: 1000, videoViews: 500, clicks: 100, spend: 50, results: 20, ctr: 10, cpm: 50, costPerResult: 2.5, conversions: 20, avgCpc: .5, youtubeEarnedLikes: 0, youtubeEarnedShares: 0 };
const overall = { companyName: "Fixture", dateRange, accountIds: { metaAccountId: "96906550", googleAccountId: null, metaAccountIds: ["96906550"], googleAccountIds: [] }, summaries: [], campaignGroups: [{ id: "meta-lead", platform: "meta", campaignType: "Lead", rows: [campaign], totals: campaign }], warnings: [], diagnostics: [], audienceClickBreakdown: { age: [], gender: [], location: { country: [], region: [], city: [] } } };
const performance = { resultLabel: "Lead", results: 2, impressions: 1489660, videoViews: 1463361, clicks: 10, spend: 2228.44, ctr: 10, cpm: 50, cpc: .5, costPerResult: 2.5, landingPageViews: 0, linkClicks: 0 };
let demandRequests = 0, failHierarchy = false, partialHierarchy = false;
let sessionRole = "admin";
const requests = [];
await page.route("**/api/**", async (route) => {
  const url = new URL(route.request().url()); requests.push(url);
  let data = {};
  if (url.pathname.includes("tiktok-insights")) return route.fulfill({ status: 503, json: { error: "Fixture insights unavailable" } });
  if (url.pathname === "/api/auth/session") data = { user: { role: sessionRole } };
  else if (url.pathname === "/api/reporting/demand-gen") { demandRequests++; data = { ...demand, campaignId: url.searchParams.get("campaignId") }; }
  else if (url.pathname.includes("/ad-groups") || url.pathname.includes("/ads")) {
    if (failHierarchy) return route.fulfill({ status: 503, json: { error: "Fixture retry failure" } });
    data = { ...overall, sections: [{ platform: "meta", campaigns: [{ id: "c", name: "Fixture campaign", status: "Paused", details: [], children: [{ id: "s", name: "Historical set", status: "Paused", details: [], performance, ads: Array.from({length:process.env.REPORT_QA_BREAKDOWN_SCOPE === "1" ? 25 : 1},(_,index)=>({ id: index ? `a${index}` : "a", name: `Historical ad${index ? ` ${index}` : ""}`, status: "Paused", details: [], creative: { id: "creative1", imageUrl: creativeUrl }, performance: { ...performance, spend: 3, results: 1 } })) }] }] }], warnings: partialHierarchy ? ["Fixture partial coverage"] : [] };
  } else if (url.pathname.includes("/api/reports/") || url.pathname === "/api/reporting") data = url.searchParams.get("googleAccountId") ? { ...overall, accountIds: { metaAccountId: null, metaAccountIds: [], googleAccountId: "1234567890", googleAccountIds: ["1234567890"] }, campaignGroups: [{ ...overall.campaignGroups[0], id: "google-search", platform: "google", campaignType: "Search", rows: [{ ...campaign, platform: "google", campaignType: "Search", campaignName: "Google campaign only" }] }] } : overall;
  else if (url.pathname.endsWith("/final-url-performance")) data = { section: { rows: [{ id: "url", campaign: "Demand Gen campaign with a readable name", finalUrl: "https://example.com/landing-page?utm_source=google&utm_campaign=demand-gen", spend: 2007.59, impressions: 289568, clicks: 21237, conversions: 1256, ctr: 7.33, cpc: .09, cpa: 1.60, conversionRate: 5.92 }], otherRow: null, totalUrlCount: 1 }, warnings: [] };
  else if (url.pathname.includes("/advanced") || url.pathname === "/api/reporting/advanced") return route.fulfill({ status: 503, json: { error: "Fixture analysis unavailable" } });
  else if (url.pathname.includes("/accounts/search")) data = { accounts: [] };
  if (compactPdf && data.sections) {
    const children = data.sections[0].campaigns[0].children;
    children[0].ads[1].name = "A long historical ad name that wraps alongside the image and preserves the full performance row";
    children[0].ads[2].creative.imageUrl = "data:image/png;base64,broken";
    children.push({...children[0], id:"s2", name:"Another historical set", ads:[{...children[0].ads[0], id:"other-ad", performance:{...performance, clicks:20, spend:4}}]});
  }
  if (url.searchParams.get("platform") === "tiktok") {
    data = JSON.parse(JSON.stringify(data).replaceAll('"meta"', '"tiktok"').replaceAll('"Paused"', '"ENABLE"'));
  }
  if (url.pathname.includes("/api/reports/") && url.searchParams.get("googleAccountId")) await new Promise((resolve) => setTimeout(resolve, 1500));
  await route.fulfill({ json: data });
});

async function downloadPdf(file) {
  await page.evaluate(() => {
    window.customPdfObserver?.disconnect();
    window.customPdfStructure=null;
    window.customPdfObserver=new MutationObserver(() => {
      const host=document.querySelector('.custom-report-pdf');
      if(!host) return;
      const pages=Array.from(host.querySelectorAll('[data-custom-pdf-page]'));
      if(!pages.length) return;
      window.customPdfStructure={
        pages:pages.length,
        introNotes:pages[0].querySelector('.pdf-section')?.querySelectorAll('p').length ?? 0,
        fits:pages.every(page => {const body=page.querySelector('.pdf-body'); return body.scrollHeight<=body.clientHeight+1;}),
        tableImages:host.querySelectorAll('table img').length,
        adRows:Array.from(host.querySelectorAll('[data-pdf-ad-label]')).map(row => ({label:row.dataset.pdfAdLabel, text:row.textContent, page:Number(row.closest('[data-custom-pdf-page]').dataset.customPdfPage)})),
        headers:Array.from(host.querySelectorAll('thead')).map(head=>head.textContent),
        creatives:host.querySelectorAll('figure').length,
        text:host.textContent,
        layoutSafe:pages.every(page=>Array.from(page.querySelectorAll('.pdf-section')).every(section=>{
          const heading=section.querySelector('h2'), table=section.querySelector('table');
          return !heading || !table || heading.getBoundingClientRect().bottom<=table.getBoundingClientRect().top;
        })),
        numericFits:Array.from(host.querySelectorAll('td:not(:first-child):not(.pdf-creative-cell)')).every(cell=>cell.scrollWidth<=cell.clientWidth+1),
        dashboardDesign:pages.every(page=>getComputedStyle(page.querySelector('.pdf-header')).backgroundImage.includes('headerbackground.png') && Array.from(page.querySelectorAll('.pdf-section')).every(section=>parseFloat(getComputedStyle(section).borderRadius)>=20)),
        thumbnailsFit:Array.from(host.querySelectorAll('table img')).every(image=>image.clientWidth===112 && image.clientHeight===84 && getComputedStyle(image).objectFit==="contain"),
      };
    });
    window.customPdfObserver.observe(document.body,{childList:true,subtree:true});
  });
  await page.getByRole("button", { name: "Report", exact: true }).click();
  const downloadPromise = page.waitForEvent("download", { timeout: file.includes("long") ? 300000 : 120000 });
  void downloadPromise.catch(() => undefined);
  await page.getByRole("menuitem", { name: "Download PDF", exact: true }).click();
  if (file.startsWith("demand") || file.startsWith("breakdown")) {
    await page.waitForFunction(() => window.customPdfStructure);
    const structure = await page.evaluate(() => window.customPdfStructure);
    assert.ok(structure.pages > 0 && structure.fits, 'complete custom pages fit their printable area');
    assert.ok(structure.adRows.length > 0, 'ads appear in performance table rows');
    assert.ok(structure.layoutSafe,"wrapped headings stay above tables");
    assert.ok(structure.numericFits,"numeric values fit without wrapping or clipping");
    assert.ok(structure.dashboardDesign,"dashboard header and styled cards preserved in composed pages");
    assert.ok(structure.tableImages > 0, 'performance tables include selected creative images');
    assert.ok(structure.thumbnailsFit, 'selected thumbnails use uncropped 112 by 84 boxes');
    assert.ok(structure.headers.some(header => header.includes('Creative')));
    assert.ok(structure.headers.every(header => !header.includes('Actions')));
  }  const download = await downloadPromise;
  await download.saveAs(`tmp/${file}.pdf`);
  assert.equal(await download.failure(), null);
  if (file.startsWith("demand") || file.startsWith("breakdown")) {
    const contents = await readFile(`tmp/${file}.pdf`, "latin1");
    const boxes = [...contents.matchAll(/\/MediaBox \[([^\]]+)\]/g)].map(match => match[1].trim().split(/\s+/).map(Number));
    assert.ok(boxes.length > 0, "standalone export contains pages");
    assert.ok(boxes.every(([x,y,w,h]) => x === 0 && y === 0 && Math.abs(w-595.28)<1 && Math.abs(h-841.89)<1), "every page is A4 portrait");
  }
  await page.waitForURL((url) => !url.searchParams.has("screenshot"), { timeout: 30000 });
}
try {
  await page.goto(`${base}/demand-gen?googleAccountId=1234567890&platform=google&startDate=2026-09-01&endDate=2026-09-30`);
  await page.getByRole("cell", { name: "Furniture", exact: true }).waitFor();
  if (compactPdf) {
    await downloadPdf("demand-compact");
    const demandPdf = await page.evaluate(() => window.customPdfStructure);
    assert.equal(new Set(demandPdf.adRows.map(row=>row.label)).size,12);
    assert.ok(demandPdf.pages < 12, "several ads share pages");
    assert.ok(demandPdf.adRows.some((row,index,rows)=>index && row.page===rows[index-1].page), "adjacent ads share a page");
    assert.ok(demandPdf.text.includes("Creative image unavailable"));
    assert.ok(demandPdf.text.includes("Asset spend: RM 2.34") && demandPdf.text.includes("Top-performing creative"));
    const previewPromise = page.waitForEvent("download");
    await page.getByRole("button", {name:"Preview PDF",exact:true}).click();
    await page.getByRole("dialog", {name:"PDF preview",exact:true}).waitFor({timeout:180000});
    const images = await page.locator('img[alt^="PDF preview page"]').evaluateAll(images=>images.map(image=>image.src));
    await writeFile("tmp/compact-demand-ad-page.png", Buffer.from(images.at(-1).split(",")[1],"base64"));
    await page.getByRole("button",{name:"Download PDF",exact:true}).click();
    await (await previewPromise).saveAs("tmp/demand-compact-preview.pdf");
    await page.getByRole("button",{name:"Close preview",exact:true}).click();
    await page.goto(`${base}/campaign-breakdown?metaAccountId=96906550&platform=meta&startDate=2026-09-01&endDate=2026-09-30`);
    await page.getByRole("button",{name:"Expand Fixture campaign",exact:true}).waitFor();
    await downloadPdf("breakdown-compact");
    const breakdownPdf = await page.evaluate(() => window.customPdfStructure);
    assert.equal(new Set(breakdownPdf.adRows.map(row=>row.label)).size,26);
    assert.equal(breakdownPdf.adRows.length,52,"each ad keeps all metrics across two groups");
    assert.ok(breakdownPdf.pages < 26,"breakdown ads share pages");
    assert.equal(breakdownPdf.introNotes,0,"creative metadata stays out of report scope");
    assert.ok(breakdownPdf.text.includes("Historical set") && breakdownPdf.text.includes("Ads total"));
    assert.ok(breakdownPdf.text.includes("Another historical set") && breakdownPdf.text.includes("Creative image unavailable"));
    assert.equal(breakdownPdf.adRows.filter(row=>row.label.includes("Another historical set")).length,2,"same-named ads stay in their ad set context");
    assert.ok(breakdownPdf.headers.some(header=>header.includes("Cost/Results")),"last metric group retained");
    await page.getByRole("button",{name:"Preview PDF",exact:true}).click();
    await page.getByRole("dialog",{name:"PDF preview",exact:true}).waitFor({timeout:240000});
    const previews = await page.locator('img[alt^="PDF preview page"]').evaluateAll(images=>images.map(image=>image.src));
    await writeFile("tmp/compact-breakdown-ad-page.png", Buffer.from(previews.at(-1).split(",")[1],"base64"));
    await page.getByRole("button",{name:"Close preview",exact:true}).click();
    assert.equal(await page.locator(".custom-report-pdf").count(),0,"temporary composition cleaned up");
    console.log(JSON.stringify({demandPages:demandPdf.pages, breakdownPages:breakdownPdf.pages, demandAds:12, breakdownAds:26}));
    await browser.close(); process.exit(0);
  }
  if (process.env.REPORT_QA_BREAKDOWN_SCOPE === "1") {
    await page.goto(`${base}/campaign-breakdown?metaAccountId=96906550&platform=meta&startDate=2026-09-01&endDate=2026-09-30`);
    await page.getByRole('button',{name:'Expand Fixture campaign',exact:true}).waitFor();
    await downloadPdf('breakdown-scope-regression');
    const output=await page.evaluate(()=>window.customPdfStructure);
    assert.equal(new Set(output.adRows.map(row=>row.label)).size,25,'all ads exported');
    assert.equal(output.introNotes,0,'ad creative captions do not leak into report scope');
    console.log('Breakdown scope regression passed');
    await browser.close(); process.exit(0);
  }
  if (process.env.REPORT_QA_CREATIVE_SELECTION === "1") {
    demand.ads[0].imageUrls=Array.from({length:6},(_,index)=>`${creativeUrl}#${index}`);
    demand.ads[0].selectedCreative={assetId:"2",assetResource:"customers/1234567890/assets/2",kind:"image",previewUrl:`${creativeUrl}#selected`,metrics:{...values,spend:2.34},performanceComplete:true,selection:"top_performing"};
    await page.goto(`${base}/demand-gen?googleAccountId=1234567890&platform=google&startDate=2026-09-01&endDate=2026-09-30&metric=views`);
    const ads=page.locator('[data-slot="card"]').filter({has:page.getByRole('heading',{name:'Ads',exact:true})});
    await ads.getByText('Asset spend: RM 2.34',{exact:true}).waitFor();
    assert.equal(await ads.getByRole('img').count(),1,'single selected preview on dashboard');
    assert.ok((await ads.getByRole('img').getAttribute('src')).endsWith('#selected'),'selected asset identity retained');
    assert.equal(await ads.getByRole('columnheader',{name:'Views',exact:true}).count(),0);
    assert.equal(await ads.getByRole('button',{name:'Impressions',exact:true}).count(),1);
    assert.equal(await ads.getByText('RM 5.00',{exact:true}).count(),1,'ad spend stays separate');
    await page.route('**/locus-t-logo-25.png',route=>route.fulfill({status:404,body:'Fixture footer logo unavailable'}));
    await downloadPdf('demand-selected-creative');
    const pdf=await page.evaluate(()=>window.customPdfStructure);
    assert.equal(pdf.creatives,1);
    assert.ok(pdf.text.includes('Asset spend: RM 2.34') && pdf.text.includes('Ad spend') && pdf.text.includes('RM 5.00'));
    assert.ok(pdf.text.includes('Top-performing creative') && !pdf.text.includes('Creative 1 of'));
    assert.ok(pdf.fits && pdf.text.includes('LOCUS-T SDN BHD'),'failed footer logo preserves bounded fallback and page numbering');
    await page.setViewportSize({width:390,height:844});
    await downloadPdf('demand-selected-creative-mobile');
    assert.equal(await ads.getByRole('img').count(),1,'export restores single screen preview');
    console.log('Creative QA passed: legacy metric links, one selected image, ad/asset spend parity, portrait styled pages and mobile restoration.');
    await browser.close(); process.exit(0);
  }
  if (process.env.REPORT_QA_AD_SORT === "1") {
    const original=demand.ads[0];
    demand.ads=[{...original,id:"a",name:"Ten",metrics:{...values,clicks:10,ctr:10,cpc:10,impressions:10,spend:10}}, { ...original,id:"b",name:"Zero",metrics:{...values,clicks:0,ctr:0,cpc:0,impressions:0,spend:0}}, {...original,id:"c",name:"Unavailable",metrics:{...values,clicks:null,ctr:null,cpc:null,impressions:null,spend:null}}];
    await page.reload();
    const card=page.locator('[data-slot="card"]').filter({has:page.getByRole("heading",{name:"Ads",exact:true})});
    await card.getByRole("cell",{name:"Unavailable",exact:true}).waitFor();
    const before=demandRequests;
    for(const metric of ["Clicks","CTR (%)","CPC","Impressions","Ad spend"]) {
      await card.getByRole("button",{name:metric,exact:true}).click();
      assert.deepEqual(await card.locator('tbody tr td:first-child').allTextContents(),["Ten","Zero","Unavailable"]);
      await card.getByRole("button",{name:`${metric} ↓`,exact:true}).click();
      assert.deepEqual(await card.locator('tbody tr td:first-child').allTextContents(),["Zero","Ten","Unavailable"]);
    }
    assert.equal(demandRequests,before,"sorting does not refetch data");
    await downloadPdf("demand-ad-sort");
    const exported=await page.evaluate(()=>window.customPdfStructure.adRows.map(row=>row.label));
    assert.ok(exported[0].includes("Zero") && exported[1].includes("Ten") && exported[2].includes("Unavailable"),"export preserves sorted ad order");
    assert.deepEqual(await card.locator('tbody tr td:first-child').allTextContents(),["Zero","Ten","Unavailable"]);
    console.log("Ads sorting QA passed: all metrics toggle, missing values last, no refetch, sorted export and restored screen.");
    await browser.close(); process.exit(0);
  }
  if (process.env.REPORT_QA_IMAGE_REFETCH === "1") {
    demand.ads[0].imageUrls = [`${base}/fixture-expiring-creative.png`];
    await page.reload();
    await page.getByRole("img", {name:"Demand ad creative",exact:true}).waitFor();
    await downloadPdf("demand-expiring-creative");
    assert.equal(flakyImageRequests,2,"loaded creative is not fetched again during page serialization");
    assert.ok(!(await page.evaluate(()=>window.customPdfStructure.text)).includes("Creative image unavailable"),"loaded creative retained");
    console.log("Image embedding QA passed: expiring remote creative retained without renderer refetch.");
    await browser.close(); process.exit(0);
  }
  if (process.env.REPORT_QA_EDGE_ONLY === "1") {
    demand.ads[0].imageUrls = Array.from({length:14},(_,i)=>`${creativeUrl}#${i}`);
    demand.ads.push({...demand.ads[0],id:"ad2",name:"Second distinct ad",imageUrls:[creativeUrl]});
    await page.reload();
    await page.getByRole("cell", {name:"Furniture",exact:true}).waitFor();
    await downloadPdf("demand-height");
    const overflow = await page.evaluate(()=>window.customPdfStructure);
    assert.equal(overflow.creatives,2,"one representative creative per ad");
    assert.equal(overflow.adRows.length,2,"both ads appear as table rows");
    assert.equal(overflow.adRows[0].page,overflow.adRows[1].page,"adjacent ads share a page");
    assert.ok(overflow.adRows.at(-1).label.includes("Second distinct ad"),"second ad keeps its identity");
    demand.inMarket = [];
    demand.affinity = [];
    demand.ads[0].name = "Long unavailable-metric creative name ".repeat(8);
    demand.ads[0].metrics = { ...values, cpc: null, views: null };
    demand.ads[0].imageUrls = ["data:image/png;base64,broken"];
    await page.goto(`${base}/demand-gen?googleAccountId=1234567890&platform=google&startDate=2026-09-01&endDate=2026-09-29`);
    await page.getByRole("heading", {name:"Ads",exact:true}).waitFor();
    await downloadPdf("demand-empty-null-long-label");
    assert.ok((await page.evaluate(()=>window.customPdfStructure.text)).includes("Creative image unavailable"),"failed creatives retain explicit placeholders");
    assert.equal(await page.locator(".custom-report-pdf").count(),0,"completed export removes temporary document");
    await page.getByRole("button", { name: "Report", exact: true }).click();
    const png = page.waitForEvent("download", {timeout:120000});
    await page.getByRole("menuitem", {name:"Download PNG",exact:true}).click();
    await (await png).saveAs("tmp/demand-unchanged-png.png");
    await page.waitForURL(url => !url.searchParams.has("screenshot"));
    assert.equal(await page.locator('[data-compact-pdf]').count(),0,"PNG never uses PDF compact styling");
    console.log("Edge QA passed: reduced capture height, empty interest panels, unavailable values and long creative name.");
    await browser.close();
    process.exit(0);
  }
  if (process.env.REPORT_QA_PREVIEW === "1") {
    let downloads = 0;
    page.on("download", () => downloads++);
    await page.evaluate(() => {
      window.originalPdfCanvasDataUrl = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = () => { throw new Error("Fixture raster failure"); };
    });
    await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
    await page.getByText("Could not render PDF page 1. Fixture raster failure", {exact:true}).waitFor({timeout:120000});
    await page.waitForURL(url => !url.searchParams.has("screenshot"));
    assert.equal(await page.locator('[data-compact-pdf], .custom-report-pdf').count(),0,"failed export restores styles and removes temporary document");
    await page.evaluate(() => { HTMLCanvasElement.prototype.toDataURL = window.originalPdfCanvasDataUrl; delete window.originalPdfCanvasDataUrl; });
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("dialog", { name: "PDF preview", exact: true }).waitFor({ timeout: 120000 });
    assert.equal(downloads, 0, "preview does not download automatically");
    assert.ok(await page.getByAltText("PDF preview page 1", { exact: true }).isVisible());
    await page.screenshot({ path: "tmp/admin-portrait-pdf-preview.png" });
    const previewImages = await page.locator('img[alt^="PDF preview page"]').evaluateAll(images=>images.map(image=>image.src));
    await writeFile("tmp/portrait-analysis-page.png",Buffer.from(previewImages[0].split(",")[1],"base64"));
    await writeFile("tmp/portrait-ad-page.png",Buffer.from(previewImages.at(-1).split(",")[1],"base64"));
    const save = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF", exact: true }).click();
    await (await save).saveAs("tmp/admin-preview.pdf");
    await page.getByRole("button", { name: "Close preview", exact: true }).click();
    assert.equal(await page.locator('dialog[open], [data-compact-pdf]').count(),0);
    await page.waitForURL(url => !url.searchParams.has("screenshot"));
    sessionRole = "user";
    const userSession = page.waitForResponse(response => response.url().includes("/api/auth/session"));
    await page.reload();
    await page.getByRole("cell", { name: "Furniture", exact: true }).waitFor();
    await userSession;
    assert.equal(await page.getByRole("button", { name: "Preview PDF", exact: true }).count(),0);
    sessionRole = "admin";
    await page.reload();
    await page.getByRole("button", { name: "Preview PDF", exact: true }).waitFor();
    if (process.env.REPORT_QA_PREVIEW_ONLY === "1") {
      console.log("Preview QA passed: failure cleanup, retry intent, no automatic download, saved PDF, close and user-role visibility.");
      await browser.close();
      process.exit(0);
    }
  }
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
  assert.equal(await page.getByRole("button", { name: "Grouped chart", exact: true }).isVisible(), false);
  assert.equal(await page.getByRole("button", { name: "Ranked chart", exact: true }).first().isVisible(), false);
  await page.screenshot({ path: "tmp/demand-improvements-desktop.png", fullPage: true });
  await downloadPdf("demand-improvements");
  assert.equal(new URL(page.url()).searchParams.getAll("campaignId").length, 2);
  assert.equal(new URL(page.url()).searchParams.get("metric"), "ctr");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.getByRole("button", { name: "Ranked chart", exact: true }).first().click();
  assert.equal(await page.getByRole("cell", { name: "Furniture", exact: true }).isVisible(), false);
  await page.getByRole("button", { name: "Show table", exact: true }).click();
  await page.getByRole("cell", { name: "Furniture", exact: true }).waitFor();
  await page.getByRole("button", { name: "Grouped chart", exact: true }).click();
  assert.equal(await matrix.getByRole("table").isVisible(), false);
  await page.getByRole("button", { name: "Show matrix", exact: true }).click();
  await matrix.getByRole("table").waitFor();
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
  assert.ok((await page.evaluate(()=>window.customPdfStructure.text)).includes("Value filter:"), "PDF retains filter description");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: "tmp/breakdown-improvements-mobile.png", fullPage: true });
  await downloadPdf("breakdown-improvements-mobile");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "mobile layout restores after export");
  await page.goto(`${base}/campaign-breakdown?tiktokAccountId=96906550&platform=tiktok&startDate=2026-09-01&endDate=2026-09-30`);
  await page.getByRole("button", {name:"Expand Fixture campaign",exact:true}).waitFor();
  await downloadPdf("breakdown-tiktok");
  if (process.env.REPORT_QA_LONG_PDF === "1") {
    const originalAds = demand.ads;
    demand.ads = Array.from({ length: 100 }, (_, index) => ({ ...originalAds[0], id: `long-${index}`, name: index === 99 ? "FINAL AD 100" : `Ad ${index + 1}` }));
    await page.goto(`${base}/demand-gen?googleAccountId=1234567890&platform=google&startDate=2026-09-01&endDate=2026-09-29`);
    await page.getByText("FINAL AD 100", { exact: true }).waitFor();
    await downloadPdf("demand-long-compact");
    assert.equal(await page.locator('[data-compact-pdf]').count(), 0, "compact export mode restores");
    demand.ads = originalAds;
  }
  overall.companyName = "VTAR Education and Professional Training Centre";
  for (const route of ["overall", "campaign-breakdown", "demand-gen"]) {
    for (const width of [390, 782, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1080 });
      const account = route === "demand-gen" ? "googleAccountId=1234567890&platform=google" : "metaAccountId=96906550&platform=meta";
      await page.goto(`${base}/${route}?${account}&startDate=2026-09-01&endDate=2026-09-30`);
      await page.waitForFunction(() => document.querySelector('[data-report-export-title="true"]:not([aria-label])'));
      const typography = await page.evaluate(() => {
        const size = (element) => element ? parseFloat(getComputedStyle(element).fontSize) : null;
        const title = document.querySelector('[data-report-export-title="true"]');
        const date = document.querySelector('[data-report-export-date-control="true"]');
        return { root: size(document.documentElement), title: size(title), titleHeight: title.getBoundingClientRect().height,
          section: size(document.querySelector('h2')), table: size(document.querySelector('td')),
          nav: size(document.querySelector('nav a')), input: size(document.querySelector('input:not([type="checkbox"])')),
          titleBottom: title.getBoundingClientRect().bottom, dateTop: date?.getBoundingClientRect().top,
          overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert.equal(typography.root, 16);
      assert.equal(typography.title, width < 768 ? 24 : 32);
      assert.equal(typography.nav, 14);
      if (typography.section !== null) assert.equal(typography.section, width < 768 ? 20 : 24);
      if (typography.table !== null) assert.equal(typography.table, width < 768 ? 13 : 14);
      if (typography.input !== null) assert.equal(typography.input, width < 768 ? 16 : 14);
      assert.equal(typography.overflow, false);
      assert.ok(typography.titleHeight < 180, "long company titles wrap within a sensible height");
      if (width < 1024 && typography.dateTop !== undefined) assert.ok(typography.dateTop >= typography.titleBottom);
      if (width === 390) {
        const targets = await page.locator('nav a:visible, nav button:visible').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
        assert.ok(targets.every((height) => height >= 44), "mobile navigation retains touch targets");
        await page.screenshot({ path: `tmp/font-${route}-mobile.png`, fullPage: true });
        const datePicker = page.getByRole("button", { name: "Open date range picker", exact: true }).first();
        await datePicker.click();
        await page.locator('[data-slot="calendar"]:visible').waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "mobile date picker fits the viewport");
        assert.ok(await page.locator('[data-slot="calendar"]:visible button').evaluateAll((elements) => elements.every((element) => element.getBoundingClientRect().height >= 44)), "calendar retains mobile touch targets");
        await datePicker.click();
      }
    }
  }
  await page.goto(`${base}/overall?metaAccountId=96906550&platform=meta&startDate=2026-09-01&endDate=2026-09-30`);
  await page.getByRole("heading", { name: "Campaign Breakdown", exact: true }).waitFor();
  await downloadPdf("overall-font-standardizing");
  await page.goto(base);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("heading", { level: 1 }).waitFor();
  assert.equal(await page.getByRole("heading", { level: 1 }).evaluate((element) => parseFloat(getComputedStyle(element).fontSize)), 24);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "home dashboard remains mobile friendly");
  console.log("Font QA passed: global scale, long titles, mobile controls, home dashboard, and Overall PDF.");
  console.log("Improvement QA passed: multi-select, shares/totals, side-by-side charts, no presentation refetch, filtering unopened branches with retained ancestors, views, native PDF downloads, preserved state, mobile scrolling.");
} catch (error) { console.log((await page.locator("body").innerText()).slice(0, 6500)); throw error; }
finally { await browser.close(); }
