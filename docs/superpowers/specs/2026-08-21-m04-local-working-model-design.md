# M04 Local Working Model Design

## Goal

Add a local-only M04 Campaigns module that proves the dashboard, authenticated API, SQLite repository, and UI can exchange campaign-planning data without contacting Supabase or any advertising platform.

## Scope

Included:

- A new Campaigns section on `/dashboard` linking to `/campaigns`.
- One authenticated Campaigns workbench with local summaries, filters, campaign details, draft creation, revision history, budget and approval state, simulated launch-gate progress, QA, resources, audit history, and handoff state.
- A local SQLite database at `M04_SQLITE_PATH` or `data/m04-local.sqlite`.
- Seeded Google, Meta, and TikTok examples.
- Authenticated local API routes for list, create, detail, and validated mock workflow actions.
- One end-to-end test proving SQLite initialization, creation, workflow advancement, and fetch.

Excluded:

- Supabase writes or production migration application.
- Google, Meta, TikTok, Notion, or other external API calls.
- Real campaign creation, activation, scheduling, or spend.
- Provider adapters, deployment, exhaustive catalog testing, and broad refactoring.

## Selected approach

Use a local SQLite vertical slice rather than static JSON or a local Supabase stack. Static JSON would not prove a database connection. A Supabase stack would exceed the requested local-model scope and would still lack safe bootstrap RPCs for initial accounts, packages, and plans.

The local repository exposes application-facing DTOs that use M04 terminology. This keeps the UI replaceable with a later Supabase repository while making the local implementation explicitly non-production.

## Safety boundary

- Every API response includes `mode: "local-model"` and `providerWrites: false`.
- The repository rejects use when `NODE_ENV === "production"`.
- The UI displays a persistent “Local demo — no ads are created” warning.
- Gate actions are named “Simulate Gate 1” and “Simulate Gate 2”; they never imply a provider mutation.
- API routes authenticate independently with the existing server session.
- The SQLite file is ignored by Git and separate from all existing SQLite stores.

## Local data model

SQLite preserves the eleven M04 logical record types:

1. Ad accounts
2. Budget packages
3. Campaign plans
4. Immutable revisions
5. Approvals
6. Builds
7. Build resources
8. Gate attempts
9. QA results
10. Audit events
11. Monitoring handoffs

SQLite uses integer identifiers, ISO text timestamps and dates, JSON text, integer booleans, and integer micros for money. Foreign keys are enabled. Mutations use `BEGIN IMMEDIATE`, optimistic `lock_version` checks, and append an audit event.

Local display extensions are limited to `client_name` and `campaign_name`; `campaign_name` also lives in the revision payload so it maps cleanly to M04’s existing `plan_payload` boundary.

The default seed contains Google, Meta, and TikTok campaigns at representative draft, awaiting-approval, ready-to-deliver, and launched states.

## API

All routes use the Node.js runtime, disable caching, authenticate through `getServerAuthSession`, validate request bodies, and return conventional 400/401/403/404/409/500 responses.

- `GET /api/campaign-planning`: list summaries, filters, accounts, and packages.
- `POST /api/campaign-planning`: create a draft plan and immutable revision 1 transactionally.
- `GET /api/campaign-planning/[id]`: fetch joined plan, revision, approval, build, resources, QA, audit, and handoff detail.
- `POST /api/campaign-planning/[id]/actions`: perform one local action: save revision, submit, approve, simulate Gate 1, simulate Gate 2, or create handoff.

The local state model follows the existing M04 names:

```text
plan:  draft → awaiting_approval → approved → launch_in_progress → launched
build: pending_gate_1 → gate_1_in_progress → ready_to_deliver
       → gate_2_in_progress → verified → handoff_complete
```

## UI

The dashboard gains a separate “Campaigns” section with a “Campaign Planning & Launch” card linking to `/campaigns`. The legacy “Create Media Plan” link remains available and unchanged.

The `/campaigns` workbench uses the repository’s existing visual language and components:

- Persistent local-demo warning and back-to-dashboard navigation.
- Summary cards for total, draft, awaiting approval, and launched campaigns.
- Search, platform, and status filters.
- Responsive campaign table/cards showing campaign, client, platform, account, budget, flight, status, and last update.
- A create-draft form for client, platform, account, package, campaign name, objective, destination, dates, and allocation.
- A selected-campaign detail area with revision, budget, approval, build/resource, QA, audit, and handoff sections.
- Explicit confirmation before every mock state transition.
- Text labels accompany colors and icons for accessibility.

Authenticated non-basic operators may view the local model. Mutating local actions are restricted to administrators for this first working slice.

## Error handling

- Missing or corrupt local data returns a clear module error without falling back to provider or Supabase calls.
- Invalid state changes return 409 and leave the database unchanged.
- Validation failures return field-level 400 errors.
- Stale `lock_version` updates return 409.
- Empty results display a first-run empty state with the create-draft action.

## Verification

Run one focused end-to-end command after implementation. It creates a unique temporary SQLite file, initializes and seeds it, creates a campaign through the local API workflow, advances it through the simulated states, fetches the resulting detail, and verifies the final status, audit trail, `mode`, and `providerWrites: false`. The test removes only its exact temporary directory.

No additional database, provider, deployment, or exhaustive test suite is part of this local-model delivery.

