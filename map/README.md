# Ads Reporting Dashboard map

Application inventory reviewed 2026-11-12; individual cards retain their dated implementation and verification receipts. This map describes source, ownership, behavior and acceptance gaps. It does not authorize advertising writes, email sends, migrations or deployment. See the [documentation index](../docs/README.md) and [documentation audit](../docs/documentation-audit-2026-11-12.md) for setup, service guides and review limits.

On `master`, use the application card for the branch differences. Reporting, presentation and acceptance records were imported from `datepicker-improvement` as dated evidence; their associated application changes were not merged with the documentation.

| Area | Entry | Status |
| --- | --- | --- |
| Routes, authentication, workflows and automation | [Application](application.md) | Source inventory reviewed; live deployment not revalidated |
| Reporting and provider collection | [Reporting](reporting.md) | Feature-branch snapshot; see application card for master differences |
| Global fonts and export layouts | [Presentation](presentation.md) | Feature-branch snapshot; verification remains scoped to recorded source |
| Dated verification and remaining gates | [Acceptance](acceptance.md) | Open gates tracked separately from implementation |

Read the repository [AGENTS.md](../AGENTS.md) before implementation. Routes are thin wrappers; provider queries and orchestration belong in `lib/reporting`. Credentials come from existing environment/Doppler configuration and must never appear in evidence.

Update the affected map card with each behavior change. Record implementation, local verification, native reconciliation and deployment independently. Preserve dated receipts; do not turn a fixture pass into live acceptance.

The MCP implementation has its own map in the DigitalBee repository. Its META-3 and DG-3 gates are not automatically satisfied by dashboard checks.
