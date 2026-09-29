CREATE TABLE m04_provider_steps (
  operation_id TEXT NOT NULL,
  step TEXT NOT NULL CHECK(step IN ('campaign','adset','ad')),
  provider_name TEXT NOT NULL,
  provider_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('started','confirmed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(operation_id,step)
);
CREATE TRIGGER m04_provider_step_immutable BEFORE UPDATE OF operation_id,step,provider_name,created_at ON m04_provider_steps
BEGIN SELECT RAISE(ABORT,'Immutable M04 provider step'); END;
