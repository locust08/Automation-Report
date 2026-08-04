from __future__ import annotations

from collections import Counter
import re
from typing import Any

from google_ads_pull import SearchTermRecord, norm_text
from site_context import SiteContext


GENERIC_SINGLE_WORDS = {
    "best",
    "cheap",
    "company",
    "filter",
    "installer",
    "malaysia",
    "near",
    "price",
    "product",
    "rental",
    "service",
    "shop",
    "supplier",
    "system",
    "water",
}
GENERIC_PHRASES = {
    "customer",
    "customer service",
    "near me",
    "water dispenser",
    "water filter",
    "water purifier",
}
OBVIOUS_WASTE_CATEGORIES = {
    "competitor_brand",
    "wrong_product",
    "wrong_service",
    "portal_navigation",
    "stable_irrelevant_intent",
}


def phrase_tokens(value: Any) -> list[str]:
    return re.findall(r"[^\W_]+", norm_text(str(value or "")), flags=re.UNICODE)


def normalized_phrase(value: Any) -> str:
    return " ".join(phrase_tokens(value))


def contains_phrase(text: Any, phrase: Any) -> bool:
    text_tokens = phrase_tokens(text)
    phrase_parts = phrase_tokens(phrase)
    if not phrase_parts or len(phrase_parts) > len(text_tokens):
        return False
    return any(
        text_tokens[index : index + len(phrase_parts)] == phrase_parts
        for index in range(len(text_tokens) - len(phrase_parts) + 1)
    )


def safety_row_dict(row: SearchTermRecord | dict[str, Any]) -> dict[str, Any]:
    if isinstance(row, SearchTermRecord):
        return {
            "termId": row.term_id,
            "campaignId": row.campaign_id,
            "campaignName": row.campaign_name,
            "adGroupId": row.ad_group_id,
            "adGroupName": row.ad_group_name,
            "searchTerm": row.search_term,
            "cost": row.cost,
            "impressions": row.impressions,
            "clicks": row.clicks,
            "conversions": row.conversions,
            "destinationUrl": row.destination_url,
        }
    return row


def row_key(row: dict[str, Any]) -> str:
    return f"{row.get('adGroupId', '')}\t{norm_text(row.get('searchTerm', ''))}"


def scope_matches(row: dict[str, Any], campaign_id: str, ad_group_id: str, scope: str) -> bool:
    if str(row.get("campaignId", "")) != campaign_id:
        return False
    return scope == "CAMPAIGN" or str(row.get("adGroupId", "")) == ad_group_id


def primary_page_contains_phrase(
    site_contexts: dict[str, SiteContext],
    reviewed_rows: list[dict[str, Any]],
    campaign_id: str,
    ad_group_id: str,
    scope: str,
    phrase: str,
) -> bool:
    urls = {
        str(row.get("destinationUrl", ""))
        for row in reviewed_rows
        if scope_matches(row, campaign_id, ad_group_id, scope) and row.get("destinationUrl")
    }
    for url in urls:
        context = site_contexts.get(url)
        if not context or not context.primary_page:
            continue
        primary_text = f"{context.primary_page.title} {context.primary_page.text}"
        if contains_phrase(primary_text, phrase):
            return True
    return False


def positive_keyword_overlaps(
    keyword_criteria: list[dict[str, Any]],
    campaign_id: str,
    ad_group_id: str,
    scope: str,
    phrase: str,
) -> list[dict[str, Any]]:
    return [
        criterion
        for criterion in keyword_criteria
        if not criterion.get("negative")
        and str(criterion.get("campaignId", "")) == campaign_id
        and (scope == "CAMPAIGN" or str(criterion.get("adGroupId", "")) == ad_group_id)
        and contains_phrase(criterion.get("text", ""), phrase)
    ]


def existing_phrase_negative(
    keyword_criteria: list[dict[str, Any]],
    campaign_id: str,
    ad_group_id: str,
    scope: str,
    phrase: str,
) -> bool:
    return any(
        criterion.get("negative")
        and str(criterion.get("matchType", "")).upper() == "PHRASE"
        and str(criterion.get("scope", "")).upper() == scope
        and str(criterion.get("campaignId", "")) == campaign_id
        and (scope == "CAMPAIGN" or str(criterion.get("adGroupId", "")) == ad_group_id)
        and normalized_phrase(criterion.get("text", "")) == phrase
        for criterion in keyword_criteria
    )


