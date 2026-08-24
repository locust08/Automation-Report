import type { CampaignPlanDraftInput, ProviderResourceReference } from "./domain";
import { createCampaignWizardForm, type CampaignWizardForm } from "./campaign-wizard";
import type { CampaignAccountOption, CampaignPlanDetail } from "./types";

export function hydrateCampaignWizardFromRevision(detail: CampaignPlanDetail): CampaignWizardForm {
  const plan = detail.currentRevision.payload;
  const preparation = plan.provider_preparation;
  const providerFields = preparation.provider_fields;
  const form = {
    ...createCampaignWizardForm(plan.platform),
    platform: plan.platform,
    accountId: String(detail.plan.accountId),
    packageId: String(detail.plan.packageId),
    campaignName: plan.campaign_name,
    objective: plan.objective,
    destination: plan.destination,
    startDate: plan.start_date,
    endDate: plan.end_date,
    allocatedBudget: String(plan.allocated_budget),
    trackingTemplate: plan.tracking.tracking_template ?? "",
  } satisfies CampaignWizardForm;

  if (plan.platform === "google") {
    const group = plan.campaign_structure.groups[0];
    const creative = plan.creative;
    return {
      ...form,
      campaignType: plan.campaign_type,
      biddingStrategy: plan.bidding_strategy,
      targetCpa: plan.bid_targets.target_cpa === undefined ? "" : String(plan.bid_targets.target_cpa),
      targetRoas: plan.bid_targets.target_roas === undefined ? "" : String(plan.bid_targets.target_roas),
      searchPartners: String(plan.network_settings.search_partners),
      locations: plan.locations.join(", "),
      languages: plan.languages.join(", "),
      conversionActionId: plan.conversion.action_id,
      conversionCategory: plan.conversion.category,
      groupName: group?.name ?? "",
      keywords: group?.keywords.map((keyword) => keyword.text).join(", ") ?? "",
      keywordMatchTypes: group?.keywords.map((keyword) => keyword.match_type).join(", ") ?? "",
      creativeFormat: creative.format,
      assetIds: "image_asset_ids" in creative ? creative.image_asset_ids.join(", ") : form.assetIds,
      squareAssetIds: "square_image_asset_ids" in creative ? creative.square_image_asset_ids.join(", ") : form.squareAssetIds,
      portraitAssetIds: "portrait_image_asset_ids" in creative ? creative.portrait_image_asset_ids.join(", ") : form.portraitAssetIds,
      logoAssetIds: "logo_asset_ids" in creative ? creative.logo_asset_ids.join(", ") : form.logoAssetIds,
      videoAssetIds: "video_asset_ids" in creative ? creative.video_asset_ids.join(", ") : form.videoAssetIds,
      headline: creative.headlines.join(", "),
      longHeadlines: "long_headlines" in creative ? creative.long_headlines.join(", ") : form.longHeadlines,
      descriptions: creative.descriptions.join(", "),
      businessName: "business_name" in creative ? creative.business_name : form.businessName,
      demandGenFormat: "ad_format" in creative ? creative.ad_format : form.demandGenFormat,
      urlPath1: "path_1" in creative ? creative.path_1 ?? "" : "",
      urlPath2: "path_2" in creative ? creative.path_2 ?? "" : "",
      euPoliticalAds: stringRecordValue(preparation.compliance, "eu_political_advertising", form.euPoliticalAds),
      googleBrandGuidelines: stringRecordValue(providerFields, "brand_guidelines", form.googleBrandGuidelines),
    };
  }

  if (plan.platform === "meta") {
    const creative = plan.creative;
    const creativeFields = metaCreativeFields(creative, form.destination);
    return {
      ...form,
      optimizationGoal: plan.optimization_goal,
      billingEvent: plan.billing_event,
      pixelId: plan.pixel_id,
      conversionEvent: plan.conversion_event,
      placementMode: plan.placements.mode,
      manualPlacements: plan.placements.mode === "manual" ? plan.placements.values.join(", ") : "",
      countries: plan.targeting.countries.join(", "),
      ageMin: String(plan.targeting.age_min),
      ageMax: String(plan.targeting.age_max),
      genders: plan.targeting.genders.join(", "),
      interests: plan.targeting.interests.join(", "),
      creativeFormat: creative.format,
      groupName: stringRecordValue(providerFields, "ad_set_name", form.groupName),
      creativeName: stringRecordValue(providerFields, "creative_name", form.creativeName),
      adName: stringRecordValue(providerFields, "ad_name", form.adName),
      pageId: referenceByRole(plan, "facebook_page") ?? form.pageId,
      instagramActorId: referenceByRole(plan, "instagram_actor") ?? "",
      specialAdCategories: plan.special_ad_categories.length ? plan.special_ad_categories.join(", ") : stringRecordValue(preparation.compliance, "special_ad_categories_declared", "none"),
      budgetScope: stringRecordValue(providerFields, "budget_scope", form.budgetScope),
      budgetMode: stringRecordValue(providerFields, "budget_mode", form.budgetMode),
      deliveryBidStrategy: stringRecordValue(providerFields, "bid_strategy", form.deliveryBidStrategy),
      bidAmount: numberRecordValue(providerFields, "bid_amount"),
      attributionWindow: stringRecordValue(providerFields, "attribution_window", form.attributionWindow),
      ...creativeFields,
    };
  }

  return {
    ...form,
    optimizationGoal: plan.optimization_goal,
    pixelId: plan.pixel_id,
    conversionEvent: plan.conversion_event,
    placementMode: plan.placements.mode,
    manualPlacements: plan.placements.mode === "manual" ? plan.placements.values.join(", ") : "",
    countries: plan.targeting.countries.join(", "),
    languages: plan.targeting.languages.join(", "),
    genders: plan.targeting.genders.join(", "),
    interests: plan.targeting.interests.join(", "),
    operatingSystems: plan.targeting.operating_systems.join(", "),
    ageGroups: plan.targeting.age_groups.join(", "),
    identityName: plan.identity.display_name,
    creativeFormat: plan.creative.format,
    assetIds: plan.creative.video_id,
    primaryText: plan.creative.ad_text,
    callToAction: plan.creative.call_to_action,
    groupName: stringRecordValue(providerFields, "ad_group_name", form.groupName),
    adName: stringRecordValue(providerFields, "ad_name", form.adName),
    budgetMode: plan.budget_mode,
    promotionType: stringRecordValue(providerFields, "promotion_type", form.promotionType),
    placementType: stringRecordValue(providerFields, "placement_type", form.placementType),
    billingEvent: stringRecordValue(providerFields, "billing_event", form.billingEvent),
    deliveryBidStrategy: stringRecordValue(providerFields, "bid_type", form.deliveryBidStrategy),
    bidAmount: numberRecordValue(providerFields, "bid_amount"),
    pacing: stringRecordValue(providerFields, "pacing", form.pacing),
    clickAttributionWindow: stringRecordValue(providerFields, "click_attribution_window", form.clickAttributionWindow),
    viewAttributionWindow: stringRecordValue(providerFields, "view_attribution_window", form.viewAttributionWindow),
    specialIndustries: stringRecordValue(preparation.compliance, "special_industries_declared", form.specialIndustries),
  };
}

