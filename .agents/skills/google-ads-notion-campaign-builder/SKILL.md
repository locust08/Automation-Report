---
name: google-ads-notion-campaign-builder
description: Create paused Google Ads campaigns from approved Notion ad group setup rows. Use when Codex needs to read the Google Ads Ad Group Setup Requests database, resolve the linked Google Ads CID and MCC access path, validate Search or Performance Max setup fields, and create or validate campaigns through the Google Ads API using Doppler-managed secrets.
---

# Google Ads Notion Campaign Builder

## Overview

Use this skill to turn approved Notion setup rows into paused Google Ads campaigns. The bundled script reads one row per ad group or asset group, resolves the linked Google Ads customer from Notion, builds Google Ads REST mutate operations, and runs in plan, validate-only, or execute-paused mode.

Always apply the repo `google-ads-doppler`, `notion-doppler`, and user-level `doppler` guardrails. Run every command through Doppler.

## Quick Start

Create from exact Notion page IDs:

```bash
doppler run -- node .agents/skills/google-ads-notion-campaign-builder/scripts/create_campaign_from_notion.mjs \
  --page-ids 3754fcc4f7018102a780e6150ecfa960,3754fcc4f7018194bc79dd86b03d2d88 \
  --validate-only
```

Create live paused campaigns only after validate-only passes. The campaign is paused, while child entities are enabled for review:

```bash
doppler run -- node .agents/skills/google-ads-notion-campaign-builder/scripts/create_campaign_from_notion.mjs \
  --page-ids <notion_page_ids> \
  --execute-paused
```

For finance or other restricted verticals, validate first without exemptions. If Google returns only exemptible keyword policy violations and the landing page disclosures are approved, retry with:

```bash
doppler run -- node .agents/skills/google-ads-notion-campaign-builder/scripts/create_campaign_from_notion.mjs \
  --page-ids <notion_page_ids> \
  --validate-only \
  --request-policy-exemptions
```

Query rows from the database by status:

```bash
doppler run -- node .agents/skills/google-ads-notion-campaign-builder/scripts/create_campaign_from_notion.mjs \
  --database-id 8adaf03ad617472780f0b34e5ca6ef08 \
  --status "Ready for Setup" \
  --validate-only
```

## Workflow

1. Read `references/notion-schema.md` when property names or required fields are unclear.
2. Read `references/google-ads-build-notes.md` when changing Google Ads operation mapping.
3. Run `--plan-only` first for unfamiliar database rows.
4. Run `--validate-only` against Google Ads before live creation.
5. Run `--execute-paused` only when the plan and validation output match the user-approved setup.

## Script Behavior

- Groups rows by `05 Campaign Name`, linked ad account, and `07 Campaign Type`.
- Resolves customer ID from the linked Ad Account `ID` property.
- Resolves `login-customer-id` from the linked Ad Account `Access Path` property.
- Defaults Google Ads REST calls to `/v24`; override with `GOOGLE_ADS_API_VERSION` only when needed.
- Refuses existing non-removed campaign names unless `--allow-existing` is passed.
- Creates campaigns in paused state, with ad groups, ads, keywords, and PMax asset groups enabled.
- Maps `06 Campaign Objective = Leads` or `Sales` to `MAXIMIZE_CONVERSIONS`; maps `Website Traffic` objectives or `08 Optimization Focus = Clicks` to Google Ads Maximize clicks, represented as `TARGET_SPEND` in the API.
- Treats `08 Optimization Focus` as the bidding/optimization override, not the business objective. Current supported values are `Conversions`, `Clicks`, `Reach`, and `Engagement`; older rows with `08 Campaign Focus` are still accepted as a fallback.
- Applies `13 Target CPA` only for conversion bidding. Website traffic and clicks-focused campaigns use Maximize clicks without a target CPA.
- Parses keyword syntax as `[keyword]` exact, `"keyword"` phrase, and plain keyword broad.
- Blocks Performance Max creation when the Notion image set lacks eligible landscape and square images.
- Requests policy exemptions only when `--request-policy-exemptions` is passed and all returned keyword policy violations are exemptible.

## Validation Notes

Use the built-in local checks after editing the script:

```bash
node .agents/skills/google-ads-notion-campaign-builder/scripts/create_campaign_from_notion.mjs --self-test
```

Then validate the skill folder:

```bash
python3 /Users/easonleong/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  .agents/skills/google-ads-notion-campaign-builder
```
