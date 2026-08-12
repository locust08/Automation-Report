#!/usr/bin/env python
"""Project-owned priority selector; the review skill remains unchanged."""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SKILL_SCRIPTS = ROOT / ".agents" / "skills" / "google-ads-search-term-review-agent" / "scripts"
sys.path.insert(0, str(SKILL_SCRIPTS))

from google_ads_pull import default_date_range, pull_search_terms  # noqa: E402


def key(row: object) -> str:
    return f"{row.campaign_id}|{row.ad_group_id}|{' '.join(row.search_term.strip().lower().split())}"


def sort_rows(rows: list[object]) -> list[object]:
    return sorted(rows, key=lambda row: (-float(row.cost or 0), -int(row.impressions or 0), key(row)))


def main() -> None:
    start, end = default_date_range()
    parser = argparse.ArgumentParser()
    parser.add_argument("customer_id")
    parser.add_argument("output")
    parser.add_argument("--start-date", default=start)
    parser.add_argument("--end-date", default=end)
    args = parser.parse_args()
    rows = pull_search_terms(args.customer_id, args.start_date, args.end_date).rows
    rows = sort_rows(rows)
    pathlib.Path(args.output).write_text(json.dumps([key(row) for row in rows], indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
