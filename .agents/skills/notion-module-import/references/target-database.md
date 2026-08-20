# Default Target Database Contract

## Database

- Name: `Project | Feature Development`
- URL: `https://app.notion.com/p/3b14fcc4f70180d7affdedb49150d039`
- Data source: `collection://3b14fcc4-f701-80ad-8532-000be2e17e70`
- Main view: `view://3b14fcc4-f701-8012-8ae6-000cd78a70c6`
- Fetch the database on every run. This file records the expected contract; the live schema remains authoritative.

## Expected properties

| Property | Type | Import behavior |
| --- | --- | --- |
| Module | Title | `M01 — Outcome-Oriented Module Name`; numbering is per project |
| Project | Select | Required existing project enum |
| Stage | Select | New-row default: `1.2 Requirement / User story` |
| Status | Status | Workflow only; new-row default: `Backlog` |
| Owner | Select | Omit unless explicitly supplied |
| Start Date | Date | Omit unless explicitly supplied |
| Due Date | Date | Omit unless explicitly supplied |
| Actual Completed Date | Date | Automation-managed; omit on create |
| Schedule Status | Formula | Read-only; never send in create/update properties |

`Sprint` is not part of the current database contract.

## Create contract

```json
{
  "Module": "M01 — Module Name",
  "Project": "Existing Project Option",
  "Stage": "1.2 Requirement / User story",
  "Status": "Backlog"
}
```

Omit blank scheduling and completion fields instead of sending placeholders.

## Workflow and completion contract

- Supported Status values: `Backlog`, `In Progress`, `Blocked`, `In Review`, `Done`, `Cancelled`.
- Status is never used to express lateness or schedule health.
- A Notion database automation is authoritative for Actual Completed Date:
  - trigger whenever Status becomes Done;
  - set or overwrite Actual Completed Date with the current Asia/Kuala_Lumpur calendar date;
  - preserve the value while reopened;
  - overwrite it when reopened work becomes Done again.
- The skill must re-fetch and verify the date after a skill-driven transition to Done.
- Never infer or backfill historical completion dates without explicit verified evidence.

## Schedule Status formula contract

Evaluate in this precedence order:

| Condition | Result |
| --- | --- |
| Status is Cancelled | `Cancelled` |
| Status is Done and Actual Completed Date is empty | `Data issue — completion date missing` |
| Status is Done and Due Date is empty | `Completed — no baseline` |
| Done and actual date is before Due Date | `Completed early` |
| Done and actual date equals Due Date | `Completed on time` |
| Done and actual date is after Due Date | `Completed late` |
| Not Done and Actual Completed Date is populated | `Reopened` |
| Incomplete and Due Date is empty | `Unscheduled` |
| Incomplete and today is after Due Date | `Overdue` |
| Incomplete and Due Date is today | `Due today` |
| Remaining future-dated work | `Scheduled` |

Compare calendar dates. `Scheduled` is not evidence that delivery is on track.

Live formula expression:

```text
if(prop("Status") == "Cancelled", "Cancelled", if(prop("Status") == "Done", if(empty(prop("Actual Completed Date")), "Data issue — completion date missing", if(empty(prop("Due Date")), "Completed — no baseline", if(dateBetween(prop("Actual Completed Date"), prop("Due Date"), "days") < 0, "Completed early", if(dateBetween(prop("Actual Completed Date"), prop("Due Date"), "days") == 0, "Completed on time", "Completed late")))), if(not(empty(prop("Actual Completed Date"))), "Reopened", if(empty(prop("Due Date")), "Unscheduled", if(dateBetween(now(), prop("Due Date"), "days") > 0, "Overdue", if(dateBetween(now(), prop("Due Date"), "days") == 0, "Due today", "Scheduled"))))))
```

## View contract

- Visible properties, in order: Module, Project, Stage, Owner, Status, Schedule Status, Start Date, Due Date, Actual Completed Date.
- Sort by Project ascending, then Module ascending.

## Update and migration contract

- Fetch the page immediately before editing.
- Preserve all properties and unrelated content by default.
- Change only explicitly requested lifecycle properties.
- Preserve an existing page icon. Add a suitable emoji only when the page has no icon; replace an icon only when explicitly requested.
- Match checkbox text case-insensitively after trimming and collapsing whitespace, and preserve checked states for exact normalized matches.
- Require a preview when checked wording changes materially or checkbox matching is ambiguous.
- Require an exact title mapping preview before renaming legacy rows.
- Require a section-level preview before converting a legacy page body.
- Do not migrate existing modules to the adaptive page format without explicit user intent.

