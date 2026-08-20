# Simple Module Page Template

Use this adaptive format for every new module and every existing module whose migration to this format is explicitly approved.

```markdown
<callout icon="📋" color="blue_bg">
	**Goal:** [One short sentence describing the result this module should deliver.]
</callout>

## What this module does
[One or two short paragraphs explaining the problem, intended result, and module boundary in plain English.]

## Scope and boundaries
- [Included responsibility or behavior.]
- [Excluded responsibility or hard boundary.]

## Who will use it
- [User role]
- [User role]

## Features
- [ ] [One clear capability or testable behavior.]
- [ ] [One clear capability or testable behavior.]

## How it works
**Main flow:**
1. [First meaningful action.]
2. [Next meaningful action.]
3. [Final result or decision.]

**Needed for this module:**
- [Dependency, source, or connected system]

### User experience and states
[Add only when alternate paths or user-visible states need clarification.]

### Design requirements
[Add only when the source supplies design direction or a designer needs a confirmed behavior contract.]

### Technical behavior
[Add only the supported responsibility, data, integration, permission, failure, recovery, quality, or deployment detail.]

## Flow diagrams
### User flow
[Add a plain-English Mermaid flowchart only when required by diagram-guidance.md.]

### System flow
[Add a plain-English UML-style Mermaid sequence diagram only when required by diagram-guidance.md.]

## Developer test scenarios
[Add an informational test table only when required by product-specification-guidance.md.]

## Tasks
- [ ] [Source-supplied action.]

## Completion criteria
- [ ] [Observable result or test evidence.]
```

## Required order and optional sections

Keep this order:

1. Goal callout
2. `## What this module does`
3. `## Scope and boundaries`, when a product, system, security, data, or responsibility boundary matters
4. `## Who will use it`
5. `## Features`
6. `## How it works`
7. `## Flow diagrams`, only when at least one diagram applies
8. `## Developer test scenarios`, when required by product-specification-guidance.md
9. `## Tasks`, only when the source provides explicit tasks
10. `## Completion criteria`
11. `## Delivery evidence`, only when a delivery workflow has already created it

When only one diagram applies, include only its third-level heading. Omit the entire Flow diagrams section when neither applies.

Documentation-only imports and refreshes never create Delivery evidence. Preserve the complete existing section verbatim after Completion criteria. The `notion-module-delivery` skill owns its entries and evidence-backed progress changes.

Inside `## How it works`, choose only the detail that fits the module. Keep `Main flow` first. Add user experience, design, permission, responsibility, data, integration, failure, recovery, quality, or deployment detail only when supported. Place dependency or tools lists near the end, before Primary references when references are present. Read [product-specification-guidance.md](product-specification-guidance.md) for business-owner, designer, developer, UX, feature-decomposition, and test coverage. Read [technical-detail-guidance.md](technical-detail-guidance.md) for implementation comparisons, configurations, measurements, recommendations, and sources.

## Writing rules

- Use simple, professional English and short sentences.
- Explain a necessary platform or technical term the first time it appears.
- Write feature checkboxes as clear capabilities or testable behavior.
- Keep each feature to one actor capability or system behavior with one observable outcome. Split separate permissions, validations, outcomes, failures, or user roles.
- Write task checkboxes as actions beginning with a verb.
- Write completion checkboxes as results that a reviewer can observe or test.
- Start every new checkbox unchecked.
- Do not show feature, requirement, task, completion, question, assumption, decision, or rule IDs.
- Do not use register tables, lifecycle-state columns, project-owner columns, or placeholder rows.
- Use informational tables only for repeated comparisons or mappings allowed by product-specification-guidance.md or technical-detail-guidance.md. Keep them out of Features, Tasks, and Completion criteria.
- Do not add Questions, Assumptions, and Decisions or Shared Rules and Module Exceptions sections.
- Preserve exact platform names, domain terms, thresholds, formulas, classifications, and status values supplied by the source.
- Include only people who use or are directly affected by the module.
- Keep technical architecture out of early requirement pages unless the source explicitly supplies it.
- Use a numbered Main flow for three or more sequential steps. Use a short sentence for one or two steps. Do not use arrow-separated Main flows.
- Avoid duplicating the same information in both a table and nearby prose.
- Keep Features, Developer test scenarios, Tasks, and Completion criteria distinct: product behavior, verification behavior, implementation actions, and whole-module acceptance.

## Checkbox refresh rules

- Match old and new checkbox text case-insensitively after trimming and collapsing whitespace.
- Preserve the checked state of exact normalized matches.
- Keep new items unchecked.
- Never clear progress because a refresh source omits checkbox state.
- Require a preview with an old-to-new mapping before materially renaming a checked item.
- Stop for a decision when several existing items could match one proposed item.

## Existing-page migration rules

- Do not migrate existing modules automatically.
- Require explicit user intent to refresh or migrate an existing page to this template.
- Produce a section-level preview before changing a legacy structure.
- Preserve authored notes, change logs, confirmed implementation details, checked progress, and unrelated content unless the approved preview says where each item will move.
- Preserve an existing Delivery evidence section verbatim and after Completion criteria.
- Preserve a valid existing diagram unless the user approves a replacement or simplification.
