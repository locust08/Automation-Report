# Cloudflare Advanced Report Cache

This Worker stores generated `/advanced` report JSON and optional `/overall` report JSON outside the Vercel runtime.

- D1 stores report cache metadata.
- R2 stores the full JSON payload.
- Vercel calls this Worker with `ADVANCED_REPORT_CACHE_WORKER_URL` and `ADVANCED_REPORT_CACHE_SECRET`.
- Vercel can also call this Worker with `OVERALL_REPORT_CACHE_WORKER_URL` and `OVERALL_REPORT_CACHE_SECRET`.
- TikTok Insights can reuse the Overall cache credentials or use `TIKTOK_INSIGHTS_CACHE_WORKER_URL` and `TIKTOK_INSIGHTS_CACHE_SECRET`.

## Endpoints

- `GET /advanced-report-cache/:cacheKey`: returns cached JSON or `404`.
- `PUT /advanced-report-cache/:cacheKey`: stores cached JSON and upserts D1 metadata.
- `GET /overall-report-cache/:cacheKey`: returns cached Overall JSON or `404`.
- `PUT /overall-report-cache/:cacheKey`: stores `{ payload, expiresAt }` and upserts D1 metadata.
- `GET /tiktok-insights-cache/:cacheKey`: returns an unexpired TikTok Insights envelope or `404`.
- `PUT /tiktok-insights-cache/:cacheKey`: stores `{ payload, expiresAt }` without credentials or OAuth data.

All endpoints require the Worker secret. The Vercel `OVERALL_REPORT_CACHE_SECRET` value must match `ADVANCED_REPORT_CACHE_SECRET` on this Worker.

```http
Authorization: Bearer <ADVANCED_REPORT_CACHE_SECRET>
```

## Setup

Create the D1 database and R2 bucket, update `wrangler.toml`, then run:

```bash
doppler run -- npx wrangler d1 migrations apply automation-advanced-report-cache --remote
doppler run -- npx wrangler deploy
```


## Resumable Advanced Report generation

`GET /advanced-report-generation/:cacheKey` returns persisted generation state and its ETag. `PUT` requires `If-Match` with that revision (`*` means create only if absent). A conflicting revision returns 409. Immutable R2 objects and conditional D1 pointer publication prevent stale generations from replacing current state or complete report results. The existing advanced_report_cache table is reused; no new migration is required.

Deploy this backward-compatible Worker before the paired application and monthly automation driver. Production generation requires the cache URL and secret; development fixtures can use isolated memory. Application POST awaits one bounded chunk; GET reads progress. Complete snapshots retain the existing cached report contract. See docs/dashboard-report-fixes-2026-10-13.md for verification and rollback boundaries.
