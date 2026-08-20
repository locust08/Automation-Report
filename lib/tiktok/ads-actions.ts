export const TIKTOK_ADS_API_VERSION = "v1.3" as const;
export const TIKTOK_ADS_API_ORIGIN = "https://business-api.tiktok.com" as const;
export const TIKTOK_ADS_API_BASE = `${TIKTOK_ADS_API_ORIGIN}/open_api/${TIKTOK_ADS_API_VERSION}`;

export type TikTokAdsHttpMethod = "GET" | "POST";

export type TikTokAdsActionDefinition = {
  method: TikTokAdsHttpMethod;
  path: `/${string}/`;
  mutation: boolean;
  advertiserRequired: boolean;
  multipart?: boolean;
  stripAdvertiserId?: boolean;
};

export const TIKTOK_ADS_ACTIONS = {
  "account.get": {
    method: "GET", path: "/advertiser/info/", mutation: false, advertiserRequired: true,
    stripAdvertiserId: true,
  },
  "campaign.list": {
    method: "GET", path: "/campaign/get/", mutation: false, advertiserRequired: true,
  },
  "campaign.get": {
    method: "GET", path: "/campaign/get/", mutation: false, advertiserRequired: true,
  },
  "campaign.create": {
    method: "POST", path: "/campaign/create/", mutation: true, advertiserRequired: true,
  },
  "campaign.update": {
    method: "POST", path: "/campaign/update/", mutation: true, advertiserRequired: true,
  },
  "campaign.status": {
    method: "POST", path: "/campaign/status/update/", mutation: true, advertiserRequired: true,
  },
  "adgroup.list": {
    method: "GET", path: "/adgroup/get/", mutation: false, advertiserRequired: true,
  },
  "adgroup.get": {
    method: "GET", path: "/adgroup/get/", mutation: false, advertiserRequired: true,
  },
  "adgroup.create": {
    method: "POST", path: "/adgroup/create/", mutation: true, advertiserRequired: true,
  },
  "adgroup.update": {
    method: "POST", path: "/adgroup/update/", mutation: true, advertiserRequired: true,
  },
  "adgroup.budget": {
    method: "POST", path: "/adgroup/budget/update/", mutation: true, advertiserRequired: true,
  },
  "adgroup.status": {
    method: "POST", path: "/adgroup/status/update/", mutation: true, advertiserRequired: true,
  },
  "ad.list": {
    method: "GET", path: "/ad/get/", mutation: false, advertiserRequired: true,
  },
  "ad.get": {
    method: "GET", path: "/ad/get/", mutation: false, advertiserRequired: true,
  },
  "ad.create": {
    method: "POST", path: "/ad/create/", mutation: true, advertiserRequired: true,
  },
  "ad.update": {
    method: "POST", path: "/ad/update/", mutation: true, advertiserRequired: true,
  },
  "ad.status": {
    method: "POST", path: "/ad/status/update/", mutation: true, advertiserRequired: true,
  },
  "report.sync": {
    method: "GET", path: "/report/integrated/get/", mutation: false, advertiserRequired: true,
  },
  "report.async-create": {
    method: "POST", path: "/report/task/create/", mutation: false, advertiserRequired: true,
  },
  "report.async-status": {
    method: "GET", path: "/report/task/check/", mutation: false, advertiserRequired: true,
  },
  "report.async-download": {
    method: "GET", path: "/report/task/download/", mutation: false, advertiserRequired: true,
  },
  "asset.image-search": {
    method: "GET", path: "/file/image/ad/search/", mutation: false, advertiserRequired: true,
  },
  "asset.image-upload": {
    method: "POST", path: "/file/image/ad/upload/", mutation: true, advertiserRequired: true,
    multipart: true,
  },
  "asset.video-search": {
    method: "GET", path: "/file/video/ad/search/", mutation: false, advertiserRequired: true,
  },
  "asset.video-upload": {
    method: "POST", path: "/file/video/ad/upload/", mutation: true, advertiserRequired: true,
    multipart: true,
  },
  "spark.authorize": {
    method: "POST", path: "/tt_video/authorize/", mutation: true, advertiserRequired: true,
  },
  "spark.list": {
    method: "GET", path: "/tt_video/list/", mutation: false, advertiserRequired: true,
  },
  "spark.get": {
    method: "GET", path: "/tt_video/info/", mutation: false, advertiserRequired: true,
  },
  "spark.create": {
    method: "POST", path: "/business/spark_ad/create/", mutation: true, advertiserRequired: true,
  },
  "identity.list": {
    method: "GET", path: "/identity/get/", mutation: false, advertiserRequired: true,
  },
  "identity.video-info": {
    method: "GET", path: "/identity/video/info/", mutation: false, advertiserRequired: true,
  },
  "pixel.list": {
    method: "GET", path: "/pixel/list/", mutation: false, advertiserRequired: true,
  },
  "app.list": {
    method: "GET", path: "/app/list/", mutation: false, advertiserRequired: true,
  },
  "store.list": {
    method: "GET", path: "/store/list/", mutation: false, advertiserRequired: true,
  },
  "catalog.list": {
    method: "GET", path: "/catalog/get/", mutation: false, advertiserRequired: true,
    stripAdvertiserId: true,
  },
  "lead-form.get": {
    method: "GET", path: "/page/field/get/", mutation: false, advertiserRequired: true,
  },
} as const satisfies Record<string, TikTokAdsActionDefinition>;

export type TikTokAdsActionName = keyof typeof TIKTOK_ADS_ACTIONS;

export function isTikTokAdsActionName(value: string): value is TikTokAdsActionName {
  return Object.hasOwn(TIKTOK_ADS_ACTIONS, value);
}


