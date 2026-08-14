-- One-time production cleanup for report jobs that stopped updating before
-- 2026-06-01 and were left in a non-terminal state by the older Worker.
--
-- Review before running. This script does not delete jobs or completed items.

UPDATE report_job_items
SET
  status = 'failed',
  error_message = CASE
    WHEN error_message IS NULL OR error_message = '' THEN
      'Closed as stale during the 2026-08-11 D1 maintenance.'
    ELSE
      error_message || ' | Closed as stale during the 2026-08-11 D1 maintenance.'
  END,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status IN ('queued', 'processing', 'retrying')
  AND job_id IN (
    SELECT id
    FROM report_jobs
    WHERE status IN ('queued', 'processing')
      AND updated_at < '2026-06-01T00:00:00.000Z'
  );

UPDATE report_jobs
SET
  status = CASE
    WHEN EXISTS (
      SELECT 1
      FROM report_job_items
      WHERE report_job_items.job_id = report_jobs.id
        AND report_job_items.status = 'completed'
    ) THEN 'completed_with_failures'
    ELSE 'failed'
  END,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status IN ('queued', 'processing')
  AND updated_at < '2026-06-01T00:00:00.000Z';

-- This should return no rows after the cleanup.
SELECT id, status, report_month_key, updated_at
FROM report_jobs
WHERE status IN ('queued', 'processing')
  AND updated_at < '2026-06-01T00:00:00.000Z';
