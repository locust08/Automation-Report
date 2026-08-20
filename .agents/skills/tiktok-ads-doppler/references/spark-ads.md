# Spark Ads for KOL and influencer posts

## Required inputs

A creator must enable ad authorization for the TikTok post and provide a valid Post Authorization Code. Treat the code as a short-lived secret.

A creator username, creator ID, post URL, video ID, or item ID alone does not grant ad permission.

## Authorization workflow

1. Resolve the exact advertiser.
2. Run `spark authorize --auth-code-stdin` without `--apply` and enter the code through the hidden terminal prompt.
3. Review the redacted preview. The receipt stores only a one-way fingerprint.
4. After explicit confirmation, repeat the command with `--apply`, the exact advertiser name, and the same unexpired code through hidden stdin.
5. Query authorized Spark posts and verify the creator/display name, authorization state, validity, `identity_id`, and `item_id`.
6. Build the Spark Ad input using the verified authorized-post identity and item.
7. Preview and apply `spark create`; keep the campaign, ad group, and ad disabled unless activation was explicitly confirmed.

## Boundaries

- Do not persist the authorization code in Doppler, JSON, receipts, shell history, URLs, or chat.
- Do not substitute a different post or identity after the preview.
- Check music/commercial-use restrictions, post availability, authorization expiry, destination, CTA, and advertiser rights before create.
- Use `AUTH_CODE`, `TT_USER`, or `BC_AUTH_TT` only as returned and verified by TikTok.
- Exclude TikTok One Creator Marketplace discovery, invitations, orders, and creator-side actions from this skill version. They require a separate TTO account authorization and token lifecycle.

Official references:

- https://business-api.tiktok.com/portal/docs/api-reference/v1.3
- https://business-api.tiktok.com/portal/docs/create-a-campaign-an-ad-group-and-a-spark-ad-in-one-step/v1.3
