import assert from "node:assert/strict";
import test from "node:test";

import { prepareCampaignPlanDraft } from "./campaign-plan-preparation";
import { createCampaignWizardForm } from "./campaign-wizard";
import { buildCampaignDraftRequest, hydrateCampaignWizardFromRevision } from "./campaign-wizard-payload";
import type { CampaignPlanDetail } from "./types";

const googleAccount = {
  id: 10,
  clientId: "11111111-1111-4111-8111-111111111111",
  clientName: "Client",
  platform: "google" as const,
  providerAccountId: "mock-google",
  accountName: "Google",
  currency: "MYR",
  timezone: "Asia/Kuala_Lumpur",
};

test("hydrates and rebuilds a complete Google revision with locked identity", () => {
  const prepared = prepareCampaignPlanDraft({
    platform: "google", client_id: "11111111-1111-4111-8111-111111111111", client_name: "Client", ad_account_id: 10, budget_package_id: 20,
    campaign_name: "Search", provider_account_id: "mock-google", currency: "MYR", timezone: "Asia/Kuala_Lumpur", start_date: "2026-08-22", end_date: "2026-09-21", allocated_budget: 5000, destination: "https://example.test/landing", tracking: { url_parameters: { utm_source: "m04_stage2" } }, objective: "leads", campaign_type: "search", bidding_strategy: "target_cpa", bid_targets: { target_cpa: 50 }, network_settings: { google_search: true, search_partners: false, display_network: false }, locations: ["MY-KUL"], languages: ["en"], placements: { inventory: "google_search" }, targeting: { audience_segments: [], excluded_locations: [] }, conversion: { action_id: "mock-conversion", category: "submit_lead_form" }, campaign_structure: { groups: [{ name: "Core", keywords: [{ text: "crm", match_type: "phrase" }] }] }, creative: { format: "responsive_search_ad", headlines: ["One", "Two", "Three"], descriptions: ["First", "Second"] },
  });
  const detail = { plan: { id: 1, accountId: 10, packageId: 20 }, currentRevision: { payload: prepared.plan } } as CampaignPlanDetail;
  const form = hydrateCampaignWizardFromRevision(detail);
  const rebuilt = buildCampaignDraftRequest(form, googleAccount);
  assert.equal(form.campaignName, "Search");
  assert.equal(form.keywords, "crm");
  assert.equal(rebuilt.ad_account_id, 10);
  assert.equal(rebuilt.budget_package_id, 20);
  assert.equal(rebuilt.platform, "google");
});

test("serializes comma-separated Demand Gen headlines and descriptions as individual assets", () => {
  const form = {
    ...createCampaignWizardForm("google"),
    accountId: "10",
    packageId: "20",
    campaignName: "Demand Gen",
    campaignType: "demand_gen",
    creativeFormat: "demand_gen_asset",
    headline: "Headline one, Headline two, Headline three",
    descriptions: "Description one, Description two",
    businessName: "Client",
    assetIds: "image-1, image-2",
  };
  const request = buildCampaignDraftRequest(form, googleAccount);
  assert.equal(request.platform, "google");
  if (request.platform !== "google" || request.creative.format !== "demand_gen_asset") assert.fail("Expected Demand Gen creative");
  assert.deepEqual(request.creative.headlines, ["Headline one", "Headline two", "Headline three"]);
  assert.deepEqual(request.creative.descriptions, ["Description one", "Description two"]);
});
