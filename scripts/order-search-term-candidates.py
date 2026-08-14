#!/usr/bin/env python
"""Project-owned priority selector; the review skill remains unchanged."""
from __future__ import annotations

import argparse
from dataclasses import asdict
import json
import pathlib
import hashlib
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
    parser.add_argument("--batch-dir")
    parser.add_argument("--batch-size", type=int, default=250)
    args = parser.parse_args()
    pull = pull_search_terms(args.customer_id, args.start_date, args.end_date)
    pull.rows = sort_rows(pull.rows)[:2500]
    output = pathlib.Path(args.output)
    batch_dir = pathlib.Path(args.batch_dir) if args.batch_dir else output.with_suffix("").with_name(f"{output.stem}-inputs")
    batch_dir.mkdir(parents=True, exist_ok=True)
    manifest_batches = []
    for index, offset in enumerate(range(0, len(pull.rows), args.batch_size), start=1):
        rows = pull.rows[offset:offset + args.batch_size]
        batch_pull = asdict(pull)
        batch_pull["rows"] = [asdict(row) for row in rows]
        payload = json.dumps({"pull": batch_pull}, separators=(",", ":"), ensure_ascii=False)
        batch_path = batch_dir / f"{index:03d}.json"
        batch_path.write_text(payload, encoding="utf-8")
        manifest_batches.append({
            "runNumber": index,
            "termCount": len(rows),
            "file": str(batch_path),
            "checksum": hashlib.sha256(payload.encode("utf-8")).hexdigest(),
        })
    manifest = {
        "customerId": args.customer_id,
        "startDate": args.start_date,
        "endDate": args.end_date,
        "totalTerms": len(pull.rows),
        "expiresAt": None,
        "batches": manifest_batches,
    }
    output.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
