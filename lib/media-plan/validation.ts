import {
  DEFAULT_MEDIA_PLAN_LANGUAGE,
  DEFAULT_NETWORK,
  DEFAULT_TARGET_LOCATION,
  MEDIA_PLAN_LANGUAGE_OPTIONS,
  MEDIA_PLAN_LIMITS,
  MEDIA_PLAN_TARGET_LOCATION_OPTIONS,
  MediaPlan,
  MediaPlanBiddingStrategy,
  MediaPlanCampaignObjective,
  MediaPlanFormData,
  MediaPlanKeywordMatchType,
  MediaPlanLanguage,
  SUPPORTED_CAMPAIGN_TYPE,
} from "@/lib/media-plan/schema";

export interface MediaPlanValidationIssue {
  path: string;
  message: string;
}

export interface MediaPlanValidationResult {
  valid: boolean;
  issues: MediaPlanValidationIssue[];
}

export interface GeneratedMediaPlanValidationResult extends MediaPlanValidationResult {
  plan: MediaPlan | null;
}

const CAMPAIGN_OBJECTIVES = new Set<MediaPlanCampaignObjective>([
  "Leads",
  "Sales",
  "Website Traffic",
]);
const BIDDING_STRATEGIES = new Set<MediaPlanBiddingStrategy>(["Conversions", "Clicks"]);
const LANGUAGES = new Set<MediaPlanLanguage>(MEDIA_PLAN_LANGUAGE_OPTIONS);
const MATCH_TYPES = new Set<MediaPlanKeywordMatchType>(["BROAD", "PHRASE", "EXACT"]);
const MAX_SPECIAL_REMARKS_LENGTH = 4000;
const MALAYSIA_LOCATION_OPTIONS = new Set<string>(MEDIA_PLAN_TARGET_LOCATION_OPTIONS);
const UNSUPPORTED_CLAIM_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\baward[-\s]?winning\b/i, label: "award claim" },
  { pattern: /(?:^|\s)#\s?1\b|\bnumber\s+one\b/i, label: "ranking claim" },
  { pattern: /\b(?:cheapest|best\s+in|best\s+price)\b/i, label: "superlative pricing claim" },
  { pattern: /\bguaranteed\b/i, label: "guarantee claim" },
  { pattern: /\b(?:5[-\s]?star|five[-\s]?star|top[-\s]?rated)\b/i, label: "review claim" },
  { pattern: /\b(?:free|discount|promo|promotion|limited\s+time)\b/i, label: "promotion claim" },
  { pattern: /\bRM\s?\d/i, label: "specific price claim" },
];

export function validateMediaPlanForm(form: MediaPlanFormData): MediaPlanValidationResult {
  const issues: MediaPlanValidationIssue[] = [];

  validateRequiredUrl(issues, "websiteUrl", form.websiteUrl, "Website URL must be a valid URL.");
  validatePositiveNumber(issues, "adBudget", form.adBudget, "Ad Budget must be a number greater than 0.");

  if (!form.googleCid.trim()) {
    issues.push({ path: "googleCid", message: "Google CID is required." });
  } else {
    validateGoogleCid(issues, "googleCid", form.googleCid);
  }

  if (form.specialRemarks.length > MAX_SPECIAL_REMARKS_LENGTH) {
    issues.push({
      path: "specialRemarks",
      message: `Special Remarks must be ${MAX_SPECIAL_REMARKS_LENGTH} characters or fewer.`,
    });
  }

  validateCampaignType(issues, "campaignType", form.campaignType);
  validateLocationValue(issues, "targetLocation", form.targetLocation);
  validateLanguageValue(issues, "language", form.language);

  return { valid: issues.length === 0, issues };
}

export function validateMediaPlan(plan: MediaPlan | null): MediaPlanValidationResult {
  const result = validateGeneratedMediaPlan(plan);
  return { valid: result.valid, issues: result.issues };
}

