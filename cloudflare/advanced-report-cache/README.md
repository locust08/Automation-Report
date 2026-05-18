# Cloudflare Advanced Report Cache

This Worker stores generated `/advanced` report JSON and optional `/overall` report JSON outside the Vercel runtime.

- D1 stores report cache metadata.
- R2 stores the full JSON payload.
- Vercel calls this Worker with `ADVANCED_REPORT_CACHE_WORKER_URL` and `ADVANCED_REPORT_CACHE_SECRET`.
- Vercel can also call this Worker with `OVERALL_REPORT_CACHE_WORKER_URL` and `OVERALL_REPORT_CACHE_SECRET`.

## Endpoints

- `GET /advanced-report-cache/:cacheKey`: returns cached JSON or `404`.
- `PUT /advanced-report-cache/:cacheKey`: stores cached JSON and upserts D1 metadata.
- `GET /overall-report-cache/:cacheKey`: returns cached Overall JSON or `404`.
- `PUT /overall-report-cache/:cacheKey`: stores `{ payload, expiresAt }` and upserts D1 metadata.

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
