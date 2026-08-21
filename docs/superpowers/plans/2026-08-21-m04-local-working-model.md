# M04 Local Working Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-only M04 Campaigns workbench whose authenticated Next.js UI and API read and mutate mock campaign workflow data in SQLite.

**Architecture:** A Node-only SQLite repository initializes an ignored local file, seeds representative cross-platform records, and exposes typed list/detail/create/action functions. Thin authenticated route handlers call that repository, while one `/campaigns` client workbench consumes the routes and clearly labels every gate as a simulation. No provider or Supabase runtime is called.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod 4, `node:sqlite` `DatabaseSync`, existing Tailwind/shadcn-style components, Node test runner through `tsx`.

**Spec:** `docs/superpowers/specs/2026-08-21-m04-local-working-model-design.md`

## Global Constraints

- Use `M04_SQLITE_PATH` or `data/m04-local.sqlite`; never reuse another module's SQLite file.
- Reject the local repository when `NODE_ENV === "production"`.
- Make no Supabase, Notion, Google, Meta, TikTok, provider, deployment, or production-migration calls.
- Every response includes `mode: "local-model"` and `providerWrites: false`.
- Label launch actions as simulations and show a persistent local-demo warning.
- Authenticated non-basic operators may view; only administrators may mutate.
- Run exactly one focused end-to-end test command after implementation.

---

### Task 1: Local SQLite domain and repository

**Files:**
- Create: `lib/campaign-planning/types.ts`
- Create: `lib/campaign-planning/sqlite-schema.sql`
- Create: `lib/campaign-planning/sqlite-repository.ts`

**Interfaces:**
- Produces `CampaignPlanningListPayload`, `CampaignPlanDetail`, `CreateCampaignPlanInput`, `CampaignPlanActionInput`, and `CampaignPlanAction`.
- Produces `listCampaignPlans()`, `getCampaignPlan(id)`, `createCampaignPlan(input, actor)`, and `applyCampaignPlanAction(id, input, actor)`.

- [ ] **Step 1: Define application DTOs and supported states**

```ts
export type CampaignPlatform = "google" | "meta" | "tiktok";
export type CampaignPlanStatus = "draft" | "awaiting_approval" | "approved" | "launch_in_progress" | "launched";
export type CampaignPlanAction = "save_revision" | "submit" | "approve" | "simulate_gate_1" | "simulate_gate_2" | "create_handoff";
export type LocalModelMeta = { mode: "local-model"; providerWrites: false };
```

Define list summaries, account/package choices, full joined detail, resource, QA, revision, approval, audit, and handoff DTOs. Monetary values cross the API as integer micros plus display currency.

- [ ] **Step 2: Create the idempotent SQLite schema**

Create the eleven local M04 record tables with foreign keys, immutable revision/approval/QA/audit/handoff rows, unique logical resource keys per build, and `lock_version` on mutable plans/builds/packages. Add `m04_local_seed_state` so seed insertion runs once per database.

- [ ] **Step 3: Implement guarded database opening and seed data**

```ts
function openDatabase(): DatabaseSync {
  if (process.env.NODE_ENV === "production") throw new Error("The M04 local model is unavailable in production.");
  const file = resolve(process.env.M04_SQLITE_PATH || "data/m04-local.sqlite");
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("pragma foreign_keys = on;");
  db.exec(readFileSync(resolve("lib/campaign-planning/sqlite-schema.sql"), "utf8"));
  seedLocalModel(db);
  return db;
}
```

Seed Google, Meta, and TikTok examples across draft, awaiting approval, ready-to-deliver, and launched states. Provider IDs are visibly mock values.

- [ ] **Step 4: Implement list and joined-detail fetches**

Return summary counts, choices, and campaign cards from `listCampaignPlans()`. Return revision, approval, build, resources, QA, audits, and handoff from `getCampaignPlan(id)`, or `null` when absent. Close the database in `finally`.

- [ ] **Step 5: Implement transactional creation and simulated actions**

`createCampaignPlan` inserts a draft plan and immutable revision 1 in one `BEGIN IMMEDIATE` transaction. `applyCampaignPlanAction` checks the supplied `lockVersion`, validates the current state, performs only the selected transition, appends an audit event, increments the lock, and rolls back on error.

The simulated gate actions create mock build/resources/attempts/QA evidence without any external call. Handoff requires a verified mock build.

- [ ] **Step 6: Review the repository boundary**

Confirm the repository imports no Supabase/provider/Notion modules, all statements are parameterized, production is blocked, the database always closes, and every write uses a transaction.

- [ ] **Step 7: Commit the repository unit**

```powershell
git add -- lib/campaign-planning/types.ts lib/campaign-planning/sqlite-schema.sql lib/campaign-planning/sqlite-repository.ts
git commit -m "feat(m04): add local campaign repository"
```

### Task 2: Authenticated local API

**Files:**
- Create: `lib/campaign-planning/validation.ts`
- Create: `app/api/campaign-planning/route.ts`
- Create: `app/api/campaign-planning/[id]/route.ts`
- Create: `app/api/campaign-planning/[id]/actions/route.ts`

**Interfaces:**
- Consumes the repository functions from Task 1.
- Produces `GET/POST /api/campaign-planning`, `GET /api/campaign-planning/[id]`, and `POST /api/campaign-planning/[id]/actions`.

- [ ] **Step 1: Define strict Zod request schemas**

