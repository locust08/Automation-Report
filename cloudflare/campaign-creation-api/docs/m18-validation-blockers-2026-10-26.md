# M18 validation blocker visibility — 26 October 2026

User-returned validation key `c192ecce-2535-4c46-b641-592c665b551f` reached M04 and returned a valid HTTP 200 envelope in 5,919 ms at 09:04:48.117 UTC. Outcome was `unavailable`, readiness code and service error `request_failed`, correlation `ca041c32-3cda-4652-94d6-63eb2d81ed7d`, failure reference `b573a135-a637-4e2d-97e9-02911a11d15f`. No validation pass or provider mutation is established. The separately approved single validation is consumed and is not repeated.

Exact deployed M04 source is `e3f06de1c4fc6e0ab223c22a8d6442df62d13786`, Worker `4981d5f5-b777-488a-8b80-f85a33d8110b`. Its outer exception handler converts non-provider errors such as `clone_changed` and `template_disabled` into `request_failed`. Those errors can occur before provider validate-only logic. This is a confirmed information-loss mechanism; it does not identify which exception caused the actual returned failure. Scope drift, source drift, malformed stored data and other failures must not be inferred from timing alone.

The local candidate adds a finite, curated blocker mapping only for `campaign_draft_validate`. It preserves specific clone/template/planning/conflict categories in validation issues, service_error and the existing safe backend log. Arbitrary exception messages remain hidden. Outcomes, source-currentness checks, approval checks, native calls and retry behavior remain unchanged. There is no automatic source refresh, new revision, provider creation, bypass or weakening of a blocker.

A matching one-line DigitalBee MCP projection update permits these same six codes in its safe diagnostic text. Both candidates are local until separately approved and verified; the existing M04 service is distinct from the previously approved MCP diagnostic deployment. No M04 deployment, database read, migration, provider action or further validation occurred.

Verification: M04 TypeScript, scoped esbuild bundle and whitespace checks pass. The scoped repository lint result is recorded in the handoff. No regression or behavioral tests run under the user's restriction. Static checks do not prove the original Meta cause or connected acceptance.

Ownership: chat `01a175ba-4c34-7700-bf2d-579abe1d2639`; Automation-Report branch `codex/m18-backend-diagnostics-01a175ba`; base exact fetched deployed source above. Integration coordinator `01a12ed0-ee4b-749e-a39a-430f2eb60030`; feature handoff only, no shared/main merge. Existing feature worktrees and dirty files remain untouched. M17 stays paused, Google QA remains dated evidence, and Meta draft approval/creation remains unverified.

## Approved release

The user explicitly approved deploying this separate M04 diagnostic correction, the matching MCP allowlist update, and one further Meta validation. M04 source `a1de2abca5c69a6399047aee6246f71f99624816` is deployed as `d8b662b0-7e0a-47ec-ba0e-49942b0a476c` at 100%. Its exact injected artifact SHA-256 is `8c1d4f4f2dbfb40fee61c58f3943ec8aaec064f4f2e4b5ce4a134459b8e65649`; rollback is `4981d5f5-b777-488a-8b80-f85a33d8110b`.

The matching MCP source `50566a08101acafcdb74020392eb1f1c6823f8a3` is deployed as `43ba71fd-c2a1-4e98-a045-1389e7e1063f` at 100%, exact artifact `28fb19d3579885cc25bc4442b67c80c0e93284f02c54b2852eff4ccfcff707ef`, rollback `a274a4dd-7e5a-464b-a658-b820e5e5ce12`. Each prepared source-map artifact was injected/uploaded to existing US PostHog project 503297 before its one deployment. Independent readbacks preserve existing bindings/settings/assets/routes/schedules except release labels/provenance; other Workers remain unchanged. No migration, operator D1 query, permission change, regression test or provider mutation occurred.

M04 TypeScript, scoped bundle, lint and whitespace checks passed; lint emitted only a React-version detection warning. MCP TypeScript and whitespace checks passed. No behavioral tests were run. The approved browser connection is unavailable, so the new single validation remains unexecuted and is handed to the user's existing employee connection with fresh reserved key `6b562692-1a1d-4efb-b659-34b810fe684a`. Original cause and connected acceptance remain unresolved; no prior validation is repeated.

## 27 October — Browser test isolates the actual false drift

The user authorized further testing through Ava's normal ChatGPT extension, with no desktop controls or regression tests. Exact Meta source campaign/ad-set/ad GETs confirmed the recorded account and parent links, PAUSED status and MYR4.13/day. One workflow GET failed transiently; one separately instrumented GET succeeded, confirming revision `664d3f03-822d-45c4-ae77-d70de4c29233` remains draft (correlation `45261446-42fe-4e2b-bb5b-638e949bb305`).

One bounded validation using key `99fc1d3b-45e7-4431-9091-06008a879945` returned `clone_changed`, correlation `e14946eb-538e-4f42-aa20-96401f89f2fa`, failure `8a4be2f1-1237-4b7b-a57a-6299f18d2ee9`, HTTP 200 and 5,591 ms. A filtered, bounded M04 server-log capture independently confirms `m04_backend_failure/category:clone_changed`. No validation retry or provider mutation followed. Raw request metadata remains private; only curated category/timestamp evidence is retained.

Current clone planning is enabled, and saved provenance uses the same service. One targeted readiness call (correlation `75a2d337-1577-4cfc-b060-6c22f8488ecd`) reported the exact source eligible, with unchanged source fingerprint `mjBP2nN7n6sjl1IQ08W3LGWiualcE_2b43X7GC9UcAU`. Current source budget is MYR4.13, but the discovered minimum is now MYR4.12. No draft was refreshed or saved.

The deployed clone guard hashes the entire source record, including this derived minimum. Using the actual observed fields and deployed SHA-256/base64url property order, the current record hashes to `nSRY7CxuUD53Xjk-k9dSezincvDPPqyh0jicR7zzJxo`. Changing **only** its minimum from 4.12 to 4.13 reproduces the saved provenance hash **exactly**, `AVpBaY_X9BdB9pGomZRJyHXPeFdqZgpn28TbhS6sbhI`. Thus the guard mistakes a one-sen change in readiness evidence for a source edit. This is a deterministic evidence calculation, not a regression-suite run.

### Scoped local correction

Normal exact snapshot matches retain existing behavior. On a Meta-only mismatch, the fallback requires today's independently verified minimum to fit the unchanged planned budget, then reproduces the stored legacy hash by replacing only `minimum_daily_budget` with the saved planned amount. The full source fingerprint, ownership, IDs, configuration, source campaign budget and every other snapshot field remain in that exact hash. An actual source/configuration change, unaffordable new minimum, malformed plan or unexplained legacy snapshot still fails closed. Disabled planning and service checks run before this fallback. Google/TikTok/template paths are unchanged. No draft, approval or provider data is rewritten; no stored provenance is migrated.

The narrow legacy fallback is intentionally not a general migration: snapshots originally saved at another minimum that cannot be reconstructed remain blocked for review. Existing provider validation, approval, creation, QA and scheduling checks remain in force. No source mismatch is accepted solely from a matching ad ID.

M04 TypeScript, scoped bundle and whitespace checks pass. Scoped lint reports pre-existing `any` and unused `verified_at` findings; the unchanged baseline is checked separately. No regression or behavioral tests ran. The correction is local/pushed for review, **not deployed**. Previous authorization covered diagnostic-only deployment; release of this validation-logic correction and its post-release single validation need a new explicit decision. M17 remains paused and campaigns untouched.
