# TikTok setup-plan contract

The builder accepts plain JSON and returns plain JSON. The contract has no Notion, Supabase, SQL, or frontend identifiers.

## Required semantics

- `advertiser.id` is the exact numeric TikTok advertiser ID that will later pass the stored Doppler mutation allowlist.
- `advertiser.timezone` is a valid IANA timezone such as `Asia/Kuala_Lumpur`; fixed-offset labels and arbitrary text are rejected because dates are advertiser-local and the launcher performs a daylight-saving-aware conversion to UTC+0.
- `mediaPlan.approval.status` is exactly `APPROVED`; draft or pending media plans are rejected.
- `campaign.campaignType` is `AUCTION`, `automationMode` is `MANUAL`, and `budgetOwner` is `ADGROUP`.
- Every ad group uses `BUDGET_MODE_DYNAMIC_DAILY_BUDGET` and `BID_TYPE_NO_BID`.
- Targeting validation uses `status = VALIDATED`, `source = TIKTOK_API`, and the same advertiser ID as the plan.
- Placement is exactly `PLACEMENT_TIKTOK` for v1.
- `targeting.searchResultEnabled` is the literal boolean `false`; TikTok Search Placement is always off in this contract.
- Every creative uses `format = SINGLE_VIDEO`, `creativeMode = REGULAR`, a `CUSTOMIZED_USER` identity ID, and a TikTok video ID.
- Every website destination uses an absolute `https://` URL.

## Objective branches

| Objective | Required settings |
| --- | --- |
| `TRAFFIC` | Website URL; `CLICK` + `CPC`, or `TRAFFIC_LANDING_PAGE_VIEW` + `OCPM`. |
| `WEB_CONVERSIONS` | Website URL, pixel ID, optimization event, `CONVERT`, and `OCPM`. |
| `LEAD_GENERATION` website | Website URL, pixel ID, optimization event, `EXTERNAL_WEBSITE`, and `OCPM`. |
| `LEAD_GENERATION` Instant Form | Instant Form page ID, `INSTANT_PAGE`, and `OCPM`. |

`VIDEO_VIEWS` is rejected in V1. TikTok documents dynamic daily budgeting for that objective as allowlist-only, and this contract excludes lifetime budgets. Provider values are pinned by schema version 3. Revalidate them against the live TikTok API and advertiser capabilities before launch. A future provider change requires a contract and test update; never silently substitute a value.

## Search Placement invariant

`placements = ["PLACEMENT_TIKTOK"]` selects TikTok placement but does not, by itself, authorize distribution in TikTok search results. Schema version 3 therefore requires `searchResultEnabled = false` as a separate hard pin. The field survives normalization and is covered by the immutable revision hash. Missing, non-boolean, or `true` values fail validation.

The launcher maps this approved field to `search_result_enabled: false`. The compiled-operation hash, receipt integrity hash, and activation material-configuration hash bind the provider field. Create verification, activation preview, every pre-enable readback, and the final enabled readback require the provider to return the exact boolean `false`; absence, coercion, or `true` is material drift and fails closed.

## Budget and schedule approval

The revision preserves advertiser-local `YYYY-MM-DD` dates. Each inclusive date range must fit inside the approved media-plan period. The launcher converts local start-of-day and end-of-day boundaries to UTC+0 using the advertiser's IANA timezone; this protects calendar intent across daylight-saving changes.

For each dynamic-daily ad group:

```text
nominalPlannedSpend = dailyBudget × inclusiveActiveDays
providerBudgetEnvelope = nominalPlannedSpend × 1.25
overdeliveryHeadroom = providerBudgetEnvelope − nominalPlannedSpend
```

Across all ad groups, `providerBudgetEnvelope` must be less than or equal to `mediaPlan.allocatedBudget`. TikTok's documented dynamic-daily controls can allow up to 125% of the daily budget on an individual day while constraining weekly spend separately. The envelope is a conservative approval allowance; it does not predict spend and does not impose a provider-side hard cap. Budget or schedule changes alter the derived calculations and require a new immutable revision, approval, and launcher preview.

