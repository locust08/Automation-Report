#!/usr/bin/env python
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
from datetime import datetime
from typing import Any

from google_ads_pull import PullResult, SearchTermRecord, build_fixture_pull_result, default_date_range, pull_search_terms, strip_dashes
from phrase_candidates import build_negative_phrase_candidates
from render_outputs import action_counts, write_outputs
from review_agent import review_rows_sync
from site_context import crawl_site, fixture_site_context


def parse_args() -> argparse.Namespace:
    start_date, end_date = default_date_range()
    parser = argparse.ArgumentParser(description="Generate a read-only Google Ads search term review proposal.")
    parser.add_argument("customer_id", help="Google Ads customer ID / CID")
    parser.add_argument("--start-date", default=start_date, help="Start date YYYY-MM-DD. Defaults to past 30 days inclusive.")
    parser.add_argument("--end-date", default=end_date, help="End date YYYY-MM-DD. Defaults to local today.")
    parser.add_argument("--campaign-name", default="", help="Limit the review to one exact campaign name.")
    parser.add_argument("--out-dir", default="outputs", help="Curated output directory for Markdown and CSV.")
    parser.add_argument("--tmp-dir", default="tmp", help="Intermediate output directory for full JSON.")
    parser.add_argument("--max-pages", type=int, default=50, help="Maximum same-domain pages to crawl per destination URL.")
    parser.add_argument("--max-depth", type=int, default=2, help="Maximum same-domain crawl depth.")
    parser.add_argument("--crawl-concurrency", type=int, default=8, help="Maximum concurrent destination URL crawls.")
    parser.add_argument("--limit-terms", type=int, default=0, help="Limit terms after pull; intended for smoke tests.")
    parser.add_argument("--exclude-term-keys-file", default="", help="JSON array of stable term keys already analyzed.")
    parser.add_argument("--max-new-terms", type=int, default=250, help="Maximum newly discovered terms to analyze in one run.")
    parser.add_argument("--job-status-path", default="", help="Optional job status JSON updated with incremental progress.")
    parser.add_argument("--snapshot-file", default="", help="Normalized Google search-term snapshot; avoids fetching Google Ads again.")
    parser.add_argument("--batch-size", type=int, default=80, help="Terms per agent batch.")
    parser.add_argument("--concurrency", type=int, default=20, help="Maximum concurrent OpenAI reviewer batches.")
    parser.add_argument("--model", default="", help="Override OpenAI model. Defaults to OPENAI_SEARCH_TERM_REVIEW_MODEL or gpt-5.6-sol.")
    parser.add_argument(
        "--suggest-negative-phrases",
        action="store_true",
        help=(
            "Include all high-confidence negative phrase suggestions. Without this option, "
            "only candidates with obvious zero-conversion paid waste are proposed."
        ),
    )
    parser.add_argument(
        "--reasoning-effort",
        choices=["none", "minimal", "low", "medium", "high", "xhigh"],
        default="medium",
        help="OpenAI reasoning effort for reviewer batches. Defaults to medium.",
    )
    parser.add_argument("--dry-run-agent-fixture", action="store_true", help="Use local fixture data and deterministic review; makes no Google Ads, website, or OpenAI API calls.")
    return parser.parse_args()


def build_site_contexts(destination_urls: list[str], args: argparse.Namespace) -> dict[str, Any]:
    contexts: dict[str, Any] = {}
    if args.dry_run_agent_fixture:
        for url in destination_urls:
            contexts[url] = fixture_site_context(url)
        return contexts

    max_workers = max(1, min(args.crawl_concurrency, len(destination_urls) or 1))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_by_url = {
            executor.submit(crawl_site, url, max_pages=args.max_pages, max_depth=args.max_depth): url
            for url in destination_urls
        }
        for future in as_completed(future_by_url):
            url = future_by_url[future]
            contexts[url] = future.result()
    return contexts


