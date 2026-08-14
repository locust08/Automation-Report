# Meta CSV import storage

This Worker provides durable storage for staff-approved Meta Ads CSV imports.

- D1 stores normalized rows and import history.
- The original uploaded CSV is not retained.
- Every endpoint requires `Authorization: Bearer <META_IMPORT_WORKER_SECRET>`.

Create the D1 database, replace the placeholder `database_id` in `wrangler.toml`, configure the
Worker-side bearer secret, then run:

```powershell
npx wrangler d1 create automation-meta-csv-import
cd cloudflare/meta-csv-import
doppler run -- npx wrangler secret put META_IMPORT_WORKER_SECRET
doppler run -- npx wrangler d1 migrations apply automation-meta-csv-import --remote
doppler run -- npx wrangler deploy
```

Configure the same Worker URL and secret in Vercel as `META_IMPORT_WORKER_URL` and
`META_IMPORT_WORKER_SECRET`.
