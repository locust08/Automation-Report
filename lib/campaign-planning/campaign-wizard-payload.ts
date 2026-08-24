import type { CampaignPlanDraftInput } from "./domain";
import { createCampaignWizardForm, type CampaignWizardForm } from "./campaign-wizard";
import type { CampaignAccountOption, CampaignPlanDetail } from "./types";

export function hydrateCampaignWizardFromRevision(detail: CampaignPlanDetail): CampaignWizardForm {
  const plan = detail.currentRevision.payload;
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
      creativeFormat: creative.format,
      assetIds: "image_asset_ids" in creative ? creative.image_asset_ids.join(", ") : form.assetIds,
      headline: creative.headlines.join(", "),
      descriptions: creative.descriptions.join(", "),
      businessName: "business_name" in creative ? creative.business_name : form.businessName,
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
    identityName: plan.identity.display_name,
    creativeFormat: plan.creative.format,
    assetIds: plan.creative.video_id,
    primaryText: plan.creative.ad_text,
    callToAction: plan.creative.call_to_action,
  };
}

export function buildCampaignDraftRequest(
  form: CampaignWizardForm,
  account: CampaignAccountOption,
): CampaignPlanDraftInput {
  const common = {
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
      ? { format, headlines: pad(split(form.headline), 3), descriptions: pad(split(form.descriptions), 2) }
      : format === "performance_max_asset_group"
        ? { format, headlines: pad(split(form.headline), 3), long_headlines: [split(form.headline)[0] ?? form.headline.trim()], descriptions: pad(split(form.descriptions), 2), business_name: form.businessName.trim(), image_asset_ids: assets, logo_asset_ids: [assets[0] ?? "mock-logo"], video_asset_ids: [] }
        : { format, headlines: split(form.headline), descriptions: split(form.descriptions), business_name: form.businessName.trim(), image_asset_ids: assets, video_asset_ids: [] };
    return { ...common, platform: "google", objective: form.objective as "sales" | "leads" | "website_traffic", campaign_type: form.campaignType as "search" | "performance_max" | "demand_gen", bidding_strategy: form.biddingStrategy as "maximize_conversions" | "target_cpa" | "maximize_conversion_value" | "target_roas" | "maximize_clicks", bid_targets: form.biddingStrategy === "target_cpa" ? { target_cpa: Number(form.targetCpa) } : form.biddingStrategy === "target_roas" ? { target_roas: Number(form.targetRoas) } : {}, network_settings: form.campaignType === "search" ? { google_search: true, search_partners: form.searchPartners === "true", display_network: false } : { google_search: false, search_partners: false, display_network: false }, locations: split(form.locations), languages: split(form.languages), placements: { inventory: form.campaignType === "search" ? "google_search" : form.campaignType === "performance_max" ? "all_google_inventory" : "discover_youtube_gmail" }, targeting: { audience_segments: [], excluded_locations: [] }, conversion: { action_id: form.conversionActionId.trim(), category: form.conversionCategory as "purchase" | "submit_lead_form" | "page_view" }, campaign_structure: { groups: [{ name: form.groupName.trim(), keywords: form.campaignType === "search" ? split(form.keywords).map((text) => ({ text, match_type: "phrase" as const })) : [] }] }, creative } as CampaignPlanDraftInput;
  }
  if (form.platform === "meta") {
    const assets = split(form.assetIds);
    const creative = form.creativeFormat === "existing_post" ? { format: "existing_post" as const, post_id: assets[0], eligibility_confirmed: true as const } : form.creativeFormat === "video" ? { format: "video" as const, video_asset_id: assets[0], primary_text: form.primaryText.trim(), headline: form.headline.trim(), call_to_action: form.callToAction as "learn_more" | "shop_now" | "sign_up" | "apply_now" } : form.creativeFormat === "carousel" ? { format: "carousel" as const, primary_text: form.primaryText.trim(), cards: pad(assets, 2).map((image_asset_id, index) => ({ image_asset_id, headline: `${form.headline.trim()} ${index + 1}`, destination: form.destination.trim() })), call_to_action: form.callToAction as "learn_more" | "shop_now" | "sign_up" | "apply_now" } : { format: "image" as const, image_asset_id: assets[0], primary_text: form.primaryText.trim(), headline: form.headline.trim(), call_to_action: form.callToAction as "learn_more" | "shop_now" | "sign_up" | "apply_now" };
    return { ...common, platform: "meta", objective: form.objective as "traffic" | "leads" | "sales", buying_type: "auction", conversion_location: "website", optimization_goal: form.optimizationGoal as "landing_page_views" | "link_clicks" | "offsite_conversions", billing_event: "impressions", pixel_id: form.pixelId.trim(), conversion_event: form.conversionEvent as "view_content" | "lead" | "purchase", placements: form.placementMode === "automatic" ? { mode: "automatic" } : { mode: "manual", values: split(form.manualPlacements) as Array<"facebook_feed" | "facebook_reels" | "facebook_stories" | "instagram_feed" | "instagram_reels" | "instagram_stories"> }, targeting: { countries: split(form.countries), age_min: Number(form.ageMin), age_max: Number(form.ageMax), genders: split(form.genders) as Array<"all" | "female" | "male">, interests: split(form.interests) }, special_ad_categories: [], creative } as CampaignPlanDraftInput;
  }
  return { ...common, platform: "tiktok", objective: form.objective as "traffic" | "web_conversions" | "lead_generation", campaign_type: "auction", budget_mode: "daily", optimization_goal: form.optimizationGoal as "click" | "landing_page_view" | "complete_payment" | "lead", pixel_id: form.pixelId.trim(), conversion_event: form.conversionEvent as "page_view" | "purchase" | "submit_form", placements: form.placementMode === "automatic" ? { mode: "automatic" } : { mode: "manual", values: ["tiktok"] }, targeting: { countries: split(form.countries), languages: split(form.languages), age_groups: ["25-34", "35-44"], genders: split(form.genders) as Array<"all" | "female" | "male">, interests: split(form.interests), operating_systems: split(form.operatingSystems) as Array<"android" | "ios"> }, identity: { type: "regular", display_name: form.identityName.trim() }, creative: { format: "single_video", spark_ad: false, video_id: split(form.assetIds)[0], ad_text: form.primaryText.trim(), call_to_action: form.callToAction as "learn_more" | "shop_now" | "sign_up" | "apply_now" } } as CampaignPlanDraftInput;
}

function metaCreativeFields(creative: Extract<CampaignPlanDetail["currentRevision"]["payload"], { platform: "meta" }>["creative"], destination: string) {
  if (creative.format === "existing_post") return { assetIds: creative.post_id, primaryText: "", headline: "" };
  if (creative.format === "video") return { assetIds: creative.video_asset_id, primaryText: creative.primary_text, headline: creative.headline, callToAction: creative.call_to_action };
  if (creative.format === "carousel") return { assetIds: creative.cards.map((card) => card.image_asset_id).join(", "), primaryText: creative.primary_text, headline: creative.cards[0]?.headline ?? "", destination: creative.cards[0]?.destination ?? destination, callToAction: creative.call_to_action };
  return { assetIds: creative.image_asset_id, primaryText: creative.primary_text, headline: creative.headline, callToAction: creative.call_to_action };
}

function split(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function pad(values: string[], minimum: number) { const result = [...values]; while (result.length < minimum) result.push(`${result[0] || "Stage 2 asset"} ${result.length + 1}`); return result; }
