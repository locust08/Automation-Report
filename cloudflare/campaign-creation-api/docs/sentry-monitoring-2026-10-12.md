# Sentry error monitoring — October 12, 2026

Superseded locally by the user-approved [PostHog replacement](posthog-monitoring-2026-10-12.md). This file preserves historical Sentry candidate evidence; it is not the current activation procedure.

One Cloudflare project, [digitalbee-mcp](https://ai-hive-sdn-bhd.sentry.io/projects/digitalbee-mcp/), was created in the user-confirmed `ai-hive-sdn-bhd` organization (project ID `4512240528719952`). Error monitoring was selected; logs, tracing and application metrics were left off. No browser SDK was added. Production activation, source-map upload and connected event acceptance remain pending.

## Implementation and isolation

Both backend entry points use official `@sentry/cloudflare` 11.6.0. DigitalBee's accepted staging source extends production registry fix `2f337dc`; M04's separate `codex/tiktok-paused-flow-completion` checkout extends the accepted `670e8de` source recorded by `ad937fd`. The undeployed M18 facade/backend feature checkouts are excluded. The older Google-only M04 directory in the reporting application's main checkout was not changed.

HTTP, Queue and scheduled handlers are wrapped. Existing safe-response catches in operation, read, OAuth, control, invitation, bug, audit and campaign boundaries capture unexpected failures. Expected denials, schema/input errors, disabled capabilities, stale revisions/cursors and definitive provider validation rejections are filtered. Available application-generated UUID correlation and receipt references are retained; account and employee IDs are not supplied.

Each event carries a fixed `service` (`digitalbee-mcp` or `m04`), deployment environment, service-specific release, bounded operation name and safe error category. Original error messages, nested causes, arbitrary properties, URLs, OAuth parameters, request/response bodies, credentials, headers/cookies, employee/account data and advertising content are excluded. Events are rebuilt from an allowlist; only deployed bundle line/column coordinates survive. Source paths, function names, frame variables and source context do not. Automatic integrations/console forwarding and breadcrumbs are off. All SDK data collection switches are disabled. Logs, metrics, client reports and trace propagation are disabled; no tracing sampler is configured.

Missing/invalid DSN, release or environment configuration bypasses Sentry. Capturing failures is best effort. Each wrapper keeps invocation-local result state so SDK initialization or post-handler failures cannot cause business work to execute twice or replace its response/error. Existing authorization, receipts, queue acknowledgements, dispatch fences and mutation retry rules are retained.

## Deployment configuration and source maps

Tracked Wrangler configs declare empty `SENTRY_DSN` and `SENTRY_RELEASE` values and an explicit environment. Ignored `.sentry-release.jsonc` configs select the shared DSN and preserve every current production plain-text variable, including Meta's enabled and TikTok's disabled gates. M04 adds the `CF_VERSION_METADATA` binding; both services can derive `service@version-uuid`, or use an explicit `service@git-sha` release. No upload token is a Worker binding or source/config value.

Operator/CI `npm run sentry:upload` requires `SENTRY_AUTH_TOKEN`, `SENTRY_ORG=ai-hive-sdn-bhd`, `SENTRY_PROJECT=digitalbee-mcp`, `SENTRY_SERVICE`, the exact `SENTRY_RELEASE` and the exact approved Wrangler artifact directory in `SENTRY_BUNDLE_DIR`. It registers the release, validates/uploads `index.js` and its source map, and finalizes that release. Upload credentials must remain in operator/CI secrets. Live source-map resolution is not claimed without an upload and verified diagnostic.

Fresh read-only deployment/version snapshots identify these rollback baselines:

| Service | Active / rollback version | Retained bindings |
| --- | --- | --- |
| DigitalBee | `19ef85e1-b6a9-49a2-a345-9eaa50431677` | 103 |
| M04 | `81320c3c-e198-49ea-9c0b-cc9311aaa844` | 31 |

Activation requires the existing AGENTS.md deployment approval. Re-read both versions and schedules immediately before activating. Preserve existing asset ownership/content, binding descriptors, secrets, compatibility settings and capability flags. Build/deploy only these observability changes from the accepted baselines. Verify that runtime differences are limited to Sentry settings and M04 version metadata. No migration, advertising call, M18 feature release, grant change or capability activation is authorized by this candidate. Roll back only the affected Worker to the recorded version if its behavior changes.

## Verification and remaining gates

The real SDK runs under workerd for both service tags: unexpected HTTP failures, caught operation errors, Queue failures and scheduled failures emit filtered error envelopes. Tests assert the complete transmitted envelope excludes synthetic sensitive URLs, headers, bodies, identities and content; denials send no events; Sentry outages preserve safe responses. Wrapper tests exercise missing configuration, SDK setup/post-handler failures and exactly-once processing. Existing M04 regression tests retain uncertain mutation and readback behavior. Runtime fixture bundling now externalizes Node built-ins and uses the production-required `nodejs_compat` flag.

Both service type checks and preserved-configuration Worker dry runs passed. DigitalBee's full suite passed 1,314 tests across 148 files, including the actual separate M04 Worker fixture. M04's full suite passed 198 tests with one pre-existing optional test skipped. Local checks are distinct from deployment and connected acceptance.

Sentry's organization reports **Error Quota Exceeded** and monitoring/new data paused. No operator upload token is configured. No production deployment or synthetic event transmission has occurred. Restore quota and configure the upload credential locally, then obtain deployment approval.

After activation, `npm run sentry:diagnostic` sends one safe event for each `SENTRY_SERVICE` and exact deployed release. `SENTRY_CONFIG` selects its ignored approved configuration. This harness imports only the SDK/privacy wrapper, has no advertising clients or business handlers, and persists a one-attempt checkpoint in `.sentry-local/`. Never resend an uncertain/accepted event automatically. Verify the returned event ID in the single project with the correct service, environment and release, then record visibility and source-map resolution separately. HTTP ingestion acceptance alone does not complete verification.

Local mappings, release configs, production snapshots and verification logs are ignored and excluded from commits/pushes. Existing unrelated mapping/image/document changes remain outside this release.
