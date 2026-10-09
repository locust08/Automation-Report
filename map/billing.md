# M05 billing evidence

Reviewed 2026-10-09. M05 is a read-only evidence producer for DigitalBee. It does not replace the Notion billing plan, infer collected funds, expose a provider balance, forecast spend, recommend budget changes, or mutate advertising data.

## Current pilot boundary

| Boundary | Current state |
| --- | --- |
| Account | Dscaff Notion service `3584fcc4-f701-8003-843e-d7e3316fc758` only |
| Provider | Google Ads customer `1998676917` through MCC `3666137525` |
| Cycle | `35e4fcc4-f701-803c-92f6-f7cac2926a4f`, 1–31 October 2026, MYR 7,500 |
| Scheduler | Cloudflare dispatcher remains `shadow`; an account allow-list environment value is mandatory |
| Evidence | Daily provider spend through the last complete account-local day, missing dates, capture time, immutable revision, coverage and approved-envelope pacing |
| Explicitly unavailable | Forecast, provider balance, M08 collected funds and recommendations |

The M04 account mapping, timezone, active verified access, active admin operator and source revision are revalidated atomically by the Dscaff seed RPC. Conflicting existing rows fail closed. Tables retain RLS and deny `PUBLIC`, `anon` and `authenticated`; security-invoker functions are executable only by `service_role`.

Implementation is local until the production gate in the [pilot runbook](../docs/operations/m05-dscaff-pilot.md) is approved. Local tests are not native Google reconciliation and do not authorize deployment.
