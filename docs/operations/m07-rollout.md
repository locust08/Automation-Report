# M07 rollout record

## Scope

This change covers Google Ads authentication and v25 compatibility in reporting, management, optimization publishing, campaign creation, the two Google Ads skills, GitHub Actions, Vercel environment sync and `cloudflare/placement-analysis`. Lead Routes, Meta/TikTok functionality, unrelated settings and existing working-tree edits are outside scope.

The shared client requires the OAuth client ID, client secret and refresh token. Existing OAuth aliases remain supported. The default/minimum REST version is v25. Direct access omits the manager header; Notion/account-specific routes retain precedence over the fallback MCC. Live mutations never automatically retry after transport failures. Error objects contain safe diagnostic metadata; internal policy-exemption handling does not attach remote response bodies to public errors.

## Verification on 2026-09-21

- Offline transport/routing, reporting fallback, date mutation and management tests passed; regression scanner passed.
- Python SDK 32.0.0 initialized with OAuth credentials only and explicit v25 in offline tests; a live direct read also passed. Review fixture completed without external calls.
- `ListAccessibleCustomers` and direct reads passed for 18 accessible customers. Representative child reads passed through MCCs `3666137525` and `4114685827`.
- Live GoogleAdsFieldService audit confirmed 214 statically extracted GAQL fields exist in v25. This checks field existence, not every selectable-with combination or dynamically assembled query.
- Real reporting campaign/keyword reads and a Notion-resolved management read (17 campaigns) passed.
- Validation-only requests passed for campaign edits, negative exact/phrase publishing, positive exact publishing, placement exclusions and paused Search campaign creation. No live ad mutations were submitted.
- Isolated application typecheck, lint and production build passed. Lint reported 25 existing warnings and no errors. Worker bundling dry-run passed.
- Safe local request IDs and results are under ignored `artifacts/m07/`; credentials are not recorded there.

## Compatibility changes

The [Google release notes](https://developers.google.com/google-ads/api/docs/release-notes) require campaign date-time fields. Existing public date field keys are retained and mapped to date-time request fields. Removed video-view metrics use TrueView views; keyword conversion rates continue to derive from clicks and conversions. Topic labels use criterion topic paths. The removed Demand Gen `lead_form_only` field is no longer queried or offered as an editable field; pending edits targeting it fail local validation.

The [Cloud-project migration guide](https://developers.google.com/google-ads/api/docs/api-policy/developer-token) establishes OAuth project ownership as the source of access levels. Successful account reads prove runtime access, but do not establish the administrative inventory below.

## Production gate — not yet cleared

The user cannot currently verify the Cloud-project administrative information. Deployment is held. Obtain the following from the production OAuth project's owner:

- Project ID, number and display name; confirm the OAuth client belongs to it.
- Enabled Google Ads API and approved production access level.
- Project quota and responsible Owner/Editor contacts.

Record those safe values as `GOOGLE_ADS_CLOUD_PROJECT_ID`, `GOOGLE_ADS_CLOUD_PROJECT_NUMBER`, `GOOGLE_ADS_CLOUD_PROJECT_NAME`, and `GOOGLE_ADS_PROJECT_ACCESS_LEVEL`. Confirm each deployed runtime uses that project. Complete validation-only checks with approved fixtures for PMax assets and other managed ad/asset mutation families. Inventory every distinct active Notion access path and validate representative customers for any route beyond the two MCCs already checked.

## Commands

```powershell
npm run google-ads:check
npm run google-ads:test
uv run --project lib/search-term-optimization/python --group ads --group ads-agent python scripts/google-ads-python.test.py
doppler run -- npm run google-ads:preflight -- <customer-id>
doppler run -- npx tsx scripts/google-ads-v25-audit.ts
doppler run -- npx tsx scripts/google-ads-validate-smoke.ts <customer-id> <manager-id>
doppler run -- npm run google-ads:preflight -- <customer-id> --validate-fixture=<approved-fixtures.json>
```

Validation fixture format: an array of `{ customerId, loginCustomerId, service, operations }` objects. The preflight always forces `validateOnly: true`. Never place credentials in fixture files. Search/policy/control behavior remains in the domain-specific builders.

## Staged canary

After the gate clears, deploy read-only reporting/account resolution first, then placement/search-term readers, management/optimization reads, and finally mutation workflows with their existing approval controls. Record deployment IDs and timestamps for every stage. Observe seven consecutive clean days and one scheduled production cycle for every affected deployment. On any failed gate, roll back the affected deployment and restart that window after remediation.

Keep the unused legacy secret in Doppler, Vercel, GitHub and Cloudflare throughout the canary. Secret removal is a separate post-canary operation; none were deleted by this implementation. Repeat direct/MCC reads, validation-only fixtures and the regression scanner after removal.
