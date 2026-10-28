# M18 future-start release and CI — 28 October 2026

The user approved the future-start code release while preserving production settings, assets and allowlists, keeping campaigns paused and M17 untouched. Matching source-map uploads to the existing private PostHog US project 503297 were separately explicitly approved.

M04 source `070f195ee1d72be0c66d372b00ae2bb64c1be0f4` is deployed as `418b7d4d-09f2-4a75-9213-012b246e2afc` at 100%; rollback `4ba934d3-a167-4347-bbb0-149034fd0e86`. Exact uploaded artifact and full current production settings/assets/allowlists/routes/subdomain/schedules readback passed. All four peers were unchanged by this release. Only required release provenance changed. No migrations or provider calls, creation, scheduling, desktop controls or regression tests. MCP retained its existing deployed dashboard assets. Private immutable evidence: primary workspace `outputs/m18-future-start-release-20261028`; never publish raw settings or CLI logs.

The user-selected revised offline target is 1 November 2026 at 10:00 AM MYT (`2026-11-01T02:00:00.000Z`). Gate 2 must finish before 29 October at 10:00 AM MYT; recommended operating cutoff 09:30. No draft or new workflow/revision/provider IDs exist. Fresh validation, human planning approval, separate PAUSED creation confirmation, exact new-ID allowlist release, fresh QA and human Gate 2 confirmation remain separate gates. The old hierarchy and unknown receipt are untouched. M18 remains incomplete; runtime deployment is separate from connected acceptance.

## CI

Repository workflow `.github/workflows/m18-future-start.yml` runs on relevant pull requests, pushes to `codex/m18-future-start-ci-*`, main/master/staging, and manual dispatch once integrated into the default branch. It uses pinned official checkout/setup-node actions, read-only contents permission, no persisted checkout credentials, Node 24, npm's committed lockfile, a 15-minute timeout and per-ref concurrency cancellation.

Run locally from this Worker directory:

```sh
npm ci --no-audit --no-fund
node scripts/m18-ci.mjs
```

The entrypoint typechecks source and declaration files (including test files without executing them), builds the Worker with Wrangler's `--dry-run`, and checks MCP's embedded campaign-card JavaScript syntax. It creates an isolated build configuration from the tracked compatibility date/flags and entrypoint, omitting production variables, resources and dashboard assets. The tracked wrangler.jsonc currently contains strict JSON; invalid JSON or future JSONC comments fail closed until the reader is deliberately updated. Build reports and local Wrangler logs remain ignored under `.dry-run/m18-ci`.

No tests, provider calls, source-map upload, deployment, migrations, campaign creation or scheduling run in this workflow. No Cloudflare, PostHog or ad-platform secrets are needed. A successful CI build is not a release artifact prepared for production or a provider acceptance result. Dashboard asset compilation is outside these Worker-only checks. Existing unrelated workflows remain unchanged; in Automation-Report, creating a pull request can independently trigger the pre-existing Google contract test workflow, so no PR was opened during this no-regression-test task.

CI changes are follow-up tooling/docs on uniquely owned `codex/m18-future-start-ci-20261028`; predecessor branches and main/shared branches are unchanged. Runtime source remains the exact release SHA above. See the primary workspace release evidence for publication/run status and integration-owner handoff.