## Verification contract

For each expected module, verify:

- one active row under the target project;
- correct normalized title and no numbering collision;
- a suitable emoji icon is present for new modules, or the existing icon was preserved during refresh;
- required adaptive sections appear in this order: Goal callout, What this module does, optional Scope and boundaries, Who will use it, Features, How it works, optional Flow diagrams, optional Developer test scenarios, optional Tasks, Completion criteria, and optional delivery-managed Delivery evidence;
- a Main flow with three or more sequential steps uses a numbered list and does not use arrow-separated text;
- Features, Tasks, and Completion criteria use checkbox lists without visible item IDs, lifecycle-state columns, project-owner columns, or register tables;
- informational tables, when used, have header rows and balanced tags, improve a supported comparison or mapping, remain outside checkbox sections, and contain no project-owner, progress, lifecycle-state, or visible-ID columns;
- Product and Technical modules contain atomic features, applicable UX and design behavior, clear responsibility and source-of-truth boundaries, relevant failure and recovery behavior, developer test coverage, and measurable quality evidence when supplied;
- source-supplied requirements, externally verified facts, calculations, and recommendations remain distinguishable, and volatile statistics have a verification date or planning-snapshot warning;
- Questions, Assumptions, and Decisions and Shared Rules and Module Exceptions sections are absent from new or explicitly migrated pages;
- diagram applicability follows the documented decision rules, labels use plain English, claims resolve to the written page, and valid existing diagrams are preserved;
- checked progress and unrelated authored content were preserved during refresh;
- an existing Delivery evidence section remains unchanged, after Completion criteria, and outside every checkbox section during documentation-only work;
- no feature or task rows;
- correct defaults or explicit overrides;
- consistent Status, Actual Completed Date, and Schedule Status;
- direct URL returned to the user.

## Acceptance scenarios

1. Five clear modules produce exactly five rows.
2. A new unscheduled Backlog module derives `Unscheduled`.
3. Future, today, and past incomplete Due Dates derive `Scheduled`, `Due today`, and `Overdue`.
4. Done before, on, and after Due Date derives early, on-time, and late.
5. Done without Actual Completed Date derives the data-issue result.
6. Done without Due Date derives `Completed — no baseline`.
7. Reopened work retains its previous completion date and derives `Reopened`; the next Done transition overwrites the date.
8. Cancelled derives `Cancelled` regardless of dates.
9. Existing modules update without duplication, metadata reset, checkbox loss, icon loss, or unrelated-content loss.
10. A missing project enum or required schema stops the workflow before mutation. A missing Operating Rules section is non-blocking unless an explicit project-specific contract requires it; never create or infer project rules without approval.
11. Ambiguous titles or legacy page mappings produce a preview before writes.
12. Partial failures are reconciled before retrying only missing operations.
13. A simple two-step module omits the Flow diagrams section.
14. A branched user journey produces a plain-English flowchart; cross-system work produces a plain-English sequence diagram.
15. Unsupported technical detail or a diagram/content conflict produces a user question or preview instead of a silent replacement.
16. New pages receive a relevant emoji icon; existing custom icons remain unchanged during refresh.
17. New features, tasks, and completion criteria start unchecked.
18. Exact normalized checkbox matches preserve their prior checked state.
19. Materially renamed or ambiguous checked items require an approved old-to-new mapping.
20. New and explicitly migrated pages contain no visible item IDs, register tables, lifecycle-state columns, project-owner columns, Questions, Assumptions, and Decisions section, or Shared Rules and Module Exceptions section.
21. A technical module dynamically selects only useful informational tables; a simple module remains concise without empty or unnecessary technical sections.
22. A three-or-more-step Main flow renders as a numbered list, while a one-or-two-step flow may remain a short sentence.
23. A formatting-only refresh preserves checkbox counts and states, diagrams, child pages, lifecycle properties, and unrelated authored content.
24. Volatile prices, capacities, versions, availability, and platform behavior are either verified from a current official source with a date or clearly labeled as supplied planning inputs.
25. A Product module includes success coverage for every feature and relevant validation, permission, error, recovery, and user-visible outcomes.
26. A Technical module defines applicable responsibility, source-of-truth, data, integration, tenant-isolation, and quality-evidence boundaries without inventing missing decisions.
27. Every important alternate, error, approval, and recovery branch in a diagram maps to a developer test scenario when test scenarios apply.
28. A documentation-only import or refresh never creates Delivery evidence and preserves every existing delivery entry verbatim.