export function validateGeneratedMediaPlan(value: unknown): GeneratedMediaPlanValidationResult {
  const issues: MediaPlanValidationIssue[] = [];

  if (!isRecord(value)) {
    return {
      valid: false,
      plan: null,
      issues: [{ path: "plan", message: "OpenAI output must be a JSON object." }],
    };
  }

  validateString(issues, value, "batchPreviewId", "Batch preview ID is required.");
  validateCampaign(issues, value.campaign);
  validateAdGroups(issues, value.adGroups);
  validatePlanningNotes(issues, value.planningNotes);

  return {
    valid: issues.length === 0,
    issues,
    plan: issues.length === 0 ? (value as unknown as MediaPlan) : null,
  };
}

export function getIssueMessage(
  issues: MediaPlanValidationIssue[],
  path: string
): string | null {
  return issues.find((issue) => issue.path === path)?.message ?? null;
}

export function hasIssueForPath(
  issues: MediaPlanValidationIssue[],
  path: string
): boolean {
  return issues.some((issue) => issue.path === path || issue.path.startsWith(`${path}.`));
}

export function normalizeMediaPlanFormInput(value: unknown): MediaPlanFormData {
  const body = isRecord(value) ? value : {};
  return {
    websiteUrl: readString(body.websiteUrl),
    adBudget: readString(body.adBudget),
    googleCid: readString(body.googleCid),
    campaignType: readString(body.campaignType) || SUPPORTED_CAMPAIGN_TYPE,
    specialRemarks: readString(body.specialRemarks),
    targetLocation: readString(body.targetLocation) || DEFAULT_TARGET_LOCATION,
    language: readString(body.language) || DEFAULT_MEDIA_PLAN_LANGUAGE,
  };
}

function validateCampaign(issues: MediaPlanValidationIssue[], value: unknown) {
  if (!isRecord(value)) {
    issues.push({ path: "campaign", message: "Campaign must be a JSON object." });
    return;
  }

  validateString(issues, value, "campaign.campaignName", "Campaign name is required.");
  validateString(issues, value, "campaign.brandOrClientName", "Brand or client name is required.");
  validateString(issues, value, "campaign.businessName", "Business name is required.");
  validateEnum(
    issues,
    value.campaignObjective,
    "campaign.campaignObjective",
    CAMPAIGN_OBJECTIVES,
    "Campaign objective must be Leads, Sales, or Website Traffic."
  );
  validateCampaignType(issues, "campaign.campaignType", readString(value.campaignType));
  validateEnum(
    issues,
    value.biddingStrategy,
    "campaign.biddingStrategy",
    BIDDING_STRATEGIES,
    "Bidding strategy must be Conversions or Clicks."
  );
  validateRequiredUrl(
    issues,
    "campaign.websiteUrl",
    readString(value.websiteUrl),
    "Campaign website URL must be valid."
  );
  validateRequiredUrl(
    issues,
    "campaign.finalUrl",
    readString(value.finalUrl),
    "Final URL must be valid."
  );
  validateDate(issues, "campaign.startDate", value.startDate);
  validatePositivePlanNumber(
    issues,
    value.averageDailyBudget,
    "campaign.averageDailyBudget",
    "Average daily budget must be a number greater than 0."
  );
  if (value.targetCPA !== null) {
    validateNumber(issues, value.targetCPA, "campaign.targetCPA", "Target CPA must be a number or null.");
  }
  validateExactNetwork(issues, value.network);
  validateString(issues, value, "campaign.networkNotes", "Network notes are required.");
  validateStringArray(issues, value.targetLocation, "campaign.targetLocation", "Target location is required.");
  validateLocationArray(issues, value.targetLocation);
  validateLanguageArray(issues, value.language);
}