export function buildCampaignDraftRequest(
  form: CampaignWizardForm,
  account: CampaignAccountOption,
): CampaignPlanDraftInput {
  const common = {
    schema_version: 2 as const,
    entities: providerNeutralEntities(form),
    client_id: account.clientId,
    client_name: account.clientName,
    ad_account_id: account.id,
    budget_package_id: Number(form.packageId),
    campaign_name: form.campaignName.trim(),
    provider_account_id: account.providerAccountId,
    currency: account.currency,
    timezone: account.timezone,
    start_date: form.startDate,
    end_date: form.endDate,
    allocated_budget: Number(form.allocatedBudget),
    destination: form.destination.trim(),
    tracking: { url_parameters: { utm_source: "m04_stage2" }, ...(form.trackingTemplate.trim() ? { tracking_template: form.trackingTemplate.trim() } : {}) },
  };
  if (form.platform === "google") {
    const format = form.campaignType === "search" ? "responsive_search_ad" : form.campaignType === "performance_max" ? "performance_max_asset_group" : "demand_gen_asset";
    const assets = split(form.assetIds);
    const creative = format === "responsive_search_ad"
      ? { format, headlines: split(form.headline), descriptions: split(form.descriptions), ...(form.urlPath1.trim() ? { path_1: form.urlPath1.trim() } : {}), ...(form.urlPath2.trim() ? { path_2: form.urlPath2.trim() } : {}) }
      : format === "performance_max_asset_group"
        ? { format, headlines: split(form.headline), long_headlines: split(form.longHeadlines), descriptions: split(form.descriptions), business_name: form.businessName.trim(), image_asset_ids: assets, square_image_asset_ids: split(form.squareAssetIds), portrait_image_asset_ids: split(form.portraitAssetIds), logo_asset_ids: split(form.logoAssetIds), video_asset_ids: split(form.videoAssetIds) }
        : { format, headlines: split(form.headline), descriptions: split(form.descriptions), business_name: form.businessName.trim(), ad_format: form.demandGenFormat as "multi_asset" | "carousel" | "video_responsive", image_asset_ids: assets, video_asset_ids: split(form.videoAssetIds) };
    const resourceReferences = [
      reference("conversion:primary", "conversion_action", "conversion_action", form.conversionActionId),
      ...(format === "performance_max_asset_group" ? [
        ...references("creative:landscape", "image", "marketing_image_landscape", form.assetIds),
        ...references("creative:square", "image", "marketing_image_square", form.squareAssetIds),
        ...references("creative:portrait", "image", "marketing_image_portrait", form.portraitAssetIds),
        ...references("creative:logo", "image", "logo_square", form.logoAssetIds),
        ...references("creative:video", "video", "youtube_video", form.videoAssetIds),
      ] : format === "demand_gen_asset" ? [
        ...references("creative:image", "image", `demand_gen_${form.demandGenFormat}_image`, form.assetIds),
        ...references("creative:video", "video", "demand_gen_video", form.videoAssetIds),
      ] : []),
    ];
    return {
      ...common,
      provider_preparation: preparation({
        compliance: { eu_political_advertising: form.euPoliticalAds },
        intendedStatuses: { campaign: "PAUSED", ad_group: "PAUSED", ad: "PAUSED" },
        providerFields: { brand_guidelines: form.googleBrandGuidelines, demand_gen_ad_format: form.demandGenFormat },
        resourceReferences,
      }),
      platform: "google", objective: form.objective as "sales" | "leads" | "website_traffic", campaign_type: form.campaignType as "search" | "performance_max" | "demand_gen", bidding_strategy: form.biddingStrategy as "maximize_conversions" | "target_cpa" | "maximize_conversion_value" | "target_roas" | "maximize_clicks", bid_targets: form.biddingStrategy === "target_cpa" ? { target_cpa: Number(form.targetCpa) } : form.biddingStrategy === "target_roas" ? { target_roas: Number(form.targetRoas) } : {}, network_settings: form.campaignType === "search" ? { google_search: true, search_partners: form.searchPartners === "true", display_network: false } : { google_search: false, search_partners: false, display_network: false }, locations: split(form.locations), languages: split(form.languages), placements: { inventory: form.campaignType === "search" ? "google_search" : form.campaignType === "performance_max" ? "all_google_inventory" : "discover_youtube_gmail" }, targeting: { audience_segments: [], excluded_locations: [] }, conversion: { action_id: form.conversionActionId.trim(), category: form.conversionCategory as "purchase" | "submit_lead_form" | "page_view" }, campaign_structure: { groups: [{ name: form.groupName.trim(), keywords: form.campaignType === "search" ? split(form.keywords).map((text, index) => ({ text, match_type: keywordMatchType(form.keywordMatchTypes, index) })) : [] }] }, creative,
    } as CampaignPlanDraftInput;
  }
  if (form.platform === "meta") {
    const assets = split(form.assetIds);
    const creative = form.creativeFormat === "existing_post" ? { format: "existing_post" as const, post_id: assets[0], eligibility_confirmed: false as const } : form.creativeFormat === "video" ? { format: "video" as const, video_asset_id: assets[0], primary_text: form.primaryText.trim(), headline: form.headline.trim(), call_to_action: form.callToAction as "learn_more" | "shop_now" | "sign_up" | "apply_now" } : form.creativeFormat === "carousel" ? { format: "carousel" as const, primary_text: form.primaryText.trim(), cards: assets.map((image_asset_id, index) => ({ image_asset_id, headline: split(form.headline)[index] ?? form.headline.trim(), destination: split(form.carouselDestinations)[index] ?? form.destination.trim() })), call_to_action: form.callToAction as "learn_more" | "shop_now" | "sign_up" | "apply_now" } : { format: "image" as const, image_asset_id: assets[0], primary_text: form.primaryText.trim(), headline: form.headline.trim(), call_to_action: form.callToAction as "learn_more" | "shop_now" | "sign_up" | "apply_now" };
    const specialCategories = form.specialAdCategories === "none" ? [] : split(form.specialAdCategories) as Array<"credit" | "employment" | "housing" | "social_issues">;
    return {
      ...common,
      provider_preparation: preparation({
        compliance: { special_ad_categories_declared: form.specialAdCategories, existing_post_eligibility_confirmed: form.creativeFormat === "existing_post" ? false : null },
        intendedStatuses: { campaign: "PAUSED", ad_set: "PAUSED", creative: "PAUSED", ad: "PAUSED" },
        providerFields: { ad_set_name: form.groupName.trim(), creative_name: form.creativeName.trim(), ad_name: form.adName.trim(), budget_scope: form.budgetScope, budget_mode: form.budgetMode, bid_strategy: form.deliveryBidStrategy, bid_amount: numberOrNull(form.bidAmount), attribution_window: form.attributionWindow, promoted_object: { pixel_reference: form.pixelId.trim(), conversion_event: form.conversionEvent } },
        resourceReferences: [reference("identity:facebook-page", "identity", "facebook_page", form.pageId), ...(form.instagramActorId.trim() ? [reference("identity:instagram", "identity", "instagram_actor", form.instagramActorId)] : []), reference("conversion:pixel", "pixel", "meta_pixel", form.pixelId), ...references("creative:asset", form.creativeFormat === "video" ? "video" : form.creativeFormat === "existing_post" ? "post" : "image", form.creativeFormat, form.assetIds)],
      }),
      platform: "meta", objective: form.objective as "traffic" | "leads" | "sales", buying_type: "auction", conversion_location: "website", optimization_goal: form.optimizationGoal as "landing_page_views" | "link_clicks" | "offsite_conversions", billing_event: "impressions", pixel_id: form.pixelId.trim(), conversion_event: form.conversionEvent as "view_content" | "lead" | "purchase", placements: form.placementMode === "automatic" ? { mode: "automatic" } : { mode: "manual", values: split(form.manualPlacements) as Array<"facebook_feed" | "facebook_reels" | "facebook_stories" | "instagram_feed" | "instagram_reels" | "instagram_stories"> }, targeting: { countries: split(form.countries), age_min: Number(form.ageMin), age_max: Number(form.ageMax), genders: split(form.genders) as Array<"all" | "female" | "male">, interests: split(form.interests) }, special_ad_categories: specialCategories, creative,
    } as CampaignPlanDraftInput;
  }
  return {
    ...common,
    provider_preparation: preparation({
      compliance: { special_industries_declared: form.specialIndustries },
      intendedStatuses: { campaign: "DISABLED", ad_group: "DISABLED", ad: "DISABLED" },
      providerFields: { ad_group_name: form.groupName.trim(), ad_name: form.adName.trim(), promotion_type: form.promotionType, placement_type: form.placementType, billing_event: form.billingEvent, bid_type: form.deliveryBidStrategy, bid_amount: numberOrNull(form.bidAmount), pacing: form.pacing, click_attribution_window: form.clickAttributionWindow, view_attribution_window: form.viewAttributionWindow },
      resourceReferences: [reference("conversion:pixel", "pixel", "tiktok_pixel", form.pixelId), reference("identity:regular", "identity", "tiktok_identity", form.identityName), reference("creative:video", "video", "video", split(form.assetIds)[0] ?? ""), ...references("targeting:location", "location", "location", form.countries)],
    }),
    platform: "tiktok", objective: form.objective as "traffic" | "web_conversions" | "lead_generation", campaign_type: "auction", budget_mode: form.budgetMode as "daily" | "lifetime", optimization_goal: form.optimizationGoal as "click" | "landing_page_view" | "complete_payment" | "lead", pixel_id: form.pixelId.trim(), conversion_event: form.conversionEvent as "page_view" | "purchase" | "submit_form", placements: form.placementMode === "automatic" ? { mode: "automatic" } : { mode: "manual", values: ["tiktok"] }, targeting: { countries: split(form.countries), languages: split(form.languages), age_groups: split(form.ageGroups) as Array<"18-24" | "25-34" | "35-44" | "45-54" | "55+">, genders: split(form.genders) as Array<"all" | "female" | "male">, interests: split(form.interests), operating_systems: split(form.operatingSystems) as Array<"android" | "ios"> }, identity: { type: "regular", display_name: form.identityName.trim() }, creative: { format: "single_video", spark_ad: false, video_id: split(form.assetIds)[0], ad_text: form.primaryText.trim(), call_to_action: form.callToAction as "learn_more" | "shop_now" | "sign_up" | "apply_now" },
  } as CampaignPlanDraftInput;
}

