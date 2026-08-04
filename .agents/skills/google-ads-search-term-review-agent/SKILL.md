---
name: google-ads-search-term-review-agent
description: Use when a user provides a Google Ads CID and wants active Search campaign/ad group search terms reviewed against landing-page and same-domain website intent, or wants approved search-term proposals applied and summarized.
---

# Google Ads Search Term Review Agent

Use this skill to generate a proposal list for unreviewed Google Ads Search terms. The workflow is read-only by default and must not apply Google Ads changes.

Always follow `.agents/skills/google-ads-doppler/SKILL.md` and the user-level Doppler skill. Run commands through Doppler and use Google Ads credentials only for Google Ads API access. The OpenAI reviewer uses the Doppler-managed `OPENAI_API_KEY`.

## Default Command

```bash
doppler run -- uv run --group ads --group ads-agent python .agents/skills/google-ads-search-term-review-agent/scripts/run_search_term_review.py <customer_id>
```

Example:

```bash
doppler run -- uv run --group ads --group ads-agent python .agents/skills/google-ads-search-term-review-agent/scripts/run_search_term_review.py 446-568-6564
```

## What The Script Does

1. Uses the last 30 days inclusive of local today by default.
2. Pulls data directly from Google Ads API for active Search campaigns and active ad groups only.
3. Aggregates by ad group and normalized search term.
4. Skips a search term when the same normalized text already exists in that ad group as a non-removed keyword or negative keyword.
5. Pulls active ad final URLs per ad group and uses the dominant active final URL as the destination URL.
6. Crawls the destination URL domain, starting with the destination URL, then same-domain sitemap/internal links.
7. Reviews every unreviewed term with an OpenAI Agents SDK agent using [review-rubric.md](references/review-rubric.md).
8. Moves any converting term proposed as `negative exact` to `special review needed`, marks it as special review, and sets its special-review proposed action to `add exact`.
9. Builds a safety corpus from all observed terms and existing keyword criteria, including terms skipped from individual review.
10. Treats negative phrases as a secondary, suggestion-only layer. It emits them
    only when the user requests phrase suggestions or the evidence shows obvious
    zero-conversion paid waste.
11. Applies the deterministic high-confidence safety gates before any phrase is proposed.
12. Writes Markdown and CSV proposal files to `outputs/`, and full JSON including `no action`, safety-corpus, eligible phrase, and suppressed phrase rows to `tmp/`.

## Useful Options

```bash
--start-date YYYY-MM-DD
--end-date YYYY-MM-DD
--limit-terms 20
--batch-size 80
--concurrency 20
--crawl-concurrency 8
--model gpt-5.6-sol
--reasoning-effort medium
--suggest-negative-phrases
--max-pages 50
--max-depth 2
--dry-run-agent-fixture
```

Use `--dry-run-agent-fixture` for a no-API smoke test. It does not call Google Ads, websites, or OpenAI.

Use `--suggest-negative-phrases` only when the user asks for phrase-negative
suggestions. Without it, propose a phrase only when at least one
zero-conversion click incurred positive cost and the intent is an obvious,
stable mismatch category. Keep all phrase output secondary to the normal
term-level review.

## Output Contract

Markdown starts with:

| Action Type | Count |
| --- | ---: |
| Negative exact | count |
| Add exact | count |
| Special review needed | count |
| No action | count |
| Total reviewed | count |
| Secondary suggestion: negative phrase (campaign) | count |
| Secondary suggestion: negative phrase (ad group) | count |
| Suppressed negative phrase candidates | count |

Then it shows rows classified as `negative exact`, `add exact`, or
`special review needed`. `Special review needed` groups appear first. A
dedicated secondary negative-phrase suggestion section appears only after the
primary term-level actions.

Show the three phrase-related count rows only when the user requested phrase
review or at least one clear-paid-waste phrase is eligible. Keep suppressed
phrase details in full JSON for auditability even when phrase information is
omitted from the human-facing Markdown and CLI summary.

Phrase candidates are stored separately from term-level actions:

- `negativePhraseCandidates` contains eligible `PHRASE` proposals.
- `suppressedNegativePhraseCandidates` contains rejected seeds and gate failures.
- Every eligible row is marked `suggestionOnly: true` and
  `recommendationPriority: secondary`.
- `suggestionTrigger` states whether the phrase was surfaced because the user
  requested phrase suggestions or because the data showed clear paid waste.
- Scope is `CAMPAIGN` or `AD_GROUP`; account-level phrase negatives are never proposed.
- A phrase qualifies only when every matching observed query has zero conversions,
  all reviewed matches are clear negatives, there is no positive-keyword or
  primary-page overlap, the phrase is specific and observed verbatim, and the
  hybrid recurrence/clicked-competitor evidence rule passes.

Rows include these review columns:

- `Special Review`
- `Special Review Proposed Action`

For `special review needed` rows, `Special Review` is `yes` and `Special Review Proposed Action` is `add exact`.

Rows are grouped by:

