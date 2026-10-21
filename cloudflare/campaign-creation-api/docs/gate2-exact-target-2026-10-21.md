# Gate2 exact target restriction

Gate2 allowlist rows require exactly subject, service_id, platform, account_id, workflow_id, revision_id and campaign_id. Account-only Gate2 rows are rejected. Recovery rows remain unchanged. Authorization still checks flags, current employee authority and native confirmation.

Before preparation, reservation and queued execution, the Worker binds the allowlisted immutable workflow/revision to the durable original creation campaign. For Google the verified parent receipt's exact account-qualified resource is used; Meta uses the confirmed campaign step. Fresh QA must independently identify the same campaign before preparing a native card or dispatching scheduling. A different workflow, revision, campaign, account or removed scope cannot schedule a provider write. Unknown/dispatched receipts remain readback-only.

The 72-hour future-schedule and Google midnight restrictions are preserved. No budget write, provider scheduling behavior, database schema or recovery scope changed. Main and private restriction changes must release together with Gate2 disabled until the exact target allowlist is installed. No account-wide pilot activation is authorized by this implementation.

Validation: 15 focused source/action tests passed, including three new boundary cases, and private Worker typecheck passed. Main has three focused scope tests and a passing typecheck. Sandbox temporary rename failures preceded successful scoped execution outside that restriction.

Production release and live acceptance remain pending. The approved Google test is campaign24383922445/account2315114913 with MYR1/day unchanged; no provider mutation has occurred. A separate explicit M03 allowlist approval is pending after automatic review rejected its persistent access-control expansion. Gate2 remains disabled. Rollback prior runtime and disabled/empty Gate2 settings, retaining all data and receipts. No migration. No remote publication/CI claimed.
