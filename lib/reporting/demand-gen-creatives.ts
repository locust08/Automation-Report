import { aggregateDemandMetrics, type DemandNativeRow, type DemandValues } from "./demand-gen";

export type DemandCreative = {
  assetId: string; assetResource: string; kind: "image" | "video"; previewUrl: string;
  metrics: DemandValues; performanceComplete: boolean;
};
export type SelectedDemandCreative = DemandCreative & { selection: "top_performing" | "representative" };
type Ref = { asset?: string };
export type DemandAdDefinition = {
  demandGenMultiAssetAd?: { marketingImages?: Ref[]; squareMarketingImages?: Ref[]; portraitMarketingImages?: Ref[]; classicDisplayImages?: Ref[] };
  demandGenVideoResponsiveAd?: { videos?: Ref[] };
  demandGenCarouselAd?: { carouselCards?: Ref[] };
};
type Asset = { resourceName?: string; imageAsset?: { fullSize?: { url?: string } }; youtubeVideoAsset?: { youtubeVideoId?: string }; demandGenCarouselCardAsset?: { marketingImageAsset?: string; squareMarketingImageAsset?: string; portraitMarketingImageAsset?: string } };
type Query = <T>(sql: string) => Promise<{ rows: T[]; complete: boolean; reason?: string | null }>;
const creativeFieldTypes = new Set(["MARKETING_IMAGE", "SQUARE_MARKETING_IMAGE", "PORTRAIT_MARKETING_IMAGE", "CLASSIC_DISPLAY_IMAGE", "YOUTUBE_VIDEO", "DEMAND_GEN_CAROUSEL_CARD"]);
const available = (value: number | null) => value !== null && Number.isFinite(value) && value >= 0;
export function selectDemandCreative(creatives: DemandCreative[]): SelectedDemandCreative | null {
  const previews = creatives.filter(creative => creative.previewUrl).sort((a,b) => a.assetResource.localeCompare(b.assetResource));
  if (!previews.length) return null;
  const complete = creatives.every(c => c.previewUrl && c.performanceComplete && [c.metrics.conversions,c.metrics.clicks,c.metrics.impressions].every(available));
  const delivered = previews.filter(c => (c.metrics.impressions ?? 0) > 0);
  if (!complete || !delivered.length) return { ...previews[0], selection: "representative" };
  delivered.sort((a,b) => (b.metrics.conversions! - a.metrics.conversions!) || (b.metrics.clicks! - a.metrics.clicks!) || (b.metrics.impressions! - a.metrics.impressions!) || a.assetResource.localeCompare(b.assetResource));
  return { ...delivered[0], selection: "top_performing" };
}
export const demandCreativeLabel = (selection?: SelectedDemandCreative["selection"]) => selection === "top_performing" ? "Top-performing creative · conversions, clicks, impressions" : "Representative creative — performance unavailable";

