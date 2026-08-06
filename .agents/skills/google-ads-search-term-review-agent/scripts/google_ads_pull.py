from __future__ import annotations

import os
import time
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

GOOGLE_ADS_VERSION = "v23"
DEFAULT_MCCS = ("3666137525", "4114685827")
REQUIRED_GOOGLE_ENV = (
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GOOGLE_OAUTH_REFRESH_TOKEN",
)


@dataclass
class SearchTermRecord:
    term_id: str
    campaign_id: str
    campaign_name: str
    ad_group_id: str
    ad_group_name: str
    search_term: str
    cost: float = 0.0
    impressions: int = 0
    clicks: int = 0
    conversions: float = 0.0
    destination_url: str = ""
    destination_urls: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class PullResult:
    customer_id: str
    customer_name: str
    login_customer_id_used: str | None
    date_range: dict[str, str]
    api_version: str
    raw_search_term_rows: int
    unique_search_terms: int
    existing_ad_group_keyword_matches_skipped: int
    rows: list[SearchTermRecord]
    safety_search_terms: list[SearchTermRecord] = field(default_factory=list)
    keyword_criteria: list[dict[str, Any]] = field(default_factory=list)


def strip_dashes(value: str | int | None) -> str:
    return str(value or "").replace("-", "")


def norm_text(value: str | None) -> str:
    return " ".join(str(value or "").strip().lower().split())


def to_number(value: Any) -> float:
    try:
        n = float(value if value is not None else 0)
    except (TypeError, ValueError):
        return 0.0
    return n if n == n and n not in (float("inf"), float("-inf")) else 0.0


def money_from_micros(value: Any) -> float:
    return to_number(value) / 1_000_000


def default_date_range(today: date | None = None, tz_name: str = "Asia/Kuala_Lumpur") -> tuple[str, str]:
    local_today = today or datetime.now(ZoneInfo(tz_name)).date()
    return (local_today - timedelta(days=29)).isoformat(), local_today.isoformat()


def require_google_ads_env() -> None:
    missing = [key for key in REQUIRED_GOOGLE_ENV if not os.environ.get(key)]
    if missing:
        raise RuntimeError(f"Missing required Google Ads env vars: {', '.join(missing)}")


def get_path(data: dict[str, Any], *paths: str, default: Any = None) -> Any:
    for path in paths:
        current: Any = data
        ok = True
        for part in path.split("."):
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                ok = False
                break
        if ok:
            return current
    return default


