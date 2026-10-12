# M04 shared MCP error monitoring — October 12, 2026

M04 routes sanitized edge SDK exceptions through the main DigitalBee Worker's SQLite ErrorMonitor namespace, object posthog:503297. HTTP, queue, scheduled and instrumented campaign operations retain their original behavior. The privacy wrapper and protocol mirror the accepted main source. Monitoring remains disabled pending rollout.

The shared coordinator sends first occurrences and hourly repeat summaries, with combined caps of 1,000 events per UTC day and 10,000 per UTC month. It retains safe local counters/samples for 30 UTC days, including withheld errors. Uncertain sends are never retried. Healthy requests do not call the coordinator.

The private ErrorProbeEntrypoint.test() emits a diagnostic inside the actual M04 deployment. DigitalBee's administrator Error Monitoring view invokes it and verifies its exact UUID/service/release in US project 503297 before showing Connected. The isolated operator diagnostic harness is retired.

Type checks, preserved-configuration Worker dry run and the full 18-file regression suite passed: 198 tests passed, one existing optional skip. Main integration fixtures inspect actual workerd SDK output for privacy and metadata preservation. No production diagnostic, source-map upload or activation is claimed.

The organization's Error Tracking billing limit was visibly verified at $0; this affects its other projects too. Cloudflare remains on its existing plan. Frontend capture, replay, analytics and AI are excluded. Sentry's cloud project remains intact.

Missing credentials: main-only server API key with error_tracking:read/write and operator-only source-map key with error_tracking:write plus organization:read. Both must be restricted to project 503297. API-key creation and the existing production deployment approval remain gates.

Refresh rollback versions and production snapshots; deploy the main SQLite migration disabled, then M04/gateway probe entrypoints, then final main bindings and activation. Preserve unrelated bindings, flags, schedules and advertising rules. Inject/register and upload source maps before deploying the exact hash-checked bundle with --no-bundle. Test actual deployed M04 once and verify source-map resolution. Disable monitoring and roll back the affected Worker if behavior changes, preserving coordinator state.

The detailed shared API/UI/architecture receipt is DigitalBee docs/error-monitoring-dashboard-2026-10-12.md. Official references: [Workers capture](https://posthog.com/docs/libraries/cloudflare-workers), [source maps](https://posthog.com/docs/error-tracking/upload-source-maps/cli).