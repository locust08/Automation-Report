import assert from "node:assert/strict";
import test from "node:test";

import { campaignPlanDraftInputSchema } from "./domain";
import { evaluateCampaignProviderReadiness } from "./campaign-provider-readiness";
import { buildCampaignDraftRequest } from "./campaign-wizard-payload";
import { createCampaignWizardForm } from "./campaign-wizard";
import type { CampaignAccountOption, CampaignPlatform } from "./types";

const clientId = "11111111-1111-4111-8111-111111111111";

function account(platform: CampaignPlatform): CampaignAccountOption {
  return { id: 10, clientId, clientName: "Client", platform, providerAccountId: `mock-${platform}`, accountName: platform, currency: "MYR", timezone: "Asia/Kuala_Lumpur" };
}

function completeBase(platform: CampaignPlatform) {
  return {
    ...createCampaignWizardForm(platform),
    accountId: "10", packageId: "20", campaignName: `${platform} campaign`,
    euPoliticalAds: "does_not_contain", specialAdCategories: "none", specialIndustries: "none",
  };
}

for (const objective of ["sales", "leads", "website_traffic"]) {
  for (const campaignType of ["search", "performance_max", "demand_gen"]) {
    const demandGenFormats = campaignType === "demand_gen" ? ["multi_asset", "carousel", "video_responsive"] : ["multi_asset"];
    for (const demandGenFormat of demandGenFormats) test(`validates Google ${objective} ${campaignType} ${demandGenFormat}`, () => {
      const form = {
        ...completeBase("google"), objective, campaignType, demandGenFormat,
        headline: campaignType === "demand_gen" ? "One" : "One, Two, Three",
        longHeadlines: "One long headline", descriptions: campaignType === "demand_gen" ? "First" : "First, Second",
        assetIds: campaignType === "search" ? "" : demandGenFormat === "carousel" ? "image-1, image-2" : "image-1",
        squareAssetIds: campaignType === "performance_max" ? "square-1" : "",
        logoAssetIds: campaignType === "performance_max" ? "logo-1" : "",
        videoAssetIds: demandGenFormat === "video_responsive" ? "video-1" : "",
      };
      const parsed = campaignPlanDraftInputSchema.safeParse(buildCampaignDraftRequest(form, account("google")));
      assert.equal(parsed.success, true, parsed.success ? undefined : JSON.stringify(parsed.error.issues));
    });
  }
}

for (const objective of ["traffic", "leads", "sales"]) {
  for (const creativeFormat of ["image", "video", "carousel", "existing_post"]) test(`validates Meta ${objective} ${creativeFormat}`, () => {
    const form = {
      ...completeBase("meta"), objective, creativeFormat,
      optimizationGoal: objective === "traffic" ? "landing_page_views" : "offsite_conversions",
      conversionEvent: objective === "traffic" ? "view_content" : objective === "sales" ? "purchase" : "lead",
      assetIds: creativeFormat === "carousel" ? "asset-1, asset-2" : "asset-1",
      headline: creativeFormat === "carousel" ? "Card one, Card two" : "Headline",
      carouselDestinations: "https://example.test/one, https://example.test/two",
    };
    const parsed = campaignPlanDraftInputSchema.safeParse(buildCampaignDraftRequest(form, account("meta")));
    assert.equal(parsed.success, true, parsed.success ? undefined : JSON.stringify(parsed.error.issues));
  });
}

for (const objective of ["traffic", "web_conversions", "lead_generation"]) test(`validates TikTok ${objective} single-video`, () => {
  const optimizationGoal = objective === "traffic" ? "click" : objective === "web_conversions" ? "complete_payment" : "lead";
  const form = {
    ...completeBase("tiktok"), objective, optimizationGoal,
    conversionEvent: objective === "traffic" ? "page_view" : objective === "web_conversions" ? "purchase" : "submit_form",
    billingEvent: objective === "traffic" ? "cpc" : "ocpm", assetIds: "video-1",
  };
  const request = buildCampaignDraftRequest(form, account("tiktok"));
  const parsed = campaignPlanDraftInputSchema.safeParse(request);
  assert.equal(parsed.success, true, parsed.success ? undefined : JSON.stringify(parsed.error.issues));
  assert.equal(evaluateCampaignProviderReadiness(request).providerReady, false);
});

test("keeps V1 existing-post eligibility and TikTok budget constraints frozen", () => {
  const metaV2 = buildCampaignDraftRequest({ ...completeBase("meta"), creativeFormat: "existing_post", assetIds: "post-1" }, account("meta"));
  const metaV1 = { ...metaV2, schema_version: 1 as const, entities: undefined };
  assert.equal(campaignPlanDraftInputSchema.safeParse(metaV1).success, false);

  const tiktokV2 = buildCampaignDraftRequest({ ...completeBase("tiktok"), assetIds: "video-1", budgetMode: "lifetime", billingEvent: "cpc" }, account("tiktok"));
  const tiktokV1 = { ...tiktokV2, schema_version: 1 as const, entities: undefined };
  assert.equal(campaignPlanDraftInputSchema.safeParse(tiktokV1).success, false);
});
