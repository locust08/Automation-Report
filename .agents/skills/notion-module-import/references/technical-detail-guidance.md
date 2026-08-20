# Adaptive Technical Detail Guidance

Use this guidance to decide whether and how to add developer-ready context inside `## How it works`. Select the lightest useful format. Do not turn every module into a technical specification.

## Contents

- Decision sequence
- Activate developer-detail mode
- Format selection
- Optional `How it works` subsections
- Reusable table patterns
- Allowed and prohibited tables
- Claim and source handling
- Safe refresh behavior

## Decision sequence

1. Identify the intended reader and decision. A developer needs implementation context; a business reviewer may need only behavior and outcomes.
2. Identify the module stage. Preserve source-confirmed technical details at any stage, but avoid inventing architecture for early requirement stages.
3. Identify the available evidence: source requirements, official current facts, calculations, and recommendations.
4. Identify repeated structures. Use a table only when at least three entries share two or more fields, or when a compact mapping materially improves comparison.
5. Select only the subsections that reduce ambiguity or support implementation, review, or a decision.
6. Remove duplicated prose after adding a table. Keep one authoritative representation of each fact.

## Activate developer-detail mode

Activate this mode when the user requests technical background, implementation logic, tools, configurations, recommendations, statistics, or developer guidance, or when the source contains infrastructure, APIs, models, integrations, deployment options, performance measures, costs, or quality evaluation.

Keep the simple template when the module is primarily a straightforward user-facing behavior with few dependencies and no meaningful technical comparison. Developer-detail mode is a spectrum: add one helpful subsection when one is enough.

## Format selection

| Information | Preferred format |
| --- | --- |
| Context, boundary, or explanation | Short prose |
| Three or more sequential actions | Numbered list |
| One or two actions | Short sentence |
| Comparable specifications or configurations | Informational table |
| Measurements, formulas, costs, capacities, or scoring criteria | Informational table |
| Responsibility, data, permission, UX-state, test, or quality mapping | Informational table governed by product-specification-guidance.md |
| Safety boundaries, caveats, or recommendations | Bullets |
| Features, Tasks, or Completion criteria | Checkboxes |
| Branches, retries, approvals, handoffs, or cross-system interaction | Mermaid under Flow diagrams |

Do not use a table when cells would become long essays, entries do not share repeated fields, or a short list is faster to understand. Prefer no more than four columns. Use short headers and keep one idea per row.

## Optional `How it works` subsections

Keep `Main flow` first. Choose and order only the subsections supported by the source:

1. Technical background developers should know
2. Recommended deployment tracks or approach comparison
3. Setup logic
4. Configuration matrix
5. Execution logic
6. Measurements and formulas
7. Quality review
8. Data and integrations
9. Permissions and tenant isolation
10. Failure handling and safety
11. Practical recommendations
12. Current planning statistics
13. Needed tools and assets
14. Primary references

Keep procedural subsections numbered. Keep safety and recommendations as bullets unless a repeated comparison clearly benefits from a table.

## Reusable table patterns

Use only patterns that fit the content:

- Specifications: `Area | Specification | Developer impact`
- Deployment comparison: `Track | Configuration | Best used for | Main trade-off`
- Configuration matrix: `Dimension | Fixed baseline | Values tested | Reason`
- Measurements: `Metric | Definition or formula | Why it matters`
- Quality rubric: `Criterion | What the reviewer checks`
- Planning costs: `Resource | Rate or capacity | Example calculation | Planning note`
- Tools and assets: `Tool or asset | Purpose | Expected evidence`

For responsibility, UX-state, data-contract, permission, developer-test, and quality-evidence tables, use [product-specification-guidance.md](product-specification-guidance.md).

Use Notion enhanced Markdown table syntax with `fit-page-width="true"` and `header-row="true"`. Table cells contain rich text only. Escape special characters as required outside code spans.

## Allowed and prohibited tables

Allowed informational tables explain technical facts, configurations, metrics, formulas, quality criteria, costs, capacities, tool-purpose mappings, or the product-specification mappings defined in product-specification-guidance.md.

Never use tables for Features, Tasks, Completion criteria, requirement IDs, lifecycle state, progress, ownership, questions, assumptions, decisions, or placeholder registers.

## Claim and source handling

Keep these claim types visibly distinct:

| Claim type | Required handling |
| --- | --- |
| Source-supplied requirement | Preserve the meaning and present it as a project requirement. Do not imply independent verification. |
| Externally verified fact | Use a current official primary source and retain a direct reference. |
| Calculation | Show the formula, units, and input values. |
| Recommendation or inference | Label it as guidance and explain the decision condition or trade-off. |

When the user asks for current details, research, suggestions, recommendations, or statistics, verify volatile facts through official primary sources. Volatile facts include prices, capacities, availability, versions, product capabilities, platform behavior, limits, and regulations. Record the verification date or state that the table is a planning snapshot that must be reconfirmed before action.

When the user supplies a complete authoritative source and does not ask for independent research, retain supplied facts as requirements. Preserve exact platform names, thresholds, formulas, and commercial baselines, and label them as supplied when confusion is possible.

Do not convert a recommendation into a requirement or present an inference as a verified fact.

## Safe refresh behavior

For an existing page, fetch immediately before editing and replace only the approved subsection spans. Preserve lifecycle properties, icon, checked states, diagrams, child pages, source links, and unrelated authored content.

After writing, verify:

- required top-level section order;
- numbered Main flow when it has three or more steps;
- selected table count, header rows, and balanced opening and closing tags;
- absence of tables inside Features, Tasks, and Completion criteria;
- absence of project-owner, progress, lifecycle-state, and visible-ID columns;
- unchanged checkbox counts and checked states for a formatting-only refresh;
- preserved diagrams, child pages, lifecycle properties, and unrelated content;
- direct references and volatility warnings for researched current facts.
