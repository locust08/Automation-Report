# Reporting and analysis

## Profiles

| Profile | Default level | Purpose |
| --- | --- | --- |
| `advertiser` | `AUCTION_ADVERTISER` | Account delivery and spend overview. |
| `campaign` | `AUCTION_CAMPAIGN` | Compare campaign efficiency and delivery. |
| `adgroup` | `AUCTION_ADGROUP` | Diagnose targeting, bid, budget, and optimization performance. |
| `ad` | `AUCTION_AD` | Compare individual ads. |
| `creative` | `AUCTION_AD` | Review video engagement and conversion signals by ad. |
| `audience` | Audience report | Compare demographic delivery and efficiency. |
| `daily` | Campaign by day | Detect pacing shifts, fatigue, anomalies, and trend changes. |

## Interpretation rules

- Preserve advertiser currency, timezone, report date range, data level, dimensions, filters, attribution settings, and provider request IDs.
- Confirm whether conversion value is monetary before interpreting ROAS.
- Compute derived CTR, CPC, CPM, CPA, and ROAS from additive totals. Do not sum provider-returned rates or averages across rows.
- Separate regular conversions, real-time conversions, total-payment metrics, and modeled/attributed metrics.
- Compare like-for-like date windows, attribution settings, objectives, and optimization events.
- Drill from campaign to ad group to ad/creative before recommending a mutation.
- Use asynchronous reports for large date ranges or high-cardinality dimensions.
- Treat empty data as a result to investigate, not proof that access failed; check dates, filters, account delivery, and data latency.
- Split synchronous integrated-report ranges into maximum 30-day inclusive windows and paginate each window sequentially.
- In production automation, use the shared read gateway. Preserve `cacheHitDates`, `cacheMissDates`, data timestamps, originating request IDs, and new provider request IDs in the audit artifact.
- A successful empty report is zero delivery. Authorization, validation, malformed-ID, rate-limit, and API failures are warnings/errors and must never be converted to zero.

Example input for a filtered report:

```json
{
  "report_type": "BASIC",
  "data_level": "AUCTION_AD",
  "dimensions": ["ad_id", "stat_time_day"],
  "metrics": ["spend", "impressions", "clicks", "conversion"],
  "start_date": "2026-08-01",
  "end_date": "2026-08-07",
  "filtering": [{
    "field_name": "campaign_ids",
    "filter_type": "IN",
    "filter_value": "123456789"
  }]
}
```

Official reporting reference:

- https://business-api.tiktok.com/portal/docs?id=1740302848100353
