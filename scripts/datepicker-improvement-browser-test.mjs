import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = process.env.REPORT_QA_BASE_URL ?? 'http://localhost:3000';
await mkdir('artifacts/datepicker-improvement', { recursive: true });
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
for (const timezoneId of ['Asia/Kuala_Lumpur','America/Los_Angeles']) {
const page = await browser.newPage({viewport:{width:1440,height:900},timezoneId});
await page.clock.setFixedTime(new Date('2026-10-27T04:00:00Z'));
await page.route('**/api/**', route => {
 const path = new URL(route.request().url()).pathname;
 if(path==='/api/user/report-display-preferences') return route.fulfill({json:{preferences:{overall:true,campaign:true,advanced:true}}});
 const dateRange = {startDate:'2026-10-19',endDate:'2026-10-26',previousStartDate:'2026-10-11',previousEndDate:'2026-10-18',currentLabel:'October 2026',previousLabel:'Previous period'};
 return route.fulfill({json:path==='/api/auth/session'?{user:{role:'admin'}}:path.includes('accounts/search')?{accounts:[]}:{companyName:'Date picker fixture',dateRange,accountIds:{metaAccountId:'96906550',googleAccountId:null,metaAccountIds:['96906550'],googleAccountIds:[]},summaries:[],campaignGroups:[],warnings:[],diagnostics:[],audienceClickBreakdown:{age:[],gender:[],location:{country:[],region:[],city:[]}}}});
});
await page.goto(`${base}/overall?metaAccountId=96906550&startDate=2026-10-19&endDate=2026-10-26`,{timeout:120000});
const trigger=page.getByRole('button',{name:'Open date range picker'});
await trigger.click();
const popup=page.locator('[data-report-date-picker]');
await popup.waitFor();
const day=n=>popup.locator('.rdp-month').first().getByRole('button',{name:new RegExp(`October ${n}(st|nd|rd|th), 2026`)});
await day(10).click();
assert.equal(await popup.locator('[data-selected-single="true"]').count(),1);
assert.equal(await popup.locator('[data-range-end="true"]').count(),0);
assert.equal(await popup.locator('[data-range-middle="true"]').count(),0);
assert.match(await popup.innerText(),/Oct 10, 2026.*\n.*Select end date/s);
assert.ok(await popup.getByRole('button',{name:'Apply',exact:true}).isDisabled());
await day(15).click();
assert.equal(await popup.locator('[data-range-middle="true"]').count(),4);
await day(20).click();
assert.equal(await popup.locator('[data-range-middle="true"]').count(),0);
await day(18).click();
assert.match(await popup.innerText(),/Oct 18, 2026/);
await day(18).click();
assert.ok(await popup.getByRole('button',{name:'Apply',exact:true}).isEnabled());
await popup.getByRole('button',{name:'Apply',exact:true}).click();
await page.waitForURL(u=>u.searchParams.get('startDate')==='2026-10-18'&&u.searchParams.get('endDate')==='2026-10-18');
for(const width of [320,390,767,782,1440]) {
 await page.setViewportSize({width,height:900});
 await trigger.click();
 await popup.waitFor();
 await page.waitForTimeout(150);
 assert.equal(await popup.locator('.rdp-month').count(),width<768?1:2);
 const bounds=await popup.boundingBox();
 assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width+1,JSON.stringify({width,bounds}));
 assert.ok(await popup.evaluate(n=>n.scrollWidth<=n.clientWidth+1),JSON.stringify(await popup.evaluate(n=>({width:innerWidth,client:n.clientWidth,scroll:n.scrollWidth,children:[...n.querySelectorAll('*')].filter(c=>c.getBoundingClientRect().right>n.getBoundingClientRect().right).map(c=>({tag:c.tagName,cls:c.className,width:c.getBoundingClientRect().width}))}))));
 if(timezoneId==='Asia/Kuala_Lumpur') await page.screenshot({path:`artifacts/datepicker-improvement/${width}.png`});
 await popup.getByRole('button',{name:'Cancel',exact:true}).click();
}
await trigger.click();
await popup.getByRole('combobox',{name:'Quick date range'}).click();
await page.getByRole('option',{name:'Last 7 days',exact:true}).click();
assert.ok(await popup.isVisible());
assert.equal(await popup.locator('[data-range-middle="true"]').count(),5);
await page.keyboard.press('Escape');
await popup.waitFor({state:'hidden'});
await page.close();
console.log(`PASS ${timezoneId}: replacement range, earlier restart, same-day apply, responsive bounds, presets, Escape`);
}
} finally { await browser.close(); }