/** Ad/asset relations are scoped independently: shared asset IDs never share metrics. */
export async function collectDemandCreatives(ads: { resourceName: string; ad: DemandAdDefinition }[], query: Query, scope: string, customerId: string) {
  const validAsset = (ref: string) => new RegExp(`^customers/${customerId}/assets/\\d+$`).test(ref);
  const validAd = (ref: string) => new RegExp(`^customers/${customerId}/adGroupAds/\\d+~\\d+$`).test(ref);
  if (!/^\d+$/.test(customerId) || ads.some(ad => !validAd(ad.resourceName))) throw new Error("Creative lookup requires exact account-owned ad resources.");
  const refsByAd = new Map(ads.map(({ resourceName, ad }) => {
    const images = ad.demandGenMultiAssetAd;
    const refs = [...(images?.marketingImages ?? []), ...(images?.squareMarketingImages ?? []), ...(images?.portraitMarketingImages ?? []), ...(images?.classicDisplayImages ?? []), ...(ad.demandGenVideoResponsiveAd?.videos ?? []), ...(ad.demandGenCarouselAd?.carouselCards ?? [])].flatMap(ref => ref.asset ? [ref.asset] : []);
    if (refs.some(ref => !validAsset(ref))) throw new Error("Creative asset does not belong to this account.");
    return [resourceName, [...new Set(refs)]] as const;
  }));
  const warnings: string[] = [];
  const performance = new Map<string, DemandNativeRow[]>();
  let performanceComplete = true, metadataComplete = true;
  for (let offset = 0; offset < ads.length; offset += 100) {
    try {
      const result = await query<DemandNativeRow & { adGroupAdAssetView?: { adGroupAd?: string; asset?: string; fieldType?: string } }>(`SELECT ad_group_ad_asset_view.ad_group_ad, ad_group_ad_asset_view.asset, ad_group_ad_asset_view.field_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM ad_group_ad_asset_view WHERE ${scope} AND ad_group_ad_asset_view.ad_group_ad IN (${ads.slice(offset,offset+100).map(ad => `'${ad.resourceName}'`).join(",")})`);
      performanceComplete &&= result.complete;
      for (const row of result.rows) {
        const owner = row.adGroupAdAssetView?.adGroupAd, asset = row.adGroupAdAssetView?.asset;
        if (!owner || !asset || !refsByAd.get(owner)?.includes(asset) || !creativeFieldTypes.has(row.adGroupAdAssetView?.fieldType ?? "")) continue;
        const key = `${owner}|${asset}`; performance.set(key,[...(performance.get(key) ?? []),row]);
      }
    } catch { performanceComplete = false; }
  }
  if (!performanceComplete) warnings.push("Creative performance is incomplete; displayed images are representative, not ranked.");
  const assets = new Map<string, Asset>();
  const loadAssets = async (refs: string[]) => {
    for (let offset=0; offset<refs.length; offset+=100) {
      const batch = refs.slice(offset,offset+100);
      try {
        const result = await query<{ asset?: Asset }>(`SELECT asset.resource_name, asset.image_asset.full_size.url, asset.youtube_video_asset.youtube_video_id, asset.demand_gen_carousel_card_asset.marketing_image_asset, asset.demand_gen_carousel_card_asset.square_marketing_image_asset, asset.demand_gen_carousel_card_asset.portrait_marketing_image_asset FROM asset WHERE asset.resource_name IN (${batch.map(ref => `'${ref}'`).join(",")})`);
        metadataComplete &&= result.complete;
        for (const row of result.rows) if (row.asset?.resourceName && batch.includes(row.asset.resourceName)) assets.set(row.asset.resourceName,row.asset);
        metadataComplete &&= batch.every(ref => assets.has(ref));
      } catch { metadataComplete = false; }
    }
  };
  const refs = [...new Set([...refsByAd.values()].flat())];
  await loadAssets(refs);
  const cardImages = (asset?: Asset) => Object.values(asset?.demandGenCarouselCardAsset ?? {}).filter((ref): ref is string => typeof ref === "string" && validAsset(ref));
  await loadAssets([...new Set([...assets.values()].flatMap(cardImages))].filter(ref => !assets.has(ref)));
  if (!metadataComplete) warnings.push("Some creative previews are unavailable; displayed images are representative, not ranked.");
  const byAd = new Map<string,DemandCreative[]>();
  for (const [owner, refs] of refsByAd) {
    const creatives = refs.map(ref => {
      const asset = assets.get(ref);
      const id = asset?.youtubeVideoAsset?.youtubeVideoId;
      const image = asset?.imageAsset?.fullSize?.url || cardImages(asset).map(child => assets.get(child)?.imageAsset?.fullSize?.url).find(Boolean);
      const observations = performance.get(`${owner}|${ref}`) ?? [];
      return { assetId: ref.split("/").at(-1)!, assetResource: ref, kind: id ? "video" as const : "image" as const,
        previewUrl: image || (id && /^[\w-]{11}$/.test(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ""),
        metrics: aggregateDemandMetrics(performanceComplete ? observations : []), performanceComplete: performanceComplete && metadataComplete && observations.length > 0 };
    });
    byAd.set(owner,creatives);
  }
  return { byAd, warnings, complete: performanceComplete && metadataComplete };
}
