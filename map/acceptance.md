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

Compact standalone PDFs now place selected creatives inside campaign-grouped ad tables, with selection/ranking and asset-spend captions omitted from PDF Creative columns. The [compact PDF receipt](../docs/compact-pdf-verification-2026-10-02.md) records the latest 12 Demand Gen ads/six pages and 26 Breakdown ads/12 pages, download and preview checks, nine focused tests, passing typecheck/scoped lint, and the unrelated repository-wide lint failures. Source `01500d1` reached Ready in Vercel production deployment `PVjrqq3MLYZQrPinz8iRba5M8Dzr`. Native reconciliation remains pending independently; browser publication to GitHub master awaits sign-in.
## M03 stranded pause receipt recovery — 2026-10-16

**2 November, 10:54 MYT completion (supersedes earlier checkpoints below):** both required original M18 pilot requests now have complete formal M03 PAUSED-baseline evidence chains. Human exact-revision approvals and separate human pause confirmations are verified; final SELECT shows one original revision, one matching approval and one verified execution per request. Google receipt `a3c7194b-f5ed-466d-b75b-5beea525bf48` and Meta receipt `bd225981-9226-43fa-a577-074d4c735396` retain execution-linked official PAUSED readbacks at 02:51:51.924 and 02:51:48.336 UTC. The assistant prepared cards only; the user explicitly confirmed both pause clicks. No new request, duplicate claim, reconciliation, activation or scheduling. Google Gate 2/compensation, zero-spend and historical Meta consent remain open; M18 stays In Review / Stage 3.2 / 7/9 and M17 untouched. See the linked ledger for full hashes/provenance.

**2 November, 10:47 MYT display follow-up (supersedes the blocker in the earlier checkpoint below):** both retained cards render after host display recovery. Existing-request refreshes preserved exact original revisions/keys; separate Google presentation avoids the combined response exposing only the last Meta card. Google fresh card was visually verified with enabled approval, expiry 10:51:02 MYT, and left for human approval. The user personally approved Meta revision `062c87b9-9466-4a59-9419-22506ce5b85a`; approval `4f59e780-890e-4562-a765-13b2ee0021cb` is verified in UI and SELECT. Each request retains one revision and zero execution operations. No code/deployment/provider mutation or assistant confirmation occurred. A permanent host-loading root cause remains unproven; separate pause confirmations and full M18 acceptance remain open.

Latest continuation: [2 November startup diagnostics and acceptance ledger](../docs/m03-bootstrap-diagnostics-2026-11-02.md). Published source `dccadfd` and the final injected artifact pass 10 bootstrap cases and two mocked approval/pause flows; 94 scoped tests remain retained. Diagnostics proved Doppler HTTP 401, corrected by the approved scoped token replacement. Separately approved Meta placement is verified on current backend `b6ffd161-7f8a-4fc0-879e-e47806ab43a4`, with identical JS, preserved other settings and four unchanged peers; rollback `9c85bc5c-0528-4c4d-9fa8-aed2145899c6`. One bounded preparation per pilot saved Google request `6cf8e971-a7d5-48f3-8150-bf0ee9c1b0c9` and Meta request `ce6149f1-1f08-46fc-b2c8-bc7841fa2127`, each validated PAUSED→PAUSED and awaiting approval. ChatGPT cannot display either native card; zero approvals/execution operations are verified by SELECT. Do not recreate or blindly reprepare. Official exact hierarchies remain PAUSED at capture; empty date-bounded delivery reports are inconclusive. Both formal pause chains, future Google Gate 2/compensation and historical Meta consent remain open. No provider status mutation occurred. M18 stays In Review / Stage 3.2 / 7/9; M17 untouched.

Branch `codex/m03-receipt-recovery-20261016` starts from `f18a3f939e764d3aaba2725bf41a293ea32f5480`. The aged `started` + official `ENABLED` regression reproduced the prior `request_failed`/`operator_authorization` mislabel locally. The scoped read now reports `pause_not_observed`, `retry_allowed:false`, official status and the unchanged receipt without a provider write. A separate private recovery confirmation can dispose only a ten-minute-old resultless claim, preserve its original receipt, and create one superseding draft from the exact M18/M04 source. Migration `20261016025118_m03_pause_recovery_disposition.sql` adds the disposition and blocks later verification of the old receipt. Fixture tests, TypeScript and SQL transaction syntax checks are local evidence; production migration, Worker deployment, human confirmations and provider acceptance remain separate.
