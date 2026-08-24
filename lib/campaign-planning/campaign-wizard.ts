import type { CampaignPlatform } from "./types";

export type CampaignWizardForm = {
  platform: CampaignPlatform;
  accountId: string; packageId: string; campaignName: string; objective: string;
  destination: string; startDate: string; endDate: string; allocatedBudget: string; trackingTemplate: string;
  campaignType: string; biddingStrategy: string; targetCpa: string; targetRoas: string; searchPartners: string;
  locations: string; languages: string; conversionActionId: string; conversionCategory: string; groupName: string; keywords: string;
  optimizationGoal: string; billingEvent: string; pixelId: string; conversionEvent: string; placementMode: string;
  manualPlacements: string; countries: string; ageMin: string; ageMax: string; genders: string; interests: string;
  operatingSystems: string; creativeFormat: string; assetIds: string; primaryText: string; headline: string;
  descriptions: string; businessName: string; callToAction: string; identityName: string;
};

export type CampaignWizardStep = { id: string; label: string; description: string };
export type CampaignWizardFieldError = { field: keyof CampaignWizardForm; message: string };
export type CampaignWizardDraft = {
  platform: CampaignPlatform;
  currentStep: number;
  highestReachedStep: number;
  formData: Partial<CampaignWizardForm>;
  updatedAt: string;
};

export type CampaignEditDraft = CampaignWizardDraft & {
  planId: number;
  baseRevisionId: number;
  baseLockVersion: number;
};

const STEP_LABELS: Record<CampaignPlatform, CampaignWizardStep[]> = {
  google: [
    { id: "account", label: "Platform & Account", description: "Choose where this campaign will run." },
    { id: "goal", label: "Goal & Campaign Type", description: "Set the outcome and Google campaign format." },
    { id: "settings", label: "Campaign Settings", description: "Configure budget, flight, bidding, and targeting." },
    { id: "creative", label: "Ad Group & Ad", description: "Build the ad group and its creative." },
    { id: "review", label: "Review", description: "Review and create the local draft." },
  ],
  meta: [
    { id: "account", label: "Platform & Account", description: "Choose where this campaign will run." },
    { id: "campaign", label: "Campaign", description: "Choose the objective and campaign identity." },
    { id: "ad-set", label: "Ad Set", description: "Configure delivery, audience, budget, and placements." },
    { id: "ad", label: "Ad", description: "Create the Meta ad creative." },
    { id: "review", label: "Review", description: "Review and create the local draft." },
  ],
  tiktok: [
    { id: "account", label: "Platform & Account", description: "Choose where this campaign will run." },
    { id: "campaign", label: "Campaign", description: "Choose the objective and campaign identity." },
    { id: "ad-group", label: "Ad Group", description: "Configure delivery, audience, budget, and placements." },
    { id: "ad", label: "Ad", description: "Create the TikTok video ad." },
    { id: "review", label: "Review", description: "Review and create the local draft." },
  ],
};

const BASE_FORM: CampaignWizardForm = {
  platform: "google", accountId: "", packageId: "", campaignName: "", objective: "leads",
  destination: "https://example.test/landing", startDate: "2026-08-22", endDate: "2026-09-21", allocatedBudget: "5000",
  trackingTemplate: "{lpurl}?utm_source=m04_stage2", campaignType: "search", biddingStrategy: "target_cpa", targetCpa: "50",
  targetRoas: "", searchPartners: "false", locations: "MY-KUL, MY-SEL", languages: "en, ms",
  conversionActionId: "mock-conversion-action", conversionCategory: "submit_lead_form", groupName: "Core intent",
  keywords: "stage two campaign, local campaign draft", optimizationGoal: "offsite_conversions", billingEvent: "impressions",
  pixelId: "mock-pixel-id", conversionEvent: "lead", placementMode: "automatic", manualPlacements: "facebook_feed, instagram_feed",
  countries: "MY", ageMin: "21", ageMax: "55", genders: "all", interests: "business software", operatingSystems: "android, ios",
  creativeFormat: "responsive_search_ad", assetIds: "mock-image-1, mock-image-2, mock-image-3",
  primaryText: "Planned locally. No provider calls are made.", headline: "Local Stage 2 campaign",
  descriptions: "A validated campaign draft, Stored only in local Supabase", businessName: "Stage 2 Business",
  callToAction: "learn_more", identityName: "Stage 2 Business",
};

export function getCampaignWizardSteps(platform: CampaignPlatform): CampaignWizardStep[] { return STEP_LABELS[platform]; }

export function shouldAutosaveCampaignWizardStep(step: number): boolean { return step < 4; }