1. Ad group
2. Destination URL
3. Proposed action

Within groups, rows sort by cost descending, then impressions descending.

## Applying Approved Proposals

After the user explicitly approves the proposed actions, apply the generated JSON with the separate apply workflow:

```bash
doppler run -- node scripts/google_ads_apply_search_term_action_proposal.mjs <customer_id> <proposal_json_path> --execute
```

Phrase proposals require explicit approval and the additional opt-in flag:

```bash
doppler run -- node scripts/google_ads_apply_search_term_action_proposal.mjs <customer_id> <proposal_json_path> --execute --include-negative-phrases
```

Example:

```bash
doppler run -- node scripts/google_ads_apply_search_term_action_proposal.mjs 446-568-6564 tmp/google_ads_search_term_review_agent_4465686564_YYYYMMDD_YYYYMMDD.json --execute
```

Use `--execute` directly by default after approval to avoid spending mutate operation quota twice. The apply script still performs preflight checks before creating criteria:

1. Resolves accessible customer context.
2. Loads existing exact keywords, positive keywords, and campaign/ad-group phrase negatives.
3. Re-checks phrase confidence, zero conversions, positive-keyword overlap, scope, duplicates, length, and word limits.
4. Sends approved exact and phrase operations through one all-or-nothing Google Ads mutate request.
5. Re-queries Google Ads and verifies resource name, match type, and scope.
6. Writes an execution audit JSON to `outputs/`.

Rows classified as `special review needed` are visible in review outputs but are not treated as approved mutation rows by the standard apply workflow.
Phrase candidates are ignored unless `--include-negative-phrases` is present.
Never treat the presence of a phrase candidate as approval. Clearly present it
as a secondary proposal and wait for the user to approve phrase application.

## Required Post-Apply Report

After a successful `--execute`, report the applied result and include a semantic negative-keyword grouping table in the final response.

Build the table from the execution audit's `verification.verified` rows filtered to `proposedAction == "negative exact"`. Assign every verified negative exact keyword to one mutually exclusive primary intent group. Use clear groups such as competitor/institution/brand, external scholarship/grant, unsupported study destination, language test/tutoring, school/exchange programme, jobs/non-student immigration, informational research, online/unrelated course, student-visa mismatch, event/travel, portal/government navigation, and other unrelated intent. Adapt group names to the actual terms and omit empty groups.

Use this final-response table shape:

| Negative-keyword group | Count | Representative examples |
| --- | ---: | --- |
| group | count | `term`, `term`, `term` |
| **Total** | **verified negative exact count** | |

The post-apply response must also:

- State the applied negative exact and add exact counts.
- State duplicate, conflict, validation, and verification-missing counts.
- State campaign and ad-group negative phrase applied, skipped, and verification-missing counts.
- Verify every applied phrase resource is enabled, has `PHRASE` match type,
  matches its proposed scope, and has a unique resource name.
- Verify that group counts sum exactly to the verified negative exact total.
- Verify that every grouped resource name is unique and matches the verified negative exact resource-name set, with zero omissions or duplicates.
- State that `special review needed` rows were excluded and left unchanged.
- Link to the execution audit and to a full grouped-keyword artifact when one is generated.

If no negative exact keywords were verified as applied, include the table header and a total of zero.

Apply-time keyword validation follows Google Ads keyword criterion limits:

- Skip proposed exact keywords and negative exact keywords when the keyword text is more than 80 characters.
- Skip proposed exact keywords and negative exact keywords when the keyword text is more than 10 words.
- Report these as validation skips in the execution audit, not as failed apply attempts.

Use `--validate` only when the user asks for validation first, when the apply script has changed, or when the proposal is unusually risky and the extra Google Ads mutate operation quota is acceptable:

```bash
doppler run -- node scripts/google_ads_apply_search_term_action_proposal.mjs <customer_id> <proposal_json_path> --validate
```

Add `--include-negative-phrases` to the validation command only when the user
explicitly wants the phrase candidates validated.

## Safety Rules

- Keep the proposal-generation step read-only.
- Keep phrase negatives suggestion-only and secondary to exact term-level actions.
- Generate ordinary high-confidence phrase suggestions only when the user asks
  for them. Without an explicit request, surface only obvious mismatch phrases
  with positive cost, at least one click, and zero conversions, and call out
  the measured waste in the reason.
- Apply approved proposals only through `scripts/google_ads_apply_search_term_action_proposal.mjs`.
- Use the separate apply workflow only after explicit user approval.
- Require explicit phrase approval and `--include-negative-phrases` before any phrase mutation.
- Never create account-level phrase negatives from this skill.
- Reject phrase candidates when any matching observed query converts, any
  reviewed match is not a clear negative exact, a live positive keyword overlaps,
  or the phrase appears in the primary landing-page offer.
- Keep secrets in Doppler and out of logs.
- Move any term with conversions that is proposed as `negative exact` to `special review needed`.
- Treat `no action` as reviewed but hidden from proposal tables.
