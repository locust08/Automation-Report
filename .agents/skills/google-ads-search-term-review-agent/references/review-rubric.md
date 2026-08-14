# Search Term Review Rubric

Use this rubric to classify every unreviewed Google Ads Search term against the destination URL and same-domain website context.

## Core Question

Does the search term match the service or offer shown on the final URL?

The destination URL is the primary source of truth. Same-domain pages can clarify the business offer, service areas, synonyms, and adjacent services, but they do not override the destination URL when the ad group points to a specific service page.

## Actions

Classify every term as one of:

- `negative exact`
- `add exact`
- `special review needed`
- `no action`

Only `negative exact`, `add exact`, and `special review needed` rows are shown in the proposal output. Keep `no action` rows in JSON for auditability.

Negative phrase is not a term-level action or a first-priority recommendation.
Treat it as a secondary suggestion after term-level review. Derive
high-confidence phrase candidates only when the user asks for phrase
suggestions or when an obvious mismatch has already produced measurable paid
waste.

## Negative Exact

Use `negative exact` when the search term intent does not match the destination URL. The negative is proposed at ad group level.

Strong mismatch examples:

- Calculator, estimator, formula, or tool intent.
- Government payment, login, check-status, renewal, or portal intent.
- Document template, sample, form, PDF, download, or letter intent.
- Job seeker, career, salary, vacancy, or internship intent.
- Definition, meaning, wiki, tutorial, or broad research intent.
- Unrelated provider, competitor, app, portal, marketplace, or brand intent.
- Unrelated service, product, audience, geography, or funnel stage.
- Search term clearly asks for something the landing page does not offer.

Conversion safety:

- Zero-conversion mismatch terms are usually safe to exclude.
- Terms with conversions must not be proposed as `negative exact`; move them to `special review needed` even when mismatch appears explicit and evidence-backed.
- Ambiguous converting terms should become `no action`.

### Phrase Seed

For a clear zero-conversion `negative exact` decision, optionally return:

- `mismatchCategory`
- `negativePhraseSeed`

The seed must be the shortest self-contained competitor name or stable mismatch
intent that appears in the search term in the same word order. Good examples
include `coway` for an unrelated competitor or `bottom load` when the
destination only supports direct piping.

When the reusable seed is a named unrelated brand or provider, classify it as
`competitor_brand` even if the full query also asks for contact, support,
reviews, or portal navigation.

Return an empty phrase seed for generic product/service words, locations, short
ambiguous abbreviations, supported offer language, or any phrase that would be
unsafe to reuse.

The deterministic phrase-candidate layer must still reject a seed unless:

- Every matching observed query has zero conversions.
- Every reviewed matching query is a clear `negative exact`.
- Existing positive keywords do not overlap the phrase.
- The phrase is absent from the primary landing-page offer.
- The phrase is specific and uses only an observed spelling.
- Evidence recurs, or one clicked query contains an unambiguous competitor brand.

Suggestion priority:

- When the user explicitly asks for phrase-negative suggestions, surface
  candidates that pass all high-confidence gates.
- Otherwise, surface a candidate only when the intent is an obvious stable
  mismatch, at least one click incurred positive cost, and conversions remain
  zero. State the clicks and cost as the reason it is being raised.
- Present phrase candidates after the term-level recommendations and label them
  as suggestion-only.
- Do not infer approval from the phrase appearing in the proposal. Applying it
  still requires explicit phrase approval and the phrase-specific apply flag.

Campaign scope is allowed only for universally irrelevant competitor brands or
phrases safely supported across multiple ad groups. Product-specific mismatch
phrases stay at ad-group scope. Account-level phrase negatives are not allowed.

## Special Review Needed

Use `special review needed` when a term has conversions and would otherwise be classified as `negative exact`.

This is a manual-review hold state. Do not apply it as a Google Ads mutation through the standard apply workflow.

## Add Exact

Use `add exact` only when both are true:

- The search term has conversions.
- The search term intent matches the destination URL offer.

The keyword is proposed at ad group level as exact match.

Do not add a term only because it converted. The page must semantically support the same service, audience, and offer.

## No Action

Use `no action` when:

- The term matches the destination URL but has zero conversions.
- The term converted but relevance is not clear enough to add exact.
- The term is ambiguous, partial, too broad, or low-signal.
- The term appears relevant but the landing page does not directly support a distinct new exact keyword.

Do not display `no action` rows in the Markdown/CSV proposal.

## Required Evidence

For every non-`no action` row, provide a concise reason tied to the page offer, such as:

- `Intent does not match landing page offer`
- `Government portal/payment intent does not match the landing page offer`
- `Relevant converting term matches the destination URL offer`

Reasons should be specific enough for a human reviewer to approve or reject quickly.
