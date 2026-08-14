# Search-term batch stability log

- **R2 configuration blocked local analysis.** The runner required the deployed Worker even during local development. Fixed by using job-scoped files under `tmp/search-term-analysis-jobs/local-object-storage` when Worker configuration is absent.
- **A saved 250-term input was ignored.** Snapshot parsing was accidentally placed in the website-crawl helper while the main runner fetched Google Ads again. This produced valid reviews for a different set of terms and triggered the input/output safety check. Fixed by loading `PullResult` from `--snapshot-file` in `main()` and skipping the Google fetch.
- **Batch outputs could overwrite each other.** The review script names JSON output by account and reporting dates, so multiple runs for the same account shared a filename. Fixed by assigning every job/run its own output directory.
- **The mapper could read an older account output.** The compatibility mapper previously searched the shared `tmp` directory. Fixed by copying only the confirmed isolated batch output into the mapper scope for the duration of the atomic commit, then removing it.
- **Completed work was represented by counters without durable rows.** Fixed with relational reviewed-term rows and the atomic `commit_search_term_analysis_batch` RPC. A batch is completed only after the expected row count is verified.
- **Stopping a stale worker could erase retry state.** Fixed so an active unconfirmed batch becomes `needs_retry`, queued batches become `stopped`, and completed rows remain untouched.
- **Placement storage showed unavailable while PostgREST was healthy.** Concurrent local analysis polling could exceed the original four-second read timeout. Verified the placement run and row tables returned `200`, then increased the bounded default read timeout to ten seconds while retaining one retry.
- **A completed 1,218-term analysis showed 1,000 reused and 218 queued.** PostgREST capped the single relational response at 1,000 rows. Fixed by reading durable results in explicit 250-row pages; summary counts use all saved pages while initial rendering uses the first 250 rows.
- **Zero-term jobs consumed daily capacity and kept the loading UI active.** Fixed by ending before analysis, releasing manual claims (or restoring scheduled reservations), and returning an explicit zero-term terminal state to the client.
- **Google access failures looked like generic retrieval or quota failures.** The retry wrapper hid the final Google response. Enabled exception re-raising, surface a safe manager-permission message for `USER_PERMISSION_DENIED`, and release capacity when retrieval fails before caching.

## Regression checks

- A snapshot fixture must return exactly the keys present in that batch.
- Output files must be isolated by job and run.
- A count/key mismatch must prevent completion and preserve the input.
- Atomic retries must keep one row per `(job_id, stable_term_key)`.
- The progressive dashboard must prefer relational rows and calculate remaining terms as discovered minus saved.
