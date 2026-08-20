# Adaptive Product Specification Guidance

Use this guidance when a module must align a business owner, designer, and developer, or when the source asks for detailed features, user experience, permissions, validation, error behavior, test cases, or acceptance evidence. Keep simple modules short.

## Contents

- Specification depth
- Handoff coverage
- Module and feature decomposition
- Scope and responsibility boundaries
- User experience and design behavior
- Developer test scenarios
- Quality requirements
- Format patterns
- Completeness checks

## Specification depth

Choose the lightest level that captures the confirmed requirement.

| Level | Use when | Expected detail |
| --- | --- | --- |
| Simple | One straightforward behavior, few dependencies, and no meaningful branch | Current simple template, short flow, features, and completion criteria |
| Product | Multiple user actions, permissions, validation, UI states, handoffs, or designer involvement | Scope, atomic features, UX behavior, design states when supplied, diagrams, and test scenarios |
| Technical | APIs, data changes, external systems, queues, security boundaries, performance targets, or deployment behavior | Product detail plus responsibility, data, integration, failure, quality, and technical evidence |

State the selected level in a preview or completion response. Do not show the level as lifecycle metadata in the Notion page.

## Handoff coverage

Write one coherent module page. Cover only the perspectives that apply:

- **Business owner:** intended outcome, included and excluded scope, business rules, permissions, measurable success, and unresolved material decisions.
- **Designer:** entry point, main and alternate paths, user-visible states, required content, responsive or accessibility behavior, and approved design-system constraints.
- **Developer:** system responsibilities, data changes, integrations, validation, permissions, failures, recovery, quality targets, and test evidence.

Ask before writing when a missing decision would change scope, permissions, data ownership, user-visible behavior, or an acceptance result. Do not hide the gap in an assumption, question, diagram node, or invented test result.

## Module and feature decomposition

Create one row per independently purposed top-level module. Keep a capability inside the module when it contributes to the same outcome and cannot be usefully released or accepted on its own. Propose separate modules when capabilities have different outcomes, primary users, release decisions, or acceptance boundaries.

Write each feature checkbox as one actor capability or system behavior with one observable outcome.

Split a feature when it combines separate:

- permissions;
- inputs or validations;
- success outcomes;
- failure or recovery behavior;
- user roles;
- external systems; or
- independently testable actions.

Prefer:

- `An authorised editor can preview a draft without changing the live page.`
- `Publishing revalidates only the affected tenant pages.`

Avoid:

- `Users can create, preview, approve, publish, and roll back pages.`

Keep feature wording stable during refreshes so checked progress and test references remain safe.

## Scope and responsibility boundaries

Add `## Scope and boundaries` when inclusion, exclusion, ownership, or system responsibility could otherwise be misunderstood.

Use short bullets for a few boundaries:

- `This module manages landing-page content and presentation.`
- `Shopify remains the source of truth for prices, inventory, checkout, and orders.`

Use a responsibility table when at least three areas share repeated fields:

`Area | Responsible system | Source of truth | Boundary`

`Responsible system` describes a product or technical boundary, not a project owner. Do not add people, progress, or lifecycle state.

State the positive responsibility first. Use `must not` only for a hard security, data, compliance, or architecture boundary.

## User experience and design behavior

For a product or technical module, extract the applicable behavior:

1. Entry point and trigger
2. Preconditions
3. Main path
4. Alternate paths
5. Validation and permission checks
6. Loading, empty, success, error, and disabled states
7. Recovery or retry action
8. Final user-visible result

Keep the numbered `Main flow` as the authoritative happy path. Add `### User experience and states` only when alternate or user-visible states materially improve clarity.

Use short bullets for a few states. Use this table when at least three states share the same fields:

`Situation | System response | What the user sees | Available action`

Add `### Design requirements` only when the source supplies design direction or a designer needs a confirmed behavior contract. Include only applicable items:

- required screen, page, modal, form, or block;
- shared component or design token;
- layout or responsive behavior;
- loading, empty, success, error, disabled, and destructive-action states;
- accessibility behavior;
- required label, helper text, confirmation, or validation message; and
- approved variant or content rule.

Describe required behavior. Do not invent visual styling, copy, breakpoints, or accessibility targets that the source does not confirm.

## Developer test scenarios

Add `## Developer test scenarios` when the user requests developer-ready detail, the selected depth is Product or Technical, or the module contains a branch, validation, permission, integration, recovery path, or measurable quality target.

Use an informational table:

`Feature or behavior | Starting condition | Action | Expected result`

Test scenarios are verification specifications, not tasks or progress records. Do not add checkbox state, owner, implementation status, or visible IDs.

Use the exact feature wording or a short unambiguous feature name in the first column. Keep each row to one action and one expected result. Split long scenarios.

Coverage rules:

- Add at least one success scenario for every feature in a Product or Technical module.
- Add a validation scenario when the module accepts user or system input.
- Add permission scenarios when behavior differs by role or tenant.
- Add a failure and recovery scenario when an external system, background job, webhook, queue, or retry can fail.
- Add a tenant-isolation scenario when tenant-scoped data is read or changed.
- Add a test scenario for every important alternate, error, approval, or recovery branch shown in a diagram.
- Include the expected user-visible result when the user receives feedback.

Do not invent an expected result when the business rule is unresolved. Stop and request the decision.

## Quality requirements

Replace vague words such as `fast`, `secure`, `reliable`, `accessible`, or `scalable` with a confirmed target and verification method when the source supports one.

Use this table when at least three quality requirements share repeated fields:

`Quality area | Target | Verification evidence`

Examples of evidence include an automated test, access-control test, production-like measurement, audit event, retry test, backup restore test, accessibility review, or monitoring alert.

Treat an unsupported target as a source-supplied requirement, not a verified capability. Preserve exact units, thresholds, and measurement conditions.

## Format patterns

Allowed informational tables for Product or Technical modules include:

- Responsibility: `Area | Responsible system | Source of truth | Boundary`
- UX states: `Situation | System response | What the user sees | Available action`
- Data contract: `Field | Required | Validation | Stored or sent to`
- Permission mapping: `Role | Allowed action | Denied action or boundary`
- Test scenarios: `Feature or behavior | Starting condition | Action | Expected result`
- Quality evidence: `Quality area | Target | Verification evidence`

Use a table only when comparison or mapping improves understanding. Prefer no more than four columns. Keep Features, Tasks, and Completion criteria as checkbox lists.

Use Notion enhanced Markdown table syntax with `fit-page-width="true"` and `header-row="true"`. Keep table cells to short rich text.

Use diagrams as defined in `diagram-guidance.md`:

- User flowchart for meaningful user actions and choices.
- UML-style system sequence diagram for cross-system messages, data changes, retries, or verification.

Keep written requirements authoritative. A diagram clarifies behavior and does not replace features, test scenarios, or completion evidence.

## Completeness checks

Before writing or approving a Product or Technical module, confirm:

- the goal states one outcome;
- included and excluded scope are clear when a boundary matters;
- each feature is atomic and observable;
- the main flow has an entry point and final result;
- applicable validation, permission, alternate, error, and recovery behavior is defined;
- supplied design states and constraints are captured;
- system responsibility and source of truth are unambiguous;
- every feature and important diagram branch has appropriate test coverage;
- quality claims use confirmed targets and evidence where available;
- completion criteria describe whole-module acceptance rather than implementation tasks; and
- requirements, verified facts, calculations, and recommendations remain distinguishable.