Validate non-empty client/campaign/objective/destination names, platform enum, positive account/package IDs, ISO dates with end not before start, positive allocation micros, integer lock version, and the exact action enum.

- [ ] **Step 2: Implement the collection route**

Set `runtime = "nodejs"` and `dynamic = "force-dynamic"`. GET requires a server session and returns the list payload. POST additionally requires `session.role === "admin"`, validates JSON, and creates the local draft with `{ id: session.sub, email: session.email }` attribution.

- [ ] **Step 3: Implement detail and action routes**

Detail GET returns 404 for an unknown campaign. Action POST requires admin, validates the action/lock version/payload, returns 409 for stale or invalid transitions, and returns the refreshed detail after a successful transaction.

- [ ] **Step 4: Normalize API errors**

Return 401 unauthenticated, 403 unauthorized, 400 validation, 404 missing, 409 state/lock conflict, and 500 local-store failures. Every successful body preserves `mode` and `providerWrites`.

- [ ] **Step 5: Commit the API unit**

```powershell
git add -- lib/campaign-planning/validation.ts app/api/campaign-planning/route.ts 'app/api/campaign-planning/[id]/route.ts' 'app/api/campaign-planning/[id]/actions/route.ts'
git commit -m "feat(m04): expose local campaign api"
```

### Task 3: Campaigns workbench and dashboard entry

**Files:**
- Create: `app/campaigns/page.tsx`
- Create: `components/campaign-planning/campaigns-page-client.tsx`
- Create: `components/campaign-planning/campaign-create-form.tsx`
- Create: `components/campaign-planning/campaign-detail.tsx`
- Modify: `components/reporting/home-page-client.tsx`
- Modify: `components/reporting/report-shell.tsx`
- Modify: `proxy.ts`

**Interfaces:**
- Consumes Task 2 API routes and Task 1 DTOs.
- Produces `/campaigns` and the dashboard “Campaigns” section.

- [ ] **Step 1: Add the protected server page**

Call `getServerAuthSession()`, redirect unauthenticated users to `/`, redirect the basic `user` role to `/dashboard`, and render `CampaignsPageClient` with the session role.

- [ ] **Step 2: Add the dashboard and shell navigation links**

Add a “Campaigns” heading beneath the existing tools and a “Campaign Planning & Launch” card linking to `/campaigns`. Add the same destination to `ReportShell` navigation using a campaign/megaphone icon. Preserve the legacy Create Media Plan card unchanged.

- [ ] **Step 3: Build the workbench loading, error, and filter states**

Fetch `GET /api/campaign-planning` with `cache: "no-store"`. Render the persistent local-demo alert, summary cards, search, platform/status filters, responsive campaign rows, loading skeleton, retryable error, and empty state.

- [ ] **Step 4: Build local draft creation**

Render an admin-only form for client, platform, account, package, campaign name, objective, destination, start/end dates, and allocation. Submit to POST, show field/server errors, refresh the list, and select the new draft.

- [ ] **Step 5: Build campaign detail and simulated actions**

Fetch the selected detail and render plan/revision, budget/approval, build/resources, QA, audit, and handoff sections. Admin-only action buttons use explicit confirmation and the exact labels “Simulate Gate 1” and “Simulate Gate 2.” Refresh both list and detail after success.

- [ ] **Step 6: Add routing protection**

Treat `/campaigns` as an authenticated page in `proxy.ts`. Continue relying on each API route's own authentication and authorization checks.

- [ ] **Step 7: Commit the UI unit**

```powershell
git add -- app/campaigns/page.tsx components/campaign-planning/campaigns-page-client.tsx components/campaign-planning/campaign-create-form.tsx components/campaign-planning/campaign-detail.tsx components/reporting/home-page-client.tsx components/reporting/report-shell.tsx proxy.ts
git commit -m "feat(m04): add local campaigns workbench"
```

### Task 4: Single end-to-end local verification

**Files:**
- Create: `scripts/m04-local-model.test.mts`
- Modify: `package.json`

**Interfaces:**
- Consumes the repository API from Task 1.
- Produces the single command `npm run test:m04-local`.

- [ ] **Step 1: Add one end-to-end SQLite workflow test**

The test creates a unique temporary directory, sets `M04_SQLITE_PATH` before dynamic import, lists seeded mock records, creates a campaign, applies submit → approve → simulate Gate 1 → simulate Gate 2 → handoff, fetches final detail, and asserts:

```ts
assert.equal(final.plan.status, "launched");
assert.equal(final.build?.status, "handoff_complete");
assert.equal(final.mode, "local-model");
assert.equal(final.providerWrites, false);
assert.ok(final.auditEvents.length >= 6);
```

Delete only the exact temporary test directory in `finally`.

- [ ] **Step 2: Add the package command**

```json
"test:m04-local": "tsx --test scripts/m04-local-model.test.mts"
```

- [ ] **Step 3: Run the one authorized verification command**

Run: `npm run test:m04-local`

Expected: one test file passes, the final campaign is `launched`, the build is `handoff_complete`, provider writes remain false, and the temporary database is removed.

- [ ] **Step 4: Inspect the final diff and local safety state**

Confirm only planned files changed, no SQLite file is tracked, no external service was contacted, and no process remains. This is inspection, not an additional test suite.

- [ ] **Step 5: Commit the verification unit**

```powershell
git add -- scripts/m04-local-model.test.mts package.json
git commit -m "test(m04): verify local campaign workflow"
```