function validateAdGroups(issues: MediaPlanValidationIssue[], value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({ path: "adGroups", message: "At least one ad group is required." });
    return;
  }

  value.forEach((item, adGroupIndex) => {
    const prefix = `adGroups.${adGroupIndex}`;
    if (!isRecord(item)) {
      issues.push({ path: prefix, message: `Ad group ${adGroupIndex + 1} must be a JSON object.` });
      return;
    }

    validateString(issues, item, `${prefix}.adGroupName`, `Ad group ${adGroupIndex + 1} needs a name.`);
    validateString(issues, item, `${prefix}.intentType`, `Ad group ${adGroupIndex + 1} needs an intent type.`);
    validateKeywords(issues, item.keywords, prefix, adGroupIndex);
    validateCopyArray(
      issues,
      item.headlines,
      `${prefix}.headlines`,
      `Ad group ${adGroupIndex + 1}`,
      "Headline",
      3,
      MEDIA_PLAN_LIMITS.headline
    );
    validateCopyArray(
      issues,
      item.descriptions,
      `${prefix}.descriptions`,
      `Ad group ${adGroupIndex + 1}`,
      "Description",
      2,
      MEDIA_PLAN_LIMITS.description
    );
    validateMaxLength(
      issues,
      `${prefix}.displayPath1`,
      readString(item.displayPath1),
      MEDIA_PLAN_LIMITS.displayPath,
      `Display Path 1 in ad group ${adGroupIndex + 1}`
    );
    validateMaxLength(
      issues,
      `${prefix}.displayPath2`,
      readString(item.displayPath2),
      MEDIA_PLAN_LIMITS.displayPath,
      `Display Path 2 in ad group ${adGroupIndex + 1}`
    );
    validateSitelinks(issues, item.sitelinks, prefix, adGroupIndex);
  });
}

function validatePlanningNotes(issues: MediaPlanValidationIssue[], value: unknown) {
  if (!isRecord(value)) {
    issues.push({ path: "planningNotes", message: "Planning notes must be a JSON object." });
    return;
  }

  validateString(issues, value, "planningNotes.strategy", "Planning strategy is required.");
  validateStringArray(issues, value.assumptions, "planningNotes.assumptions", "Planning assumptions must be a list.");
  validateStringArray(issues, value.warnings, "planningNotes.warnings", "Planning warnings must be a list.");
}

function validateKeywords(
  issues: MediaPlanValidationIssue[],
  value: unknown,
  prefix: string,
  adGroupIndex: number
) {
  if (!Array.isArray(value)) {
    issues.push({ path: `${prefix}.keywords`, message: `Ad group ${adGroupIndex + 1} keywords must be a list.` });
    return;
  }
  if (value.length === 0) {
    issues.push({ path: `${prefix}.keywords`, message: `Ad group ${adGroupIndex + 1} needs at least 1 keyword.` });
  }
  if (value.length > MEDIA_PLAN_LIMITS.keywords) {
    issues.push({
      path: `${prefix}.keywords`,
      message: `Ad group ${adGroupIndex + 1} can have up to ${MEDIA_PLAN_LIMITS.keywords} keywords.`,
    });
  }

  value.forEach((keyword, keywordIndex) => {
    if (!isRecord(keyword)) {
      issues.push({
        path: `${prefix}.keywords.${keywordIndex}`,
        message: `Keyword ${keywordIndex + 1} in ad group ${adGroupIndex + 1} must be a JSON object.`,
      });
      return;
    }
    validateString(
      issues,
      keyword,
      `${prefix}.keywords.${keywordIndex}.text`,
      `Keyword ${keywordIndex + 1} in ad group ${adGroupIndex + 1} needs text.`
    );
    validateUnsafeClaims(
      issues,
      `${prefix}.keywords.${keywordIndex}.text`,
      readString(keyword.text),
      `Keyword ${keywordIndex + 1} in ad group ${adGroupIndex + 1}`
    );
    validateEnum(
      issues,
      keyword.matchType,
      `${prefix}.keywords.${keywordIndex}.matchType`,
      MATCH_TYPES,
      `Keyword ${keywordIndex + 1} in ad group ${adGroupIndex + 1} must use BROAD, PHRASE, or EXACT match.`
    );
  });
}