def generic_or_ambiguous(phrase: str, category: str) -> bool:
    tokens = phrase_tokens(phrase)
    if not tokens:
        return True
    if category == "unsupported_location":
        return True
    if phrase in GENERIC_PHRASES:
        return True
    if len(tokens) == 1:
        token = tokens[0]
        return (
            category != "competitor_brand"
            or len(token) < 4
            or token in GENERIC_SINGLE_WORDS
            or not token.isalpha()
        )
    return all(token in GENERIC_SINGLE_WORDS for token in tokens)


def build_negative_phrase_candidates(
    reviewed_rows: list[dict[str, Any]],
    safety_search_terms: list[SearchTermRecord | dict[str, Any]],
    keyword_criteria: list[dict[str, Any]],
    site_contexts: dict[str, SiteContext],
    *,
    phrase_suggestions_requested: bool = False,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    safety_rows = [safety_row_dict(row) for row in safety_search_terms]
    reviewed_by_key = {row_key(row): row for row in reviewed_rows}
    existing_negative_term_keys = {
        f"{criterion.get('adGroupId', '')}\t{norm_text(criterion.get('text', ''))}"
        for criterion in keyword_criteria
        if criterion.get("negative") and criterion.get("scope") == "AD_GROUP"
    }

    seed_groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for row in reviewed_rows:
        phrase = normalized_phrase(row.get("negativePhraseSeed", ""))
        if row.get("proposedAction") != "negative exact" or not phrase:
            continue
        seed_groups.setdefault((str(row.get("campaignId", "")), phrase), []).append(row)

    eligible: list[dict[str, Any]] = []
    suppressed: list[dict[str, Any]] = []

    for (campaign_id, phrase), seed_rows in sorted(seed_groups.items()):
        campaign_name = str(seed_rows[0].get("campaignName", ""))
        categories = Counter(str(row.get("mismatchCategory", "other")) for row in seed_rows)
        category = categories.most_common(1)[0][0]
        distinct_seed_ad_groups = sorted({str(row.get("adGroupId", "")) for row in seed_rows})
        scope = "CAMPAIGN" if category == "competitor_brand" or len(distinct_seed_ad_groups) > 1 else "AD_GROUP"
        ad_group_id = "" if scope == "CAMPAIGN" else distinct_seed_ad_groups[0]
        ad_group_name = ""
        if ad_group_id:
            ad_group_name = next(
                (str(row.get("adGroupName", "")) for row in seed_rows if str(row.get("adGroupId", "")) == ad_group_id),
                "",
            )

        matching_reviewed = [
            row
            for row in reviewed_rows
            if scope_matches(row, campaign_id, ad_group_id, scope)
            and contains_phrase(row.get("searchTerm", ""), phrase)
        ]
        matching_safety = [
            row
            for row in safety_rows
            if scope_matches(row, campaign_id, ad_group_id, scope)
            and contains_phrase(row.get("searchTerm", ""), phrase)
        ]
        supporting_rows = [
            row
            for row in matching_reviewed
            if row.get("proposedAction") == "negative exact"
            and row.get("relevance") == "mismatch"
            and bool(row.get("mismatchIsClear"))
        ]
        unexplained_observed_rows = [
            row
            for row in matching_safety
            if row_key(row) not in reviewed_by_key and row_key(row) not in existing_negative_term_keys
        ]
        positive_overlaps = positive_keyword_overlaps(
            keyword_criteria,
            campaign_id,
            ad_group_id,
            scope,
            phrase,
        )
        distinct_search_terms = sorted({norm_text(row.get("searchTerm", "")) for row in supporting_rows})
        distinct_ad_groups = sorted({str(row.get("adGroupId", "")) for row in supporting_rows})
        total_clicks = sum(int(row.get("clicks") or 0) for row in matching_safety)
        total_cost = round(sum(float(row.get("cost") or 0) for row in matching_safety), 6)
        recurrence = len(distinct_search_terms) >= 2 or len(distinct_ad_groups) >= 2
        one_off_competitor = category == "competitor_brand" and total_clicks >= 1
        clear_paid_waste = (
            category in OBVIOUS_WASTE_CATEGORIES
            and total_clicks >= 1
            and total_cost > 0
        )
        observed_variant = all(contains_phrase(row.get("searchTerm", ""), phrase) for row in seed_rows)
        all_reviewed_mismatch = bool(matching_reviewed) and all(
            row.get("proposedAction") == "negative exact"
            and row.get("relevance") == "mismatch"
            and bool(row.get("mismatchIsClear"))
            for row in matching_reviewed
        )

        gates = {
            "zeroConversions": all(float(row.get("conversions") or 0) <= 0 for row in matching_safety),
            "allReviewedMatchesNegativeExact": all_reviewed_mismatch,
            "allObservedQueriesAccountedFor": not unexplained_observed_rows,
            "noPositiveKeywordOverlap": not positive_overlaps,
            "absentFromLandingPage": not primary_page_contains_phrase(
                site_contexts,
                reviewed_rows,
                campaign_id,
                ad_group_id,
                scope,
                phrase,
            ),
            "specificEnough": not generic_or_ambiguous(phrase, category),
            "observedVariantOnly": observed_variant,
            "evidenceThreshold": recurrence or one_off_competitor,
            "categoryConsistent": len(categories) == 1,
            "notAlreadyNegativePhrase": not existing_phrase_negative(
                keyword_criteria,
                campaign_id,
                ad_group_id,
                scope,
                phrase,
            ),
            "explicitlyRequestedOrClearPaidWaste": phrase_suggestions_requested or clear_paid_waste,
        }
        suppression_reasons = [name for name, passed in gates.items() if not passed]
        evidence = {
            "termIds": [str(row.get("term_id") or row.get("termId") or "") for row in supporting_rows],
            "searchTerms": sorted({str(row.get("searchTerm", "")) for row in supporting_rows}),
            "observedSearchTerms": sorted({str(row.get("searchTerm", "")) for row in matching_safety}),
            "distinctSearchTerms": len(distinct_search_terms),
            "distinctAdGroups": len(distinct_ad_groups),
            "cost": total_cost,
            "impressions": sum(int(row.get("impressions") or 0) for row in matching_safety),
            "clicks": total_clicks,
            "conversions": round(sum(float(row.get("conversions") or 0) for row in matching_safety), 6),
            "observedQueryCount": len(matching_safety),
            "clearPaidWaste": clear_paid_waste,
        }
        suggestion_trigger = "user_requested" if phrase_suggestions_requested else "clear_paid_waste"
        candidate = {
            "candidateId": "",
            "text": phrase,
            "matchType": "PHRASE",
            "scope": scope,
            "campaignId": campaign_id,
            "campaignName": campaign_name,
            "adGroupId": ad_group_id,
            "adGroupName": ad_group_name,
            "category": category,
            "confidence": "high" if not suppression_reasons else "suppressed",
            "recommendationPriority": "secondary",
            "suggestionOnly": True,
            "suggestionTrigger": suggestion_trigger if not suppression_reasons else "",
            "reason": (
                (
                    f"Secondary phrase suggestion from explicit user request; "
                    if phrase_suggestions_requested and not suppression_reasons
                    else (
                        f"Secondary phrase suggestion because {total_clicks} zero-conversion click(s) "
                        f"spent {total_cost:.2f}; "
                        if clear_paid_waste and not suppression_reasons
                        else "Suppressed secondary phrase suggestion; "
                    )
                )
                + f"{category.replace('_', ' ')} evidence from "
                + f"{len(supporting_rows)} reviewed mismatch row(s)"
            ),
            "evidence": evidence,
            "gates": gates,
        }
        if suppression_reasons:
            candidate["suppressionReasons"] = suppression_reasons
            candidate["positiveKeywordOverlaps"] = positive_overlaps
            candidate["unexplainedObservedSearchTerms"] = [
                str(row.get("searchTerm", "")) for row in unexplained_observed_rows
            ]
            suppressed.append(candidate)
        else:
            eligible.append(candidate)

    eligible.sort(key=lambda row: (row["campaignName"], row["scope"], row["adGroupName"], row["text"]))
    suppressed.sort(key=lambda row: (row["campaignName"], row["scope"], row["adGroupName"], row["text"]))
    for index, candidate in enumerate(eligible, start=1):
        candidate["candidateId"] = f"np{index}"
    for index, candidate in enumerate(suppressed, start=1):
        candidate["candidateId"] = f"snp{index}"
    return eligible, suppressed
