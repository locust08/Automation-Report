import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readComponent = (name) =>
  readFile(new URL(`./${name}`, import.meta.url), "utf8");

const readOverallRoute = (name) =>
  readFile(new URL(`../../app/overall/${name}`, import.meta.url), "utf8");

const [overall, shell, filters, picker, download, metrics, campaigns, audience, skeletons, routeSkeleton, routePage, routeLoading] = await Promise.all([
  readComponent("overall-page-client.tsx"),
  readComponent("report-shell.tsx"),
  readComponent("report-filters-bar.tsx"),
  readComponent("report-header-month-picker.tsx"),
  readComponent("screenshot-mode-toggle.tsx"),
  readComponent("metric-grid.tsx"),
  readComponent("campaign-table.tsx"),
  readComponent("audience-click-breakdown.tsx"),
  readComponent("overall-report-skeleton.tsx"),
  readComponent("overall-route-skeleton.tsx"),
  readOverallRoute("page.tsx"),
  readOverallRoute("loading.tsx"),
]);

test("enables balanced compact sizing only for interactive overall reports", () => {
  assert.match(overall, /const compactInteractive = !screenshotMode/);
  assert.match(overall, /compactResponsive=\{compactInteractive\}/);
  assert.match(overall, /variant=\{compactInteractive \? "compact" : "header"\}/);
  assert.match(overall, /densePopover=\{compactInteractive\}/);
  assert.match(picker, /numberOfMonths=\{2\}/);
  assert.match(picker, /w-\[min\(clamp\(360px,80vw,560px\),calc\(100vw-2rem\)\)\]/);
  assert.match(picker, /\[--cell-size:clamp\(1\.25rem,4\.5vw,1\.75rem\)\]/);
  assert.match(shell, /text-\[clamp\(1\.75rem,3\.2vw,2\.5rem\)\]/);
  assert.match(shell, /minmax\(260px,360px\)/);
});

test("keeps compact account filters readable before the large breakpoint", () => {
  assert.match(overall, /compactToolbar/);
  assert.match(filters, /grid-cols-\[84px_minmax\(0,1fr\)_32px\]/);
  assert.match(filters, /<ButtonGroup className="flex-none">/);
  assert.match(filters, /denseToolbar[\s\S]*?"h-8 w-auto flex-none px-2 text-\[11px\]"/);
  assert.match(filters, /denseToolbar \? "ml-auto w-auto flex-none"/);
  assert.match(filters, /useState<SearchEntry\[\]>\(\(\) =>/);
  assert.match(filters, /w-\[min\(20rem,calc\(100vw-1\.5rem\)\)\]/);
  assert.match(filters, /compact \? "gap-0\.5 px-2 py-1\.5 text-xs leading-snug"/);
  assert.doesNotMatch(filters, /No country set/);
  assert.match(download, /compact\?: boolean/);
  assert.match(download, /compact \? "w-auto" : "w-full"/);
});

test("opts report body sections into compact sizing without changing defaults", () => {
  assert.match(metrics, /compact = false/);
  assert.match(metrics, /ScrollArea type="always"/);
  assert.match(metrics, /orientation="horizontal"/);
  assert.match(metrics, /compact \? \(/);
  assert.match(campaigns, /compact = false/);
  assert.match(audience, /compact = false/);
  assert.match(audience, /compact && !screenshotMode/);
  assert.match(campaigns, /xl:hidden/);
  assert.match(campaigns, /xl:block/);
});

test("renders the overall report shell immediately with section skeletons", () => {
  assert.doesNotMatch(overall, /ReportSuccessScreen/);
  assert.doesNotMatch(overall, /useReportReadyTransition/);
  assert.doesNotMatch(overall, /ReportLoadingState/);
  assert.match(overall, /titleLoading=\{compactInteractive/);
  assert.match(overall, /<OverallSummarySkeleton compact=\{compactInteractive\}/);
  assert.match(overall, /<OverallCampaignSkeleton compact=\{compactInteractive\}/);
  assert.match(overall, /<OverallAudienceSkeleton compact=\{compact\}/);
  assert.match(shell, /titleLoading \? \(/);
  assert.match(skeletons, /aria-label="Loading summary metrics"/);
  assert.match(skeletons, /aria-label="Loading campaign performance"/);
  assert.match(skeletons, /aria-label="Loading audience breakdown"/);
  assert.doesNotMatch(routePage, /ReportRouteLoading/);
  assert.match(routePage, /fallback=\{<OverallRouteSkeleton \/>\}/);
  assert.match(routeLoading, /<OverallRouteSkeleton \/>/);
  assert.match(routeSkeleton, /aria-label="Loading monthly performance report"/);
  assert.match(routeSkeleton, /<OverallSummarySkeleton compact \/>/);
  assert.doesNotMatch(routeSkeleton, /Preparing your page|Your report is ready/);
});