function validateCopyArray(
  issues: MediaPlanValidationIssue[],
  value: unknown,
  path: string,
  label: string,
  itemLabel: "Headline" | "Description",
  minItems: number,
  maxLength: number
) {
  if (!Array.isArray(value)) {
    issues.push({ path, message: `${label} ${itemLabel.toLowerCase()}s must be a list.` });
    return;
  }
  if (value.length < minItems) {
    issues.push({ path, message: `${label} needs at least ${minItems} ${itemLabel.toLowerCase()}s.` });
  }

  value.forEach((item, index) => {
    const itemPath = `${path}.${index}`;
    if (typeof item !== "string" || !item.trim()) {
      issues.push({ path: itemPath, message: `${itemLabel} ${index + 1} in ${label.toLowerCase()} cannot be empty.` });
      return;
    }
    validateMaxLength(issues, itemPath, item, maxLength, `${itemLabel} ${index + 1} in ${label.toLowerCase()}`);
    validateUnsafeClaims(issues, itemPath, item, `${itemLabel} ${index + 1} in ${label.toLowerCase()}`);
  });
}

function validateSitelinks(
  issues: MediaPlanValidationIssue[],
  value: unknown,
  prefix: string,
  adGroupIndex: number
) {
  if (!Array.isArray(value)) {
    issues.push({ path: `${prefix}.sitelinks`, message: `Ad group ${adGroupIndex + 1} sitelinks must be a list.` });
    return;
  }
  if (value.length > MEDIA_PLAN_LIMITS.sitelinks) {
    issues.push({
      path: `${prefix}.sitelinks`,
      message: `Ad group ${adGroupIndex + 1} can have up to ${MEDIA_PLAN_LIMITS.sitelinks} sitelinks.`,
    });
  }

  value.forEach((sitelink, sitelinkIndex) => {
    if (!isRecord(sitelink)) {
      issues.push({
        path: `${prefix}.sitelinks.${sitelinkIndex}`,
        message: `Sitelink ${sitelinkIndex + 1} in ad group ${adGroupIndex + 1} must be a JSON object.`,
      });
      return;
    }
    validateString(
      issues,
      sitelink,
      `${prefix}.sitelinks.${sitelinkIndex}.title`,
      `Sitelink ${sitelinkIndex + 1} in ad group ${adGroupIndex + 1} needs a title.`
    );
    validateString(
      issues,
      sitelink,
      `${prefix}.sitelinks.${sitelinkIndex}.url`,
      `Sitelink ${sitelinkIndex + 1} in ad group ${adGroupIndex + 1} needs a URL.`
    );
    const url = readString(sitelink.url);
    if (url) {
      validateRequiredUrl(
        issues,
        `${prefix}.sitelinks.${sitelinkIndex}.url`,
        url,
        `Sitelink ${sitelinkIndex + 1} in ad group ${adGroupIndex + 1} URL must be valid.`
      );
    }
    validateUnsafeClaims(
      issues,
      `${prefix}.sitelinks.${sitelinkIndex}.title`,
      readString(sitelink.title),
      `Sitelink ${sitelinkIndex + 1} in ad group ${adGroupIndex + 1}`
    );
  });
}

function validateRequiredUrl(
  issues: MediaPlanValidationIssue[],
  path: string,
  value: string,
  message: string
) {
  const trimmed = value.trim();
  if (!trimmed) {
    issues.push({ path, message });
    return;
  }

  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      issues.push({ path, message: `${message} It must start with http:// or https://.` });
    }
  } catch {
    issues.push({ path, message });
  }
}

function validatePositiveNumber(
  issues: MediaPlanValidationIssue[],
  path: string,
  value: string,
  message: string
) {
  const amount = Number(value.replace(/,/g, "").trim());
  if (!Number.isFinite(amount) || amount <= 0) {
    issues.push({ path, message });
  }
}

function validateGoogleCid(
  issues: MediaPlanValidationIssue[],
  path: string,
  value: string
) {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{10}$/.test(digits)) {
    issues.push({ path, message: "Google CID must contain exactly 10 digits." });
  }
}

