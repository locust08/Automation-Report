# Rate limits

TikTok applies global limits to the developer app across all advertiser accounts. Endpoint-specific limits also apply independently. Use the official v1.3 source as the runtime authority:

- https://business-api.tiktok.com/portal/docs/rate-limits/v1.3

## Runtime controls

Store these non-browser runtime controls in Doppler:

```text
TIKTOK_BUSINESS_RATE_LIMIT_LEVEL=basic
TIKTOK_BUSINESS_MAX_QPS=8
TIKTOK_BUSINESS_MAX_QPM=480
TIKTOK_BUSINESS_MAX_CONCURRENCY=3
```

The client clamps configured QPS and QPM to the selected TikTok tier. Defaults reserve 20 percent headroom. For the Basic tier, TikTok's global provider limits are 10 QPS, 600 QPM, and 864,000 QPD.

Endpoint-specific internal ceilings are also conservative:

| Action | Basic internal ceiling | Provider ceiling |
| --- | --- | --- |
| `ad.create` | 4 QPS / 120 QPM / 69,120 QPD | 5 / 150 / 86,400 |
| `report.async-create` | 1 QPS / 48 QPM / 3,600 QPD | 2 / 60 / 4,500 |

## Throttling behavior

- Treat provider `code: 40100` and HTTP 429 as `rate_limited`.
- Use a provider `Retry-After` value when present.
- Without an explicit provider cooldown, return a conservative five-minute `provider_unknown` cooldown.
- Allow automatic GET retry only for short cooldowns of at most two seconds.
- Never automatically retry a POST.
- Reset daily local accounting at 00:00 UTC.
- Batch reads and limit concurrency instead of issuing one request per object.

The process-global limiter shares counters across local CLI client instances and advertiser IDs. Production cron automations must call `tiktok-ads-read-gateway`, whose single named SQLite Durable Object persists rate events and provider cooldowns across Worker isolates and hibernation.

The gateway refreshes credentials and all four controls from Doppler at most once per 60 seconds. Doppler is the only rate-configuration authority; Worker files contain no independent QPS, QPM, concurrency, or tier values. The gateway clamps every refreshed value to the provider tier, admits all TikTok production reads, and fails closed when neither current nor in-memory configuration is available.

Efficiency rules:

- Coalesce identical in-flight validation, report, and budget requests.
- Cache exact advertiser validation for 60 minutes when readable and 5 minutes when unavailable; changing `TIKTOK_BUSINESS_TOKEN_UPDATED_AT` invalidates the cache namespace.
- Cache today/yesterday report dates for 45 minutes, 2–7-day-old dates for 6 hours, 8–30-day-old dates for 24 hours, and older dates for 7 days.
- Cache live budget inspection for 10 minutes.
- Fetch only missing or stale contiguous dates, split report requests into at most 30 inclusive days, and paginate sequentially.
- Cron uses normal cache policy. `fresh=true` is reserved for authorized manual verification and incident investigation.
