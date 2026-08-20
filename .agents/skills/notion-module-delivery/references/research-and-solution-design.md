# Research and Solution Design

Use this reference to turn a Notion module into a current, decision-complete technical plan without silently changing its business contract.

## Source hierarchy

Use sources in this order when they do not conflict:

1. Explicit user decisions and approval boundaries.
2. The live module, linked requirements, accepted designs, and recorded decisions.
3. Applicable `AGENTS.md`, repository conventions, code contracts, tests, migrations, and current configured behavior.
4. Current official vendor documentation for the exact framework, API, provider, or deployment system.
5. Recognized standards and regulator or standards-body guidance.
6. High-quality secondary sources only when no primary source answers the question.

Do not use a lower-ranked source to override a confirmed product requirement. Surface a conflict when following the requirement would be invalid, unsafe, unsupported, or materially more costly.

## Claim handling

Keep these categories separate in reasoning, the technical plan, and Delivery evidence:

- **Requirement:** supplied by the module or user; preserve its meaning.
- **Verified fact:** supported by a current primary source or direct readback.
- **Calculation:** show inputs, units, and formula.
- **Recommendation:** chosen guidance with its decision condition and trade-off.
- **Inference:** conclusion drawn from repository or live-state evidence; label it as an inference.

Record the verification date for versions, API behavior, limits, prices, availability, policies, security guidance, and other facts that can change.

## Repository discovery

Before proposing a solution:

1. Read applicable project instructions and determine the package manager, language, framework, database, hosting, secrets source, and CI/CD path.
2. Inspect git status and identify user-owned changes.
3. Trace the current implementation from user entry point through server, data, provider, background work, deployment, and monitoring boundaries.
4. Inspect existing tests, test commands, fixtures, mocks, migrations, generated types, feature flags, runtime controls, and rollback mechanisms.
5. Confirm what is actually deployed or scheduled through read-only evidence when module wording depends on live state.
6. Search for prior implementations and receipts before introducing another abstraction.

Do not infer that a checked item is still valid from page history alone or that an unchecked item is missing before inspecting the repository.

## When current official research is required

Always research official primary sources when the solution depends on:

- an external API, SDK, platform, model, or provider capability;
- current framework, library, runtime, or deployment behavior;
- authentication, authorization, secrets, privacy, compliance, or security controls;
- rate limits, quotas, pricing, supported regions, or product availability;
- database migration, backup, rollback, retention, or concurrency behavior;
- accessibility, browser, mobile, or platform-specific requirements; or
- a recommendation likely to change how users, data, money, or production systems are affected.

For a trivial stable local refactor, keep research targeted. Confirm the relevant project and official framework contract without collecting unrelated citations.

## Solution comparison

Generate at least two viable approaches when the choice is material. Compare only criteria that affect the module:

- requirement coverage and correctness;
- compatibility with current architecture and data;
- security, privacy, tenant isolation, and failure containment;
- reversibility, idempotency, and rollback;
- operational burden, observability, and supportability;
- performance, cost, and provider constraints;
- testability and evidence quality; and
- migration and rollout risk.

Choose one approach. Explain why it best fits the confirmed constraints and identify any deferred alternative. Do not turn a recommendation into a requirement without user approval.

## Decision-complete plan test

The implementation plan is ready when another engineer can execute it without choosing:

- the intended behavior and excluded behavior;
- affected components and interfaces;
- source of truth and data flow;
- validation, permissions, and failure behavior;
- migration, compatibility, and rollback strategy;
- verification at unit, integration, and live boundaries;
- Notion evidence required for each checkbox; and
- the exact actions that still require user approval.

Ask the user only when the remaining choice materially changes one of these outcomes.

## Primary research anchors

Use the current task's official documentation first. These are baseline anchors, not substitutes for task-specific research:

- Notion request limits: https://developers.notion.com/reference/request-limits
- Notion block updates: https://developers.notion.com/reference/update-a-block
- GitHub protected branches: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches
- Next.js production checklist: https://nextjs.org/docs/app/guides/production-checklist
- Supabase local migrations: https://supabase.com/docs/guides/local-development/overview
- Supabase database testing: https://supabase.com/docs/guides/database/testing
- Vercel preview promotion and verification: https://vercel.com/docs/deployments/promote-preview-to-production
- NIST Secure Software Development Framework: https://csrc.nist.gov/projects/ssdf