function validateCampaignType(
  issues: MediaPlanValidationIssue[],
  path: string,
  value: string
) {
  if (value.trim() !== SUPPORTED_CAMPAIGN_TYPE) {
    issues.push({
      path,
      message:
        "Only Search is supported. Performance Max, Shopping, Video, Display, Demand Gen, and AI Max are not available in this feature.",
    });
  }
}

function validateString(
  issues: MediaPlanValidationIssue[],
  object: Record<string, unknown>,
  path: string,
  message: string
) {
  const key = path.split(".").at(-1) ?? path;
  const value = object[key];
  if (typeof value !== "string" || !value.trim()) {
    issues.push({ path, message });
  }
}

function validateStringArray(
  issues: MediaPlanValidationIssue[],
  value: unknown,
  path: string,
  message: string
) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    issues.push({ path, message });
  }
}

function validateLanguageArray(issues: MediaPlanValidationIssue[], value: unknown) {
  const path = "campaign.language";
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({ path, message: "At least one campaign language is required." });
    return;
  }

  value.forEach((item, index) => {
    if (!LANGUAGES.has(item as MediaPlanLanguage)) {
      issues.push({
        path: `${path}.${index}`,
        message: "Campaign language must be English, Malay, or Chinese.",
      });
    }
  });
}

function validateLocationArray(issues: MediaPlanValidationIssue[], value: unknown) {
  const path = "campaign.targetLocation";
  if (!Array.isArray(value)) {
    return;
  }
  value.forEach((item, index) => {
    if (typeof item === "string" && item.trim() && !MALAYSIA_LOCATION_OPTIONS.has(item.trim())) {
      issues.push({
        path: `${path}.${index}`,
        message: "Target location must be Malaysia Nationwide or a supported Malaysia location.",
      });
    }
  });
}

function validateLocationValue(issues: MediaPlanValidationIssue[], path: string, value: string) {
  if (!MALAYSIA_LOCATION_OPTIONS.has(value.trim())) {
    issues.push({
      path,
      message: "Target location must be Malaysia Nationwide or a supported Malaysia location.",
    });
  }
}

function validateLanguageValue(issues: MediaPlanValidationIssue[], path: string, value: string) {
  if (!LANGUAGES.has(value.trim() as MediaPlanLanguage)) {
    issues.push({ path, message: "Language must be English, Malay, or Chinese." });
  }
}

function validateUnsafeClaims(
  issues: MediaPlanValidationIssue[],
  path: string,
  value: string,
  label: string
) {
  for (const claim of UNSUPPORTED_CLAIM_PATTERNS) {
    if (claim.pattern.test(value)) {
      issues.push({
        path,
        message: `${label} contains an unsupported ${claim.label}. Verify the claim externally or remove it before approval.`,
      });
      return;
    }
  }
}

function validateEnum<T extends string>(
  issues: MediaPlanValidationIssue[],
  value: unknown,
  path: string,
  allowed: Set<T>,
  message: string
) {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    issues.push({ path, message });
  }
}

function validateNumber(
  issues: MediaPlanValidationIssue[],
  value: unknown,
  path: string,
  message: string
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push({ path, message });
  }
}

function validatePositivePlanNumber(
  issues: MediaPlanValidationIssue[],
  value: unknown,
  path: string,
  message: string
) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    issues.push({ path, message });
  }
}

function validateDate(issues: MediaPlanValidationIssue[], path: string, value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    issues.push({ path, message: "Start date must use YYYY-MM-DD format." });
  }
}

function validateExactNetwork(issues: MediaPlanValidationIssue[], value: unknown) {
  if (!Array.isArray(value) || value.length !== 1 || value[0] !== DEFAULT_NETWORK) {
    issues.push({ path: "campaign.network", message: "Network must be Google Search Only." });
  }
}

function validateMaxLength(
  issues: MediaPlanValidationIssue[],
  path: string,
  value: string,
  maxLength: number,
  label: string
) {
  if (!value.trim()) {
    issues.push({ path, message: `${label} is required.` });
    return;
  }
  if (value.length > maxLength) {
    issues.push({
      path,
      message: `${label} must be ${maxLength} characters or fewer.`,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
