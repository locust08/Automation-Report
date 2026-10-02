# Ads Reporting Dashboard map

Reviewed 2026-10-02. This map describes the current source, ownership, behavior and acceptance gaps. It does not authorize advertising writes, email sends, migrations or deployment.

| Area | Entry | Status |
| --- | --- | --- |
| Reporting and provider collection | [Reporting](reporting.md) | Implemented; native and connected acceptance partial |
| Global fonts and export layouts | [Presentation](presentation.md) | Implemented; Overall audience-heading overlap needs reproduction |
| Today's verification work | [Acceptance](acceptance.md) | Open gates tracked separately from implementation |

Read the repository [AGENTS.md](../AGENTS.md) before implementation. Routes are thin wrappers; provider queries and orchestration belong in `lib/reporting`. Credentials come from existing environment/Doppler configuration and must never appear in evidence.

Update the affected map card with each behavior change. Record implementation, local verification, native reconciliation and deployment independently. Preserve dated receipts; do not turn a fixture pass into live acceptance.

The MCP implementation has its own map in the DigitalBee repository. Its META-3 and DG-3 gates are not automatically satisfied by dashboard checks.
