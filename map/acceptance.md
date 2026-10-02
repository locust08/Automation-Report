# Acceptance ledger — 2026-10-02

## Evidence already recorded

- Dashboard hierarchy/Demand Gen local checks and read-only API smoke: [2026-10-01 receipt](../docs/monthly-breakdowns-demand-gen.md). Native classified nonzero format/Affinity comparison remains unverified.
- Latest dashboard chat records production Ready at commit `7460c84`, including CPC formatting and Notion transient-error retries. This is historical chat evidence, not a new deployment readback.
- DigitalBee MCP map records META-1/META-2 and DG-1/DG-2 implemented; META-3/DG-3 remain partial. Keep its acceptance receipts in that repository.

## Today's gates

| Gate | Completion evidence required | Current status |
| --- | --- | --- |
| Dashboard mapping | Source-backed reporting, typography, cache and export ownership plus honest remaining gates | Created; source and local links verified |
| MCP Meta discovery | Ordinary account request resolves authorized mapping or accurately explains the failure | Pending; prior Mapping review required |
| MCP Meta completion/regeneration | Full account pagination, descendant completeness and date change verified in connected host | Date regeneration and campaign spend/native comparison passed; full collection and completeness partial |
| MCP Meta retry/denial | Failed continuation retains rows/retries; denied access clears data correctly | Pending |
| Demand Gen native comparison | Matched account/campaign/dates, classified nonzero format/device and measured Affinity evidence | Three formats, six In-market rows and Affinity reconciled; individual device cells and seven-impression total discrepancy remain |
| MCP Demand Gen fresh routing | Fresh natural prompt resolves scope and mounts correct interactive report | Pending |
| Overall PDF audience layout | Populated audience fixture reproduces issue; exported artifact has no overlapping headings/controls/charts | Fixed locally; empty/populated serialized export bounds, PNG/PDF downloads and visual inspection passed |

See the [2026-10-02 verification receipt](../docs/reporting-verification-2026-10-02.md) for exact scope, values, artifacts and limitations.

For each new receipt record source commit, account/campaign, inclusive dates, metric/event definitions, expected/returned counts, verification surface, result and artifact path. Never include credentials. Synthetic fixtures, provider API reads, native UI reconciliation and connected MCP interaction are different evidence types.

## Deferred work

Standalone custom portrait PDF and admin preview local evidence is recorded in [2026-10-02 custom PDF receipt](../docs/custom-pdf-verification-2026-10-02.md). Keep local fixture checks separate from production rollout and long-report performance acceptance.

Usage analytics, SEO and unrelated gallery work remain deferred. Mapping-only edits require no runtime deployment. Provider writes, emails and migrations are outside today's reporting verification scope.
