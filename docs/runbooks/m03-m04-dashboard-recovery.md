# M03/M04 dashboard recovery runbook

This runbook covers the dashboard-only M03 change-control and M04 campaign-readiness controls. Advertising-provider execution remains locked; recovery must never enable Google, Meta, or TikTok mutations.

## Invalid development actor mapping

1. Read `DEV_AUTH_BYPASS_ACTOR_ID` from the deployment secret manager. Do not place it in source control or logs.
2. Confirm the UUID identifies an active `admin` row in `ads_reporting_auth`.
3. Correct the environment value and restart the local or preview runtime.
4. Load `/campaigns` and `/change-control`; confirm the server resolves the actor without inserting or updating an authentication record.

If the mapping is absent or inactive, keep mutations unavailable. Never restore the removed hard-coded actor fallback.

## Domain or trusted-network lockout

Workflow actions require an active administrator, an active M03 operator email domain, and an active M03 trusted-network match. Workflow settings themselves require only an active administrator and server-attested proxy context so administrators can recover.

1. Open **Workflow access settings** on `/change-control`.
2. Reactivate or add the correct operator domain or CIDR network.
3. Confirm the change created an immutable row in `m03_ads_admin_events` or `m04_ads_admin_events`.
4. Retry one read-only dashboard load, then one mock validation action.

Use soft activation/deactivation only. Do not delete configuration rows.

## Migration failure

1. Stop the apply and capture the exact failed statement without credentials.
2. Compare remote migration history and the allowlisted `m03_ads_*` / `m04_ads_*` objects.
3. Do not edit an already-applied migration. Create an additive forward repair migration with the Supabase CLI.
4. Re-run only the failed schema, RLS, duplicate, and isolation assertions.
5. Confirm no non-M03/M04 schema metadata or row counts changed.

## Idempotency collision or duplicate detection

1. Read the matching M03 idempotency claim or M03/M04 admin event by idempotency key.
2. Compare its action, request or setting identity, and response snapshot with the retry.
3. Return the existing logical result when they match.
4. Treat a reused key with different intent as a conflict; issue a new key only after the original outcome is known.
5. Confirm row counts for revisions, approvals, events, readiness checks, and builds did not increase unexpectedly.

## Failed validation or approval

1. Keep the request in `validation_failed` or `awaiting_approval`; do not publish.
2. Review the structured validation issues and immutable revision hash.
3. Edit only an eligible draft using its current lock version, then validate again to create a new immutable snapshot.
4. Approve only the exact latest validated hash.

## Supabase connection failure

1. Confirm the configured URL is the approved CRM08 project and the service-role secret is available only to the server.
2. Check Supabase project health and server logs.
3. Keep entered browser state intact and retry only after connectivity returns.
4. Do not fall back to local files, R2, another Supabase project, or direct browser credentials.

## Provider execution lock confirmation

- `POST /api/change-control/provider` must return HTTP 423 with `provider_execution_locked`.
- The dashboard must not show functioning publish, retry, readback, verification, or rollback controls.
- M03 provider-dependent statuses remain part of the future contract but cannot be reached by mock RPCs.
- M04 provider creation, activation, readback, and M05 handoff remain disabled.