This calculation covers media cost only. It excludes tax, fees, credits, and invoice adjustments, and the approved allocation is not a provider-enforced account spending cap. Schema version 3 records the policy ID, 12,500-basis-point daily upper-bound factor, absence of weekly netting, and unchanged-budget-and-schedule assumption inside the hashed calculations block.

## Example shape

```json
{
  "advertiser": {
    "id": "7123456789012345678",
    "name": "Example MY",
    "currency": "MYR",
    "timezone": "Asia/Kuala_Lumpur"
  },
  "brief": {
    "id": "brief-001",
    "productOrOffer": "Approved offer",
    "audienceSummary": "Approved audience summary",
    "objective": "TRAFFIC",
    "primaryKpi": "Landing page views"
  },
  "mediaPlan": {
    "id": "plan-001",
    "clientName": "Example Client",
    "startDate": "2026-09-01",
    "endDate": "2026-09-30",
    "totalApprovedBudget": 6000,
    "allocatedBudget": 3750,
    "approval": {
      "status": "APPROVED",
      "reference": "approval-001",
      "approvedBy": "Approver name",
      "approvedAt": "2026-08-20T09:00:00+08:00"
    }
  },
  "campaign": {
    "name": "LT | TikTok | Traffic | 2026-09",
    "campaignType": "AUCTION",
    "automationMode": "MANUAL",
    "budgetOwner": "ADGROUP",
    "specialIndustries": []
  },
  "adGroups": [{
    "key": "prospecting",
    "name": "MY | Broad | Traffic",
    "startDate": "2026-09-01",
    "endDate": "2026-09-30",
    "dailyBudget": 100,
    "budgetMode": "BUDGET_MODE_DYNAMIC_DAILY_BUDGET",
    "bidType": "BID_TYPE_NO_BID",
    "targeting": {
      "validation": {
        "status": "VALIDATED",
        "source": "TIKTOK_API",
        "advertiserId": "7123456789012345678",
        "validatedAt": "2026-08-20T08:30:00+08:00"
      },
      "locationIds": ["156"],
      "placements": ["PLACEMENT_TIKTOK"],
      "searchResultEnabled": false,
      "gender": "GENDER_UNLIMITED",
      "ageGroups": [],
      "languageCodes": [],
      "interestCategoryIds": [],
      "audienceIds": []
    },
    "objectiveSettings": {
      "objective": "TRAFFIC",
      "destination": "WEBSITE",
      "destinationUrl": "https://example.com/offer",
      "optimizationGoal": "TRAFFIC_LANDING_PAGE_VIEW",
      "billingEvent": "OCPM"
    },
    "ads": [{
      "key": "video-01",
      "name": "Video 01",
      "format": "SINGLE_VIDEO",
      "creativeMode": "REGULAR",
      "identity": { "type": "CUSTOMIZED_USER", "identityId": "7012345678901234567" },
      "video": { "videoId": "v1000000000001" },
      "adText": "Approved caption",
      "callToAction": "LEARN_MORE"
    }]
  }]
}
```

Advertiser, targeting, pixel, and form identifiers are numeric. Identity and uploaded-video resource identifiers are treated as opaque TikTok IDs and may contain letters, digits, underscores, or hyphens.

For the example, the nominal planned spend is `100 × 30 = 3000 MYR`, the conservative provider budget envelope is `3000 × 1.25 = 3750 MYR`, and the allocated budget covers that envelope exactly.

## Official provider references

Checked 2026-08-18 against current TikTok for Business documentation:

- [Create an ad group](https://business-api.tiktok.com/gateway/docs/index?doc_id=1739499616346114&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b&language=ENGLISH)
- [Campaign creation overview](https://business-api.tiktok.com/portal/docs/campaign-creation/v1.3)
- [Create a Manual Campaign](https://business-api.tiktok.com/portal/docs/create-a-campaign-guide/v1.3)
- [Create an ad](https://business-api.tiktok.com/portal/docs/create-an-ad/v1.3)
