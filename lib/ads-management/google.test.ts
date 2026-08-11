import assert from "node:assert/strict";
import test from "node:test";
import { buildSitelinkMutateOperations, sitelinkVerificationMatches, validateLocalChange } from "@/lib/ads-management/google";
import type { AdsFieldChangeRecord } from "@/lib/ads-management/types";

function change(overrides: Partial<AdsFieldChangeRecord>): AdsFieldChangeRecord {
  return { id: "1", change_set_id: "set", entity_type: "campaign", entity_id: "10", entity_name: "Search", field_key: "campaign.name", field_label: "Campaign name", value_type: "string", baseline_value: "Old", proposed_value: "New", latest_official_value: null, reviewed_official_value: null, published_value: null, verified_value: null, conflict_resolution: null, validation_errors: [], publish_status: "pending", verification_status: "pending", platform_response: null, last_error_message: null, publish_attempts: 0, ...overrides };
}

test("requires editable names", () => assert.deepEqual(validateLocalChange(change({ proposed_value: "" })), ["Campaign name is required."]));
test("limits statuses to enabled and paused", () => assert.equal(validateLocalChange(change({ field_key: "campaign.status", field_label: "Campaign status", proposed_value: "REMOVED" })).length, 1));
test("requires positive micros", () => assert.equal(validateLocalChange(change({ field_key: "campaign_budget.amount_micros", field_label: "Daily budget", value_type: "money_micros", proposed_value: "0" })).length, 1));
test("accepts a valid campaign edit", () => assert.deepEqual(validateLocalChange(change({ proposed_value: "New campaign" })), []));
test("validates responsive search ad headline length", () => assert.equal(validateLocalChange(change({ entity_type: "ad", entity_id: "customers/1/ads/2", field_key: "ad.headlines", field_label: "Headlines", value_type: "text_assets", proposed_value: [{ text: "A".repeat(31) }, { text: "Second" }, { text: "Third" }] })).length, 1));
test("counts only the fallback text in responsive search ad keyword insertion", () => assert.deepEqual(validateLocalChange(change({ entity_type: "ad", entity_id: "customers/1/ads/2", field_key: "ad.headlines", field_label: "Headlines", value_type: "text_assets", proposed_value: [{ text: "ARJET High Pressure Cleane" }, { text: "High Pressure Cleaner BC680" }, { text: "No.1 {Keyword:High Pressure Cleaner}" }] })), []));
test("accepts valid responsive search ad descriptions", () => assert.deepEqual(validateLocalChange(change({ entity_type: "ad", entity_id: "customers/1/ads/2", field_key: "ad.descriptions", field_label: "Descriptions", value_type: "text_assets", proposed_value: [{ text: "First description" }, { text: "Second description", pinnedField: "DESCRIPTION_2" }] })), []));
test("accepts a paused ad group ad status", () => assert.deepEqual(validateLocalChange(change({ entity_type: "ad", entity_id: "customers/1/adGroupAds/2~3", field_key: "ad_group_ad.status", field_label: "Ad status", proposed_value: "PAUSED" })), []));
test("accepts a 40 character Demand Gen video headline", () => assert.deepEqual(validateLocalChange(change({ entity_type: "ad", entity_id: "customers/1/ads/2", field_key: "ad.demand_gen_video_responsive_ad.headlines", field_label: "Headlines", value_type: "text_assets", proposed_value: [{ text: "A".repeat(40) }] })), []));
test("validates every mobile final URL", () => assert.equal(validateLocalChange(change({ entity_type: "ad", field_key: "ad.final_mobile_urls", field_label: "Mobile final URLs", value_type: "url_list", proposed_value: ["not-a-url"] })).length, 1));
test("validates custom parameter pairs", () => assert.equal(validateLocalChange(change({ entity_type: "ad", field_key: "ad.url_custom_parameters", field_label: "Custom parameters", value_type: "custom_parameters", proposed_value: [{ key: "campaign name", value: "" }] })).length, 1));
test("limits Demand Gen display paths", () => assert.equal(validateLocalChange(change({ entity_type: "ad", field_key: "ad.demand_gen_video_responsive_ad.breadcrumb1", field_label: "Display path 1", proposed_value: "A".repeat(16) })).length, 1));
test("accepts a controlled Google recommendation apply request", () => assert.deepEqual(validateLocalChange(change({ entity_type: "campaign", entity_id: "customers/1234567890/recommendations/test-recommendation", field_key: "recommendation.apply", field_label: "Apply Google recommendation", value_type: "recommendation", baseline_value: "ACTIVE", proposed_value: "APPLIED" })), []));
test("rejects an invalid Google recommendation resource", () => assert.equal(validateLocalChange(change({ entity_type: "campaign", entity_id: "not-a-recommendation", field_key: "recommendation.apply", field_label: "Apply Google recommendation", value_type: "recommendation", baseline_value: "ACTIVE", proposed_value: "APPLIED" })).length, 1));
test("accepts final URL with https", () => assert.deepEqual(validateLocalChange(change({ entity_type: "ad", field_key: "ad.final_url", field_label: "Final URL", value_type: "url", baseline_value: "https://bellamysorganic.com.sg", proposed_value: "https://bellamysorganic.com.sg/landing" })), []));

