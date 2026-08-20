---
name: notion-module-import
description: Convert or refresh project requirements from pasted text, attachments, local files, or Notion pages into verified Notion module pages with one row per top-level module. Dynamically create simple, product, or technical specifications using plain English, atomic feature checkboxes, UX and design behavior, developer test scenarios, technical mappings, measurable quality evidence, and Mermaid user-flow or system-sequence diagrams. Use for business-owner, designer, and developer handoffs; simple requirement imports; developer-ready specification audits; page refreshes; and diagrams in Project | Feature Development while preserving lifecycle metadata, checked progress, delivery evidence, schedule health, and safe verified writes. For implementation, delivery, completion, or evidence-backed progress reconciliation, use notion-module-delivery instead.
---

# Notion Module Import

Convert a requirement source into one verified Notion row per top-level module. Keep the row as the lifecycle record and make the page body easy to scan.

## Required references

- Read [references/page-template.md](references/page-template.md) before drafting, refreshing, or auditing page content.
- Read [references/target-database.md](references/target-database.md) whenever the user targets the default `Project | Feature Development` database.
- Read [references/diagram-guidance.md](references/diagram-guidance.md) whenever the source includes at least three meaningful user steps, branching, approval, recovery, handoffs, integrations, scheduled work, or other cross-system behavior.
- Read [references/product-specification-guidance.md](references/product-specification-guidance.md) whenever the module must align a business owner, designer, and developer, or the source asks for detailed features, user experience, permissions, design behavior, validation, error handling, quality targets, developer test cases, or acceptance evidence.
- Read [references/technical-detail-guidance.md](references/technical-detail-guidance.md) whenever the source or user asks for implementation logic, technical background, configurations, tools, deployment choices, measurements, formulas, quality scoring, recommendations, or current statistics.

## Routing boundary

- Use this skill for requirements import, specification drafting, documentation-only audits, diagrams, and approved page-format refreshes.
- When the primary request is to implement, deliver, execute, finish, continue, complete, or reconcile implementation progress, use [../notion-module-delivery/SKILL.md](../notion-module-delivery/SKILL.md). Use this skill only for any required specification audit or approved refresh within that delivery workflow.

## Non-negotiable rules

- Create or update exactly one row per independently purposed top-level module.
- Keep all features, requirements, phases, and source-supplied tasks inside the module page. Never create feature rows, task rows, subtasks, sprints, dashboards, database views, relations, schema changes, or shared-rules pages unless explicitly requested.
- Write page content in simple English. Explain a necessary technical or platform term the first time it appears.
- Use checkboxes for Features, Tasks, and Completion criteria. Do not show item IDs, lifecycle-state columns, project owners, or register tables in the page body.
- Use informational tables only for supported comparisons or mappings, including responsibility boundaries, UX states, data contracts, permissions, developer test scenarios, quality evidence, technical facts, configurations, metrics, scoring criteria, costs, capacities, or tool-purpose mappings. Never turn Features, Tasks, Completion criteria, lifecycle state, progress, or project ownership into tables.
- Do not add Questions, Assumptions, and Decisions or Shared Rules and Module Exceptions sections.
- Treat written checkbox lists as authoritative. Use diagrams only to clarify them.
- Treat `Status` as workflow state only. Treat `Schedule Status` as a read-only formula and never write it.
- Never infer a historical completion date from page edits, checkboxes, Due Date, or other indirect evidence.
- Preserve owners, dates, stages, statuses, checked items, existing icons, notes, and unrelated content unless the user explicitly approves a change.
- Preserve an existing `## Delivery evidence` section verbatim during documentation-only work unless the user explicitly requests an evidence correction. Never create delivery evidence from requirements alone.
- Use recoverable Notion Trash for approved cleanup. Never delete or archive records without confirmation of the exact targets.

## Inputs

Resolve before writing:

1. The complete requirement source, including attachments and linked source pages.
2. The target project matching an existing `Project` option.
3. The target database, defaulting only when the user intends `Project | Feature Development`.
4. Explicit lifecycle-property overrides, if any.

If the project or module boundaries are absent or ambiguous, stop and request the missing decision. Do not invent a project option.

## Workflow

### 1. Understand the source

Extract the project, top-level modules, goal, users, features, testable behavior, workflow, dependencies, explicit tasks, completion criteria, unanswered questions, assumptions, decisions, and rules. Identify independently purposed module boundaries and atomic features. For product behavior, identify actors, entry conditions, outcomes, choices, permissions, validation, user-visible states, handoffs, data changes, integrations, approval gates, retries, failures, recovery, design constraints, quality targets, and test evidence. When technical detail is relevant, also extract system responsibilities, sources of truth, data contracts, tenant boundaries, deployment boundaries, comparable options, fixed and variable configurations, tools, assets, measurements, formulas, scoring criteria, prices, capacities, recommendations, and sources.

