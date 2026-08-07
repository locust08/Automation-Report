export const ADS_ROLES = [
  "admin",
  "paid_media_specialist",
  "campaign_optimizer",
  "specialist",
  "approver",
  "team_lead",
  "project_manager",
  "viewer",
] as const;

export type AdsRole = (typeof ADS_ROLES)[number];

export type AuthenticatedAdsUser = {
  id: string;
  email: string;
  role: string;
  displayName: string;
};

export function normalizeAdsRole(role: string): AdsRole {
  const normalized = role.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return ADS_ROLES.includes(normalized as AdsRole) ? normalized as AdsRole : "viewer";
}

export function canEditAds(role: string): boolean {
  return ["admin", "paid_media_specialist", "campaign_optimizer", "specialist", "team_lead", "project_manager"].includes(normalizeAdsRole(role));
}

export function adsRoleLabel(role: string): string {
  return normalizeAdsRole(role).split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}
