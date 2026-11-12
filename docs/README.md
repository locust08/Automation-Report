# Documentation index

Source review: 2026-11-12. Start with the implementation map for current behavior. Read dated receipts as evidence for their recorded source and environment, rather than a claim about today's deployment.

The documentation-only integration into `master` preserves the reporting/presentation snapshots from `datepicker-improvement` without merging its application changes. The [application map](../map/application.md) lists the differences; reporting and presentation cards are branch records, not a claim that all described features exist on `master`.

## Current implementation and setup

| Document | Purpose |
| --- | --- |
| [Implementation map](../map/README.md) | Entry point for source ownership and acceptance gates |
| [Application map](../map/application.md) | Routes, authentication, workflow services and automation |
| [Reporting branch record](../map/reporting.md) | Dated provider, hierarchy, Demand Gen and preference behavior from the reviewed feature branch |
| [Presentation branch record](../map/presentation.md) | Dated typography, date picker, capture and PDF evidence from the reviewed feature branch |
| [Authentication setup](auth-setup.md) | Login modes, profile schemas, sessions, roles and environment |
| [Search-term automatic approval](search-term-auto-approval.md) | Eligibility, shared cap and publishing gate |
| [Search-term batch stability](search-term-batch-stability.md) | Recorded fixes and regression expectations |
| [Contributor guide](../AGENTS.md) | Repository structure and verification conventions |
| [Documentation audit](documentation-audit-2026-11-12.md) | Review scope, corrected drift and GitHub coverage |

## Services and operations

| Document | Purpose |
| --- | --- |
| [Monthly report Worker](../cloudflare/monthly-report-cron/README.md) | Queue, Browser, D1, R2, directory sync, Resend and schedules |
| [Advanced/Overall/TikTok cache Worker](../cloudflare/advanced-report-cache/README.md) | Durable report JSON storage |
| [Meta CSV storage Worker](../cloudflare/meta-csv-import/README.md) | Import persistence |
| [Search-term scheduler Worker](../cloudflare/search-term-optimization-scheduler/README.md) | GitHub Actions dispatch and temporary batch storage |
| [Placement cache Worker](../cloudflare/placement-analysis/README.md) | On-demand bounded placement collection |
| [M04 paused campaign service](../cloudflare/campaign-creation-api/README.md) | Isolated DigitalBee campaign-creation authority; separate from dashboard planning |
| [Dashboard campaign creation](../README_campaign_creation.md) | Dashboard planning flow and recorded delivery status |
| [M03/M04 recovery](runbooks/m03-m04-dashboard-recovery.md) | Actor mapping, persistence and provider failure recovery |
| [M01 exact-negative pilot](runbooks/m01-live-pilot.md) | Narrow traffic-quality pilot, separate from automatic search-term publishing |
| [M07 rollout record](operations/m07-rollout.md) | Google v25/OAuth migration checks and recorded production gates |

The billing Worker source/configuration lives in [`cloudflare/billing-operations-api`](../cloudflare/billing-operations-api); its ownership is summarized in the application map.

## Architecture and design references

- [M03 change control and cross-platform management](architecture/m03-change-control-ad-management-integrations.md)
- [Google management UI template](architecture/google-ads-management-ui-template.md)
- [Meta management UI template](architecture/meta-ads-management-ui-template.md)

These documents contain both implemented and planned sections. Compare their dated acceptance notes with the source map before treating a proposed schema or provider capability as deployed.

## Dated verification and historical plans

- [Acceptance ledger](../map/acceptance.md)
- [Monthly hierarchy and Demand Gen receipt](monthly-breakdowns-demand-gen.md)
- [Reporting verification, 2026-10-02](reporting-verification-2026-10-02.md)
- [Creative/PDF verification, 2026-10-02](demand-gen-creative-pdf-verification-2026-10-02.md)
- [Custom PDF verification, 2026-10-02](custom-pdf-verification-2026-10-02.md)
- [Landscape PDF verification, 2026-10-02](landscape-pdf-verification-2026-10-02.md)
- [Demand Gen sorting verification, 2026-10-02](demand-ad-sort-verification-2026-10-02.md)
- [Original authentication plan](auth-implementation-plan.md) (historical; current implementation includes Google OAuth and a legacy profile mode)
- [Implementation plans](superpowers/plans) and [design specifications](superpowers/specs) (historical proposals/checklists)

Generated screenshots, PDFs, local test outputs and private cross-repository receipts are deliberately excluded from Git. A reference to a local artifact is not a downloadable GitHub artifact.
