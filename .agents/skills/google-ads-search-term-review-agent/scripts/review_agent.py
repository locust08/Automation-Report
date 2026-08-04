from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from google_ads_pull import SearchTermRecord, norm_text
from site_context import SiteContext

ActionType = Literal["negative exact", "add exact", "special review needed", "no action"]
RelevanceType = Literal["match", "mismatch", "ambiguous"]
ReasoningEffort = Literal["none", "minimal", "low", "medium", "high", "xhigh"]
MismatchCategory = Literal[
    "none",
    "competitor_brand",
    "wrong_product",
    "wrong_service",
    "portal_navigation",
    "stable_irrelevant_intent",
    "unsupported_location",
    "informational_research",
    "other",
]


class TermDecision(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    term_id: str = Field(alias="termId")
    proposed_action: ActionType = Field(alias="proposedAction")
    relevance: RelevanceType
    mismatch_is_clear: bool = Field(alias="mismatchIsClear")
    reason: str
    mismatch_category: MismatchCategory = Field(default="none", alias="mismatchCategory")
    negative_phrase_seed: str = Field(default="", alias="negativePhraseSeed")


class BatchReview(BaseModel):
    decisions: list[TermDecision]


AGENT_INSTRUCTIONS = """
You review Google Ads search terms against landing-page evidence.

Classify every provided term as exactly one of:
- negative exact
- add exact
- special review needed
- no action

Decision rules:
- Use negative exact only when the search term intent does not match the destination URL offer.
- Strong mismatch examples include calculator, government portal/payment/checking, document template, job seeker, definition/research, unrelated provider, unrelated service, unrelated product, unsupported geography, or clearly different offer.
- Use special review needed when a term has conversions and would otherwise be negative exact.
- Use add exact only when the term has conversions and the term matches the destination URL offer.
- Use no action for matching terms without conversions, ambiguous terms, partial matches, and converting terms whose page fit is not clear enough.

The destination URL is primary evidence. Supporting same-domain pages can clarify the business, but they do not override a specific destination-page offer.
Return concise reasons tied to the page offer. Return one decision for every termId.

For a clear zero-conversion mismatch, also return:
- mismatchCategory: one of competitor_brand, wrong_product, wrong_service,
  portal_navigation, stable_irrelevant_intent, unsupported_location,
  informational_research, other
- negativePhraseSeed: the shortest self-contained phrase that captures the
  irrelevant entity or intent, using only words that appear together in the
  observed search term. Use an empty string when no phrase is safely reusable.

Phrase-seed guidance:
- Good seeds: an unambiguous competitor name such as "coway", or a stable
  product mismatch such as "bottom load".
- When the reusable seed is a named unrelated brand or provider, use
  competitor_brand even if the full query also asks for contact, support,
  reviews, or a portal. This keeps the seed category consistent across variants.
- Keep generic product/service words, locations, short ambiguous abbreviations,
  and supported offer language out of phrase seeds.
- Do not invent spelling variants. Each seed must be visibly present in the
  search term in the same word order.
- Phrase seeds are suggestions only; deterministic safety checks decide whether
  a negative phrase proposal is allowed.

Batch metadata applies to every term in the batch. Do not require repeated campaign,
ad group, or destination URL fields on each term.
""".strip()


def term_payload(row: SearchTermRecord) -> dict[str, Any]:
    return {
        "termId": row.term_id,
        "searchTerm": row.search_term,
        "cost": round(row.cost, 2),
        "impressions": row.impressions,
        "clicks": row.clicks,
        "conversions": row.conversions,
    }


async def run_agent_batch(
    rows: list[SearchTermRecord],
    site_context: SiteContext,
    model: str | None = None,
    reasoning_effort: ReasoningEffort = "medium",
) -> list[TermDecision]:
    from agents import Agent, ModelSettings, Runner
    from openai.types.shared.reasoning import Reasoning

    agent = Agent(
        name="Google Ads Search Term Reviewer",
        instructions=AGENT_INSTRUCTIONS,
        model=model or os.environ.get("OPENAI_SEARCH_TERM_REVIEW_MODEL", "gpt-5.6-sol"),
        model_settings=ModelSettings(reasoning=Reasoning(effort=reasoning_effort)),
        output_type=BatchReview,
    )
    first_row = rows[0] if rows else None
    payload = {
        "campaign": first_row.campaign_name if first_row else "",
        "campaignId": first_row.campaign_id if first_row else "",
        "adGroup": first_row.ad_group_name if first_row else "",
        "adGroupId": first_row.ad_group_id if first_row else "",
        "destinationUrl": site_context.destination_url,
        "landingPageAndWebsiteEvidence": site_context.combined_text(),
        "crawlLimited": site_context.crawl_limited,
        "terms": [term_payload(row) for row in rows],
    }
    result = await Runner.run(agent, json.dumps(payload, ensure_ascii=False))
    output = result.final_output
    if isinstance(output, BatchReview):
        return output.decisions
    if isinstance(output, dict):
        return BatchReview.model_validate(output).decisions
    if isinstance(output, str):
        return BatchReview.model_validate_json(output).decisions
    return BatchReview.model_validate(output).decisions


def fixture_decision(row: SearchTermRecord) -> TermDecision:
    term = norm_text(row.search_term)
    mismatch = re.search(r"\b(calculator|job|jobs|career|template|pdf|government|portal|login|definition|meaning)\b", term)
    if mismatch:
        return TermDecision.model_validate({
            "term_id": row.term_id,
            "proposedAction": "negative exact",
            "relevance": "mismatch",
            "mismatchIsClear": True,
            "reason": "Intent does not match the landing page offer",
            "mismatchCategory": "stable_irrelevant_intent",
            "negativePhraseSeed": mismatch.group(1),
        })
    if row.conversions > 0:
        return TermDecision.model_validate({
            "term_id": row.term_id,
            "proposedAction": "add exact",
            "relevance": "match",
            "mismatchIsClear": False,
            "reason": "Relevant converting term matches the destination URL offer",
        })
    return TermDecision.model_validate({
        "term_id": row.term_id,
        "proposedAction": "no action",
        "relevance": "match",
        "mismatchIsClear": False,
        "reason": "Search term matches the destination URL offer, but has no conversions",
    })


def post_process_decision(row: SearchTermRecord, decision: TermDecision | None) -> dict[str, Any]:
    if decision is None:
        action: ActionType = "no action"
        relevance: RelevanceType = "ambiguous"
        mismatch_is_clear = False
        reason = "No valid agent decision returned; kept for manual review"
    else:
        action = decision.proposed_action
        relevance = decision.relevance
        mismatch_is_clear = decision.mismatch_is_clear
        reason = decision.reason.strip() or "Search term reviewed"
        mismatch_category: MismatchCategory = decision.mismatch_category
        negative_phrase_seed = norm_text(decision.negative_phrase_seed)

    if decision is None:
        mismatch_category = "none"
        negative_phrase_seed = ""

    if action == "add exact" and row.conversions <= 0:
        action = "no action"
        relevance = "match" if relevance == "match" else "ambiguous"
        mismatch_is_clear = False
        reason = "Search term reviewed as relevant, but has no conversions"

    if action == "negative exact" and row.conversions > 0:
        action = "special review needed"
        reason = "Converting term was proposed as negative exact; requires manual review before exclusion"

    if action == "special review needed" and row.conversions <= 0:
        action = "no action"
        relevance = "ambiguous" if relevance == "mismatch" else relevance
        mismatch_is_clear = False
        reason = "Search term was marked for special review, but has no conversions"

    if action == "negative exact" and relevance != "mismatch":
        action = "no action"
        mismatch_is_clear = False
        reason = "Search term reviewed, but mismatch evidence is not clear enough to exclude"

    if action == "add exact" and relevance != "match":
        action = "no action"
        reason = "Search term has conversions, but landing-page match is not clear enough to add exact"

    if action != "negative exact" or relevance != "mismatch" or not mismatch_is_clear:
        mismatch_category = "none"
        negative_phrase_seed = ""

    row_dict = row.to_dict()
    row_dict.update({
        "searchTerm": row.search_term,
        "campaignId": row.campaign_id,
        "campaignName": row.campaign_name,
        "adGroupId": row.ad_group_id,
        "adGroupName": row.ad_group_name,
        "destinationUrl": row.destination_url,
        "destinationUrls": row.destination_urls,
        "proposedAction": action,
        "specialReview": "yes" if action == "special review needed" else "",
        "specialReviewProposedAction": "add exact" if action == "special review needed" else "",
        "relevance": relevance,
        "mismatchIsClear": mismatch_is_clear,
        "mismatchCategory": mismatch_category,
        "negativePhraseSeed": negative_phrase_seed,
        "reason": reason,
    })
    return row_dict


def group_rows_by_destination(rows: list[SearchTermRecord]) -> dict[tuple[str, str], list[SearchTermRecord]]:
    groups: dict[tuple[str, str], list[SearchTermRecord]] = {}
    for row in rows:
        groups.setdefault((row.ad_group_id, row.destination_url), []).append(row)
    return groups


async def review_rows(
    rows: list[SearchTermRecord],
    site_contexts: dict[str, SiteContext],
    batch_size: int = 80,
    concurrency: int = 20,
    dry_run_fixture: bool = False,
    model: str | None = None,
    reasoning_effort: ReasoningEffort = "medium",
) -> list[dict[str, Any]]:
    jobs: list[tuple[int, list[SearchTermRecord], SiteContext]] = []
    ordinal = 0
    for (_, destination_url), group in group_rows_by_destination(rows).items():
        context = site_contexts.get(destination_url) or SiteContext(destination_url=destination_url, domain="", primary_page=None, pages=[], crawl_limited=True, errors=["missing_site_context"])
        for i in range(0, len(group), batch_size):
            batch = group[i : i + batch_size]
            jobs.append((ordinal, batch, context))
            ordinal += 1

    async def run_job(job: tuple[int, list[SearchTermRecord], SiteContext]) -> tuple[int, list[dict[str, Any]]]:
        job_ordinal, batch, context = job
        if dry_run_fixture:
            decisions = [fixture_decision(row) for row in batch]
        else:
            decisions = await run_agent_batch(batch, context, model=model, reasoning_effort=reasoning_effort)
        by_id = {decision.term_id: decision for decision in decisions}
        return job_ordinal, [post_process_decision(row, by_id.get(row.term_id)) for row in batch]

    if dry_run_fixture:
        results = [await run_job(job) for job in jobs]
    else:
        semaphore = asyncio.Semaphore(max(1, concurrency))

        async def run_limited(job: tuple[int, list[SearchTermRecord], SiteContext]) -> tuple[int, list[dict[str, Any]]]:
            async with semaphore:
                return await run_job(job)

        results = await asyncio.gather(*(run_limited(job) for job in jobs))

    reviewed: list[dict[str, Any]] = []
    for _, batch_rows in sorted(results, key=lambda item: item[0]):
        reviewed.extend(batch_rows)
    return reviewed


def review_rows_sync(*args: Any, **kwargs: Any) -> list[dict[str, Any]]:
    try:
        return asyncio.run(review_rows(*args, **kwargs))
    except ValidationError as exc:
        raise RuntimeError(f"Agent returned invalid structured review output: {exc}") from exc
