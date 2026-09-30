# Safe creation preflight evidence

Source `670e8de`, deployed version `14fb1cf1-a44a-4cbc-b990-b96dbcce2e31`. TikTok creation remains disabled; all 31 existing returned bindings match the preceding disabled release.

Queue rejection retains authorization-before, scope/revision, provider-readiness or authorization-after stage, fixed safe category, timestamp and correlation in the existing account-owned operation result. Internal authority failures can carry an allowlisted boundary/category/correlation. Arbitrary messages, request bodies and credentials are excluded. Persistence failure emits only safe structured evidence and never causes another provider write.

The existing signed GET operation-status contract accepts optional `diagnose_preflight:true`. After account ownership checks it performs a present-time read-only launcher authorization probe, scope/revision check and source readiness. It reports creation activation separately and never changes the original operation, challenge or historical result. The companion DigitalBee authority action `m04:campaign_preflight_check` requires current launcher/write grants but cannot publish or enable creation.

Connected Falcon Test 2 probe passed all four current checks with creation disabled, correlation `d840c2df-dfd7-4051-a29c-186ca46a7494`; historical evidence is false. Original unknown operation `69fd9efd-d9e3-405f-b4fb-4a0858831198` and rejected Test 2 `0322fa1a-fdcf-4bb1-95cc-274cd2287e12` remain intact. No historical error is inferred from this new probe.

Verification: 184 backend tests, including actual DigitalBee client integration; typecheck and Worker dry run passed. Companion DigitalBee final suite passed 876 tests with this actual backend. No provider creation occurred during this release.