export function getCampaignWizardPrimaryAction(step: number): { kind: "next" | "submit"; buttonType: "button" } {
  return { kind: step < 4 ? "next" : "submit", buttonType: "button" };
}

export function createCampaignWizardForm(platform: CampaignPlatform = "google"): CampaignWizardForm {
  if (platform === "meta") return { ...BASE_FORM, platform, objective: "leads", optimizationGoal: "offsite_conversions", conversionEvent: "lead", creativeFormat: "image" };
  if (platform === "tiktok") return { ...BASE_FORM, platform, objective: "traffic", optimizationGoal: "click", conversionEvent: "page_view", creativeFormat: "single_video", manualPlacements: "tiktok", assetIds: "mock-video-id" };
  return { ...BASE_FORM };
}

export function restoreCampaignWizardForm(platform: CampaignPlatform, persisted: Record<string, unknown>): CampaignWizardForm {
  const restored = createCampaignWizardForm(platform);
  for (const key of Object.keys(restored) as (keyof CampaignWizardForm)[]) {
    if (key === "platform") continue;
    const value = persisted[key];
    if (typeof value === "string" || typeof value === "number") restored[key] = String(value);
  }
  return restored;
}

export function switchCampaignWizardPlatform(_form: CampaignWizardForm, platform: CampaignPlatform) {
  return { form: createCampaignWizardForm(platform), currentStep: 0, highestReachedStep: 0 };
}

export function normalizeCampaignWizardProgress(currentStep: number, highestReachedStep: number) {
  const clamp = (value: number) => Math.min(4, Math.max(0, Number.isFinite(value) ? Math.floor(value) : 0));
  const highest = clamp(highestReachedStep);
  return { currentStep: Math.min(clamp(currentStep), highest), highestReachedStep: highest };
}

function required(form: CampaignWizardForm, fields: (keyof CampaignWizardForm)[]): CampaignWizardFieldError[] {
  return fields.flatMap((field) => String(form[field] ?? "").trim() ? [] : [{ field, message: `${fieldLabel(field)} is required.` }]);
}

export function validateCampaignWizardStep(form: CampaignWizardForm, step: number): CampaignWizardFieldError[] {
  if (step === 0) return required(form, ["accountId", "packageId"]);
  if (step === 1) {
    const errors = required(form, form.platform === "google" ? ["objective", "campaignType", "campaignName"] : ["objective", "campaignName"]);
    if (form.campaignName.trim().length > 160) errors.push({ field: "campaignName", message: "Campaign name must be 160 characters or fewer." });
    return errors;
  }
  if (step === 2) {
    const common: (keyof CampaignWizardForm)[] = ["destination", "startDate", "endDate", "allocatedBudget"];
    if (form.platform === "google") common.push("biddingStrategy", "locations", "languages", "conversionActionId");
    else common.push("optimizationGoal", "pixelId", "conversionEvent", "countries", "genders");
    if (form.placementMode === "manual") common.push("manualPlacements");
    const errors = required(form, common);
    if (form.startDate && form.endDate && form.endDate < form.startDate) errors.push({ field: "endDate", message: "End date must be on or after the start date." });
    if (!(Number(form.allocatedBudget) > 0)) errors.push({ field: "allocatedBudget", message: "Allocated budget must be greater than zero." });
    if (form.destination && !isHttpUrl(form.destination)) errors.push({ field: "destination", message: "Destination must be a valid HTTP or HTTPS URL." });
    if (form.trackingTemplate.length > 2_000) errors.push({ field: "trackingTemplate", message: "Tracking template must be 2,000 characters or fewer." });
    if (form.platform === "google" && form.biddingStrategy === "target_cpa" && !(Number(form.targetCpa) > 0)) errors.push({ field: "targetCpa", message: "Target CPA must be greater than zero." });
    if (form.platform === "google" && form.biddingStrategy === "target_roas" && !(Number(form.targetRoas) > 0)) errors.push({ field: "targetRoas", message: "Target ROAS must be greater than zero." });
    if (form.platform === "google" && form.campaignType !== "search" && form.biddingStrategy === "maximize_clicks") errors.push({ field: "biddingStrategy", message: "Maximize clicks is available only for Search campaigns." });
    if (form.platform === "meta" && !validMetaCombination(form)) errors.push({ field: "optimizationGoal", message: "Meta optimization and conversion event must match the objective." });
    if (form.platform === "tiktok" && !validTikTokCombination(form)) errors.push({ field: "optimizationGoal", message: "TikTok optimization and conversion event must match the objective." });
    return errors;
  }
  if (step === 3) {
    if (form.platform === "google") return validateGoogleCreative(form);
    if (form.platform === "meta") return validateMetaCreative(form);
    return validateTikTokCreative(form);
  }
  return [0, 1, 2, 3].flatMap((index) => validateCampaignWizardStep(form, index));
}

