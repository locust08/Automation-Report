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

Demand Gen Ads metric sorting local fixture evidence is recorded in [sorting receipt](../docs/demand-ad-sort-verification-2026-10-02.md). Campaign filtering was explicitly excluded; deployment acceptance remains separate.

Breakdown PDF clipping/spacing fixture acceptance is recorded in the custom PDF receipt: grouped metrics, heading/table separation, large-number fit and filtered Meta/TikTok exports passed locally. Native reconciliation and deployment remain separate acceptance gates.

Standalone PDF changes through commit `4f598bf` were deployed to Vercel production on 2026-10-02; deployment `4tnXGaxL4cYetFiC8W3Gz1Um6BnK` reached Ready. See the custom PDF receipt for deployment evidence. Native reconciliation remains pending independently.

## Demand Gen creative/PDF follow-up

[2026-10-02 receipt](../docs/demand-gen-creative-pdf-verification-2026-10-02.md): 30 focused tests, scoped source TypeScript, scoped lint, production build and desktop/mobile PDF browser checks pass. Repository-wide typecheck remains blocked by three pre-existing generated-file errors. Read-only Magnet September API evidence confirms 21 ads, exact asset scope, ranking and separate spend. Native Google Ads UI reconciliation remains pending. No deployment of this follow-up is included; the earlier `4f598bf` rollout above remains historical.

Breakdown opening-card overflow was reproduced and fixed locally: 25-ad export preserves every ad and keeps creative captions out of report scope. See the presentation card; no production deployment is included.
