# TikTok diagnostics release — 2026-09-30

Implementation commits `7c64ff8` and `882e0e9` capture safe structured provider evidence before confirmation/reconciliation, without raw payloads, messages or credentials. Migration 0005 preserves immutable creation observations and the latest ten reconciliation observations per step. Reads enforce operation/account ownership; diagnostic persistence failure cannot authorize another provider write.

Migration applied; production version `07084399-ee37-4593-be8e-3a71f440bc8e` deployed with TikTok creation disabled and all 31 bindings preserved. M18 `d8889f7a-ca8f-41b6-8bf7-7c686792196b` exposes the evidence through the existing ChatGPT receipt, with all 96 bindings preserved. No permissions or tokens changed.

Two actual connected receipt checks on operation `69fd9efd-d9e3-405f-b4fb-4a0858831198` capture campaign/get HTTP 200/native code 0/request IDs durably. Original creation diagnostics remain unavailable; the operation remains unknown. Both its original status/result JSON and the preserved Meta receipt remain unchanged. Native inventory remains exactly 5 campaigns, 5 groups, 104 ads with unchanged values. No replay or new creation occurred.

176 M04 tests and 864 M18 tests pass with the actual client/Worker integration, including Google/Meta regressions. Both typechecks, Worker dry runs and diff checks pass. Independent review found no critical or important defect. Safe read-only diagnostic acceptance passed; paused-hierarchy acceptance remains BLOCKED and separate. Private credentials, release configurations and snapshots are excluded from commits.