function validateGoogleCreative(form: CampaignWizardForm): CampaignWizardFieldError[] {
  const errors = required(form, ["groupName", ...(form.campaignType === "search" ? ["keywords" as const] : []), "headline", "descriptions", ...(form.campaignType === "search" ? [] : ["assetIds" as const, "businessName" as const])]);
  const headlines = splitItems(form.headline);
  const descriptions = splitItems(form.descriptions);
  const assets = splitItems(form.assetIds);
  const settings = form.campaignType === "search"
    ? { label: "Search", headlineMin: 3, headlineMax: 15, headlineLength: 30, descriptionMin: 2, descriptionMax: 4 }
    : form.campaignType === "performance_max"
      ? { label: "Performance Max", headlineMin: 3, headlineMax: 15, headlineLength: 30, descriptionMin: 2, descriptionMax: 5 }
      : { label: "Demand Gen", headlineMin: 1, headlineMax: 5, headlineLength: 40, descriptionMin: 1, descriptionMax: 5 };
  addListErrors(errors, "headline", `${settings.label} headline`, headlines, settings.headlineMin, settings.headlineMax, settings.headlineLength);
  addListErrors(errors, "descriptions", `${settings.label} description`, descriptions, settings.descriptionMin, settings.descriptionMax, 90);
  if (form.campaignType !== "search") {
    if (assets.length > 20) errors.push({ field: "assetIds", message: "Use no more than 20 image asset IDs." });
    if (form.businessName.trim().length > 25) errors.push({ field: "businessName", message: "Business name must be 25 characters or fewer." });
  }
  return dedupeErrors(errors);
}

function validateMetaCreative(form: CampaignWizardForm): CampaignWizardFieldError[] {
  const errors = required(form, ["creativeFormat", "assetIds", ...(form.creativeFormat === "existing_post" ? [] : ["primaryText" as const, "headline" as const])]);
  if (form.primaryText.length > 2_200) errors.push({ field: "primaryText", message: "Primary text must be 2,200 characters or fewer." });
  if (form.headline.length > 255) errors.push({ field: "headline", message: "Headline must be 255 characters or fewer." });
  const assets = splitItems(form.assetIds);
  if (form.creativeFormat === "carousel" && (assets.length < 2 || assets.length > 10)) errors.push({ field: "assetIds", message: "Carousel ads require between 2 and 10 asset IDs." });
  return dedupeErrors(errors);
}

function validateTikTokCreative(form: CampaignWizardForm): CampaignWizardFieldError[] {
  const errors = required(form, ["identityName", "assetIds", "primaryText", "callToAction"]);
  if (form.identityName.length > 40) errors.push({ field: "identityName", message: "Identity name must be 40 characters or fewer." });
  if (form.primaryText.length > 100) errors.push({ field: "primaryText", message: "Ad text must be 100 characters or fewer." });
  return dedupeErrors(errors);
}

function addListErrors(errors: CampaignWizardFieldError[], field: keyof CampaignWizardForm, label: string, values: string[], minimum: number, maximum: number, maxLength: number) {
  if (!values.length) return;
  if (values.length < minimum || values.length > maximum) errors.push({ field, message: `Use between ${minimum} and ${maximum} ${label.toLowerCase()}${maximum === 1 ? "" : "s"}.` });
  if (values.some((value) => value.length > maxLength)) errors.push({ field, message: `Each ${label} must be ${maxLength} characters or fewer.` });
}

function splitItems(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function dedupeErrors(errors: CampaignWizardFieldError[]) { return errors.filter((error, index) => errors.findIndex((item) => item.field === error.field && item.message === error.message) === index); }
function isHttpUrl(value: string) { try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; } }
function validMetaCombination(form: CampaignWizardForm) {
  if (form.objective === "traffic") return ["landing_page_views", "link_clicks"].includes(form.optimizationGoal) && form.conversionEvent === "view_content";
  return form.optimizationGoal === "offsite_conversions" && form.conversionEvent === (form.objective === "sales" ? "purchase" : "lead");
}
function validTikTokCombination(form: CampaignWizardForm) {
  if (form.objective === "traffic") return ["click", "landing_page_view"].includes(form.optimizationGoal) && form.conversionEvent === "page_view";
  if (form.objective === "web_conversions") return form.optimizationGoal === "complete_payment" && form.conversionEvent === "purchase";
  return form.optimizationGoal === "lead" && form.conversionEvent === "submit_form";
}

function fieldLabel(field: keyof CampaignWizardForm) {
  return String(field).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}