def unique(values: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for value in values:
        if value and value not in seen:
            seen.add(value)
            out.append(value)
    return out


def chunked(values: list[str], size: int) -> list[list[str]]:
    return [values[i : i + size] for i in range(0, len(values), size)]


class GoogleAdsRestClient:
    def __init__(self, customer_id: str, timeout_seconds: float = 45.0):
        require_google_ads_env()
        self.customer_id = strip_dashes(customer_id)
        self.timeout_seconds = timeout_seconds
        self.access_token = self._get_access_token()

    def _get_access_token(self) -> str:
        body = {
            "client_id": os.environ["GOOGLE_OAUTH_CLIENT_ID"],
            "client_secret": os.environ["GOOGLE_OAUTH_CLIENT_SECRET"],
            "refresh_token": os.environ["GOOGLE_OAUTH_REFRESH_TOKEN"],
            "grant_type": "refresh_token",
        }
        with httpx.Client(timeout=self.timeout_seconds) as client:
            res = client.post("https://oauth2.googleapis.com/token", data=body)
        if res.status_code >= 400:
            raise RuntimeError(f"OAuth token request failed ({res.status_code}): {res.text}")
        return str(res.json()["access_token"])

    def _headers(self, login_customer_id: str | None) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "developer-token": os.environ["GOOGLE_ADS_DEVELOPER_TOKEN"],
            "Content-Type": "application/json",
        }
        if login_customer_id:
            headers["login-customer-id"] = strip_dashes(login_customer_id)
        return headers

    @retry(
        retry=retry_if_exception_type((httpx.HTTPError, RuntimeError)),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        stop=stop_after_attempt(3),
    )
    def search_page(self, login_customer_id: str | None, query: str, page_token: str = "") -> dict[str, Any]:
        body: dict[str, Any] = {"query": query}
        if page_token:
            body["pageToken"] = page_token
        endpoint = f"https://googleads.googleapis.com/{GOOGLE_ADS_VERSION}/customers/{self.customer_id}/googleAds:search"
        with httpx.Client(timeout=self.timeout_seconds) as client:
            res = client.post(endpoint, headers=self._headers(login_customer_id), json=body)
        if res.status_code >= 400:
            raise RuntimeError(f"Google Ads search failed ({res.status_code}): {res.text}")
        return res.json()

    def search_all(self, login_customer_id: str | None, query: str) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        page_token = ""
        while True:
            page = self.search_page(login_customer_id, query, page_token)
            rows.extend(page.get("results") or [])
            page_token = page.get("nextPageToken") or page.get("next_page_token") or ""
            if not page_token:
                return rows
            time.sleep(0.1)

    def resolve_access(self) -> tuple[str | None, str]:
        candidates = unique([strip_dashes(os.environ.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID")), "", *DEFAULT_MCCS])
        query = "SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1"
        errors: list[str] = []
        for candidate in candidates:
            login_id = candidate or None
            try:
                rows = self.search_all(login_id, query)
                name = str(get_path(rows[0] if rows else {}, "customer.descriptiveName", "customer.descriptive_name", default=""))
                return login_id, name
            except Exception as exc:
                errors.append(f"{candidate or '(direct)'}: {exc}")
        raise RuntimeError("All configured Google Ads access paths failed.\n" + "\n".join(errors))


def build_search_terms_query(start_date: str, end_date: str, campaign_name: str = "") -> str:
    campaign_filter = ""
    if campaign_name:
        escaped_campaign_name = campaign_name.replace("\\", "\\\\").replace("'", "\\'")
        campaign_filter = f"\n  AND campaign.name = '{escaped_campaign_name}'"
    return f"""
SELECT
  campaign.id,
  campaign.name,
  campaign.status,
  campaign.advertising_channel_type,
  ad_group.id,
  ad_group.name,
  ad_group.status,
  search_term_view.search_term,
  metrics.cost_micros,
  metrics.conversions,
  metrics.clicks,
  metrics.impressions
FROM search_term_view
WHERE segments.date BETWEEN '{start_date}' AND '{end_date}'
  AND campaign.status = 'ENABLED'
  AND ad_group.status = 'ENABLED'
  AND campaign.advertising_channel_type = 'SEARCH'{campaign_filter}
ORDER BY ad_group.id, metrics.cost_micros DESC
""".strip()


def aggregate_search_term_rows(rows: list[dict[str, Any]]) -> list[SearchTermRecord]:
    by_key: dict[str, SearchTermRecord] = {}
    for row in rows:
        search_term = str(get_path(row, "searchTermView.searchTerm", "search_term_view.search_term", default="")).strip()
        ad_group_id = str(get_path(row, "adGroup.id", "ad_group.id", default="")).strip()
        if not search_term or not ad_group_id:
            continue
        key = f"{ad_group_id}\t{norm_text(search_term)}"
        record = by_key.get(key)
        if not record:
            record = SearchTermRecord(
                term_id="",
                campaign_id=str(get_path(row, "campaign.id", default="")),
                campaign_name=str(get_path(row, "campaign.name", default="")),
                ad_group_id=ad_group_id,
                ad_group_name=str(get_path(row, "adGroup.name", "ad_group.name", default="")),
                search_term=search_term,
            )
            by_key[key] = record
        metrics = row.get("metrics") or {}
        record.cost += money_from_micros(metrics.get("costMicros", metrics.get("cost_micros")))
        record.impressions += int(to_number(metrics.get("impressions")))
        record.clicks += int(to_number(metrics.get("clicks")))
        record.conversions += to_number(metrics.get("conversions"))

    records = list(by_key.values())
    for index, record in enumerate(records, start=1):
        record.term_id = f"t{index}"
    return records


def existing_key(ad_group_id: str, text: str) -> str:
    return f"{ad_group_id}\t{norm_text(text)}"


def filter_unreviewed_rows(rows: list[SearchTermRecord], existing_ad_group_term_keys: set[str]) -> tuple[list[SearchTermRecord], int]:
    kept: list[SearchTermRecord] = []
    skipped = 0
    for row in rows:
        if existing_key(row.ad_group_id, row.search_term) in existing_ad_group_term_keys:
            skipped += 1
        else:
            kept.append(row)
    return kept, skipped


def get_existing_keyword_state(
    client: GoogleAdsRestClient,
    login_customer_id: str | None,
    ad_group_ids: list[str],
    campaign_ids: list[str],
) -> tuple[set[str], list[dict[str, Any]]]:
    existing: set[str] = set()
    criteria: list[dict[str, Any]] = []
    for ids in chunked(ad_group_ids, 100):
        query = f"""
SELECT
  campaign.id,
  campaign.name,
  ad_group.id,
  ad_group.name,
  ad_group_criterion.resource_name,
  ad_group_criterion.status,
  ad_group_criterion.keyword.text,
  ad_group_criterion.keyword.match_type,
  ad_group_criterion.negative
FROM ad_group_criterion
WHERE ad_group.id IN ({",".join(ids)})
  AND ad_group_criterion.type = KEYWORD
  AND ad_group_criterion.status != REMOVED
""".strip()
        for row in client.search_all(login_customer_id, query):
            campaign_id = str(get_path(row, "campaign.id", default=""))
            campaign_name = str(get_path(row, "campaign.name", default=""))
            ad_group_id = str(get_path(row, "adGroup.id", "ad_group.id", default=""))
            ad_group_name = str(get_path(row, "adGroup.name", "ad_group.name", default=""))
            text = str(get_path(row, "adGroupCriterion.keyword.text", "ad_group_criterion.keyword.text", default="")).strip()
            match_type = str(
                get_path(
                    row,
                    "adGroupCriterion.keyword.matchType",
                    "ad_group_criterion.keyword.match_type",
                    default="",
                )
            ).upper()
            negative = bool(get_path(row, "adGroupCriterion.negative", "ad_group_criterion.negative", default=False))
            resource_name = str(
                get_path(
                    row,
                    "adGroupCriterion.resourceName",
                    "ad_group_criterion.resource_name",
                    default="",
                )
            )
            if ad_group_id and text:
                existing.add(existing_key(ad_group_id, text))
                criteria.append({
                    "scope": "AD_GROUP",
                    "campaignId": campaign_id,
                    "campaignName": campaign_name,
                    "adGroupId": ad_group_id,
                    "adGroupName": ad_group_name,
                    "resourceName": resource_name,
                    "text": text,
                    "matchType": match_type,
                    "negative": negative,
                })

    for ids in chunked(campaign_ids, 100):
        query = f"""
SELECT
  campaign.id,
  campaign.name,
  campaign_criterion.resource_name,
  campaign_criterion.status,
  campaign_criterion.keyword.text,
  campaign_criterion.keyword.match_type,
  campaign_criterion.negative
FROM campaign_criterion
WHERE campaign.id IN ({",".join(ids)})
  AND campaign_criterion.type = KEYWORD
  AND campaign_criterion.status != REMOVED
""".strip()
        for row in client.search_all(login_customer_id, query):
            campaign_id = str(get_path(row, "campaign.id", default=""))
            text = str(
                get_path(
                    row,
                    "campaignCriterion.keyword.text",
                    "campaign_criterion.keyword.text",
                    default="",
                )
            ).strip()
            if not campaign_id or not text:
                continue
            criteria.append({
                "scope": "CAMPAIGN",
                "campaignId": campaign_id,
                "campaignName": str(get_path(row, "campaign.name", default="")),
                "adGroupId": "",
                "adGroupName": "",
                "resourceName": str(
                    get_path(
                        row,
                        "campaignCriterion.resourceName",
                        "campaign_criterion.resource_name",
                        default="",
                    )
                ),
                "text": text,
                "matchType": str(
                    get_path(
                        row,
                        "campaignCriterion.keyword.matchType",
                        "campaign_criterion.keyword.match_type",
                        default="",
                    )
                ).upper(),
                "negative": bool(
                    get_path(
                        row,
                        "campaignCriterion.negative",
                        "campaign_criterion.negative",
                        default=False,
                    )
                ),
            })
    return existing, criteria


def first_url(row: dict[str, Any]) -> str:
    urls = get_path(row, "adGroupAd.ad.finalUrls", "ad_group_ad.ad.final_urls", default=[])
    return str(urls[0]).strip() if isinstance(urls, list) and urls else ""


def get_destination_urls(client: GoogleAdsRestClient, login_customer_id: str | None, ad_group_ids: list[str]) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for ids in chunked(ad_group_ids, 100):
        query = f"""
SELECT
  ad_group.id,
  ad_group_ad.status,
  ad_group_ad.ad.final_urls
FROM ad_group_ad
WHERE ad_group.id IN ({",".join(ids)})
  AND ad_group.status = 'ENABLED'
  AND ad_group_ad.status = 'ENABLED'
""".strip()
        counts_by_ad_group: dict[str, dict[str, int]] = {}
        for row in client.search_all(login_customer_id, query):
            ad_group_id = str(get_path(row, "adGroup.id", "ad_group.id", default=""))
            url = first_url(row)
            if not ad_group_id or not url:
                continue
            counts_by_ad_group.setdefault(ad_group_id, {})
            counts_by_ad_group[ad_group_id][url] = counts_by_ad_group[ad_group_id].get(url, 0) + 1
        for ad_group_id, counts in counts_by_ad_group.items():
            out[ad_group_id] = [url for url, _ in sorted(counts.items(), key=lambda item: (-item[1], item[0]))]
    return out


def pull_search_terms(customer_id_raw: str, start_date: str, end_date: str, campaign_name: str = "") -> PullResult:
    customer_id = strip_dashes(customer_id_raw)
    client = GoogleAdsRestClient(customer_id)
    login_customer_id, customer_name = client.resolve_access()
    raw_rows = client.search_all(
        login_customer_id,
        build_search_terms_query(start_date, end_date, campaign_name=campaign_name),
    )
    aggregated = aggregate_search_term_rows(raw_rows)
    ad_group_ids = unique([row.ad_group_id for row in aggregated])
    campaign_ids = unique([row.campaign_id for row in aggregated])
    if ad_group_ids:
        existing_keys, keyword_criteria = get_existing_keyword_state(
            client,
            login_customer_id,
            ad_group_ids,
            campaign_ids,
        )
    else:
        existing_keys, keyword_criteria = set(), []
    unreviewed_rows, skipped = filter_unreviewed_rows(aggregated, existing_keys)
    urls_by_ad_group = get_destination_urls(client, login_customer_id, ad_group_ids) if ad_group_ids else {}

    for row in aggregated:
        urls = urls_by_ad_group.get(row.ad_group_id, [])
        row.destination_urls = urls
        row.destination_url = urls[0] if urls else ""

    return PullResult(
        customer_id=customer_id_raw,
        customer_name=customer_name,
        login_customer_id_used=login_customer_id,
        date_range={"startDate": start_date, "endDate": end_date},
        api_version=GOOGLE_ADS_VERSION,
        raw_search_term_rows=len(raw_rows),
        unique_search_terms=len(aggregated),
        existing_ad_group_keyword_matches_skipped=skipped,
        rows=unreviewed_rows,
        safety_search_terms=aggregated,
        keyword_criteria=keyword_criteria,
    )


def build_fixture_pull_result(customer_id_raw: str, start_date: str, end_date: str) -> PullResult:
    rows = [
        SearchTermRecord("t1", "1", "Fixture Search", "10", "Loans", "loan calculator", 12.5, 120, 4, 0, "https://example.com/business-loan", ["https://example.com/business-loan"]),
        SearchTermRecord("t2", "1", "Fixture Search", "10", "Loans", "business loan application", 80.2, 300, 20, 3, "https://example.com/business-loan", ["https://example.com/business-loan"]),
        SearchTermRecord("t3", "1", "Fixture Search", "10", "Loans", "business financing near me", 18.0, 90, 3, 0, "https://example.com/business-loan", ["https://example.com/business-loan"]),
        SearchTermRecord("t4", "1", "Fixture Search", "10", "Loans", "government loan portal", 22.0, 110, 6, 1, "https://example.com/business-loan", ["https://example.com/business-loan"]),
    ]
    return PullResult(
        customer_id=customer_id_raw,
        customer_name="Fixture Account",
        login_customer_id_used=None,
        date_range={"startDate": start_date, "endDate": end_date},
        api_version=GOOGLE_ADS_VERSION,
        raw_search_term_rows=len(rows),
        unique_search_terms=len(rows),
        existing_ad_group_keyword_matches_skipped=0,
        rows=rows,
        safety_search_terms=rows,
        keyword_criteria=[],
    )