function metaCreativeFields(creative: Extract<CampaignPlanDetail["currentRevision"]["payload"], { platform: "meta" }>["creative"], destination: string) {
  if (creative.format === "existing_post") return { assetIds: creative.post_id, primaryText: "", headline: "" };
  if (creative.format === "video") return { assetIds: creative.video_asset_id, primaryText: creative.primary_text, headline: creative.headline, callToAction: creative.call_to_action };
  if (creative.format === "carousel") return { assetIds: creative.cards.map((card) => card.image_asset_id).join(", "), primaryText: creative.primary_text, headline: creative.cards.map((card) => card.headline).join(", "), carouselDestinations: creative.cards.map((card) => card.destination).join(", "), destination: creative.cards[0]?.destination ?? destination, callToAction: creative.call_to_action };
  return { assetIds: creative.image_asset_id, primaryText: creative.primary_text, headline: creative.headline, callToAction: creative.call_to_action };
}

function split(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }

function keywordMatchType(value: string, index: number): "exact" | "phrase" | "broad" {
  const matchType = split(value)[index];
  return matchType === "exact" || matchType === "broad" ? matchType : "phrase";
}

function reference(logicalKey: string, resourceType: string, role: string, referenceId: string): ProviderResourceReference {
  return { logical_key: logicalKey, resource_type: resourceType, role, source: "local", reference_id: referenceId.trim(), provider_resource_id: null, resolution_status: "unresolved" };
}

