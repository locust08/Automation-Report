# M03 preparation parity: local verification and remaining evidence gate

Owner chat `01a12f26-4010-73c6-9316-7734e82cc00b`; isolated Automation-Report branch `codex/m03-preparation-parity-01a12f26`, worktree `.worktrees/m03-preparation-parity-01a12f26`, base `origin/codex/m18-m03-release` / `fef5322851b17888cbf5593989b628be56eb15e5`. Parent owns final integration. The active dashboard task and its files/branches were not edited.

October 13 continuation verified that DigitalBee source `b49ad6b7e51ac97e84fba4d04622b80e22005c0f` is integrated in the freshly fetched `codex/posthog-production` ref. Its diagnostic visibility fix remains undeployed under the user's specific upload/deployment hold; the general request to continue development does not remove that hold.

## Authorized local development

The previous signed-service fixture stubbed provider preview as always successful. New tests exercise the actual `buildM03ProviderWorkflowPreview` and scoped adapter, while keeping identity/state/provider transport synthetic and local. They prove that matching PAUSED-to-PAUSED approval preparation produces an exact-revision card with one mocked official read and zero approval or pause operations. Official baseline drift returns `baseline_or_capability_changed`; wrong request state returns `state_changed`; revoked operator returns `access_denied`. All denial paths retain backend correlation and provider_action false, produce no confirmation token and make no provider mutation.

This removes a test coverage gap. It does not establish which blocker caused the user's October 12 preparation. No production behavior, permissions, secrets, pilot scope, allowlists, migrations or runtime configuration changed.

Verification: 25 focused signed-service/scoped-pause/provider-workflow tests, TypeScript, scoped ESLint and whitespace checks pass. No live provider, connected user test, deployment, source-map upload or shared-branch merge was run.

## Actual remaining blocker and next step

The earlier user preparation's backend HTTP 200 response body/blocker was not retained. Existing telemetry identifies one blocked attempt, correlation `aa80dce0-4ba1-43e7-b00b-b6fd4090b1a8`, elapsed 18,551ms. The immutable request was awaiting_approval with zero approvals and matching PAUSED-to-PAUSED scope when inspected. That evidence cannot identify a particular earlier provider-preview, grant recheck or state failure; local success is not live acceptance and elapsed time is not a root-cause proof.

Further exact diagnosis requires the integrated safe-text diagnostics to be live and then one specifically authorized user-run preparation-only diagnostic. Parent must obtain a focused approval to resume that diagnostic rollout and resolve its source-map policy without overriding the existing no-new-upload instruction or bypassing artifact guards. If the hold remains, no live retry should be requested. This test-only branch needs no runtime release and stays local pending review/publication authority.

After an approved diagnostics release is read back, the bounded user attempt should fresh-discover `pause_campaign_prepare`, prepare action approve once for service `2de4fcc4-f701-808d-b48b-c507d8641ce3`, campaign `24293971098`, request `92c5e030-18e6-44aa-8a0c-bd1cfbcb21e0`, and one fresh UUID idempotency key. Return full safe outcome/blocker/correlation/correlation_source, Worker version and whether a native card rendered; stop before confirmation, no automatic retry, no approval/pause/creation/schedule. A curated blocked result selects the next investigation; a card proves preparation only. Jake's connection is not used as permission to execute Ava's historical request or any live mutation.
