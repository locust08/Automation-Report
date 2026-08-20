# Implementation and Verification

Use this reference to turn the selected solution into small, recoverable work units and evidence proportionate to each module claim.

## Work-unit design

A work unit should:

- cover one coherent behavior or technical boundary;
- have known dependencies and rollback;
- avoid unrelated files and user changes;
- be small enough to diagnose independently;
- include its verification in the same unit; and
- end with a Notion reconciliation when it proves one or more checkboxes.

Order foundations before consumers: schema and contracts, server behavior, user interface, integrations, background work, monitoring, deployment, then live acceptance. Parallelize only work that has independent files and interfaces.

## Implementation rules

- Follow all applicable repository instructions and specialized skills.
- Use the existing architecture and shared abstractions unless the module requires a justified change.
- Preserve backward compatibility or define an explicit migration and rollback path.
- Keep secrets in the configured secret manager and server-only runtime.
- Validate inputs and authorization at the trusted boundary, not only in the UI.
- Make retries, receipts, locks, idempotency, readback, and failure states explicit for external mutations.
- Keep runtime activation disabled when the approved authority covers planning or paused builds only.
- Inspect the dirty worktree before editing and preserve unrelated changes.
- Do not push, deploy, publish, or communicate externally unless the user has granted that authority.

## Verification ladder

Use the smallest sufficient lower layers, then add higher layers when the checkbox wording or risk requires them:

1. **Static:** formatting, lint, type checks, schema validation, or compile.
2. **Unit:** isolated business rules, validation, calculations, and state transitions.
3. **Integration:** component boundaries, database policies, queues, providers, and error recovery.
4. **Migration:** fresh-chain apply, rollback-only compile, schema assertions, policy tests, and post-apply verification.
5. **UI or end to end:** main path, alternate states, permissions, accessibility, and recovery in a real browser when applicable.
6. **Production-like build:** framework build and runtime smoke test using the configured environment source.
7. **Preview or staging:** deployed artifact, critical-route smoke tests, logs, and integration readbacks.
8. **Production or live:** explicit approval, exact target confirmation, mutation receipt, immediate readback, monitoring, and rollback readiness.

Passing a lower layer does not satisfy a checkbox that explicitly requires a higher one.

## Evidence by wording

| Checkbox wording | Minimum evidence |
| --- | --- |
| Implements or supports behavior | Focused behavior test plus relevant static checks |
| Handles validation, permission, or failure | Positive and negative tests at the trusted boundary |
| Database schema or policy works | Migration-chain or rollback compile plus semantic database tests |
| UI is usable or accessible | Browser interaction and applicable accessibility evidence |
| Integrates with a provider | Contract test and sandbox, validate-only, or exact readback as wording requires |
| Is deployed or available in preview | Deployment URL, READY state, smoke test, and relevant logs |
| Is running, scheduled, or monitored | Live configuration/readback and at least one verified execution or health signal |
| Is production-ready | Production-like build, rollback plan, observability, and all stated acceptance gates |
| Is live or released | Explicitly approved production mutation plus post-release verification |

Mocks are useful implementation evidence but do not prove real provider access, deployment, schedules, or production delivery.

## Stack-specific routing

Apply only the guidance that matches the discovered project:

- **Next.js:** run the repository lint, type, focused test, and production build commands. Use `next start` or an equivalent production-like smoke when the criterion requires runtime behavior.
- **Supabase:** keep migrations versioned, test the complete migration chain or an explicit rollback-only transaction, verify RLS under realistic roles, and regenerate types when the project contract requires them.
- **Vercel:** verify a Preview deployment before promotion by inspecting the deployment, testing critical routes, and checking errors. Treat promotion and rollback as production actions.
- **GitHub:** treat required status checks, current-head reviews, and protected-environment approvals as delivery evidence only when configured and observed.
- **External APIs and ad platforms:** prefer read-only, sandbox, dry-run, validate-only, disabled, or paused creation. Require exact account and resource confirmation before any approved live mutation.

Run environment-dependent commands through the repository's configured secret source. Do not substitute local plaintext environment files.

## Failure and recovery

- Fix failures caused by the work unit before marking its items complete.
- If a broad suite has unrelated baseline failures, preserve the output, run focused proof, and keep any criterion requiring the full suite unchecked.
- For a migration failure, stop before live apply, restore the disposable environment, and repair the migration chain.
- For an ambiguous external response, do not repeat a mutation until exact provider readback establishes the outcome.
- For a preview failure, inspect build/runtime logs, repair locally, redeploy only within granted authority, and re-run the smoke tests.
- For a production issue after separately approved release, use the documented rollback path and verify recovery before continuing.

## Completion test

Implementation is complete only when:

- the final repository state implements the chosen solution;
- focused and required broader checks pass;
- migrations, generated artifacts, configurations, and operational documentation agree;
- the deployed or live state matches every checkbox that requires it;
- rollback and monitoring evidence exist when required;
- every checked item maps to sufficient evidence; and
- remaining unchecked items are accurately recorded rather than hidden by a general success claim.
