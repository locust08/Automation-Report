# M04 campaign-creation database contract

M04 is the shared database boundary for cross-platform campaign launch orchestration. It owns an approved campaign plan from revision through verified provider delivery and monitoring handoff.

It is deliberately distinct from:

- **M03 — Cross-Platform Post-Launch Change Control and Verification**, which owns cross-platform post-launch change control, verification, and rollback. M04 provides verified launch evidence that M03 can use; it does not replace M03's change workflow.
- Future Google, Meta, and TikTok campaign creators, which are server-side clients of M04. Stage 2 stores validated drafts and platform revision details, but it does not contain a provider adapter or make provider calls.

## Relationship map

| Concern | Tables | Role |
| --- | --- | --- |
| Account and budget roots | `ads_ad_accounts`, `ads_budget_packages` | Operational account directory and bounded budget package. |
| Plan and revision | `ads_campaign_plans`, `ads_campaign_plan_revisions`, and the three `ads_*_campaign_revision_details` tables | Operational plan pointer plus immutable, hash-bound shared and platform-specific revision snapshots. |
| Approval | `ads_campaign_approvals` | Append-only approval and expiry evidence bound to a revision hash. |
| Build and resources | `ads_campaign_builds`, `ads_campaign_build_resources` | Operational approved build, logical resource intent, provider IDs, hierarchy, and final verification timestamp. |
| Claims and QA | `ads_campaign_gate_attempts`, `ads_campaign_qa_results` | Persisted gate intent/lease and immutable expected-versus-observed QA evidence. |
| Audit and handoff | `ads_campaign_audit_events`, `ads_campaign_monitoring_handoffs` | Immutable workflow audit and immutable verified-launch handoff to future monitoring. |

The immutable evidence rows are revisions, approvals, QA results, audit events, and monitoring handoffs. Plans, builds, active claims, resources, accounts, and budget packages are the operational rows; resource identity and recorded provider IDs have their own immutability protections.

## Stage 2 draft data model

Every revision captures normalized shared fields: client, account and provider account, platform, budget package, currency/timezone, flight dates, allocation and budgets, objective, destination, canonical JSON, and hash. `ads_campaign_plan_revisions.plan_payload` preserves the complete immutable Stage 2 plan.

Three additive, immutable detail tables make provider-specific draft data explicit without duplicating the shared workflow:

- `ads_google_campaign_revision_details` for Search, Performance Max, and Demand Gen.
- `ads_meta_campaign_revision_details` for website Traffic, Leads, and Sales.
- `ads_tiktok_campaign_revision_details` for Auction Traffic, Web Conversions, and Lead Generation using regular non-Spark video ads.

`ads_create_campaign_plan_draft(...)` is the only Stage 2 write boundary. It atomically creates the draft plan, revision 1, exactly one matching detail row, and its audit event. The function is executable only by `service_role`; browser roles cannot write these tables.

This is one database architecture, not three duplicate provider workflows. `platform` is `google`, `meta`, or `tiktok`; a future adapter reads the shared revision and its one matching detail row.

## Local Stage 2 workbench

The `/campaigns` workbench uses an isolated local Supabase project. It can list and create validated drafts; approval, builds, Gate 1, Gate 2, handoff, and all advertising-platform operations are intentionally disabled.

```powershell
npm run dev:m04-stage2
npm run m04:stage2:stop
```

The start command creates only the scoped local M04 stack, applies the curated prerequisite plus M04 migrations, seeds mock Google/Meta/TikTok account and package rows, and launches the dashboard with dedicated `M04_SUPABASE_*` variables. The normal stop command preserves its local data. Use `npm run m04:stage2:reset` only when that scoped local data should be discarded.

The repository refuses production and non-loopback Supabase URLs. Never place `M04_SUPABASE_SERVICE_ROLE_KEY` in browser code or reuse it for a hosted project.

Build resources use a deterministic logical key per build, extensible non-empty `resource_type`, provider resource ID, and provider parent resource ID for hierarchy. Examples:

