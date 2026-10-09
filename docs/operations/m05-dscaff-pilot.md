# M05 read-only billing pilot runbook

This runbook records the Dscaff fix in a form that can be repeated for another account. Production database, Vercel, Cloudflare and DigitalBee changes require a separate explicit approval. Never place secret values in commands, commits or evidence.

## What this release provides

M05 captures provider-reported daily spend through the last complete account-local day. It discloses missing days and freshness, snapshots immutable evidence, and calculates approved-envelope pacing from total spend. It returns `forecast: null` and `balance: null`; M08 collected funds remain unavailable. Shadow scheduling performs reads, evidence capture and monitor logging only.

The Dscaff pilot is pinned to:

- service `3584fcc4-f701-8003-843e-d7e3316fc758`;
- client `3584fcc4-f701-808a-b7aa-eae25eacf3a2`;
- cycle `35e4fcc4-f701-803c-92f6-f7cac2926a4f` and invoice `INV.GR-2605/004`;
- Google customer `1998676917` via MCC `3666137525`;
- 1–31 October 2026 and MYR 7,500.

## Repeatable rollout procedure

1. Start from the current release base in an isolated worktree. Confirm the diff contains only M05 schema, routes, provider adapters, dispatcher, tests and documentation.
2. Record, without secret values, the current Vercel deployment and environment-key names; Supabase migration state and restore point; DigitalBee Worker version, routes, bindings, flags and secret count; and Cloudflare schedules. Record rollback identifiers before mutation.
3. Apply the migration to an isolated Supabase project. Run `supabase db reset`, `supabase test db`, and database security/performance advisors. Prove every M05 table denies `PUBLIC`, `anon` and `authenticated`, every RPC is security-invoker and service-role-only, and service-role operations still succeed.
4. Set server-only seed provenance: `M05_RELEASE_OPERATOR_ID`, `M05_DSCAFF_SOURCE_REVISION`, and `M05_DSCAFF_APPROVED_AT`. These must come from a fresh verified source read. Run `npm run m05:seed:dscaff`; it atomically validates the M04 row and reads back the exact account/allocation. A mismatch must stop the rollout.
5. Set `M05_PILOT_NOTION_ACCOUNT_ID` to the single approved service. Keep `M05_SCHEDULER_MODE=shadow`. Configure purpose-separated Dashboard/DigitalBee service token, delegation key, cursor key, capture secret and matching connection revision.
6. Capture 1–8 October with `npm run m05:pilot:read -- google 1998676917 MYR <verified-timezone> 2026-10-01 2026-10-08`, then invoke the internal capture and monthly snapshot path. Reconcile every date and the summed MYR total against a native account-level Google Ads daily-cost query. Do not accept aggregate-only agreement.
7. Deploy the Dashboard with external M05 consumption still disabled. Deploy the dispatcher in shadow mode and observe one successful scheduled capture plus monitor/audit rows. It must select only the allow-listed Dscaff service.
8. Configure DigitalBee's HTTPS Dashboard origin and purpose-separated secrets. Enable `M05_CONNECTOR_ENABLED=true` only after evidence preflight passes. Use a newly authorized `budget_pacing` request; do not replay the exhausted historical `budget_get` lane.
9. Accept only when identity, dates, currency, complete coverage or explicit missing days, capture freshness, Google-native daily spend and pacing arithmetic all match. Stored Notion spend and M05 actual spend must remain separately labelled.

## Adapting this pilot for another account

Create a new narrowly scoped seed migration or generalize the seed only in a reviewed follow-up. Replace all identity constants as one reviewed set: service, client, cycle, provider account, access path, period, currency, amount and source revision. Reuse the same fail-closed validation, allow-list, daily reconciliation and acceptance steps. Do not activate Meta/TikTok merely because adapters exist.

## Rollback

Set DigitalBee `M05_CONNECTOR_ENABLED=false`, stop the dispatcher trigger, and restore the recorded Dashboard and DigitalBee versions. Retain M05 evidence tables and captured financial evidence for diagnosis; do not drop them. Shadow mode must never create recommendations, notifications or advertising mutations.
