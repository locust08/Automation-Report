import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createAdvancedGeneration, snapshotAdvancedGeneration } from "../lib/reporting/advanced-report";
import { emptyCampaignRow, mergeCampaignRows } from "../lib/reporting/metrics";
import { buildDateRange } from "../lib/reporting/date";

async function main() {
const base = process.env.REPORT_QA_BASE_URL ?? "http://localhost:3107";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport:{width:1440,height:1000}, timezoneId:"Asia/Kuala_Lumpur" });
page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(120000);
const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
const longReason = "The clear e-invoice message and visible product interface explain the offer, while the reported RM71.96 CPA gives the team a useful benchmark for the next creative test without assuming a causal lift from the image alone.";
const png="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQ1cAAAAASUVORK5CYII=";
const payloadFor=(params:URLSearchParams)=>{
  const state=createAdvancedGeneration({accountId:params.get("accountId")??"1234567890",country:"MY",startDate:params.get("startDate")??"2026-09-01",endDate:params.get("endDate")??"2026-09-30"});
  state.companyName=state.accountId==="7777777777"?"Slow Account":"Fixture Ads";
  state.googleUsage.finalUrlRows=[{id:"url1",campaignIds:["A"],campaignNames:["Campaign A"],adGroupIds:[],adGroupNames:[],finalUrl:"https://example.com/landing?source=ads",cost:100,impressions:1000,clicks:100,conversions:10,impressionShare:null,lostImpressionShareBudget:null,lostImpressionShareRank:null,impressionShareSource:null}];
  state.googleVideoCreativeAnalysis={generatedAt:new Date().toISOString(),rows:[{id:"video1",finalUrl:"https://example.com/landing?source=ads",videoUrl:"https://www.youtube.com/watch?v=abcdefghijk",thumbnailUrl:base+"/fixture.png",youtubeVideoId:"abcdefghijk",campaignName:"Campaign A",adName:"Fixture video",headline:"Clear offer",description:"Video description",spend:100,impressions:1000,views:300,clicks:100,ctr:10,conversions:10,cpa:10,reasons:[longReason,"The reported clicks provide a benchmark.","The description explains the offer."],analysisSource:"metric_fallback",aiStatus:"skipped"}]};
  return snapshotAdvancedGeneration(state);
};
const requests:Array<{path:string;params:string}> = [];
await page.route("**/fixture.png",route=>route.fulfill({contentType:"image/png",body:Buffer.from(png,"base64")}));
await page.route("**youtube-nocookie.com/embed/**",route=>route.fulfill({contentType:"text/html",body:"<html><body>Fixture video player</body></html>"}));
await page.route("**/api/**",async route=>{
 const url=new URL(route.request().url()); requests.push({path:url.pathname,params:url.search});
 if(url.pathname==="/api/auth/session")return route.fulfill({json:{user:{role:"admin"}}});
 if(url.pathname==="/api/reporting/advanced") {
  const params=route.request().method()==="POST"?new URLSearchParams(route.request().postDataJSON()):url.searchParams;
  const payload=payloadFor(params);
  if(route.request().method()==="POST") {
    await new Promise(resolve=>setTimeout(resolve,1500));
    return route.fulfill({json:{status:"ready",cacheKey:"fixture",generationId:"fixture",nextCursor:null,payload,availableSections:["final-url-performance","google-video-creative"],steps:[{id:"video",label:"Video creative",status:"success"}]}});
  }
  return route.fulfill({json:{status:"generating",cacheKey:"fixture",generationId:"fixture",nextCursor:"video",payload,availableSections:["final-url-performance"],steps:[{id:"source",label:"Final URLs",status:"success"},{id:"video",label:"Video creative",status:"pending"}]}});
 }
 if(url.pathname.includes("/tiktok-insights")) return route.fulfill({status:503,json:{error:"Fixture TikTok unavailable"}});
 if(url.pathname.includes("/accounts/search"))return route.fulfill({json:{accounts:[]}});
 const filtered=url.searchParams.getAll("campaignNameFilterValue");
 const mode=url.searchParams.get("campaignNameFilterMode");
 const active=filtered.length===0?["A","B"]:["A","B"].filter(name=>mode==="exclude"?!filtered.includes("Campaign "+name):filtered.includes("Campaign "+name));
 const row=(name:string,scale=1)=>mergeCampaignRows(emptyCampaignRow(name,"google","Search","Campaign "+name),{...emptyCampaignRow(name,"google","Search","Campaign "+name),impressions:name==="A"?1000:2000,clicks:100*scale,spend:100*scale,results:10*scale,conversions:10*scale});
 const current=[row("A"),row("B",2)];const previous=[{...row("A"),spend:50,impressions:500},{...row("B",2),spend:100,impressions:1000}];
 if(url.pathname.endsWith("/summary"))return route.fulfill({json:{companyName:"Fixture Ads",dateRange:buildDateRange("2026-09-01","2026-09-30"),accountIds:{googleAccountId:"1234567890",googleAccountIds:["1234567890"],metaAccountId:null,metaAccountIds:[]},summaries:[{platform:"google",title:"Google Ads",logoPath:"/GoogleLogo.png",metrics:[{key:"spend",label:"Ads Spent",value:active.reduce((n,name)=>n+(name==="A"?100:200),0),previousValue:150,delta:100,format:"currency"}]}],warnings:[]}});
 if(url.pathname.endsWith("/campaign-performance"))return route.fulfill({json:{companyName:"Fixture Ads",dateRange:buildDateRange("2026-09-01","2026-09-30"),accountIds:{googleAccountId:"1234567890",googleAccountIds:["1234567890"],metaAccountId:null,metaAccountIds:[]},campaignGroups:[{id:"googleSearch",platform:"google",campaignType:"Search",rows:current,totals:current.reduce(mergeCampaignRows,emptyCampaignRow("total","google","Search","Grand Total")),previousRows:previous}],warnings:[]}});
 if(url.pathname.endsWith("/tables"))return route.fulfill({json:{companyName:"Fixture Ads",dateRange:buildDateRange("2026-09-01","2026-09-30"),accountIds:{googleAccountId:"1234567890",googleAccountIds:["1234567890"],metaAccountId:null,metaAccountIds:[]},audienceClickBreakdown:{age:[{platform:"google",dimension:"age",label:"25-34",clicks:active.reduce((n,name)=>n+(name==="A"?100:200),0)}],gender:[],location:{country:[],region:[],city:[]}},warnings:[]}});
 return route.fulfill({json:{accounts:[],warnings:[]}});
});
try {
 await page.goto(`${base}/advanced?googleAccountId=7777777777&platform=google&startDate=2026-09-01&endDate=2026-09-30`);
 await page.getByRole("heading",{name:"Final URL Destination Performance",exact:true}).waitFor();
 await page.goto(`${base}/advanced?googleAccountId=1234567890&platform=google&startDate=2026-09-01&endDate=2026-09-30`);
 await page.getByRole("heading",{name:"Final URL Destination Performance",exact:true}).waitFor();
 assert.equal(await page.locator('[data-advanced-report-ready="true"]').count(),0,"partial sections are not export-ready");
 await page.getByRole("heading",{name:"Google Video Creative Analysis",exact:true}).waitFor();
 await page.getByRole("heading",{name:"Fixture Ads | 1234567890",exact:true}).waitFor();
 await page.waitForTimeout(1700);
 assert.equal(await page.getByRole("heading",{name:/Slow Account/}).count(),0,"late source results cannot replace the selected account");
 assert.equal(await page.getByText("Advanced report",{exact:true}).count(),0);
 assert.equal(await page.getByText(longReason,{exact:true}).textContent(),longReason);
 await page.getByRole("button",{name:"Play creative video",exact:true}).click();
 await page.locator('iframe[title="Creative video preview"]').waitFor();
 assert.match(await page.locator('iframe[title="Creative video preview"]').getAttribute("src")??"",/youtube-nocookie.com\/embed\/abcdefghijk/);
 await page.getByRole("button",{name:"Close preview",exact:true}).click();
 assert.equal(await page.locator('a[href="https://example.com/landing?source=ads"]').count()>0,true);
 await page.getByRole("button",{name:"Open date range picker"}).click();
 await page.getByRole("combobox",{name:"Quick date range"}).click();
 await page.getByRole("option",{name:"Yesterday",exact:true}).click();
 await page.getByRole("button",{name:"Apply",exact:true}).click();
 await page.waitForURL(url=>url.searchParams.get("startDate")!=="2026-09-01");
 assert.equal(new URL(page.url()).searchParams.get("startDate"),new URL(page.url()).searchParams.get("endDate"));
 await page.getByRole("heading",{name:"Google Video Creative Analysis",exact:true}).waitFor();
 await page.screenshot({path:"artifacts/dashboard-fixes/advanced-desktop.png",fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,"mobile report stays inside viewport");
 assert.equal(await page.evaluate(() => Array.from(document.querySelectorAll("header button, [data-report-export-header] button")).filter(button => (button as HTMLElement).offsetParent !== null).every(button => {
   const bounds = button.getBoundingClientRect(); return bounds.right <= innerWidth && bounds.left >= 0;
 })), true, "mobile header buttons are not clipped");
 await page.screenshot({path:"artifacts/dashboard-fixes/advanced-mobile.png",fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 const download=page.waitForEvent("download",{timeout:120000});
 await page.getByRole("button",{name:"Report",exact:true}).first().click();
 await page.getByRole("menuitem",{name:"Download PDF",exact:true}).click();
 const file=await download;await file.saveAs("artifacts/dashboard-fixes/advanced.pdf");assert.equal(await file.failure(),null);
 const pdf=await readFile("artifacts/dashboard-fixes/advanced.pdf","latin1");
 assert.ok(pdf.includes("/URI (https://example.com/landing?source=ads)"));
 assert.ok(pdf.includes("/URI (https://www.youtube.com/watch?v=abcdefghijk)"));
 await page.goto(`${base}/overall?googleAccountId=1234567890&platform=google&startDate=2026-09-01&endDate=2026-09-30`);
 await page.getByRole("cell",{name:"Grand Total",exact:true}).waitFor();
 assert.ok((await page.getByRole("row").filter({has:page.getByRole("cell",{name:"Grand Total",exact:true})}).textContent())?.includes("+100.0%"));
 const filter=page.getByRole("button",{name:/^Campaign Filter/}).first();await filter.click();
 await page.getByRole("button",{name:"Campaign A",exact:true}).click();
 await page.getByRole("button",{name:"Apply Filter",exact:true}).click();
 await page.waitForURL(url=>url.searchParams.getAll("campaignNameFilterValue").includes("Campaign A"));
 await page.waitForTimeout(1200);
 assert.ok(requests.some(r=>r.path.endsWith("/summary")&&r.params.includes("campaignNameFilterValue=Campaign+A")));
 assert.ok(requests.some(r=>r.path.endsWith("/tables")&&r.params.includes("campaignNameFilterValue=Campaign+A")));
 assert.equal(await page.getByRole("cell",{name:"Campaign B",exact:true}).count(),0);
 await page.getByText("100.00",{exact:true}).filter({visible:true}).first().waitFor();
 await page.getByRole("heading",{name:"Age Breakdown",exact:true}).scrollIntoViewIfNeeded();
 await page.locator('[aria-label="25-34: 100 clicks"]').waitFor();
 await page.screenshot({path:"artifacts/dashboard-fixes/filtered-monthly.png",fullPage:true});
 await filter.click();
 await page.getByRole("button",{name:"Remove Campaign A",exact:true}).click();
 await page.getByRole("button",{name:"Campaign B",exact:true}).click();
 await page.getByRole("button",{name:"Apply Filter",exact:true}).click();
 await page.waitForURL(url=>url.searchParams.getAll("campaignNameFilterValue").includes("Campaign B"));
 await page.getByText("200.00",{exact:true}).filter({visible:true}).first().waitFor();
 await page.locator('[aria-label="25-34: 200 clicks"]').waitFor();
 await filter.click();
 await page.locator("form").filter({has:page.getByText("Campaign name",{exact:true})}).getByRole("combobox").click();
 await page.getByRole("option",{name:"Does not include",exact:true}).click();
 await page.getByRole("button",{name:"Apply Filter",exact:true}).click();
 await page.waitForURL(url=>url.searchParams.get("campaignNameFilterMode")==="exclude");
 await page.getByText("100.00",{exact:true}).filter({visible:true}).first().waitFor();
 await page.getByRole("button",{name:"Reset",exact:true}).last().click();
 await page.waitForURL(url=>!url.searchParams.has("campaignNameFilterValue"));
 await page.getByRole("cell",{name:"Campaign B",exact:true}).waitFor();
 await page.getByText("300.00",{exact:true}).filter({visible:true}).first().waitFor();
 for(const platform of ["meta","tiktok"]) {
  await page.goto(`${base}/advanced?${platform}AccountId=${platform==="meta"?"123456789012":"1234567890123"}&platform=${platform}&startDate=2026-09-01&endDate=2026-09-30`);
  await page.getByRole("button",{name:"Open date range picker"}).click();
  await page.getByText("Select date range",{exact:true}).waitFor();
 }
 assert.deepEqual(errors,[]);
 await writeFile("artifacts/dashboard-fixes/browser.json",JSON.stringify({result:"passed",scenarios:["progressive readiness","account title","complete reasons","video player","safe links","date preset","mobile","PDF URI annotations","monthly filter scope and clearing","grand total deltas","Meta/TikTok datepicker"],requests:requests.length},null,2));
 console.log("Browser and PDF fixture checks passed");
} finally { await browser.close(); }

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
