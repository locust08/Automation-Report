---
name: notion-module-delivery
description: Deliver work from existing Notion module pages end to end by reading the full module and linked context, inspecting the repository and current implementation, researching current official primary documentation, selecting a decision-complete technical solution, implementing and verifying every safely achievable item, and reconciling Notion lifecycle properties, checkboxes, and compact delivery evidence. Use when the user asks to implement, deliver, execute, finish, continue, complete, work through, or reconcile implementation progress for one or more Notion modules. For documentation-only imports, requirements refreshes, page-format audits, or specification drafting, use notion-module-import instead.
---

# Notion Module Delivery

Deliver the existing module as the authoritative work contract. Default to completing all safely achievable work when the user asks for implementation. Keep Notion current throughout the run rather than treating progress reconciliation as an optional final step.

## Required references

- Read [references/research-and-solution-design.md](references/research-and-solution-design.md) before researching or choosing an implementation approach.
- Read [references/implementation-and-verification.md](references/implementation-and-verification.md) before changing project files, running mutations, or deciding that implementation is complete.
- Read [references/notion-progress-and-evidence.md](references/notion-progress-and-evidence.md) before changing a module checkbox, evidence section, Stage, Status, or date.
- Read [../notion-module-import/SKILL.md](../notion-module-import/SKILL.md), [../notion-module-import/references/page-template.md](../notion-module-import/references/page-template.md), and [../notion-module-import/references/target-database.md](../notion-module-import/references/target-database.md) before working on a module in `Project | Feature Development`.
- Read `notion://docs/enhanced-markdown-spec` through the Notion fetch tool before any Notion content write.

## Non-negotiable rules

- Treat the module page, confirmed user decisions, project instructions, and live system contracts as authoritative inputs. Do not silently change business scope, owners, deadlines, or acceptance criteria.
- Complete every safely achievable item. Do not stop after planning while an authorised, safe implementation or verification step remains.
- Respect the request mode. A review, audit, brainstorm, or plan request is read-only unless the user also asks for implementation.
- Require explicit approval before a production deployment, live database migration, ad activation or spend, destructive or difficult-to-recover operation, external message or publication, or any material scope expansion.
- Keep secrets server-side and out of commands, logs, Notion, evidence, and responses. Follow repository secret-management instructions.
- Check a Feature, Task, or Completion criterion only when its observable outcome is proven by appropriate evidence.
- Keep a compound checkbox unchecked until every clause passes. Keep partial work unchecked and record the remaining part in Delivery evidence.
- Do not use code existence, an implementation claim, or a passing compile alone as proof of behavior.
- Do not create separate task rows, subtasks, sprints, dashboards, or delivery pages unless the user explicitly requests them. Keep the module as the single project record.
- Re-fetch immediately before and after every Notion mutation. Preserve concurrent edits, child pages, discussions, checked history, icons, owners, dates, and unrelated content.
- Never automatically uncheck historical progress. Report contradictory evidence and request approval for a correction.

## Safe delivery authority

Proceed without additional approval for:

- repository and Notion inspection;
- current official-document research;
- local code, configuration, tests, migrations, and documentation within module scope;
- reversible Notion checkbox, lifecycle, and Delivery evidence updates governed by this skill;
- local builds, tests, dry runs, validate-only calls, and read-only external checks; and
- non-destructive recovery from partial local failures.

Pause before the live or externally consequential actions listed in the non-negotiable rules. Continue other independent safe work while approval is pending.

## Workflow

### 1. Resolve the delivery target

1. Resolve the module URL or locate it by exact Project and Module. If several plausible pages remain, ask the user to select one.
2. Resolve the repository or workspace that implements the module. Prefer the current workspace when its project instructions and code match the module.
3. Fetch the live database schema, module properties, full page body, linked requirement pages, relevant dependencies, and discussions when they contain decisions or review feedback.
4. Confirm the module contains authoritative Features, Tasks when present, and Completion criteria. Use `notion-module-import` to audit or refresh an incomplete specification before delivery; require approval before materially rewriting a checked requirement.

### 2. Discover the current implementation

1. Read every applicable `AGENTS.md` and repository instruction file.
2. Inspect git status without disturbing user changes.
3. Trace architecture, entry points, interfaces, schemas, migrations, tests, deployment configuration, monitoring, and existing implementation relevant to every checkbox.
4. Identify already-complete work, partial implementations, defects, missing tests, disabled runtime paths, deployment gaps, and stale documentation.
5. Use applicable domain skills for specialized systems while keeping this skill responsible for module-wide coverage and Notion reconciliation.

### 3. Build the coverage matrix

Maintain an internal matrix with one row per exact checkbox and these fields:

