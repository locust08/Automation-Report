# M05 Dscaff pilot implementation evidence — 2026-10-09

## Scope

This receipt covers the local candidate only. No production migration, seed, provider capture, Vercel deployment, Cloudflare deployment, DigitalBee activation or advertising mutation was performed.

## Implemented

- Existing M05 evidence routes, provider readers, snapshots and shadow dispatcher retained.
- Database functions changed to security-invoker; M05 tables/functions explicitly deny `PUBLIC`, `anon` and `authenticated` while retaining service-role-only access.
- Atomic idempotent Dscaff seed validates the exact M04 account, client, verified access, timezone, active admin operator and immutable source revision before inserting the single Google account/allocation.
- Internal dispatch requires the single pilot service allow-list.
- Dispatcher response parsing is bounded to 64 KiB.
- A reusable rollout/reconciliation/rollback runbook was added.

## Verification

| Check | Result |
| --- | --- |
| Focused M05 tests | Passed: 15/15 across capture, provider, delegation, coverage, scheduling, allow-list and bounded dispatcher response |
| TypeScript | Passed: `npm run typecheck` |
| Dashboard production build | Passed: `npm run build`; M05 internal and versioned budget routes included |
| Scoped lint | Passed for all changed TypeScript/JavaScript files |
| Cloudflare dry run | Passed with Wrangler 4.149.0; dispatcher remains `shadow` |
| Current Worker types | Retrieved `@cloudflare/workers-types` 5.20261008.1 for compatibility review; the dispatcher is JavaScript and requires no generated type file |
| Scoped diff | `git diff --check` passed |

The broad repository test command ran 632 tests: 626 passed and 6 unrelated existing checks failed. Three campaign-creation tests require the absent `vitest` package; three TikTok expectations differ from the current base behavior. Full-repository ESLint likewise reached pre-existing campaign-creation `no-explicit-any` errors. Neither failure set touches M05; the scoped lint, focused M05 suite, typecheck and production build pass.

Supabase reset/pgTAP/advisor execution is pending because Docker Desktop is not running on this host. The CLI failed before applying any migration. Therefore database behavior is not claimed as executed evidence yet, even though the migration includes the new schema/functional pgTAP coverage.

Live acceptance remains pending separate production approval, isolated Supabase verification, Dscaff seed/readback, native Google daily reconciliation, scheduled shadow capture and a newly authorized DigitalBee `budget_pacing` request.