- Google Search: `campaign`, `ad_group`, `ad`. Performance Max or Demand Gen can add stable types such as `asset_group` and `asset` without a schema redesign.
- Meta: `campaign`, `ad_set`, `ad`.
- TikTok: `campaign`, `ad_group`, `ad`.

## Public launch RPC sequence

The public functions are service-role-only transactional interfaces. A future server-side creator follows this sequence, keeping each provider mutation outside the database transaction:

1. Call `ads_acquire_campaign_gate_claim` for Gate 1 (`p_gate = 1`, normally `p_action = 'create'`) with a persisted logical-resource intent.
2. Immediately call `ads_record_campaign_resource_outcome` for every provider outcome, including failures, missing/found proofs, unknown, and ambiguous receipts.
3. Call `ads_append_campaign_qa_result` for Gate 1 readback evidence, then `ads_finalize_campaign_gate_claim`.
4. When a timeout or ambiguous result requires it, acquire a reconciliation claim with `ads_acquire_campaign_gate_claim` (`p_action = 'reconcile'`), record proof, append reconciliation QA, and finalize. Call `ads_acquire_campaign_retry_claim` only for resources proven missing by the required reconciliation evidence.
5. Call `ads_acquire_campaign_gate_claim` for Gate 2 (`p_gate = 2`, `p_action = 'deliver'`) with a `m04.gate2.v1` delivery manifest; record delivery outcomes, append Gate 2 QA, and finalize with `ads_finalize_campaign_gate_claim`.
6. Call `ads_create_campaign_monitoring_handoff` after verification to create the one immutable monitoring handoff.

Supporting plan lifecycle RPCs are `ads_create_campaign_plan_revision`, `ads_reserve_campaign_budget`, `ads_release_campaign_budget`, `ads_approve_campaign_plan_revision`, and `ads_transition_campaign_plan`. The currently checked-in `ads_get_campaign_launch_eligibility(text, text)` legacy eligibility bridge is Google-specific today. M04's generic platform, resource, build, and handoff structure can support later Meta/TikTok M03 integration without redesigning M04.

### Gate intents

Gate 1 declares the complete, deterministic resource intent before creation. Its minimum shape is:

```json
{
  "resources": [
    { "logical_resource_key": "campaign:main", "resource_type": "campaign" },
    { "logical_resource_key": "ad-group:prospecting", "resource_type": "ad_group" }
  ]
}
```

Gate 2 carries provider-neutral delivery/readback requirements, for example:

```json
{
  "schema": "m04.gate2.v1",
  "platform": "google",
  "delivery": { "mode": "activate_now" },
  "resources": [
    {
      "logical_resource_key": "campaign:main",
      "resource_type": "campaign",
      "required_fields": { "delivery.status": "ENABLED" }
    }
  ]
}
```

The Gate 2 manifest exactly covers every persisted build resource, has no duplicate logical-key/type entries, and each non-empty `required_fields` object includes `delivery.status`. Before every persisted resource receives the build verification timestamp, the current attempt must have matching expected, observed, and evidence-backed required values for every declared resource/field; provider IDs are also required.

## Idempotency, claims, and recovery

- Persist the Gate 1 intent before any provider mutation and record the immediate provider ID receipt through `ads_record_campaign_resource_outcome`.
- Claims are expiring, idempotency-keyed leases; only one active claim may exist for a build across both gates.
- A timeout is ambiguous, never implicit success or an automatic retry. Reconcile it first and retry only the resources proven missing.
- Provider resource IDs are write-once: never overwrite a non-null provider ID. Record later evidence instead.

## Security and integration limits

- Invoke these RPCs only from a server-side service-role integration. Browser clients never receive service secrets or write access.
- Do not write M04 tables directly; use the public RPCs so locks, hashes, claims, audit rows, and invariants stay atomic.
- Do not make provider calls inside database transactions, automatically retry after an ambiguous timeout, or create provider-specific duplicate workflow tables.

Stage 2 now defines and stores the platform draft schemas. Google/Meta/TikTok adapters, provider connection checks, approval APIs, build execution, Gate operations, launch UI, and deployment remain later-stage work. Nothing in the Stage 2 workbench creates or changes a real advertising campaign.