- section: Feature, Task, or Completion criterion;
- classification: `verified_complete`, `implementation_required`, `partial`, `blocked`, or `outside_authority`;
- implementation or inspection target;
- required evidence;
- dependencies and approval gates; and
- final Notion action.

Treat checked items as historical claims that may be sampled or revalidated when they affect safety or final completion. Do not expose internal IDs in the module body.

### 4. Research and choose the solution

Apply [references/research-and-solution-design.md](references/research-and-solution-design.md).

1. Perform a targeted current research pass for each material framework, API, security, data, deployment, or operational decision.
2. Prefer official vendor documentation and recognized standards. Record the verification date for volatile facts.
3. Distinguish requirements, verified facts, calculations, recommendations, and inferences.
4. Compare viable approaches using correctness, compatibility, security, reversibility, operating burden, cost, and testability.
5. Select one approach and make the implementation plan decision-complete.
6. Ask only when a missing decision changes business behavior, scope, architecture, data ownership, external authority, or acceptance.

### 5. Start delivery lifecycle

Immediately before the first implementation change, re-fetch the module and apply the start transition from [references/notion-progress-and-evidence.md](references/notion-progress-and-evidence.md):

- set Start Date to the current Asia/Kuala_Lumpur date only when empty;
- advance Stage to `3.1 Development` without moving an existing later stage backward; and
- set Status to `In Progress` unless a stronger existing active state should be preserved.

If the technical solution itself is the requested deliverable and no implementation follows, keep the appropriate planning stage instead of claiming development began.

### 6. Implement in verified work units

Apply [references/implementation-and-verification.md](references/implementation-and-verification.md).

1. Order work by dependency and risk. Prefer the smallest coherent unit that can produce observable evidence.
2. Preserve unrelated user changes and use the repository's package, environment, secret, migration, and formatting conventions.
3. Implement the behavior and the tests or checks that prove it.
4. Run focused validation first, then broader integration, build, migration, UI, preview, or smoke checks in proportion to risk and wording.
5. Diagnose and repair in-scope failures. Report unrelated baseline failures without claiming the affected criterion passed.
6. Capture concise evidence: command or check, result, relevant artifact or URL, and provider readback when required.

### 7. Reconcile Notion after every work unit

After a tested unit completes:

1. Re-fetch the entire module.
2. Recompute checkbox matches from exact normalized text and current evidence.
3. Batch all independently proven checkbox changes for that unit into the smallest exact section update.
4. Append one compact dated entry under `## Delivery evidence` using the required format in [references/notion-progress-and-evidence.md](references/notion-progress-and-evidence.md).
5. Update lifecycle properties when the evidence justifies a phase change.
6. Re-fetch and verify the checkbox states, evidence text, lifecycle properties, preserved content, and direct URL.

Write a blocker update immediately when all meaningful work is stopped. Otherwise keep working and include the blocker in the next work-unit entry. Respect Notion rate limits by batching writes and honoring retry guidance.

### 8. Reconcile the complete module

1. Re-run the full coverage matrix against the final repository, tests, configured services, and module wording.
2. Confirm every checked item has sufficient evidence and every unchecked item has a clear remaining requirement, blocker, or authority gate.
3. Use `In Review` when implementation is complete but code review, UI review, UAT, production approval, or live verification remains.
4. Use `Blocked` only when no meaningful progress can continue.
5. Set Status to `Done` only when every applicable Feature, Task, and Completion criterion is checked and all required live evidence exists.
6. After setting Done, allow the database automation to run, then re-fetch and verify Actual Completed Date and Schedule Status. Report a data issue rather than claiming completion if automation did not populate the date.

## Completion response

Report:

- module and direct Notion URL;
- implementation outcome and selected technical approach;
- checkbox counts before and after, grouped by Features, Tasks, and Completion criteria;
- tests, builds, migrations, previews, deployments, provider readbacks, and official references used;
- final Stage, Status, Schedule Status, and completion-date verification;
- remaining unchecked items, blockers, approval gates, and exact next action; and
- confirmation that unrelated content and user changes were preserved.

Do not claim full delivery when any required evidence, live action, or completion automation is still outstanding.

## Recovery rules

- **Concurrent Notion edit:** stop the stale update, re-fetch, rebuild the exact replacement, and preserve the other edit.
- **Ambiguous checkbox match:** leave the page unchanged and present the possible mappings.
- **Partial Notion failure:** query current state and retry only missing operations.
- **Test or build failure:** keep the affected items unchecked, diagnose in scope, and record the evidence gap.
- **Ambiguous external mutation:** do not retry blindly; read back provider state and reconcile before another write.
- **Historical checkbox contradicted:** preserve it, report the evidence conflict, and request approval before unchecking.
- **Completion automation failure:** preserve Done, report `Data issue — completion date missing`, and do not fabricate a date.
