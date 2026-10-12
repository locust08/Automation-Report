# PostHog Worker error tracking — October 12, 2026

The user approved replacing the undeployed Sentry candidate in DigitalBee and M04 with the reporting dashboard's existing **AI Hive Web Project**, [PostHog project 503297](https://us.posthog.com/project/503297/error_tracking), in the US region. The authenticated existing project page confirmed its name/ID. Its ingestion host and project token were resolved from the dashboard's existing local configuration into ignored deployment snapshots; the token is not committed. The Sentry cloud project and dashboard/frontend instrumentation are unchanged.

## Implementation

Both accepted Worker sources use pinned `posthog-node` 5.55.2 through its edge export. Each HTTP, queue and scheduled invocation owns its client and AsyncLocalStorage context; shutdown is attached to `ctx.waitUntil()` after invocation-owned background work settles. Original background promises remain attached unchanged; rejected background work is observed without changing its outcome. No global request/client state, exception autocapture, person profiles, feature flag calls, tracing, replay or console forwarding is enabled. The SDK uses immediate flushing, no retry and a five-second request/shutdown limit. Missing/invalid project token, region, environment or service release bypasses tracking.

The existing `captureUnexpected`, `markExpected`, `expectedError`, `releaseFor` and `observeWorker` interfaces retain their call sites. `captureUnexpected` now optionally returns an event UUID for the isolated diagnostic. Expected denials, input/schema errors, disabled capabilities, stale revisions and definitive provider rejections remain excluded. Caught-then-rethrown error objects are deduplicated within their invocation. Initialization, capture and flushing failures never replay business handlers or replace their responses/errors, acknowledgements, receipt handling or uncertain mutation rules.

The SDK receives a sanitized error copy without original messages, causes, function names or custom properties. Internal bundle paths are retained only for chunk-ID lookup; the outbound hook reconstructs the event and normalizes paths to index.js/worker.js. Only service, environment, release, allowlisted operation/error category, validated UUID correlation/receipt references, sanitized exception type/message, bundle coordinates and validated source-map chunk/release UUIDs survive. Person processing and GeoIP are disabled. Fixed service identifiers replace human distinct IDs. Runtime tests inspect decompressed real SDK batches and allow only these properties plus SDK library/server/GeoIP metadata.

Bindings are `POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST`, `POSTHOG_ENVIRONMENT` and `POSTHOG_RELEASE`; tracked tokens/releases are empty. Explicit releases use `service@git-sha`, with version-metadata fallback supported for non-uploaded releases. Source-map releases must use the exact explicit release stamped during preparation.

## Exact artifact workflow

Run from each Worker package. Operator/CI credentials are **never** Worker bindings:

- Set `POSTHOG_CLI_HOST=https://us.posthog.com`, `POSTHOG_CLI_PROJECT_ID=503297` and an operator-only `POSTHOG_CLI_API_KEY` with error-tracking write and organization read scopes. The CLI also requires authentication during injection to register release metadata.
- Set `POSTHOG_SERVICE` to digitalbee-mcp or m04 and `POSTHOG_RELEASE` to that service's exact source commit. Update the ignored `.posthog-release.jsonc` snapshot's release to match, preserving current production bindings, secrets, schedules, assets and capability flags. Re-read active production versions/settings immediately before approval/activation.
- Build with `npx wrangler deploy --config .posthog-release.jsonc --dry-run --outdir .posthog-bundle`. Supply a fresh `POSTHOG_BUNDLE_DIR` for a new preparation attempt; never reuse an uncertain or already prepared directory.
- `npm run posthog:prepare` injects PostHog metadata, then records SHA-256 hashes for all bundle files and the exact approved configuration. A pre-injection checkpoint prevents reusing partially prepared artifacts.
- `npm run posthog:upload` uploads the prepared maps and records the fixed project and region. Changed files/configurations are rejected.
- After the repository-required deployment approval, `npm run posthog:deploy` uploads that exact index.js with Wrangler `--no-bundle`. It rejects missing source-map uploads, changed artifact/configuration hashes, custom rebuild commands and wrong Worker/project/region/release targets. Do not rebuild after injection.

Source maps may contain source content in the operator upload; source content is excluded from runtime exception events. Source-map visibility and resolved stacks must be verified separately in PostHog; CLI/HTTP success is not connected acceptance.

## Diagnostics and acceptance

After activation, `npm run posthog:diagnostic` emits one sanitized diagnostic for the selected service and explicit release. It imports only the observability wrapper, has no business handlers or advertising clients, forwards SDK compression headers correctly, and records a one-attempt checkpoint in `.posthog-local/`. Never resend accepted or uncertain probes automatically. Verify its exact event UUID and service/environment/release in PostHog.

This isolated probe verifies ingestion/configuration, **not execution of a production Worker or that Worker's source-map resolution**. Verify an actual deployed exception's chunk/release IDs and original-source stack separately before claiming that acceptance. No new public synthetic-error route is added.

## Verification and rollout status

Local type checks, workerd HTTP/caught/queue/scheduled capture, injected-metadata preservation, expected-error suppression, privacy allowlisting, outage isolation, exactly-once behavior and overlapping invocation checks passed. Artifact integrity tests reject mutated bundles/configurations and deployment before source-map upload. Both preserved-configuration Wrangler dry runs passed. M04's final regression suite passed 198 tests with one pre-existing optional skip across 18 files. DigitalBee's full regression run covered 1,312 tests across 148 files: 1,310 passed, one optional test skipped and one screenshot file-lock failure. The affected native-rendering file passed all four tests when rerun alone. After the final background-lifecycle change, all 13 focused privacy/runtime/artifact tests and both type checks/builds passed. No source failure remains from the observed regression results; the complete suite was not rerun after that final focused change.

Miniflare is pinned to 5.20261006.1-alpha for the existing September 28 M04 compatibility date; the previously installed September 16 runtime supported dates only through September 23. Production compatibility dates and flags are unchanged.

**Activation remains pending.** No PostHog operator upload credential is configured, so release registration/injection/upload and live source-map acceptance are blocked. No Worker deployment, real diagnostic transmission, Cloudflare credential change or Sentry cloud mutation occurred. A synthetic invalid CLI credential was rejected during tooling verification; it did not register a release or upload artifacts. Existing rollback records are DigitalBee `19ef85e1-b6a9-49a2-a345-9eaa50431677` and M04 `81320c3c-e198-49ea-9c0b-cc9311aaa844`; these must be refreshed before activation. Roll back only the affected Worker if behavior changes.

Official references: [Workers SDK/lifecycle](https://posthog.com/docs/libraries/cloudflare-workers), [source-map injection/upload](https://posthog.com/docs/error-tracking/upload-source-maps/cli).