const originalSitelink = { id: "customers/1234567890/adGroupAssets/11~22~SITELINK", assetResourceName: "customers/1234567890/assets/22", linkResourceName: "customers/1234567890/adGroupAssets/11~22~SITELINK", scope: "ad_group" as const, targetResourceName: "customers/1234567890/adGroups/11", source: "ADVERTISER", status: "ENABLED", linkText: "Shop", description1: "See all products", description2: "Order online today", finalUrls: ["https://example.com/shop"], finalMobileUrls: [], startDate: "", endDate: "", editable: true };

test("validates an editable sitelink collection", () => assert.deepEqual(validateLocalChange(change({ entity_type: "ad", entity_id: "customers/1234567890/ads/33", field_key: "ad.sitelinks", field_label: "Sitelinks", value_type: "sitelinks", baseline_value: [originalSitelink], proposed_value: [{ ...originalSitelink, linkText: "Shop now" }] })), []));
test("requires paired sitelink descriptions", () => assert.equal(validateLocalChange(change({ entity_type: "ad", field_key: "ad.sitelinks", field_label: "Sitelinks", value_type: "sitelinks", baseline_value: [], proposed_value: [{ ...originalSitelink, id: "draft", description2: "" }] })).length, 1));
test("prevents edits to automatically created sitelinks", () => assert.equal(validateLocalChange(change({ entity_type: "ad", field_key: "ad.sitelinks", field_label: "Sitelinks", value_type: "sitelinks", baseline_value: [{ ...originalSitelink, source: "AUTOMATICALLY_CREATED", editable: false }], proposed_value: [] })).length, 1));
test("replaces an edited sitelink using a remove, asset create and link create", () => {
  const operations = buildSitelinkMutateOperations("1234567890", change({ entity_type: "ad", field_key: "ad.sitelinks", field_label: "Sitelinks", value_type: "sitelinks", baseline_value: [originalSitelink], proposed_value: [{ ...originalSitelink, linkText: "Shop now" }] }));
  assert.equal(operations.length, 3);
  assert.deepEqual(operations[0], { adGroupAssetOperation: { remove: originalSitelink.linkResourceName } });
  assert.equal(((operations[1] as { assetOperation: { create: { sitelinkAsset: { linkText: string } } } }).assetOperation.create.sitelinkAsset.linkText), "Shop now");
  assert.equal(((operations[2] as { adGroupAssetOperation: { create: { fieldType: string } } }).adGroupAssetOperation.create.fieldType), "SITELINK");
});
test("preserves every association when replacing a shared sitelink asset", () => {
  const shared = { ...originalSitelink, associations: [
    { linkResourceName: originalSitelink.linkResourceName, scope: "ad_group" as const, targetResourceName: originalSitelink.targetResourceName },
    { linkResourceName: "customers/1234567890/campaignAssets/55~22~SITELINK", scope: "campaign" as const, targetResourceName: "customers/1234567890/campaigns/55" },
  ] };
  const operations = buildSitelinkMutateOperations("1234567890", change({ entity_type: "ad", field_key: "ad.sitelinks", field_label: "Sitelinks", value_type: "sitelinks", baseline_value: [shared], proposed_value: [{ ...shared, linkText: "Shop now" }] }));
  assert.equal(operations.length, 5);
  assert.deepEqual(operations[0], { adGroupAssetOperation: { remove: originalSitelink.linkResourceName } });
  assert.deepEqual(operations[1], { campaignAssetOperation: { remove: "customers/1234567890/campaignAssets/55~22~SITELINK" } });
  assert.equal("assetOperation" in (operations[2] as Record<string, unknown>), true);
  assert.equal("adGroupAssetOperation" in (operations[3] as Record<string, unknown>), true);
  assert.equal("campaignAssetOperation" in (operations[4] as Record<string, unknown>), true);
});
test("adds a new sitelink at campaign scope", () => {
  const draft = { ...originalSitelink, id: "draft-sitelink-1", assetResourceName: undefined, linkResourceName: undefined, scope: "campaign" as const, targetResourceName: "customers/1234567890/campaigns/55", associations: [{ linkResourceName: "", scope: "campaign" as const, targetResourceName: "customers/1234567890/campaigns/55" }] };
  const operations = buildSitelinkMutateOperations("1234567890", change({ entity_type: "ad", field_key: "ad.sitelinks", field_label: "Sitelinks", value_type: "sitelinks", baseline_value: [], proposed_value: [draft] }));
  assert.equal(operations.length, 2);
  assert.equal("assetOperation" in (operations[0] as Record<string, unknown>), true);
  assert.deepEqual((operations[1] as { campaignAssetOperation: { create: { campaign: string } } }).campaignAssetOperation.create.campaign, draft.targetResourceName);
});
test("removes only the selected association from a shared sitelink", () => {
  const campaignAssociation = { linkResourceName: "customers/1234567890/campaignAssets/55~22~SITELINK", scope: "campaign" as const, targetResourceName: "customers/1234567890/campaigns/55" };
  const shared = { ...originalSitelink, associations: [
    { linkResourceName: originalSitelink.linkResourceName, scope: "ad_group" as const, targetResourceName: originalSitelink.targetResourceName },
    campaignAssociation,
  ] };
  const proposed = { ...shared, associations: [campaignAssociation], scope: campaignAssociation.scope, targetResourceName: campaignAssociation.targetResourceName, linkResourceName: campaignAssociation.linkResourceName };
  const operations = buildSitelinkMutateOperations("1234567890", change({ entity_type: "ad", field_key: "ad.sitelinks", field_label: "Sitelinks", value_type: "sitelinks", baseline_value: [shared], proposed_value: [proposed] }));
  assert.deepEqual(operations, [{ adGroupAssetOperation: { remove: originalSitelink.linkResourceName } }]);
  assert.equal(sitelinkVerificationMatches(change({ entity_type: "ad", field_key: "ad.sitelinks", field_label: "Sitelinks", value_type: "sitelinks", baseline_value: [shared], proposed_value: [proposed], published_value: [proposed] }), [proposed]), true);
});
test("verifies an edited sitelink while ignoring unrelated inherited links", () => {
  const proposed = { ...originalSitelink, linkText: "Shop now" };
  const inherited = { ...originalSitelink, id: "customers/1234567890/customerAssets/99~SITELINK", linkResourceName: "customers/1234567890/customerAssets/99~SITELINK", assetResourceName: "customers/1234567890/assets/99", scope: "customer" as const, targetResourceName: "customers/1234567890" };
  const replacement = { ...proposed, id: "customers/1234567890/adGroupAssets/11~44~SITELINK", linkResourceName: "customers/1234567890/adGroupAssets/11~44~SITELINK", assetResourceName: "customers/1234567890/assets/44" };
  assert.equal(sitelinkVerificationMatches(change({ entity_type: "ad", field_key: "ad.sitelinks", field_label: "Sitelinks", value_type: "sitelinks", baseline_value: [originalSitelink], proposed_value: [proposed], published_value: [proposed] }), [replacement, inherited]), true);
});
test("does not verify when the removed sitelink link is still present", () => {
  assert.equal(sitelinkVerificationMatches(change({ entity_type: "ad", field_key: "ad.sitelinks", field_label: "Sitelinks", value_type: "sitelinks", baseline_value: [originalSitelink], proposed_value: [], published_value: [] }), [originalSitelink]), false);
});
