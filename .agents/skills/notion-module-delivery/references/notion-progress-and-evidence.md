# Notion Progress and Evidence

Use this reference for every delivery-driven checkbox, evidence, Stage, Status, or Start Date update.

## Read-before-write contract

1. Fetch the live database and treat its schema and options as authoritative.
2. Fetch the complete module immediately before editing.
3. Read `notion://docs/enhanced-markdown-spec` before the first content write in the run.
4. Preserve child pages, databases, unsupported blocks, discussions, icons, unrelated content, and all unmentioned properties.
5. Use exact section-level search and replacement. Do not replace the full page for a progress update.
6. Batch checkbox changes and one evidence entry for the same work unit.
7. Re-fetch after mutation and compare the intended and actual state.
8. On a conflict, discard the stale replacement, re-fetch, and recompute.

Respect the Notion API's variable rate limit. Batch related writes, handle HTTP 429, and honor `Retry-After` rather than retrying aggressively.

## Coverage classifications

Classify every exact checkbox internally:

- `verified_complete`: sufficient current evidence exists; check it if currently unchecked.
- `implementation_required`: work is authorised and needed; implement it.
- `partial`: some clauses or evidence remain; leave unchecked.
- `blocked`: an external decision, dependency, access problem, or failed prerequisite stops it.
- `outside_authority`: completion requires a live or consequential action the user has not approved.

One work unit may prove several items. Verify each item independently. Keep Features, Tasks, and Completion criteria as separate counts.

## Checkbox evidence rules

- Match checkbox text case-insensitively after trimming and collapsing whitespace.
- Require exact normalized matches for automated state preservation or updates.
- Leave ambiguous or materially renamed items unchanged and show the mapping to the user.
- Check only observable outcomes, not effort or intention.
- Keep a compound item unchecked until every clause passes.
- Keep partial work unchecked and record the completed and remaining parts in evidence.
- Local and mocked checks do not prove `deployed`, `production`, `live`, `scheduled`, `provider-verified`, or equivalent wording.
- Existing checked items are historical claims. Revalidate safety-critical and module-completion claims.
- Never automatically uncheck a historical item. Report the contradiction and obtain approval for the correction.

## Delivery evidence format

Place the optional section after `## Completion criteria`. A documentation-only import never creates it. Create it on the first successful delivery work unit and preserve prior entries.

Use chronological entries and keep each entry concise:

```markdown
## Delivery evidence
### YYYY-MM-DD — Work unit name
- Completed: `Exact checkbox wording`; `Another exact checkbox wording`.
- Verification: `command or check` — PASS with the useful result or artifact.
- References: [Official source](https://example.com) verified YYYY-MM-DD, when it affected the solution.
- Remaining or blocked: Concise requirement, approval gate, or `None for this work unit`.
```

Rules:

- Omit the References bullet when no researched fact materially affected the unit.
- Use `Completed: No checkbox changed` for a blocker, investigation, or partial unit.
- Summarize results; do not paste long logs.
- Never include secrets, tokens, private credentials, sensitive personal data, or unsafe internal URLs.
- Link durable PRs, commits, preview deployments, migrations, reports, or provider receipts when available.
- Do not turn evidence into a progress table.

## Lifecycle mapping

Never move Stage backward. Preserve Owner, Due Date, Actual Completed Date history, and unrelated properties.

| Evidence point | Stage | Status |
| --- | --- | --- |
| First implementation change | `3.1 Development` | `In Progress` |
| Code complete and automated checks pass | `3.2 Code Review / Internal Testing` | `In Review` when review remains |
| UI or design review is the next required gate | `3.3 UI/UX Review` | `In Review` |
| Human acceptance is the next required gate | `4.1 User acceptance testing` | `In Review` |
| Production release is approved and verified | `4.2 Release to production` | `Done` only when every criterion passes |

At the first implementation change, set Start Date to the current Asia/Kuala_Lumpur calendar date only when it is empty.

Use `Blocked` only when no meaningful implementation, testing, documentation, or safe investigation can continue. Keep `In Progress` when independent work remains and record the blocker in evidence.

Use `In Review` rather than Done when any code review, UI review, UAT, production approval, deployment, live readback, or completion criterion remains.

## Done transition

Before setting Done:

1. Re-fetch the complete module.
2. Confirm every applicable Feature, Task, and Completion criterion is checked.
3. Revalidate all checked module-completion and safety-critical claims.
4. Confirm every production, live, deployment, schedule, and provider claim has the required evidence.
5. Confirm no unresolved blocker or approval gate remains.
6. Set Stage to the highest evidence-backed phase and Status to Done.
7. Allow the Notion automation a reasonable opportunity to set Actual Completed Date.
8. Re-fetch and verify the current Asia/Kuala_Lumpur date and completed Schedule Status.

If the date is missing, preserve Done and report `Data issue — completion date missing`. Never fabricate or infer it.

## Update failures

- **Exact text missing:** re-fetch; never broaden the replacement blindly.
- **Several matches:** stop and request a section-level mapping decision.
- **Partial write:** fetch current state and retry only missing operations.
- **Concurrent human edit:** merge by reapplying the proven checkbox and evidence changes to the fresh body.
- **Unsupported or child content at risk:** leave the body unchanged and use a narrower update.
- **Checked claim contradicted:** preserve it, record the discrepancy outside the checkbox state, and ask before unchecking.

## Reconciliation acceptance scenarios

1. Already implemented behavior is checked only after repository and test evidence is found.
2. A partly satisfied compound item stays unchecked.
3. A local test cannot complete a production or provider-live criterion.
4. A material official-doc conflict pauses for a product or architecture decision.
5. A concurrent page edit survives the delivery update.
6. One blocked item does not stop independent safe work.
7. A fully blocked module becomes Blocked with evidence.
8. Done is verified through the automation-managed completion date.
9. A delivery request updates progress after each verified work unit, not only in the final response.
10. A production, live migration, ad-spend, destructive, or external-message action waits for explicit approval.
