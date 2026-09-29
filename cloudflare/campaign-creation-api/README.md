# M04 paused Google campaign service

This isolated service is the Automation Report project's real M04 authority for the existing `m18-m04-v1` contract. It owns immutable drafts, approvals, one-shot operations, audit records and creation receipts in its own D1. DigitalBee calls authenticated HTTPS routes and never binds or queries this database. The existing dashboard's demo workflows are unchanged and cannot substitute for a real failure.

The current pilot is Ava (`ava@locus-t.com.my`), service `2de4fcc4-f701-808d-b48b-c507d8641ce3`, Google `2315114913`, MYR, Asia/Kuala_Lumpur. Search and Demand Gen multi-asset image ads are the only accepted creation candidates. This does not cover Demand Gen video, carousel, product feeds, other platforms, serving activation or scheduling.

Every call requires a service bearer token, a 30-second signed delegation bound to actor, account mapping, permission/provider/connection revisions, action and exact body, and a current DigitalBee grant-verifier decision. M18 roles and write grants remain owned by DigitalBee. Preparation returns the exact resource plan and five-minute challenge. Only the private confirmation widget can use that challenge.

Production HTTP service bindings connect DigitalBee's `M04_BACKEND` to this Worker and this Worker's `DIGITALBEE_AUTHORITY` to DigitalBee's grant verifier. They preserve the HTTPS request URL, authenticated contract and current-grant checks; neither service accesses the other's database. A bound request failure never falls back to a demo or bypasses authorization.

Editing an existing draft passes its workflow and expected revision IDs. M04 appends a new immutable revision to that workflow, resets its status to draft, invalidates earlier confirmation challenges, and exposes revision history in the workflow read. The card must read the same workflow back before reporting a successful save. Creation runs Google `validateOnly`, rechecks grants, atomically consumes the challenge and reserves one operation, commits its dispatch audit, and sends one atomic `googleAds:mutate` with `partialFailure:false`. Campaign, ad group, ad and explicitly created ad-group criteria are paused. The budget is dedicated and nonshared. No existing resource is updated. Provider IDs, budget, creative and targeting readbacks must match before success.

Lost responses remain unknown. Receipt/workflow reads can recover the operation identifier and perform read-only reconciliation. They never repeat creation. Current read authorization is required even after write permission is revoked; mapping drift denies reads. Mutation retries, resume, activation and scheduling are locked.

## Verify

Run `npm test`, `npm run typecheck` and `npm run dry-run`. For the actual cross-repository client/backend test, set `DIGITALBEE_M04_CLIENT` to the DigitalBee checkout's absolute `src/campaign-creation/m04.ts` path before running tests. Without it, that one integration test is explicitly skipped.

The local reference script uses existing Doppler Google OAuth credentials through aliases; it never creates provider resources. Run it from the existing Automation Report primary checkout so Doppler uses its configured login. `--validate --reuse-search-targeting --demand-budget=25` validates the user-approved paused test candidates. Private reference evidence is ignored by Git. Validation evidence is not a creation receipt or connected ChatGPT acceptance.

## Deploy and rollback

The dedicated `digitalbee-m04-campaigns` database is provisioned and its initial migration is applied. Apply `0002_immutable_revisions.sql` before deploying this revision-aware Worker. For a new environment, provision its own database and apply both migrations only there. Never migrate DigitalBee permissions or the existing reporting database using this SQL. Deploy this Worker only; do not deploy the older whole dashboard checkout over the primary application's unrelated work.

Install internal `M04_SERVICE_TOKEN`, `M04_DELEGATION_KEY` and `DIGITALBEE_GRANT_VERIFY_TOKEN` securely in both services as appropriate. Reuse existing `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` and `GOOGLE_ADS_DEVELOPER_TOKEN` as backend `GOOGLE_ADS_*` names; no new provider credentials are required. No secret values belong in logs, source, receipts or widget text.

The existing Ava pilot currently has `M04_ENABLED:true`; preserve that deployed setting during this code update. Independent rollback is `M04_ENABLED:false`; preserve durable drafts/audits/receipts. DigitalBee independently disables `M04_REAL_ENABLED` and Google live changes. A code deployment never accepts provider behavior.

The older application's full webpack build currently fails on a pre-existing global selector in `components/reporting/print/monthly-report-print.module.css:558`. It is outside this isolated service and is not included in its deployment bundle.
