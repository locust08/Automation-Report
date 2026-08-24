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
  assert.equal(form.keywordMatchTypes, "phrase");
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

test("preserves an independent match type for each Search keyword", () => {
  const form = {
    ...createCampaignWizardForm("google"), accountId: "10", packageId: "20", campaignName: "Search",
    campaignType: "search", keywords: "brand term, generic term", keywordMatchTypes: "exact, broad",
    headline: "One, Two, Three", descriptions: "First, Second", euPoliticalAds: "does_not_contain",
  };
  const request = buildCampaignDraftRequest(form, googleAccount);
  assert.equal(request.platform, "google");
  if (request.platform !== "google") assert.fail("Expected Google request");
  assert.deepEqual(request.campaign_structure.groups[0]?.keywords, [
    { text: "brand term", match_type: "exact" },
    { text: "generic term", match_type: "broad" },
  ]);
});

test("preserves a destination per Meta carousel card", () => {
  const account = { ...googleAccount, platform: "meta" as const, providerAccountId: "mock-meta" };
  const form = {
    ...createCampaignWizardForm("meta"), accountId: "10", packageId: "20", campaignName: "Carousel",
    creativeFormat: "carousel", assetIds: "image-one, image-two", headline: "First card, Second card",
    carouselDestinations: "https://example.test/one, https://example.test/two", specialAdCategories: "none",
  };
  const request = buildCampaignDraftRequest(form, account);
  assert.equal(request.platform, "meta");
  if (request.platform !== "meta" || request.creative.format !== "carousel") assert.fail("Expected Meta carousel");
  assert.deepEqual(request.creative.cards.map((card) => card.destination), [
    "https://example.test/one",
    "https://example.test/two",
  ]);
});

test("does not fabricate missing Google creative assets", () => {
  const form = {
    ...createCampaignWizardForm("google"),
    accountId: "10",
    packageId: "20",
    campaignName: "Search",
    campaignType: "search",
    headline: "Only one headline",
    descriptions: "Only one description",
  };
  const request = buildCampaignDraftRequest(form, googleAccount);
  assert.equal(request.platform, "google");
  if (request.platform !== "google" || request.creative.format !== "responsive_search_ad") assert.fail("Expected Search creative");
  assert.deepEqual(request.creative.headlines, ["Only one headline"]);
  assert.deepEqual(request.creative.descriptions, ["Only one description"]);
});

test("serializes Google V2 compliance and typed unresolved asset references", () => {
  const form = {
    ...createCampaignWizardForm("google"),
    accountId: "10",
    packageId: "20",
    campaignName: "Performance Max",
    campaignType: "performance_max",
    headline: "One, Two, Three",
    longHeadlines: "A long headline",
    descriptions: "First, Second",
    businessName: "Client",
    assetIds: "landscape-image",
    squareAssetIds: "square-image",
    logoAssetIds: "brand-logo",
    euPoliticalAds: "does_not_contain",
  } as ReturnType<typeof createCampaignWizardForm>;
  const request = buildCampaignDraftRequest(form, googleAccount) as unknown as Record<string, unknown>;
  assert.equal(request.schema_version, 2);
  const preparation = request.provider_preparation as { compliance: Record<string, unknown>; resource_references: Array<Record<string, unknown>> };
  assert.equal(preparation.compliance.eu_political_advertising, "does_not_contain");
  const entities = request.entities as { campaign: { objective: string }; budget: { scope: string }; creatives: Array<{ resource_roles: string[] }> };
  assert.equal(entities.campaign.objective, "leads");
  assert.equal(entities.budget.scope, "campaign");
  assert.deepEqual(entities.creatives[0]?.resource_roles, ["marketing_image_landscape", "marketing_image_square", "logo_square"]);
  assert.deepEqual(preparation.resource_references.filter((item) => item.resource_type === "image").map((item) => [item.role, item.resolution_status]), [
    ["marketing_image_landscape", "unresolved"],
    ["marketing_image_square", "unresolved"],
    ["logo_square", "unresolved"],
  ]);
});

test("serializes Meta identity and promoted-object references without resolving them", () => {
  const account = { ...googleAccount, platform: "meta" as const, providerAccountId: "mock-meta" };
  const form = {
    ...createCampaignWizardForm("meta"),
    accountId: "10",
    packageId: "20",
    campaignName: "Meta Leads",
    groupName: "Lead ad set",
    creativeName: "Lead creative",
    adName: "Lead ad",
    pageId: "local-page",
    instagramActorId: "local-instagram",
    specialAdCategories: "none",
  } as ReturnType<typeof createCampaignWizardForm>;
  const request = buildCampaignDraftRequest(form, account) as unknown as Record<string, unknown>;
  const preparation = request.provider_preparation as { resource_references: Array<Record<string, unknown>>; provider_fields: Record<string, unknown> };
  assert.equal(preparation.provider_fields.ad_set_name, "Lead ad set");
  assert.deepEqual(preparation.resource_references.filter((item) => item.resource_type === "identity").map((item) => item.role), ["facebook_page", "instagram_actor"]);
});

test("serializes editable TikTok age groups and provider delivery fields", () => {
  const account = { ...googleAccount, platform: "tiktok" as const, providerAccountId: "mock-tiktok" };
  const form = {
    ...createCampaignWizardForm("tiktok"),
    accountId: "10",
    packageId: "20",
    campaignName: "TikTok Traffic",
    groupName: "Traffic ad group",
    adName: "Traffic ad",
    ageGroups: "18-24, 45-54",
    optimizationGoal: "click",
    billingEvent: "cpc",
    budgetMode: "lifetime",
    specialIndustries: "none",
  } as ReturnType<typeof createCampaignWizardForm>;
  const request = buildCampaignDraftRequest(form, account) as unknown as Record<string, unknown>;
  const targeting = request.targeting as { age_groups: string[] };
  const preparation = request.provider_preparation as { provider_fields: Record<string, unknown> };
  assert.deepEqual(targeting.age_groups, ["18-24", "45-54"]);
  assert.equal(preparation.provider_fields.billing_event, "cpc");
  assert.equal(preparation.provider_fields.ad_group_name, "Traffic ad group");
});

test("hydrates V2 provider fields and role-specific assets for editing", () => {
  const form = {
    ...createCampaignWizardForm("google"), accountId: "10", packageId: "20", campaignName: "PMax", campaignType: "performance_max",
    headline: "One, Two, Three", longHeadlines: "Long one", descriptions: "First, Second", businessName: "Client",
    assetIds: "landscape", squareAssetIds: "square", portraitAssetIds: "portrait", logoAssetIds: "logo", videoAssetIds: "video",
    euPoliticalAds: "does_not_contain", googleBrandGuidelines: "enabled",
  };
  const request = buildCampaignDraftRequest(form, googleAccount);
  const prepared = prepareCampaignPlanDraft(request);
  const detail = { plan: { id: 1, accountId: 10, packageId: 20 }, currentRevision: { payload: prepared.plan } } as CampaignPlanDetail;
  const hydrated = hydrateCampaignWizardFromRevision(detail);
  assert.equal(hydrated.longHeadlines, "Long one");
  assert.equal(hydrated.squareAssetIds, "square");
  assert.equal(hydrated.portraitAssetIds, "portrait");
  assert.equal(hydrated.logoAssetIds, "logo");
  assert.equal(hydrated.videoAssetIds, "video");
  assert.equal(hydrated.euPoliticalAds, "does_not_contain");
  assert.equal(hydrated.googleBrandGuidelines, "enabled");
});
