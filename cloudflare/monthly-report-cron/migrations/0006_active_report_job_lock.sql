ALTER TABLE report_jobs ADD COLUMN report_type TEXT NOT NULL DEFAULT 'overall';

CREATE UNIQUE INDEX IF NOT EXISTS idx_report_jobs_active_type_month
ON report_jobs(report_type, report_month_key)
WHERE status IN ('queued', 'processing');
