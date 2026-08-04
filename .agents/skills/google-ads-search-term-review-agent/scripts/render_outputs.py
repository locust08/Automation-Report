from __future__ import annotations

import csv
import json
from collections import Counter
from io import StringIO
from pathlib import Path
from typing import Any


def money(value: Any) -> str:
    try:
        return f"{float(value or 0):.2f}"
    except (TypeError, ValueError):
        return "0.00"


def md_escape(value: Any) -> str:
    return str(value or "").replace("|", "\\|").replace("\n", " ")


def is_special_review(row: dict[str, Any]) -> bool:
    return row.get("proposedAction") == "special review needed"


def special_review_value(row: dict[str, Any]) -> str:
    if row.get("specialReview"):
        return str(row.get("specialReview") or "")
    return "yes" if is_special_review(row) else ""


def special_review_proposed_action(row: dict[str, Any]) -> str:
    if row.get("specialReviewProposedAction"):
        return str(row.get("specialReviewProposedAction") or "")
    return "add exact" if is_special_review(row) else ""


def action_counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    counts = Counter(row.get("proposedAction", "no action") for row in rows)
    return {
        "negative exact": counts.get("negative exact", 0),
        "add exact": counts.get("add exact", 0),
        "special review needed": counts.get("special review needed", 0),
        "no action": counts.get("no action", 0),
    }


def phrase_action_counts(plan: dict[str, Any]) -> dict[str, int]:
    candidates = plan.get("negativePhraseCandidates", [])
    return {
        "campaign": sum(1 for row in candidates if row.get("scope") == "CAMPAIGN"),
        "ad group": sum(1 for row in candidates if row.get("scope") == "AD_GROUP"),
        "suppressed": len(plan.get("suppressedNegativePhraseCandidates", [])),
    }


def phrase_gate_summary(row: dict[str, Any]) -> str:
    return ", ".join(name for name, passed in (row.get("gates") or {}).items() if passed)


def sort_action_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    action_priority = {
        "special review needed": 0,
        "negative exact": 1,
        "add exact": 2,
    }
    return sorted(
        rows,
        key=lambda row: (
            action_priority.get(str(row.get("proposedAction", "")), 9),
            str(row.get("adGroupName", "")),
            str(row.get("destinationUrl", "")),
            str(row.get("proposedAction", "")),
            -float(row.get("cost") or 0),
            -int(row.get("impressions") or 0),
        ),
    )


