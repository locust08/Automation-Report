---
name: tiktok-ad-setup-request-builder
description: Build deterministic, approved TikTok Auction video setup revisions from a normalized campaign brief and approved media plan, without writing Notion, Supabase, or TikTok.
---

# TikTok Ad Setup Request Builder

Use this skill to convert an already normalized campaign brief and approved media plan into an immutable, storage-neutral TikTok setup revision. The builder performs local validation and writes JSON only. It never calls TikTok, Notion, Supabase, or another external service.

Apply the global Doppler and `tiktok-ads-doppler` guardrails to later platform work. This builder itself does not require credentials.

## Supported v1 scope

- TikTok Auction campaigns using the manual setup path.
- Regular, non-Spark `SINGLE_VIDEO` ads.
- Ad-group-owned dynamic daily budgets using whole currency units.
- Objectives: `TRAFFIC`, `WEB_CONVERSIONS`, and `LEAD_GENERATION`.
- Website and Instant Form lead generation.
- Targeting values already validated for the exact advertiser through TikTok.

The schema intentionally excludes `VIDEO_VIEWS`, Spark Ads, Smart+ campaigns, app promotion, product or commerce campaigns, images, carousel ads, lifetime budgets, campaign-owned budgets, and unvalidated targeting. TikTok dynamic daily budgets for `VIDEO_VIEWS` are allowlist-only, while lifetime budgets are outside this approved V1 contract, so the builder rejects that objective rather than changing the budget model silently. Add any excluded capability as a separately reviewed contract version.

## Input contract

Read [references/plan-contract.md](references/plan-contract.md) before creating an input file. Required groups are:

1. Exact advertiser ID, name, currency, and timezone.
2. Normalized brief with one supported objective and primary KPI.
3. Approved media plan with period, approved total, allocated total, approval reference, approver, and approval timestamp.
4. Manual Auction campaign metadata.
5. One or more ad groups with daily budget, schedule, API-validated targeting, TikTok Search Placement explicitly disabled, objective settings, and regular video ads.

Dates are advertiser-local calendar dates. Every ad-group schedule must remain inside the approved media-plan period, and the advertiser timezone must be a valid IANA timezone. The launcher later converts each advertiser-local boundary to the TikTok-required UTC+0 schedule string.

Schema version 3 treats TikTok feed placement and TikTok Search Placement as separate controls. Every targeting block must contain `placements = ["PLACEMENT_TIKTOK"]` and the literal `searchResultEnabled = false`. Missing or `true` values are rejected. The normalized plan and revision hash bind this invariant; the launcher compiles it as `search_result_enabled: false` and requires the create and activation GET readbacks to return the exact boolean `false`.

For every dynamic-daily ad group, the builder calculates:

- nominal planned spend: `dailyBudget × inclusive active days`;
- conservative provider budget envelope: `nominal planned spend × 1.25`;
- overdelivery headroom: `provider budget envelope − nominal planned spend`.

The sum of provider budget envelopes must fit inside `mediaPlan.allocatedBudget`. The 125% envelope is an approval and risk-control allowance based on TikTok's documented dynamic-daily behavior. It is neither expected spend nor a hard provider cap. Any budget or schedule change must produce a new immutable revision and receive a new review.

## Build command

```bash
node --import tsx \
  .agents/skills/tiktok-ad-setup-request-builder/scripts/build_tiktok_ad_setup_request.ts \
  --input tmp/tiktok_ads/setup_builder/input.json \
  --output tmp/tiktok_ads/setup_builder/revision.json
```

Omit `--output` to print sanitized JSON to stdout. `--output` must remain inside the repository and will not overwrite an existing file unless `--overwrite` is present.

## Output and immutability

The output is a deterministic JSON revision containing:

- `schemaVersion = 3` and `platform = TIKTOK`;
- a canonical normalized plan;
- calculated media-plan days, nominal planned spend, provider budget envelope, overdelivery headroom, and remaining allocation after the envelope;
- `revisionHash`, a SHA-256 hash of the complete revision body;
- `revisionId`, derived from the first 20 hexadecimal characters of that hash.

The builder does not insert a generation timestamp, random ID, database key, or storage metadata. Identical semantic input produces the same revision. Any approved field edit produces a different revision and requires a new launcher preview.

## Handoff

Use `tiktok-ad-setup-launcher` only with the exact revision file reviewed and approved by the user. Never edit a revision after review and then reuse its prior preview or receipt. The launcher requires an explicit `single-persistent-host` execution mode for its local SQLite lock and JSON receipt implementation; a shared transactional lock-and-receipt backend is required before multi-host execution can be enabled.

## Official provider references

Checked 2026-08-18 against current TikTok for Business documentation:

- [Create an ad group](https://business-api.tiktok.com/gateway/docs/index?doc_id=1739499616346114&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b&language=ENGLISH) — UTC+0 schedules and dynamic-daily budget behavior, including the 125% daily allowance and `VIDEO_VIEWS` allowlist limitation.
- [Create a Manual Campaign](https://business-api.tiktok.com/portal/docs/create-a-campaign-guide/v1.3)
- [Create an ad](https://business-api.tiktok.com/portal/docs/create-an-ad/v1.3)

Provider enums, availability, budget minima, and advertiser capabilities can change. Keep unsupported combinations fail-closed until the contract and tests are reviewed together.

## Validation

```bash
npm run test:tiktok
```
