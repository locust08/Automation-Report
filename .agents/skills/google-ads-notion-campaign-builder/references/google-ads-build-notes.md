# Google Ads Build Notes

## API version

Use Google Ads REST `/v24` by default. Google Ads API minor releases such as v24.1 update the same major endpoint; keep an override through `GOOGLE_ADS_API_VERSION`.

## Search build

Create operations in one mutate request using temporary resource names:

- `campaignBudgetOperation`
- `campaignOperation` with `advertisingChannelType: SEARCH`
- `campaignCriterionOperation` for locations and languages
- `assetOperation` plus `campaignAssetOperation` for sitelinks
- `adGroupOperation`
- `adGroupAdOperation` with `responsiveSearchAd`
- `adGroupCriterionOperation` for keywords

Use `MAXIMIZE_CONVERSIONS` when `06 Campaign Objective` is `Leads` or `Sales`, or when `08 Optimization Focus` is `Conversions`. If `13 Target CPA` is present, set `maximizeConversions.targetCpaMicros` only for conversion bidding. Use Google Ads Maximize clicks when `06 Campaign Objective` is `Website Traffic` or `08 Optimization Focus` is `Clicks`; in the API this is represented by `biddingStrategyType: TARGET_SPEND` with `targetSpend`. Do not apply target CPA on this path. For v23+ scheduling, map Notion `11 Start Date` to `campaign.startDateTime`, for example `2026-06-05 00:00:00`.

Map Notion `06 Campaign Objective = Leads` to the supported Google Ads API setup controls: Maximize conversions bidding and campaign conversion goals. The Google Ads UI row called `Marketing Objective` is a campaign setup wizard label and is not exposed as a writable Campaign field in Google Ads API v24; do not claim the script can directly set that UI label.

Map Notion `06 Campaign Objective = Website Traffic` or `08 Optimization Focus = Clicks` to Maximize clicks bidding. Google Ads API bidding strategy docs identify `TARGET_SPEND` as the standard strategy for Maximize clicks, while the UI marketing objective label itself remains non-writable through the Campaign API.

For Search RSAs, put display paths inside `responsiveSearchAd.path1` and `responsiveSearchAd.path2`. For sitelink assets, put `finalUrls` on the asset root and `linkText` inside `sitelinkAsset`. For Search image assets, link image assets with `AD_IMAGE`. For business name, create a `textAsset` and link it as `BUSINESS_NAME`.

## Performance Max build

Create:

- `campaignBudgetOperation`
- `campaignOperation` with `advertisingChannelType: PERFORMANCE_MAX`
- location and language campaign criteria
- text, logo, and image assets
- one `assetGroupOperation` per Notion row
- `assetGroupAssetOperation` for headlines, descriptions, business name, logo, marketing image, and square marketing image

Block creation when PMax lacks at least one landscape marketing image and one square marketing image. Do not guess missing image assets inside this script.

## Safety defaults

- Create campaigns paused. Create child entities enabled: Search ad groups, RSAs, keywords, and PMax asset groups.
- Refuse duplicate campaign names unless `--allow-existing` is passed.
- Use `partialFailure: false` so invalid setup fails as one unit.
- Prefer `--validate-only` before `--execute-paused`.
- For exemptible keyword policy violations, collect `policyViolationDetails.key` and retry by setting `adGroupCriterionOperation.exemptPolicyViolationKeys`. Keep this behind an explicit flag.
