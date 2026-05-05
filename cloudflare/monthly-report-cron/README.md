# Cloudflare Monthly Report Automation

This Worker owns monthly report automation outside the Vercel app:

- Creates monthly report jobs.
- Queues one account per message.
- Renders the Vercel `/overall` report page to PDF through Cloudflare Browser Run.
- Stores PDFs in R2.
- Sends each report through Resend.
- Tracks progress and failures in D1.

The Vercel app remains the report UI and data source.

## Schedule

Cloudflare cron uses UTC.

- Cron: `0 4 5 * *`
- Runs on the 5th day of every month at `04:00 UTC`
- Equivalent to `12:00 PM` Malaysia time (`UTC+08:00`)

Current deployment note: the account already has 5 Cloudflare cron triggers, so
`wrangler.toml` keeps `crons = []` to allow the Worker, queue consumer, D1, and
R2 bindings to deploy. Free one cron slot or upgrade the account, then change
`crons` back to `["0 4 5 * *"]` and redeploy.

## Cloudflare Resources

Expected resource names:

- Worker: `ads-dashboard-monthly-report-automation`
- D1: `automation-report-jobs`
- R2: `automation-report-pdfs`
- Queue: `monthly-report-queue`
- Dead-letter queue: `monthly-report-dead-letter-queue`

## Required Secrets

Set these as Worker secrets, preferably sourced from Doppler:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_BROWSER_RENDERING_TOKEN`
- `REPORT_AUTOMATION_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_MONTHLY_REPORT`
- `VERCEL_APP_BASE_URL`
- `WORKER_API_SECRET`
- `MONTHLY_REPORT_TEST_RECIPIENT`

`REPORT_AUTOMATION_SECRET` must match the Vercel app secret used by `/api/report-pdf/targets`.

## API

Create a job manually:

```bash
curl -X POST "$WORKER_URL/report-jobs" \
  -H "Authorization: Bearer $WORKER_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "sendEmail": true,
    "forceTestMode": true,
    "accounts": [
      {
        "clientName": "Zero Healthcare Sdn Bhd",
        "googleAccountId": "842-631-6258",
        "recipientEmail": "eason@locus-t.com.my",
        "platform": "Google"
      }
    ]
  }'
```

Check status:

```bash
curl "$WORKER_URL/report-jobs/$JOB_ID" \
  -H "Authorization: Bearer $WORKER_API_SECRET"
```

Retry failed items:

```bash
curl -X POST "$WORKER_URL/report-jobs/$JOB_ID/retry-failed" \
  -H "Authorization: Bearer $WORKER_API_SECRET"
```

Download a completed PDF:

```bash
curl "$WORKER_URL/report-jobs/$JOB_ID/items/$ITEM_ID/download" \
  -H "Authorization: Bearer $WORKER_API_SECRET" \
  --output report.pdf
```

## Deploy

From this folder:

```bash
doppler run -- npx wrangler d1 create automation-report-jobs
```

Copy the created `database_id` into `wrangler.toml`, then run:

```bash
doppler run -- npx wrangler queues create monthly-report-queue
doppler run -- npx wrangler queues create monthly-report-dead-letter-queue
doppler run -- npx wrangler r2 bucket create automation-report-pdfs
doppler run -- npx wrangler d1 migrations apply automation-report-jobs --remote
doppler run -- npx wrangler deploy
```

Set Worker secrets:

```bash
doppler run -- npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
doppler run -- npx wrangler secret put CLOUDFLARE_BROWSER_RENDERING_TOKEN
doppler run -- npx wrangler secret put REPORT_AUTOMATION_SECRET
doppler run -- npx wrangler secret put RESEND_API_KEY
doppler run -- npx wrangler secret put RESEND_FROM_MONTHLY_REPORT
doppler run -- npx wrangler secret put VERCEL_APP_BASE_URL
doppler run -- npx wrangler secret put WORKER_API_SECRET
doppler run -- npx wrangler secret put MONTHLY_REPORT_TEST_RECIPIENT
```

Do not commit real secret values.
