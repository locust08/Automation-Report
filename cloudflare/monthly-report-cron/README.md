# Cloudflare Monthly Report Scheduler

This Worker exists only to trigger the Vercel monthly report cron endpoint.

It does not:
- generate PDFs
- query Notion
- send emails with Resend

## Schedule

- Cron: `0 1 5 * *`
- Runs on the 5th day of every month at `01:00 UTC`
- Equivalent to `09:00 AM` Malaysia time (`UTC+08:00`)

## Required Runtime Bindings

These values should come from Doppler-managed secrets and be provided to the Worker runtime:

- `CRON_SECRET`
- `VERCEL_MONTHLY_REPORT_ENDPOINT`

Do not commit real secrets into this folder.

## Local Testing

From this folder:

```bash
npx wrangler dev --test-scheduled
```

Scheduled test URL:

```text
/__scheduled?cron=0+1+5+*+*
```

## Doppler Workflow

Example local workflow:

```bash
doppler run -- npx wrangler dev --test-scheduled
```

Example deploy workflow after review:

```bash
doppler run -- npx wrangler deploy
```

If you prefer explicit Wrangler secrets/bindings management, sync the same Doppler values into the Cloudflare Worker environment before deploy. Keep `CRON_SECRET` and `VERCEL_MONTHLY_REPORT_ENDPOINT` sourced from Doppler rather than hardcoding them in `wrangler.toml`.
