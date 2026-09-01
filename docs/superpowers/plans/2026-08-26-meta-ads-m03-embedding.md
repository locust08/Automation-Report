# Meta Ads Management + Embedded M03 Change Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete `/manage/meta` by embedding the full account-scoped, non-publishing M03 Change Control workflow.

**Architecture:** Preserve the existing Meta explorer, centralize client-safe Meta capabilities, add server-side account filters to the M03 list API, and extract shared Change Control workspace components used by both `/change-control` and `/manage/meta`. Provider execution remains locked.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Supabase REST/RPC, Meta Graph API.

**Spec:** `docs/architecture/m03-change-control-ad-management-integrations.md`

## Global Constraints

- Preserve the current uncommitted Meta explorer as the starting point.
- Use existing `m03_ads_*` tables; add no Meta-specific workflow tables or database migration.
- Keep M04 read-only and do not alter M05, billing, authentication, or unrelated reporting behavior.
- Provider credentials stay server-only and no Meta mutation is enabled.
- Publishing, retry, verification, conflict execution, and rollback execution remain visibly locked.
- Cap external integration coverage at two tests per integration: connectivity and correctness/response shape. Local unit tests are not part of this cap.

---

### Task 1: Meta capability registry and account-scoped request queries

- [ ] Add failing tests for Meta UI capability coverage, mutation modes, query validation, exact account/campaign filtering, scoped summaries, and pagination.
- [ ] Extract a client-safe Meta field registry consumed by the Meta request builder and provider capability adapter.
- [ ] Add `M03RequestListFilters` with optional `account_identity` and `campaign_identity`.
- [ ] Extend the request query schema, route, and repository to apply exact server-side Supabase filters and account-scoped summaries.
- [ ] Run focused tests, typecheck the changed modules, and self-review.

### Task 2: Reusable M03 workspace components

- [ ] Add failing pure tests for workspace query serialization, prefill/edit serialization, value parsing, and optimistic-conflict state.
- [ ] Extract shared request list, editor, detail, preview, audit, actions, and controller behavior from the global Change Control client.
- [ ] Implement `M03WorkspaceScope` and `M03RequestPrefill` interfaces.
- [ ] Retain global `/change-control` behavior and workflow-policy-aware validation/approval.
- [ ] Preserve unsaved edits on `409`, refresh detail, and display a newer-version conflict message.
- [ ] Run focused tests, typecheck, and self-review.

### Task 3: Meta builder and embedded account workspace

- [ ] Add failing tests for campaign/ad-set/ad prefills, immutable baseline handling, multi-item dependent fields, and creative resource mappings.
- [ ] Replace the narrow inline form with the shared editor configured for Meta.
- [ ] Prefill official current values and block creation when a trustworthy baseline is unavailable.
- [ ] Support multiple items plus optional paired M04 plan/revision evidence.
- [ ] Embed the account-wide M03 request list with status/campaign filters and refresh after lifecycle actions.
- [ ] Display revisions, validation, approval, source evidence, provider preview/conflicts, operation plans, mappings, attempts, readback, and audit history.
- [ ] Keep provider action controls disabled and link each request to global Change Control.
- [ ] Run focused tests, typecheck, lint, and self-review.

### Task 4: Verification and architecture documentation

- [ ] Run all Change Control and Meta provider tests.
- [ ] Run `npm run typecheck` and `npm run lint`.
- [ ] Run the app with Doppler when credentials are available and verify `/manage/meta` plus `/change-control` manually.
- [ ] Verify no credential or raw sensitive provider evidence reaches browser payloads or rendered errors.
- [ ] Update the architecture document to mark Meta embedding complete only when acceptance checks pass.
