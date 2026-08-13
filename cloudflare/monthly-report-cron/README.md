# Cloudflare Monthly Report Automation

This Worker owns monthly report automation outside the Vercel app:

- Creates monthly report jobs.
- Queues one account per message.
- Renders the Vercel `/overall` report page to PDF through a Cloudflare Browser binding.
- Stores PDFs in R2.
- Sends each report through Resend.
- Tracks progress and failures in D1.
- Maintains a fast D1 replica of the Notion ad-account directory.

The Vercel app remains the report UI and data source.

## Schedule

Cloudflare cron uses UTC.

- Production cron: `0 4 7,10,15 * *`
  - Uses one Cloudflare cron trigger slot.
  - Runs at `04:00 UTC`, equivalent to `12:00 PM` Malaysia time (`UTC+08:00`).
- Monthly Overall: day 7
  - Runs on the 7th day of every month at `04:00 UTC`
  - Generates last month data.
- Monthly Advanced: day 10
  - Runs on the 10th day of every month at `04:00 UTC`
  - Generates last month data.
- Bi-Weekly Overall: day 15
  - Runs on the 15th day of every month at `04:00 UTC`
  - Generates current-month data from the 1st through the 14th.
- Ad-account incremental sync: `*/10 * * * *`
  - Queries only Notion pages edited since the last successful checkpoint.
  - Automatically performs a full reconciliation when the previous full sync is more than 24 hours old.

## Cloudflare Resources

Expected resource names:

- Worker: `ads-dashboard-monthly-report-automation`
- D1: `automation-report-jobs`
- R2: `automation-report-pdfs`
- Queue: `monthly-report-queue`
- Dead-letter queue: `monthly-report-dead-letter-queue`

## Required Secrets

Set these as Worker secrets, preferably sourced from Doppler:

- `REPORT_AUTOMATION_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_MONTHLY_REPORT`
- `VERCEL_APP_BASE_URL`
- `WORKER_API_SECRET`
- `MONTHLY_REPORT_TEST_RECIPIENT`
- `NOTION_TOKEN`
- `NOTION_AD_ACCOUNTS_DATABASE_ID`
- `NOTION_WEBHOOK_VERIFICATION_TOKEN`

`REPORT_AUTOMATION_SECRET` must match the Vercel app secret used by `/api/report-pdf/targets`.

The Vercel app also needs `MONTHLY_REPORT_WORKER_URL` (or `REPORT_AUTOMATION_WORKER_URL`) and the matching `WORKER_API_SECRET` so account searches can use D1.

## API

Search the account directory:

```bash
curl "$WORKER_URL/ad-accounts/search?q=company-or-cid" \
  -H "Authorization: Bearer $WORKER_API_SECRET"
```

Run an incremental or full sync:

```bash
curl -X POST "$WORKER_URL/ad-accounts/sync" \
  -H "Authorization: Bearer $WORKER_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"full":false}'
```

Inspect sync health:

```bash
curl "$WORKER_URL/ad-accounts/sync-status" \
  -H "Authorization: Bearer $WORKER_API_SECRET"
```

### Notion webhook setup

1. Deploy the Worker and use `$WORKER_URL/notion/webhook` as the public webhook URL in the Notion connection.
2. Subscribe to `page.created`, `page.content_updated`, `page.deleted`, and the available page restoration event.
3. Create the subscription. Read the one-time verification token from the Worker logs, paste it into Notion's verification dialog, and immediately store the same value as the `NOTION_WEBHOOK_VERIFICATION_TOKEN` Worker secret.
4. Run one authorized full sync to seed D1.

Webhook deliveries are authenticated with Notion's `X-Notion-Signature`. Duplicate event IDs are recorded and ignored.

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
doppler run -- npx wrangler secret put REPORT_AUTOMATION_SECRET
doppler run -- npx wrangler secret put RESEND_API_KEY
doppler run -- npx wrangler secret put RESEND_FROM_MONTHLY_REPORT
doppler run -- npx wrangler secret put VERCEL_APP_BASE_URL
doppler run -- npx wrangler secret put WORKER_API_SECRET
doppler run -- npx wrangler secret put MONTHLY_REPORT_TEST_RECIPIENT
doppler run -- npx wrangler secret put NOTION_TOKEN
doppler run -- npx wrangler secret put NOTION_AD_ACCOUNTS_DATABASE_ID
doppler run -- npx wrangler secret put NOTION_WEBHOOK_VERIFICATION_TOKEN
```

Do not commit real secret values.
