# Search-term auto-approval

- Applies to every account. There is no account activation switch.
- Manual and scheduled analysis use the same rules.
- Score must reach the account threshold: 90 by default, up to 100.
- The score adds fixed evidence points; it is not a percentage confidence.
- Conversions must be zero. Qualified leads must be known and zero; unknown leads require review.
- The term must have an approved mismatch: jobs, portal/payment, template/download, competitor brand, wrong product/service, or unsupported location.
- Landing-page evidence must support the mismatch, with no identical positive exact-keyword conflict.
- Ambiguous terms, required client/PM confirmation, existing exclusions, and previous reviews block automation.
- Data must be at most 48 hours old. The ad-group ID and keyword length must be valid.
- Eligible terms are added as **ad-group exact negatives**. Other terms remain in the existing review/keep workflow.
- **Settings → Maximum automatic exclusions per analysis** controls the shared cap for all users/accounts. Default: 25. Enter **0** for no limit.
- Actions and failures appear in **Automatic action history**. Retries avoid duplicate exclusions.
- The production GitHub analysis workflow defaults to live publishing. Set its `SEARCH_TERM_AUTOMATION_LIVE_PUBLISH_ENABLED` variable to `false` for the global stop/dry-run mode. Local/test runs stay dry-run unless explicitly set to `true`.
- Saving settings or opening old results does not publish historical recommendations.

The existing scoring and evidence requirements remain strict; removing account activation does not make every score-90 term eligible.
