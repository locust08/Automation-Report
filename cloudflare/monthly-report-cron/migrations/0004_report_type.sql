ALTER TABLE report_job_items ADD COLUMN report_type TEXT NOT NULL DEFAULT 'overall';
ALTER TABLE report_job_items ADD COLUMN country TEXT DEFAULT 'MY';
