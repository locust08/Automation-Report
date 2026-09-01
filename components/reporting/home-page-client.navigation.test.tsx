import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { HomePageClient } from "./home-page-client";

test("uses the wide dashboard layout on large screens", () => {
  const html = renderToStaticMarkup(<HomePageClient displayName="Admin" role="admin" />);

  assert.match(html, /class="w-full max-w-6xl space-y-3"/);
});

test("offers the shared navigation destinations from dashboard tools", () => {
  const html = renderToStaticMarkup(<HomePageClient displayName="Admin" role="admin" />);

  assert.match(html, />Ad Management</);
  assert.match(html, /href="\/manage"[^>]*>[\s\S]*?Ads Management/);
  assert.match(html, /href="\/change-control"[^>]*>[\s\S]*?Change Control Admin/);
  assert.match(html, /href="\/meta-import"[^>]*>[\s\S]*?Import Meta CSV/);
  assert.match(html, /href="\/user-management"[^>]*>[\s\S]*?User Management/);
  assert.match(html, /href="\/settings"[^>]*>[\s\S]*?Workflow Settings/);
  assert.doesNotMatch(html, />Google</);
  assert.doesNotMatch(html, /Edit Google Ads/);
});

test("groups dashboard tools by workflow category", () => {
  const html = renderToStaticMarkup(<HomePageClient displayName="Admin" role="admin" />);
  const dashboardTools = html.slice(html.indexOf('aria-labelledby="dashboard-tools-heading"'));
  const reports = dashboardTools.indexOf(">Reports<");
  const planning = dashboardTools.indexOf(">Planning &amp; Operations<");
  const adsManagement = dashboardTools.indexOf(">Ad Management<");
  const admin = dashboardTools.indexOf(">Admin<");

  assert.ok(reports >= 0);
  assert.ok(planning > reports);
  assert.ok(adsManagement > planning);
  assert.ok(admin > adsManagement);
  assert.ok(dashboardTools.indexOf("Send Report", reports) < planning);
  assert.ok(dashboardTools.indexOf("Create Media Plan", planning) < adsManagement);
  assert.ok(dashboardTools.indexOf("Import Meta CSV", planning) < adsManagement);
  assert.ok(dashboardTools.indexOf("Billing Operations", planning) < adsManagement);
  assert.ok(dashboardTools.indexOf("Campaign Planning &amp; Launch", planning) < adsManagement);
  assert.ok(dashboardTools.indexOf("Ads Management", adsManagement) < admin);
  assert.ok(dashboardTools.indexOf("Google Optimization", adsManagement) < admin);
  assert.ok(dashboardTools.indexOf("Optimization Scheduling", adsManagement) < admin);
  assert.ok(dashboardTools.indexOf("Change Control Admin", admin) > admin);
  assert.ok(dashboardTools.indexOf("User Management", admin) > admin);
  assert.ok(dashboardTools.indexOf("Workflow Settings", admin) > admin);
});