Keep the source meaning. Use confirmed decisions when drafting. Resolve any unanswered decision that could materially change the page before writing; ask the user instead of storing a question, assumption, or decision section in the module.

### 2. Inspect Notion before mutation

1. Fetch the database and treat its live schema and options as authoritative.
2. Confirm `Module`, `Project`, `Stage`, `Status`, `Owner`, `Start Date`, `Due Date`, `Actual Completed Date`, and `Schedule Status` exist with the expected types.
3. Confirm Status supports exactly `Backlog`, `In Progress`, `Blocked`, `In Review`, `Done`, and `Cancelled`.
4. Confirm the requested Project option exists.
5. Query for the proposed module title and project, then fetch every plausible duplicate.

Stop and report a missing schema field or enum. Repairing the schema requires separate approval.

### 3. Audit lifecycle and content

Before writing, report relevant anomalies:

- Done without Actual Completed Date;
- reopened work retaining a prior completion date;
- incomplete work past Due Date;
- incomplete work without Due Date;
- conflicting or malformed module numbering;
- duplicate or punctuation-variant titles;
- checked items that cannot be matched safely during a refresh;
- missing required diagrams or unexplained diagram omissions;
- malformed Mermaid, unsupported claims, oversized diagrams, or conflicts between diagrams and written content;
- technical claims presented without a clear source type, volatile statistics without a verification date or planning-snapshot warning, unsuitable tables, or tables that duplicate nearby prose;
- compound or unobservable features, unclear scope or responsibility boundaries, missing UX states, missing permission or recovery behavior, missing developer test coverage, diagram branches without matching test scenarios, or vague quality claims without a confirmed target and evidence;
- a missing or unsuitable page icon.

`Scheduled` means only that a future Due Date exists. Never call it `On track` without separate delivery evidence.

### 4. Decide whether a preview is required

Require a preview when module boundaries are ambiguous, duplicates conflict, a title or legacy page structure would change, numbering needs a decision, checked text would be renamed, checked items cannot be matched safely, or a diagram would be replaced or materially reinterpreted.

Show the proposed title, create or update action, property changes, page-section changes, icon action, checked-item mapping, selected specification depth, selected content formats, product- and developer-detail applicability, diagram applicability, preserved content, and unresolved decisions. Even when no approval preview is required, state the module count and intended property defaults before writing.

### 5. Normalize the module title and icon

- Name each row `M01 — Outcome-Oriented Module Name`, numbered independently per project and zero-padded.
- Compare titles case-insensitively after trimming and collapsing whitespace. Treat `Module 1`, `M1`, `M01`, punctuation variants, and semantically equivalent names in the same project as plausible duplicates.
- Choose one relevant emoji icon for every new module.
- When refreshing an existing module, preserve its current icon. Add a relevant emoji only when the page has no icon; replace an icon only when explicitly requested.
- Prefer a clear subject emoji such as `📊` for reporting, `📣` for advertising, or `🔐` for access. Do not use uploaded images or custom icons unless explicitly requested.

### 6. Preserve checkbox progress

- New feature, task, and completion items start unchecked.
- Match existing checkbox text case-insensitively after trimming and collapsing whitespace.
- Preserve the checked state of an exact normalized match.
- Never uncheck an item merely because the source omits progress information.
- If wording changes materially or more than one existing item could match, keep the page unchanged and present the proposed old-to-new mapping for approval.
- Do not use visible item IDs as a matching mechanism.
- Preserve every existing `## Delivery evidence` entry and keep the section after Completion criteria.

### 7. Apply lifecycle properties

For a new module without explicit scheduling metadata:

- `Project`: requested existing option.
- `Stage`: `1.2 Requirement / User story`.
- `Status`: `Backlog`.
- Omit Owner, Start Date, Due Date, and Actual Completed Date.
- Never send Schedule Status; Notion derives it.

For an existing module, change only explicitly requested properties. Do not reset an advanced stage, clear scheduling, or alter a completion date because the source omits it.

When changing Status to Done:

1. Let the database automation set Actual Completed Date.
2. Re-fetch the page after the automation has had a reasonable opportunity to run.
3. Confirm Actual Completed Date uses the current Asia/Kuala_Lumpur calendar date and Schedule Status is a completed outcome.
4. If the date is still empty, report `Data issue — completion date missing`; do not claim completion verification.

Reopened work keeps its most recent completion date. A later Done transition overwrites it through the automation.

