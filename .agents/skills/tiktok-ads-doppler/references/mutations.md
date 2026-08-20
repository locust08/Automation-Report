# Mutation contract

## Preview

Run a create, update, budget, status, upload, or Spark authorization command without `--apply`.

The CLI must return:

- exact advertiser ID and name;
- action and API version;
- current object state when an object ID is available;
- proposed sanitized payload;
- objective and asset preflight checks;
- stable run ID and local receipt path;
- the exact confirmation name required by apply.

The preview writes no TikTok mutation. It may make safe GET requests for current state and preflight.

## Apply

Apply only after the user explicitly confirms the exact preview:

```text
--apply --confirm-advertiser-name "<exact Doppler-authorized name>"
```

Apply requires a matching preview receipt. Any payload, advertiser, action, or Spark authorization-code fingerprint change produces a different run ID and requires a new preview.

## Status and activation

- Default new objects to `DISABLE`.
- Display `ENABLE` prominently in the preview when activation is requested.
- Treat budget, bid, schedule, targeting, identity, destination, and delivery status as material changes.
- For bulk requests, list every target and total count before confirmation.

## Receipts and retries

- Keep receipts under `tmp/tiktok_ads/` with mode `0600`.
- Include only sanitized input, IDs, provider request ID, timestamps, and verification data.
- Never include tokens, app secrets, Post Authorization Codes, or raw request headers.
- Retry GET requests on transient 5xx/network errors with bounded backoff.
- Treat TikTok `code: 40100` and HTTP 429 as rate limiting. Retry automatically only when the provider supplies a short cooldown within the configured auto-wait bound. Return `retryAfterAt` for longer cooldowns.
- Never automatically retry a POST. If the response is uncertain, inspect state using the receipt before deciding whether another mutation is safe.
