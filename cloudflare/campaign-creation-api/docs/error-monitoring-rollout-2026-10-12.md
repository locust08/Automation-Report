# M04 monitoring rollout checkpoint — October 12, 2026

User-approved monitoring is deployed at 100% as Worker version 02e1abfd-3a2b-4691-a489-26106898f0ac, source release m04@d56af8bd1809cd85b535e83def3ce512c92f343d. The downloaded index.js SHA-256 exactly matches the injected/uploaded manifest: 47add26fa2a5971abca15ab65617af8c71b229d81b0edd3233c8eae7bec5748c. US PostHog project 503297's token is independently verified against its visible settings.

All prior business bindings, 11 secrets, the minute schedule and capability/pilot flags are preserved. There are 44 bindings; all SENTRY bindings are removed. The external SQLite coordinator namespace is identical to the main and gateway namespaces. Operator upload credentials remain outside Worker bindings; the server API credential exists only on main. The organization's Error Tracking billing limit is verified at $0.

Accepted source e43ee30 remains an ancestor of codex/posthog-m04-production. Full M04 tests: 216 passed, one existing optional skip; typecheck and build passed. The branch is pushed and fetch-verified with zero ahead/behind. No force push, main merge, resource deletion or advertising action occurred.

Live diagnostic submission does not yet establish exact event visibility or resolved-source-map acceptance. Further deployments/live diagnostic mutations are held for the coordinated push-first checkpoint. Main's newer wire-format refinement is pushed but undeployed; it does not alter M04 business source. Keep deployment, push and connected acceptance separate.

Pre-migration rollback version is 4e2b3660-ec70-419f-ac4b-ffa3d9203c62. Disable monitoring before an affected rollback, preserving all business data and coordinator state. Detailed shared evidence is in DigitalBee docs/error-monitoring-rollout-2026-10-12.md.
