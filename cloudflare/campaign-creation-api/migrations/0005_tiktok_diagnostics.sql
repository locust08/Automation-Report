CREATE TABLE m04_tiktok_diagnostics (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 operation_id TEXT NOT NULL,
 step TEXT NOT NULL CHECK(step IN ('campaign','adset','ad')),
 phase TEXT NOT NULL CHECK(phase IN ('creation','reconciliation')),
 diagnostic_json TEXT NOT NULL CHECK(json_valid(diagnostic_json)),
 FOREIGN KEY(operation_id,step) REFERENCES m04_provider_steps(operation_id,step)
);
CREATE INDEX m04_tiktok_diagnostics_operation ON m04_tiktok_diagnostics(operation_id,step,phase,sequence);
CREATE TRIGGER m04_tiktok_diagnostic_no_update BEFORE UPDATE ON m04_tiktok_diagnostics
BEGIN SELECT RAISE(ABORT,'Immutable TikTok diagnostic'); END;
CREATE TRIGGER m04_tiktok_creation_diagnostic_no_delete BEFORE DELETE ON m04_tiktok_diagnostics WHEN OLD.phase='creation'
BEGIN SELECT RAISE(ABORT,'Preserve TikTok creation diagnostic'); END;
