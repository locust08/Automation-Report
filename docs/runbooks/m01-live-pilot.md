# M01 exact-negative live pilot

This pilot is intentionally disabled by default. It permits one administrator-approved M01 change set containing exactly one exact-match negative keyword. Every other provider publish, retry, and verification request remains locked.

## Before the pilot

1. Create the exclusion from the M01 traffic-quality dashboard and complete M03 validation and approval.
2. Confirm the request contains one field change only, its value type is `negative_keyword`, and its match type is `EXACT`.
3. Record the approved change-set UUID.
4. Set `M01_LIVE_PILOT_CHANGE_SET_ID` to that UUID in the production deployment and redeploy.
5. For the separately approved test email, set `ADS_CHANGE_DIGEST_TEST_RECIPIENT=ava@locus-t.com.my` only for the pilot window.

## Operator action

The operator—not an automated agent—opens the approved request and presses **Publish approved revision**. The workflow performs a fresh conflict check, publishes the single exact negative keyword, reads it back from Google Ads, and stores the item result and audit events.

If publishing succeeds but readback needs another attempt, **Retry verification** is read-only. If the publish itself fails, **Retry failed items** rechecks the same allowlisted item and never repeats an already successful mutation.

## Evidence to retain

- Change-set, approval, and immutable revision IDs.
- Google Ads account, campaign or ad-group identity, and exact negative keyword.
- Validate-only response, publish response, readback result, attempt count, and timestamps.
- PM notification recipient and delivery status.

## Close the pilot

Remove `M01_LIVE_PILOT_CHANGE_SET_ID` and `ADS_CHANGE_DIGEST_TEST_RECIPIENT`, then redeploy. Confirm the publish endpoint again returns `423 provider_execution_locked` for the completed request and for an unrelated request.
