# Progressive placement import (WIP)

This scaffold is not production-ready.

- The Supabase migration has not been applied.
- The current runner spawns a local process from Next.js and must be replaced by a Cloudflare Queue consumer.
- The planned R2-backed progressive import in 250-row batches is not implemented yet.
- The job, polling, cancellation, relational storage, and paginated-row APIs require end-to-end testing after the Cloudflare implementation is complete.
- Do not deploy or enable this workflow in production from this commit.
