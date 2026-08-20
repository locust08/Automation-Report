---
name: tiktok-ads-doppler
description: Safely inspect, report on, analyze, create, and update TikTok API for Business advertising through Doppler-managed credentials. Use for TikTok advertiser access checks, campaign/ad group/ad reporting or analysis, Auction campaign creation and changes, asset inspection or upload, delivery-status and budget changes, and KOL or influencer Spark Ads using a Post Authorization Code.
---

# TikTok Ads via Doppler

Use the project CLI for deterministic TikTok API for Business v1.3 reads and controlled writes. Keep the access token server-side and resolve it through the existing Doppler token manager.

## Required guardrails

Apply global Doppler guardrails from the user-level `doppler` skill.

- Run API commands with `doppler run -- <command>`, or `doppler run --project Github -- <command>` when repository linkage is unavailable.
- Use only `TIKTOK_BUSINESS_*` credentials. Never use the deprecated Login Kit token names for advertising.
- Never request, print, log, or place access tokens, app secrets, or Post Authorization Codes in JSON, shell arguments, URLs, receipts, or chat.
- Treat TikTok as the read-access authority. For a known advertiser ID, dynamically call `advertiser/info` and require TikTok to return that exact ID.
- Treat `TIKTOK_BUSINESS_AUTHORIZED_ADVERTISERS` as optional mutation-gate and diagnostic metadata. Skills document policy; they never store or remember a live advertiser inventory.
- Require the stored Doppler advertiser list for every mutation. Dynamically readable but unstored advertisers remain read-only.
- Execute reads directly. Preview every write first; apply the identical input only after explicit user confirmation.
- Create new objects as `DISABLE` unless the confirmed preview explicitly includes activation.
- Never automatically retry a POST. Verify a successful write with a follow-up GET and report the provider request ID.
- Keep receipts in `tmp/tiktok_ads/`. Treat reports, identifiers, audience data, and comments as sensitive business data.
- Apply the shared app-level limiter across every authorized advertiser. Read [rate-limits.md](references/rate-limits.md) before scheduling concurrent or bulk work.

## Start here

Check the CLI without credentials:

```bash
npm run tiktok:ads -- --help
```

List live readable advertisers and whether each is mutation-allowed:

```bash
doppler run -- npm run tiktok:ads -- account list
```

Inspect only the stored mutation list:

```bash
doppler run -- npm run tiktok:ads -- account list --stored
```

Check the capabilities actually available to an advertiser:

```bash
doppler run -- npm run tiktok:ads -- capability check \
  --advertiser-id "<advertiser_id>" \
  --start-date "2026-08-01" \
  --end-date "2026-08-07"
```

Treat app permissions as eligibility only. Use the capability result and object-specific preflight as runtime truth.

## Read and analyze

Use `account`, `campaign`, `adgroup`, `ad`, `report`, `asset`, and `spark` read commands. Pass complex filters in an owner-controlled JSON file via `--input`.

Run a deterministic analysis profile:

```bash
doppler run -- npm run tiktok:ads -- analysis campaign \
  --advertiser-id "<advertiser_id>" \
  --start-date "2026-08-01" \
  --end-date "2026-08-07"
```

Read [reporting-and-analysis.md](references/reporting-and-analysis.md) before selecting metrics, dimensions, filters, or interpreting attribution.

## Create or change ads

Read [campaign-objectives.md](references/campaign-objectives.md) before building an Auction campaign. Read [mutations.md](references/mutations.md) for the preview/apply contract.

1. Resolve the exact advertiser ID and name with `account list`, then confirm that `mutationAllowed` is true.
2. Run `capability check` and inspect required pixels, apps, forms, stores, catalogs, identities, and creative assets.
3. Prepare an input JSON object using the official v1.3 field names.
4. Run the mutation without `--apply`; review advertiser, current state, proposed payload, status, budget, schedule, targeting, and preflight checks.
5. Obtain explicit confirmation from the user for that exact preview.
6. Repeat the identical command with `--apply --confirm-advertiser-name "<exact name>"`.
7. Report the receipt, created/affected IDs, provider request ID, and verification result.

Example:

```bash
doppler run -- npm run tiktok:ads -- campaign create \
  --advertiser-id "<advertiser_id>" \
  --input "tmp/tiktok_ads/campaign.json"

doppler run -- npm run tiktok:ads -- campaign create \
  --advertiser-id "<advertiser_id>" \
  --input "tmp/tiktok_ads/campaign.json" \
  --apply \
  --confirm-advertiser-name "<exact advertiser name>"
```

Do not apply if the payload changed after preview. Generate a new preview instead.

## Run Spark Ads for KOL posts

Read [spark-ads.md](references/spark-ads.md) before any influencer or authorized-post workflow.

- Require a Post Authorization Code from the creator; a username, creator ID, post URL, or item ID alone does not grant advertising rights.
- Read the code only through `spark authorize --auth-code-stdin`.
- Preview authorization first, then enter the same unexpired code again when applying.
- Verify the authorized post and resolve `identity_id` plus `item_id` before creating a Spark Ad.
- Use `spark create` with a reviewed JSON specification. Keep it disabled by default.
- Exclude TikTok One discovery, creator invitations, orders, and creator-side actions; those require a separate TTO authorization.

## Command families

```text
capability check
account list|get
campaign list|get|create|update|status
adgroup list|get|create|update|budget|status
ad list|get|create|update|status
report sync|async-create|async-status|async-download
asset image search|upload
asset video search|upload
spark authorize|list|get|create
analysis advertiser|campaign|adgroup|ad|creative|audience|daily
```

Use `--output` only for sanitized JSON inside the workspace. Add `--overwrite` deliberately when replacing an existing output.

## Failure handling

- On authorization failure, stop and direct an administrator to `/auth/tiktok`; do not accept a token manually.
- On a dynamic read failure, re-check the exact advertiser ID and `/auth/tiktok` grant. Do not substitute a similar account.
- On a mutation-list failure, refresh the stored mutation inventory through the admin OAuth flow; dynamic readability never authorizes a write.
- On a validation or preflight failure, correct the payload or missing account asset and generate a new preview.
- On TikTok `code: 40100` or HTTP 429, honor the structured `retryAfterAt`. Automatically retry a GET only for a short bounded cooldown; never hold a job through a five-minute or daily cooldown.
- Stop after any rate-limited POST and inspect state before a new attempt. Never automatically retry a POST.
- Production cron Workers use the `tiktok-ads-read-gateway` service binding and its SQLite Durable Object for shared admission, caching, cooldowns, and request deduplication. They never fall back to uncoordinated direct TikTok calls.
- Local CLI reads use the process-shared limiter. Keep local concurrency bounded because it does not share gateway state.
- On verification failure after a successful POST, treat the mutation as potentially applied. Use the receipt and created IDs to inspect state; do not repeat the POST automatically.
- On unsupported or newly introduced endpoints, update the allowlisted action registry and tests before calling them.
