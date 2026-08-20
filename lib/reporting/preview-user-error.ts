type PreviewErrorPlatform = "meta" | "google" | "tiktok";

export function formatPreviewFatalError(
  platform: PreviewErrorPlatform,
  details?: unknown,
): string {
  void details;
  if (platform === "tiktok") {
    return "TikTok Ads access is unavailable for this account. Ask an administrator to reconnect TikTok.";
  }
  if (platform === "google") {
    return "Google Ads access is unavailable for this account. Ask an administrator to check its access path and permissions.";
  }
  return "Meta Ads access is unavailable for this account. Ask an administrator to reconnect or update its permissions.";
}

export function formatPreviewLoadError(stage: "campaigns" | "adGroups" | "ads" | "details" | "assets"): string {
  const labels = {
    campaigns: "active campaigns",
    adGroups: "ad groups",
    ads: "ads",
    details: "preview details",
    assets: "creative assets",
  } as const;
  return `Unable to load ${labels[stage]}. Check account access and try again.`;
}
