import type { AdsChangeSet, AdsDraftData, AdsDraftValidationIssue, AdsDraftValidationResult } from "@/lib/ads-edit/types";

const MAX_HEADLINES = 15;
const MAX_DESCRIPTIONS = 4;

export function validateAdsDraft(draftData: AdsDraftData): AdsDraftValidationResult {
  const issues: AdsDraftValidationIssue[] = [];

  requireText(issues, "campaignSettings.campaignName", draftData.campaignSettings.campaignName, "Campaign name is required.");
  requireText(issues, "campaignSettings.adGroupName", draftData.campaignSettings.adGroupName, "Ad group name is required.");
  requireText(issues, "campaignSettings.adName", draftData.campaignSettings.adName, "Ad name is required.");

  if (draftData.adContent.finalUrl.trim()) {
    try {
      const url = new URL(draftData.adContent.finalUrl.trim());
      if (!["http:", "https:"].includes(url.protocol)) {
        issues.push({ path: "adContent.finalUrl", message: "Final URL must start with http:// or https://." });
      }
    } catch {
      issues.push({ path: "adContent.finalUrl", message: "Final URL must be a valid URL." });
    }
  }

  if (draftData.adContent.headlines.length > MAX_HEADLINES) {
    issues.push({ path: "adContent.headlines", message: `Google responsive search ads support up to ${MAX_HEADLINES} headlines.` });
  }

  draftData.adContent.headlines.forEach((headline, index) => {
    if (!headline.text.trim()) {
      issues.push({ path: `adContent.headlines.${index}`, message: `Headline ${index + 1} cannot be empty.` });
    }
    if (headline.text.length > 30) {
      issues.push({ path: `adContent.headlines.${index}`, message: `Headline ${index + 1} should be 30 characters or fewer.` });
    }
  });

  if (draftData.adContent.descriptions.length > MAX_DESCRIPTIONS) {
    issues.push({ path: "adContent.descriptions", message: `Google responsive search ads support up to ${MAX_DESCRIPTIONS} descriptions.` });
  }

  draftData.adContent.descriptions.forEach((description, index) => {
    if (!description.text.trim()) {
      issues.push({ path: `adContent.descriptions.${index}`, message: `Description ${index + 1} cannot be empty.` });
    }
    if (description.text.length > 90) {
      issues.push({ path: `adContent.descriptions.${index}`, message: `Description ${index + 1} should be 90 characters or fewer.` });
    }
  });

  draftData.keywords.forEach((keyword, index) => {
    if (!keyword.trim()) {
      issues.push({ path: `keywords.${index}`, message: `Keyword ${index + 1} cannot be empty.` });
    }
  });

  draftData.sitelinks.forEach((sitelink, index) => {
    if (!sitelink.linkText.trim()) {
      issues.push({ path: `sitelinks.${index}.linkText`, message: `Sitelink ${index + 1} needs link text.` });
    }
    if (sitelink.finalUrl?.trim()) {
      try {
        new URL(sitelink.finalUrl.trim());
      } catch {
        issues.push({ path: `sitelinks.${index}.finalUrl`, message: `Sitelink ${index + 1} has an invalid final URL.` });
      }
    }
  });

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function validateAdsChangeSet(changeSet: AdsChangeSet): AdsDraftValidationResult {
  const issues: AdsDraftValidationIssue[] = [];
  if (!changeSet.accountId.trim()) {
    issues.push({ path: "accountId", message: "Account ID is required for sync." });
  }
  if (!changeSet.campaignId.trim() || !changeSet.adGroupId.trim() || !changeSet.adId.trim()) {
    issues.push({ path: "entityIds", message: "Campaign, ad group, and ad IDs are required for sync." });
  }
  if (changeSet.changes.length === 0) {
    issues.push({ path: "changes", message: "There are no changes to sync." });
  }

  changeSet.changes.forEach((change) => {
    if (change.path.startsWith("locked.") || change.path.includes("historicalMetrics")) {
      issues.push({ path: change.path, message: `${change.label} is locked and cannot be synced.` });
    }
    if (typeof change.after === "string" && isRequiredPath(change.path) && !change.after.trim()) {
      issues.push({ path: change.path, message: `${change.label} cannot be blank.` });
    }
    if (change.path === "adContent.finalUrl" && typeof change.after === "string" && change.after.trim()) {
      try {
        const url = new URL(change.after.trim());
        if (!["http:", "https:"].includes(url.protocol)) {
          issues.push({ path: change.path, message: "Final URL must start with http:// or https://." });
        }
      } catch {
        issues.push({ path: change.path, message: "Final URL must be a valid URL." });
      }
    }
  });

  return {
    valid: issues.length === 0,
    issues,
  };
}

function requireText(issues: AdsDraftValidationIssue[], path: string, value: string, message: string) {
  if (!value.trim()) {
    issues.push({ path, message });
  }
}

function isRequiredPath(path: string): boolean {
  return [
    "campaignSettings.campaignName",
    "campaignSettings.adGroupName",
    "campaignSettings.adName",
  ].includes(path);
}