def main() -> None:
    args = parse_args()
    if args.snapshot_file:
        with open(args.snapshot_file, "r", encoding="utf-8") as handle:
            snapshot = json.load(handle)["pull"]
        snapshot["rows"] = [SearchTermRecord(**row) for row in snapshot.get("rows", [])]
        snapshot["safety_search_terms"] = [SearchTermRecord(**row) for row in snapshot.get("safety_search_terms", [])]
        pull = PullResult(**snapshot)
    elif args.dry_run_agent_fixture:
        pull = build_fixture_pull_result(args.customer_id, args.start_date, args.end_date)
    else:
        pull = pull_search_terms(
            args.customer_id,
            args.start_date,
            args.end_date,
            campaign_name=args.campaign_name,
        )

    def stable_key(row: Any) -> str:
        return f"{row.campaign_id}|{row.ad_group_id}|{' '.join(row.search_term.strip().lower().split())}"

    excluded_keys: set[str] = set()
    if args.exclude_term_keys_file:
        with open(args.exclude_term_keys_file, "r", encoding="utf-8") as handle:
            excluded_keys = {str(value) for value in json.load(handle)}
    current_rows = pull.rows
    new_rows = [row for row in current_rows if stable_key(row) not in excluded_keys]
    queued_new_terms = max(0, len(new_rows) - max(1, args.max_new_terms))
    rows = new_rows[: max(1, args.max_new_terms)]
    if args.limit_terms and args.limit_terms > 0:
        rows = rows[: args.limit_terms]
    if args.job_status_path:
        try:
            with open(args.job_status_path, "r", encoding="utf-8") as handle:
                status = json.load(handle)
            status.update({
                "stage": f"Analyzing {len(rows)} new search terms" if rows else "No new terms — loading saved analysis",
                "updatedAt": datetime.now().isoformat(timespec="seconds"),
            })
            temporary_status_path = f"{args.job_status_path}.{os.getpid()}.tmp"
            with open(temporary_status_path, "w", encoding="utf-8") as handle:
                json.dump(status, handle, indent=2)
            os.replace(temporary_status_path, args.job_status_path)
        except (OSError, ValueError):
            pass
    destination_urls = sorted({row.destination_url for row in rows if row.destination_url})
    site_contexts = build_site_contexts(destination_urls, args)
    reviewed_rows = review_rows_sync(
        rows,
        site_contexts,
        batch_size=args.batch_size,
        concurrency=args.concurrency,
        dry_run_fixture=args.dry_run_agent_fixture,
        model=args.model or None,
        reasoning_effort=args.reasoning_effort,
    )
    negative_phrase_candidates, suppressed_negative_phrase_candidates = build_negative_phrase_candidates(
        reviewed_rows,
        pull.safety_search_terms,
        pull.keyword_criteria,
        site_contexts,
        phrase_suggestions_requested=args.suggest_negative_phrases,
    )

    plan = {
        "ok": True,
        "mode": "proposal",
        "customerId": args.customer_id,
        "customerIdNormalized": strip_dashes(args.customer_id),
        "customerName": pull.customer_name,
        "dateRange": pull.date_range,
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "apiVersion": pull.api_version,
        "loginCustomerIdUsed": pull.login_customer_id_used,
        "source": {
            "rawSearchTermRows": pull.raw_search_term_rows,
            "uniqueSearchTerms": pull.unique_search_terms,
            "unreviewedSearchTermsPulled": len(pull.rows),
            "termsReviewed": len(reviewed_rows),
            "existingAdGroupKeywordMatchesSkipped": pull.existing_ad_group_keyword_matches_skipped,
            "safetySearchTerms": len(pull.safety_search_terms),
            "existingKeywordCriteria": len(pull.keyword_criteria),
            "activeSearchCampaignsOnly": pull.active_search_campaigns_only,
            "activeAdGroupsOnly": True,
            "campaignNameFilter": args.campaign_name or None,
            "mutatingGoogleAdsChanges": False,
            "dryRunAgentFixture": bool(args.dry_run_agent_fixture),
            "negativePhraseSuggestionsRequested": bool(args.suggest_negative_phrases),
            "currentTerms": len(current_rows),
            "newTerms": len(new_rows),
            "analyzedNewTerms": len(rows),
            "queuedNewTerms": queued_new_terms,
        },
        "reviewer": {
            "model": args.model or os.environ.get("OPENAI_SEARCH_TERM_REVIEW_MODEL", "gpt-5.6-sol"),
            "reasoningEffort": args.reasoning_effort,
            "batchSize": args.batch_size,
            "concurrency": args.concurrency,
            "crawlConcurrency": args.crawl_concurrency,
        },
        "siteContexts": {url: context.to_dict() for url, context in site_contexts.items()},
        "safetyCorpus": {
            "searchTerms": [row.to_dict() for row in pull.safety_search_terms],
            "keywordCriteria": pull.keyword_criteria,
        },
        "allRows": reviewed_rows,
        "currentSearchTerms": [row.to_dict() for row in current_rows],
        "negativePhraseSuggestionPolicy": {
            "priority": "secondary",
            "suggestionOnly": True,
            "explicitRequest": bool(args.suggest_negative_phrases),
            "defaultTrigger": "clear_paid_waste_only",
        },
        "negativePhraseCandidates": negative_phrase_candidates,
        "suppressedNegativePhraseCandidates": suppressed_negative_phrase_candidates,
    }
    paths = write_outputs(plan, args.out_dir, args.tmp_dir)
    counts = action_counts(reviewed_rows)
    phrase_summary_counts = {}
    if args.suggest_negative_phrases or negative_phrase_candidates:
        phrase_summary_counts = {
            "negativePhraseCampaign": sum(
                1 for row in negative_phrase_candidates if row.get("scope") == "CAMPAIGN"
            ),
            "negativePhraseAdGroup": sum(
                1 for row in negative_phrase_candidates if row.get("scope") == "AD_GROUP"
            ),
            "suppressedNegativePhrase": len(suppressed_negative_phrase_candidates),
        }
    summary = {
        "ok": True,
        "customerId": args.customer_id,
        "customerName": pull.customer_name,
        "dateRange": pull.date_range,
        "counts": {
            "negativeExact": counts["negative exact"],
            "addExact": counts["add exact"],
            "specialReviewNeeded": counts["special review needed"],
            "noAction": counts["no action"],
            **phrase_summary_counts,
            "totalReviewed": len(reviewed_rows),
        },
        **paths,
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
