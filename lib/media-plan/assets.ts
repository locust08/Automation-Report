import { MediaPlan, MediaPlanAsset, MediaPlanAssets } from "@/lib/media-plan/schema";

export function createEmptyMediaPlanAssets(): MediaPlanAssets {
  return {
    logo: [],
    productServiceImages: [],
  };
}

export function normalizeMediaPlanAssets(plan: Pick<MediaPlan, "assets">): MediaPlanAssets {
  return {
    ...createEmptyMediaPlanAssets(),
    ...(plan.assets ?? {}),
    logo: Array.isArray(plan.assets?.logo) ? plan.assets.logo : [],
    productServiceImages: Array.isArray(plan.assets?.productServiceImages)
      ? plan.assets.productServiceImages
      : [],
  };
}

export function mediaPlanHasAssets(plan: Pick<MediaPlan, "assets">): boolean {
  const assets = normalizeMediaPlanAssets(plan);
  return assets.logo.length > 0 || assets.productServiceImages.length > 0;
}

export function getMediaPlanAssetIds(plan: Pick<MediaPlan, "assets">): string[] {
  const assets = normalizeMediaPlanAssets(plan);
  return [...assets.logo, ...assets.productServiceImages].map((asset) => asset.id);
}

export function getMediaPlanAssets(plan: Pick<MediaPlan, "assets">): MediaPlanAsset[] {
  const assets = normalizeMediaPlanAssets(plan);
  return [...assets.logo, ...assets.productServiceImages];
}