function references(prefix: string, resourceType: string, role: string, value: string): ProviderResourceReference[] {
  return split(value).map((referenceId, index) => reference(`${prefix}:${index + 1}`, resourceType, role, referenceId));
}

function preparation(input: { compliance: Record<string, unknown>; intendedStatuses: Record<string, "PAUSED" | "DISABLED">; providerFields: Record<string, unknown>; resourceReferences: ProviderResourceReference[] }) {
  return { provider_execution_locked: true as const, compliance: input.compliance, intended_statuses: input.intendedStatuses, provider_fields: input.providerFields, resource_references: input.resourceReferences.filter((item) => item.reference_id.length > 0) };
}

function numberOrNull(value: string) { const number = Number(value); return value.trim() && Number.isFinite(number) ? number : null; }

function providerNeutralEntities(form: CampaignWizardForm) {
  const intendedStatus = form.platform === "tiktok" ? "DISABLED" as const : "PAUSED" as const;
  const resourceRoles = form.platform === "google"
    ? form.campaignType === "performance_max"
      ? ["marketing_image_landscape", "marketing_image_square", ...(split(form.portraitAssetIds).length ? ["marketing_image_portrait"] : []), "logo_square", ...(split(form.videoAssetIds).length ? ["youtube_video"] : [])]
      : form.campaignType === "demand_gen"
        ? [`demand_gen_${form.demandGenFormat}_image`, ...(split(form.videoAssetIds).length ? ["demand_gen_video"] : [])]
        : []
    : form.platform === "meta"
      ? [form.creativeFormat === "existing_post" ? "existing_post" : form.creativeFormat]
      : ["video", "tiktok_identity"];
  return {
    campaign: { name: form.campaignName.trim(), objective: form.objective, intended_status: intendedStatus },
    budget: { scope: form.platform === "google" || form.budgetScope === "campaign" ? "campaign" as const : "ad_group" as const, mode: form.budgetMode === "lifetime" ? "lifetime" as const : "daily" as const, amount: Number(form.allocatedBudget), start_date: form.startDate, end_date: form.endDate },
    groups: [{ name: form.groupName.trim(), kind: form.platform === "google" && form.campaignType === "performance_max" ? "asset_group" as const : "ad_group" as const, intended_status: intendedStatus }],
    targeting: { location_references: split(form.platform === "google" ? form.locations : form.countries), language_references: split(form.languages), placement_mode: form.platform === "google" ? form.campaignType : form.placementMode },
    conversion: { event: form.platform === "google" ? form.conversionCategory : form.conversionEvent, resource_reference: form.platform === "google" ? form.conversionActionId.trim() : form.pixelId.trim() },
    creatives: [{ name: form.platform === "google" ? `${form.groupName.trim()} creative` : form.platform === "meta" ? form.creativeName.trim() : form.adName.trim(), format: form.platform === "google" ? form.campaignType : form.creativeFormat, resource_roles: resourceRoles, intended_status: intendedStatus }],
    compliance: form.platform === "google" ? { eu_political_advertising: form.euPoliticalAds } : form.platform === "meta" ? { special_ad_categories_declared: form.specialAdCategories } : { special_industries_declared: form.specialIndustries },
  };
}

function stringRecordValue(record: Record<string, unknown>, key: string, fallback: string) { return typeof record[key] === "string" ? record[key] : fallback; }
function numberRecordValue(record: Record<string, unknown>, key: string) { return typeof record[key] === "number" ? String(record[key]) : ""; }
function referenceByRole(plan: CampaignPlanDetail["currentRevision"]["payload"], role: string) { return plan.provider_preparation.resource_references.find((item) => item.role === role)?.reference_id; }
