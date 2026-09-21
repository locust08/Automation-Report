from __future__ import annotations

import os
import json
import re
import time
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from google.ads.googleads.client import GoogleAdsClient
from google.oauth2.credentials import Credentials
from google.ads.googleads.errors import GoogleAdsException
from google.api_core.retry import Retry
from google.api_core import exceptions as api_exceptions

GOOGLE_ADS_VERSION = "v25"
MAX_GOOGLE_RESPONSE_BYTES = int(os.environ.get("SEARCH_TERM_MAX_GOOGLE_RESPONSE_BYTES", str(32 * 1024 * 1024)))
DEFAULT_MCCS = ("3666137525", "4114685827")
REQUIRED_GOOGLE_ENV = (
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_REFRESH_TOKEN",
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
    active_search_campaigns_only: bool = True


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
    for suffix in ("CLIENT_ID", "CLIENT_SECRET", "REFRESH_TOKEN"):
        key = f"GOOGLE_ADS_{suffix}"
        if not os.environ.get(key) and os.environ.get(f"GOOGLE_OAUTH_{suffix}"):
            os.environ[key] = os.environ[f"GOOGLE_OAUTH_{suffix}"]
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


class BoundedOAuthCredentials(Credentials):
    request_timeout = 45.0

    def refresh(self, request):
        def bounded_request(*args, **kwargs):
            kwargs["timeout"] = self.request_timeout
            return request(*args, **kwargs)
        return super().refresh(bounded_request)


class GoogleAdsRestClient:
    def __init__(self, customer_id: str, timeout_seconds: float = 45.0):
        require_google_ads_env()
        configured = (os.environ.get("GOOGLE_ADS_API_VERSION") or GOOGLE_ADS_VERSION).lower()
        if configured.lstrip("v") != "25":
            raise RuntimeError("Python search-term reader requires Google Ads API v25.")
        self.customer_id = strip_dashes(customer_id)
        self.timeout_seconds = timeout_seconds
        self.clients: dict[str, Any] = {}

    def _client(self, login_customer_id: str | None):
        login = strip_dashes(login_customer_id)
        if login not in self.clients:
            credentials = BoundedOAuthCredentials(
                token=None, client_id=os.environ["GOOGLE_ADS_CLIENT_ID"],
                client_secret=os.environ["GOOGLE_ADS_CLIENT_SECRET"],
                refresh_token=os.environ["GOOGLE_ADS_REFRESH_TOKEN"],
                token_uri="https://oauth2.googleapis.com/token",
            )
            credentials.request_timeout = self.timeout_seconds
            self.clients[login] = GoogleAdsClient(credentials=credentials, login_customer_id=login or None, use_proto_plus=True, version="v25")
        return self.clients[login]

    def search_page(self, login_customer_id: str | None, query: str, page_token: str = "") -> dict[str, Any]:
        try:
            client = self._client(login_customer_id)
        except Exception:
            raise RuntimeError("Google OAuth initialization failed.") from None
        request = client.get_type("SearchGoogleAdsRequest", version="v25")
        request.customer_id = self.customer_id
        request.query = query
        request.page_token = page_token
        try:
            pager = client.get_service("GoogleAdsService", version="v25").search(
                request=request, timeout=self.timeout_seconds,
                retry=Retry(predicate=lambda exc: isinstance(exc, (api_exceptions.ServiceUnavailable, api_exceptions.TooManyRequests)), initial=1, maximum=10, deadline=self.timeout_seconds),
            )
            page = next(iter(pager.pages))
            payload = type(page).to_dict(page, preserving_proto_field_name=False, use_integers_for_enums=False)
        except GoogleAdsException as exc:
            codes = []
            for error in exc.failure.errors:
                code = type(error.error_code).to_dict(error.error_code, use_integers_for_enums=False)
                codes.extend(str(value) for value in code.values() if re.fullmatch(r"[A-Z][A-Z0-9_]*", str(value)))
            request_id = exc.request_id if re.fullmatch(r"[\w-]{1,150}", exc.request_id or "") else "unavailable"
            raise RuntimeError(f"Google Ads request failed: {', '.join(codes)}; request ID {request_id}") from None
        except Exception:
            raise RuntimeError("Google Ads request failed or timed out.") from None
        if len(json.dumps(payload).encode("utf-8")) > MAX_GOOGLE_RESPONSE_BYTES:
            raise RuntimeError("Google Ads search response exceeded the configured safety limit.")
        return payload

    def search_all(self, login_customer_id: str | None, query: str) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        page_token = ""
        seen_tokens: set[str] = set()
        seen_rows: set[str] = set()
        for _ in range(10000):
            page = self.search_page(login_customer_id, query, page_token)
            for row in page.get("results") or []:
                key = json.dumps(row, sort_keys=True)
                if key not in seen_rows:
                    seen_rows.add(key)
                    rows.append(row)
            page_token = page.get("nextPageToken") or ""
            if not page_token:
                return rows
            if page_token in seen_tokens:
                break
            seen_tokens.add(page_token)
            time.sleep(0.1)
        raise RuntimeError("Google Ads pagination did not terminate safely.")

    def resolve_access(self) -> tuple[str | None, str]:
        candidates = list(dict.fromkeys([strip_dashes(os.environ.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID")), "", *DEFAULT_MCCS]))
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


def build_search_terms_query(
    start_date: str,
    end_date: str,
    campaign_name: str = "",
    include_paused_campaigns: bool = False,
) -> str:
    campaign_filter = ""
    if campaign_name:
        escaped_campaign_name = campaign_name.replace("\\", "\\\\").replace("'", "\\'")
        campaign_filter = f"\n  AND campaign.name = '{escaped_campaign_name}'"
    campaign_status_filter = (
        "campaign.status != 'REMOVED'"
        if include_paused_campaigns
        else "campaign.status = 'ENABLED'"
    )
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
  AND {campaign_status_filter}
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
    active_search_campaigns_only = True
    if not raw_rows:
        # Historical search terms remain useful after a Search campaign is paused.
        # Prefer enabled campaigns, then fall back to paused (never removed) campaigns.
        raw_rows = client.search_all(
            login_customer_id,
            build_search_terms_query(
                start_date,
                end_date,
                campaign_name=campaign_name,
                include_paused_campaigns=True,
            ),
        )
        active_search_campaigns_only = False
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
        active_search_campaigns_only=active_search_campaigns_only,
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