def render_markdown(plan: dict[str, Any]) -> str:
    rows = plan.get("allRows", [])
    counts = action_counts(rows)
    phrase_counts = phrase_action_counts(plan)
    phrase_candidates = plan.get("negativePhraseCandidates", [])
    phrase_review_requested = bool(
        (plan.get("negativePhraseSuggestionPolicy") or {}).get("explicitRequest")
    )
    show_phrase_summary = bool(phrase_candidates) or phrase_review_requested
    action_rows = sort_action_rows([row for row in rows if row.get("proposedAction") != "no action"])
    lines: list[str] = []
    lines.append("# Google Ads Search Term Action Proposal")
    lines.append("")
    lines.append(f"Customer ID: {plan.get('customerId', '')}")
    if plan.get("customerName"):
        lines.append(f"Account: {plan['customerName']}")
    date_range = plan.get("dateRange", {})
    lines.append(f"Date range: {date_range.get('startDate', '')} to {date_range.get('endDate', '')}")
    lines.append(f"Source: Google Ads API {plan.get('apiVersion', '')}; active Search campaigns and active ad groups only.")
    lines.append("")
    lines.append("| Action Type | Count |")
    lines.append("| --- | ---: |")
    lines.append(f"| Negative exact | {counts['negative exact']} |")
    lines.append(f"| Add exact | {counts['add exact']} |")
    lines.append(f"| Special review needed | {counts['special review needed']} |")
    lines.append(f"| No action | {counts['no action']} |")
    lines.append(f"| Total reviewed | {len(rows)} |")
    if show_phrase_summary:
        lines.append(f"| Secondary suggestion: negative phrase (campaign) | {phrase_counts['campaign']} |")
        lines.append(f"| Secondary suggestion: negative phrase (ad group) | {phrase_counts['ad group']} |")
        lines.append(f"| Suppressed negative phrase candidates | {phrase_counts['suppressed']} |")
    lines.append("")

    groups: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    for row in action_rows:
        key = (str(row.get("adGroupName", "")), str(row.get("destinationUrl", "")), str(row.get("proposedAction", "")))
        groups.setdefault(key, []).append(row)

    for (ad_group, destination_url, action), group_rows in groups.items():
        lines.append(f"## {md_escape(ad_group)}")
        lines.append("")
        lines.append(f"Destination URL: {destination_url or '(not found)'}")
        lines.append("")
        lines.append(f"Proposed action: {action}")
        lines.append("")
        lines.append("| Search Term | Proposed Action | Special Review | Special Review Proposed Action | Reason | Cost | Impressions | Clicks | Conversions |")
        lines.append("| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |")
        for row in sorted(group_rows, key=lambda item: (-float(item.get("cost") or 0), -int(item.get("impressions") or 0))):
            lines.append(
                f"| {md_escape(row.get('searchTerm'))} | {row.get('proposedAction')} | "
                f"{md_escape(special_review_value(row))} | {md_escape(special_review_proposed_action(row))} | "
                f"{md_escape(row.get('reason'))} | "
                f"{money(row.get('cost'))} | {int(row.get('impressions') or 0)} | {int(row.get('clicks') or 0)} | {money(row.get('conversions'))} |"
            )
        lines.append("")

    if phrase_candidates:
        lines.append("## Secondary suggestions: high-confidence negative phrases")
        lines.append("")
        lines.append(
            "These are suggestion-only candidates. Review and explicitly approve them separately from the primary term-level actions."
        )
        lines.append("")
        lines.append(
            "| Phrase | Scope | Campaign | Ad Group | Trigger | Category | Supporting Terms | Cost | Impressions | Clicks | Conversions | Confidence Evidence |"
        )
        lines.append("| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |")
        for row in sorted(
            phrase_candidates,
            key=lambda item: (
                str(item.get("campaignName", "")),
                str(item.get("scope", "")),
                str(item.get("adGroupName", "")),
                -float((item.get("evidence") or {}).get("cost") or 0),
                str(item.get("text", "")),
            ),
        ):
            evidence = row.get("evidence") or {}
            supporting_terms = ", ".join(f"`{term}`" for term in evidence.get("searchTerms", []))
            lines.append(
                f"| `{md_escape(row.get('text'))}` | {md_escape(row.get('scope'))} | "
                f"{md_escape(row.get('campaignName'))} | {md_escape(row.get('adGroupName'))} | "
                f"{md_escape(row.get('suggestionTrigger'))} | {md_escape(row.get('category'))} | "
                f"{md_escape(supporting_terms)} | {money(evidence.get('cost'))} | "
                f"{int(evidence.get('impressions') or 0)} | {int(evidence.get('clicks') or 0)} | "
                f"{money(evidence.get('conversions'))} | {md_escape(phrase_gate_summary(row))} |"
            )
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def render_csv(plan: dict[str, Any]) -> str:
    rows = sort_action_rows([row for row in plan.get("allRows", []) if row.get("proposedAction") != "no action"])
    phrase_candidates = plan.get("negativePhraseCandidates", [])
    out = StringIO()
    writer = csv.writer(out)
    writer.writerow([
        "Campaign",
        "Campaign ID",
        "Ad Group",
        "Ad Group ID",
        "Destination URL",
        "Search Term",
        "Proposed Action",
        "Scope",
        "Match Type",
        "Confidence",
        "Special Review",
        "Special Review Proposed Action",
        "Reason",
        "Evidence Search Terms",
        "Confidence Evidence",
        "Cost",
        "Impressions",
        "Clicks",
        "Conversions",
    ])
    for row in rows:
        action = str(row.get("proposedAction", ""))
        writer.writerow([
            row.get("campaignName", ""),
            row.get("campaignId", ""),
            row.get("adGroupName", ""),
            row.get("adGroupId", ""),
            row.get("destinationUrl", ""),
            row.get("searchTerm", ""),
            action,
            "AD_GROUP",
            "EXACT" if action in {"negative exact", "add exact"} else "",
            "",
            special_review_value(row),
            special_review_proposed_action(row),
            row.get("reason", ""),
            "",
            "",
            money(row.get("cost")),
            int(row.get("impressions") or 0),
            int(row.get("clicks") or 0),
            money(row.get("conversions")),
        ])
    for row in phrase_candidates:
        evidence = row.get("evidence") or {}
        writer.writerow([
            row.get("campaignName", ""),
            row.get("campaignId", ""),
            row.get("adGroupName", ""),
            row.get("adGroupId", ""),
            "",
            row.get("text", ""),
            "negative phrase suggestion",
            row.get("scope", ""),
            "PHRASE",
            row.get("confidence", ""),
            "",
            "",
            row.get("reason", ""),
            " ; ".join(evidence.get("searchTerms", [])),
            phrase_gate_summary(row),
            money(evidence.get("cost")),
            int(evidence.get("impressions") or 0),
            int(evidence.get("clicks") or 0),
            money(evidence.get("conversions")),
        ])
    return out.getvalue()


def write_outputs(plan: dict[str, Any], out_dir: str | Path, tmp_dir: str | Path) -> dict[str, str]:
    out_path = Path(out_dir)
    tmp_path = Path(tmp_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    tmp_path.mkdir(parents=True, exist_ok=True)

    cid = "".join(ch for ch in str(plan.get("customerId", "")) if ch.isdigit())
    date_range = plan.get("dateRange", {})
    start = str(date_range.get("startDate", "")).replace("-", "")
    end = str(date_range.get("endDate", "")).replace("-", "")
    base = f"google_ads_search_term_review_agent_{cid}_{start}_{end}"
    md_path = out_path / f"{base}.md"
    csv_path = out_path / f"{base}.csv"
    json_path = tmp_path / f"{base}.json"

    md_path.write_text(render_markdown(plan), encoding="utf-8")
    csv_path.write_text(render_csv(plan), encoding="utf-8")
    json_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    return {"markdownPath": str(md_path.resolve()), "csvPath": str(csv_path.resolve()), "jsonPath": str(json_path.resolve())}
