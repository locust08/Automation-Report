# Auction campaign objectives

Use the official TikTok API for Business v1.3 reference as the final source of truth. The CLI validates these Auction objectives:

| Objective | Typical required account assets | Preflight focus |
| --- | --- | --- |
| `APP_PROMOTION` | TikTok app, events, platform configuration | Resolve `app_id`, app promotion type, OS, optimization event, and attribution windows. |
| `WEB_CONVERSIONS` | Pixel and conversion event | Verify `pixel_id`, event, landing page, optimization goal, billing event, and attribution. |
| `REACH` | Eligible placements and brand-safety settings | Verify region, inventory, frequency, placement, and budget eligibility. |
| `TRAFFIC` | Website or app destination | Verify promotion type, destination URL/app, optimization goal, billing event, and placements. |
| `VIDEO_VIEWS` | Eligible video asset/identity | Prefer current engaged-view optimization values; reject deprecated optimization fields. |
| `ENGAGEMENT` | Eligible identity and destination | Resolve follower/profile/community-interaction configuration and identity ownership. |
| `LEAD_GENERATION` | Instant Form or website form; pixel where applicable | For `INSTANT_PAGE`, require and inspect `page_id`; for website leads, validate URL and applicable pixel/event. |
| `PRODUCT_SALES` | Store or catalog plus product eligibility | Require `store_id` or `catalog_id`, product source, shopping-ad type, and Business Center authorization where required. |

## Build rules

- Use v1.3 field names and string IDs. Do not copy v1.2 payloads.
- Resolve account-supported targeting, region, language, placement, optimization, bid, and billing values with tool endpoints before create.
- Preserve the advertiser currency and timezone when interpreting budgets and schedules.
- Match `optimization_goal` with its supported `billing_event`.
- Treat allowlist-only and region-specific fields as unavailable until a preflight call proves otherwise.
- Keep new campaign, ad-group, and ad objects disabled for the first production build.
- Prefer copying the structure of a healthy campaign in the same advertiser when advanced objective-specific fields are uncertain, while replacing all IDs and user-approved settings explicitly.

Official references:

- https://business-api.tiktok.com/portal/docs/api-reference/v1.3
- https://business-api.tiktok.com/portal/docs/create-an-ad-group/v1.3