### 8. Draft or update the page

Use the exact adaptive section order in [references/page-template.md](references/page-template.md). Combine features and testable requirements into concise atomic feature checkboxes. Keep Features, Developer test scenarios, Tasks, and Completion criteria distinct. Include Tasks only when the source explicitly supplies work to perform. Keep completion criteria observable and easy to verify.

A documentation-only import or refresh never creates `## Delivery evidence`. When that optional delivery-managed section already exists, preserve it after Completion criteria and outside every checkbox section.

Choose the lightest format that makes the module clear:

1. Use short prose for context and boundaries.
2. Use numbered lists for sequential procedures with three or more steps.
3. Use checkboxes only for Features, Tasks, and Completion criteria.
4. Use informational tables only when multiple entries share repeated fields and comparison or mapping materially improves understanding.
5. Use Mermaid only when [references/diagram-guidance.md](references/diagram-guidance.md) requires it.

Apply [references/product-specification-guidance.md](references/product-specification-guidance.md) when product or developer handoff detail is relevant. Select Simple, Product, or Technical depth and add only the supported scope, UX, design, responsibility, data, permission, quality, and test content. Apply [references/technical-detail-guidance.md](references/technical-detail-guidance.md) when implementation detail is relevant. Keep a simple module simple. Distinguish source-supplied requirements, externally verified facts, calculations, and recommendations. Verify time-sensitive facts with current official primary sources when the user asks for current details, statistics, research, suggestions, or recommendations; otherwise preserve supplied claims as project requirements and label them accordingly.

Apply [references/diagram-guidance.md](references/diagram-guidance.md). Use logical actors and product boundaries at requirements stages. Add technical systems only when the source confirms them. Surface a missing rule or decision to the user before writing instead of adding a question node or section.

Use the smallest safe edit for existing pages. Do not migrate an existing module to the adaptive page format unless the user explicitly requests a refresh or migration.

### 9. Write safely and reconcile partial failures

For creates, use the fetched data-source ID and batch only clear modules. For updates, fetch immediately before mutation. If a batch partially fails, query current state and retry only missing or failed operations.

### 10. Verify

1. Query the database after mutation.
2. Confirm one active row per expected project/module pair and no feature or task rows.
3. Fetch each affected page and validate the adaptive section order, selected specification depth, checkbox states, diagram applicability, plain-English labels, icon, preserved content, and direct URL.
4. Confirm a main flow with three or more steps uses a numbered list rather than arrow-separated text.
5. Confirm every informational table has a header row, balanced table tags, a useful comparison or mapping purpose, and no project-owner, progress, lifecycle-state, or visible-ID columns. Confirm no informational table appears inside Features, Tasks, or Completion criteria.
6. Confirm verified facts, calculations, recommendations, and source-supplied requirements remain distinguishable. Confirm volatile statistics include a verification date or planning-snapshot warning.
7. For Product and Technical modules, confirm scope boundaries, atomic features, applicable UX and design behavior, responsibility and source-of-truth clarity, relevant failure and recovery behavior, developer test coverage, and measurable quality evidence. Confirm every important diagram branch maps to a test scenario.
8. Confirm the removed register tables and removed sections are absent from newly created or explicitly migrated pages.
9. For an existing-page update, compare before and after checkbox counts and states, diagrams, child pages, lifecycle properties, and unrelated authored content.
10. Confirm an existing Delivery evidence section and all of its entries remain unchanged and after Completion criteria.
11. Confirm explicit overrides or new-row defaults.
12. Confirm Schedule Status is derived and Actual Completed Date is consistent with Status.
13. Return unresolved decisions, skipped rows, conflicts, and partial failures.

## Completion response

Report created and updated counts, target project and database, defaults or overrides, lifecycle anomalies, direct links, icon verification, selected specification depth and content formats, test-coverage applicability, volatile-statistic caveats when applicable, unresolved conflicts, and verification result. Do not claim success for an unverified page or completion transition.

## Recovery rules

- Wrong row granularity: request confirmation, move only the identified imported rows to Trash, then recreate approved module rows.
- Duplicate found after creation: stop and report both records; never choose one to trash without approval.
- Schema mismatch: stop without further mutation and show the exact mismatch.
- Content or checkbox conflict: preserve the page and present a section-level preview with checked-item mappings.
- Diagram conflict: preserve the existing diagram and written content, then present the exact conflict and proposed replacement.
- Technical-detail conflict: preserve the existing content and identify whether the conflict concerns a requirement, verified fact, calculation, or recommendation before proposing a replacement.
- Completion automation failure: leave the workflow state intact, report the missing date, and require automation repair or an explicitly approved manual correction.
