# DigitalBee DEV workflow service boundary

This branch may adapt only pure validation and draft-domain behavior from the existing M03 and M04 modules for a private, DEV-only service.

## Permitted source components

- `lib/change-control/schema.ts` for field/value validation shapes.
- `lib/change-control/types.ts` for normalized draft and revision terminology.
- `lib/campaign-planning/types.ts` for draft input terminology.
- `lib/campaign-planning/validation.ts` and `campaign-submission-validation.ts` for pure validation rules.
- `lib/campaign-planning/campaign-wizard-payload.ts` for bounded draft normalization.

Copy or adapt only logic that has no provider, Notion, production Supabase, session-route, or production workflow dependency.

## Prohibited dependencies

- Google, Meta, or TikTok provider adapters, builders, discovery, execution, retry, rollback, or publishing code.
- Notion clients, tokens, writes, account lookup, or workflow synchronization.
- Production Supabase clients, production workflow tables, dashboard-session APIs, or existing production secrets.
- Campaign approval, Gate 1 creation, recovery, Gate 2 activation, change approval, or change execution.

## DEV service shape

`cloudflare/digitalbee-dev-workflows` owns dedicated D1 storage and two private named Worker entrypoints:

- `M03DevEntrypoint`: list, get, create draft, revise draft, and validate.
- `M04DevEntrypoint`: templates, workflow status, operation status, draft save, draft validate, and inert action preview.

Every request requires a DEV-only service credential and a short-lived signed delegation bound to subject, employee revision, service UUID, provider account, mapping revision, action, and request hash. Draft records and audit entries stay in tables prefixed `dev_m03_`, `dev_m04_`, or `dev_workflow_`.

`campaign_action_prepare` returns display-only preview data. It never returns an execution challenge, approval token, provider credential, or callable mutation reference.

## Disabled actions

The service has no route or RPC action for:

- `changes_approve_revision` or any provider execution;
- `campaign_revision_approve`;
- `campaign_gate1_create`;
- `campaign_creation_resume`;
- `campaign_gate2_activate`;
- advertising campaign, budget, bid, status, or activation changes;
- Notion writes.
