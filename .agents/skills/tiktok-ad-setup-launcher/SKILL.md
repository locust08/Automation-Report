---
name: tiktok-ad-setup-launcher
description: Safely create approved TikTok Auction campaign, ad-group, and regular-video ad revisions as disabled objects, then activate them through a separate reviewed gate.
---

# TikTok Ad Setup Launcher

Use this skill only after `tiktok-ad-setup-request-builder` has produced an immutable, approved revision. It compiles the revision into TikTok Marketing API v1.3 mutations, creates every object with `operation_status = DISABLE`, and requires a separate activation preview before enabling delivery.

This launcher uses the existing `tiktok-ads-doppler` client, advertiser allowlist, mutation payload defaults, no-POST-retry behavior, rate limiting, and server-only credentials. Read that skill and its `references/mutations.md` before live use.

## Supported v1 scope

- Manual TikTok Auction campaigns.
- `TRAFFIC`, `WEB_CONVERSIONS`, and `LEAD_GENERATION`.
- Ad-group-owned dynamic daily budgets.
- Regular `SINGLE_VIDEO` ads using already available identities and video assets.
- Manual targeting values previously validated for the exact advertiser.

The launcher rejects revisions outside the builder contract. `VIDEO_VIEWS` is fail-closed because its dynamic daily budget is allowlist-only and lifetime budgets remain outside V1. Spark, Smart+, app, commerce, carousel, image, campaign-budget, and lifetime-budget setup also remain out of scope.

## Required sequence

1. Preview the immutable revision. This performs a fresh live advertiser lookup and requires an exact ID, name, currency, and timezone match; validates the compile contract; checks referenced identities, videos, pixels, and Instant Forms; converts advertiser-local schedule boundaries to UTC+0; and writes an integrity-hashed receipt. It sends no create or status POST.
2. Apply setup with exact live advertiser-name confirmation. The launcher repeats the fresh advertiser binding, then creates campaign, ad groups, and ads in dependency order, all disabled.
3. Review the resulting provider objects and creative previews in TikTok Ads Manager.
4. Create the separate activation preview. The launcher repeats the fresh advertiser binding, GET-reads the closed approved campaign, ad-group, and ad field sets enumerated in the launcher contract, requires every listed applicable field and every object status to remain unchanged, fixes the exact provider IDs and enable payloads to an activation hash, and records a short expiry time.
5. Activate with exact live advertiser-name confirmation before the preview expires. The launcher repeats the fresh closed-field readback, enables ads first, ad groups second, and the campaign last, then performs a final GET readback of every object before recording `ACTIVE`.

Every command obtains an exclusive per-revision receipt lock before it reads or changes receipt state. The local SQLite lock and JSON receipt are safe only within one process space on one persistent host where every participating process shares the same filesystem. Every CLI invocation must declare `--execution-mode single-persistent-host`. An absent mode or a `MULTI_HOST_OR_EPHEMERAL` mode fails closed. Create operations use deterministic request IDs derived from the revision hash and operation key, so distinct local operations never share one provider idempotency key.

Read [references/launcher-contract.md](references/launcher-contract.md) for receipt states, lock scope, the closed approved field sets, and recovery rules.

## Commands

Preview disabled setup:

```bash
doppler run --project Github -- \
  node --import tsx .agents/skills/tiktok-ad-setup-launcher/scripts/launch_tiktok_ad_setup.ts \
  --revision tmp/tiktok_ads/setup_builder/revision.json \
  --execution-mode single-persistent-host \
  --initialize-new-receipt
```

Create or safely resume disabled setup:

```bash
doppler run --project Github -- \
  node --import tsx .agents/skills/tiktok-ad-setup-launcher/scripts/launch_tiktok_ad_setup.ts \
  --revision tmp/tiktok_ads/setup_builder/revision.json \
  --execution-mode single-persistent-host \
  --apply \
  --confirm-advertiser-name "Exact live advertiser name"
```

Preview activation, then activate:

```bash
doppler run --project Github -- \
  node --import tsx .agents/skills/tiktok-ad-setup-launcher/scripts/launch_tiktok_ad_setup.ts \
  --revision tmp/tiktok_ads/setup_builder/revision.json \
  --execution-mode single-persistent-host \
  --activation-preview

doppler run --project Github -- \
  node --import tsx .agents/skills/tiktok-ad-setup-launcher/scripts/launch_tiktok_ad_setup.ts \
  --revision tmp/tiktok_ads/setup_builder/revision.json \
  --execution-mode single-persistent-host \
  --activate \
  --confirm-advertiser-name "Exact live advertiser name"
```

## Hard safety boundaries

- Never apply an edited revision. Its hash must verify and exactly match the stored preview receipt.
- Never interpret setup completion as publication. `CREATED_DISABLED` is a reviewable platform draft; only the separate activation path can enable it.
- Never reuse an expired activation preview. Generate a fresh preview so the activation hash binds the current values of every applicable field in the closed approved set.
- Never run the local-lock launcher in serverless, horizontally scaled, multi-host, or ephemeral execution. It fails closed when execution mode is absent or resolves to `MULTI_HOST_OR_EPHEMERAL`. Implement and review a shared transactional lock-and-receipt backend before enabling any multi-host deployment.
- Never use `--initialize-new-receipt` for a revision whose durable state was deleted or lost. Reconcile that revision against TikTok first; the launcher refuses automatic reinitialization when its persistent initialization marker remains.
- Never retry a create or status POST after an ambiguous outcome. Reconcile the object with GET and repair the receipt through a separately reviewed recovery procedure.
- Never delete provider objects automatically after a partial build. Keep the campaign disabled and preserve every confirmed ID.
- Never place access tokens, authorization codes, request headers, or other secrets in a revision or receipt.
- Never use the launcher for Spark Ads. Spark authorization has its own sensitive-code contract.

At preview, create, activation preview, and activation, fail closed if the fresh live advertiser ID, name, currency, or timezone differs from the immutable revision. At create verification, activation preview, every activation preflight or resume readback, and final verification, fail closed if a resource ID, status, or any applicable field in the enumerated closed approved field set differs from the reviewed receipt. This includes requiring `search_result_enabled` to be present and exactly `false`; provider operational metadata outside the approved set may be ignored.

## Validation

```bash
npm run test:tiktok
```
