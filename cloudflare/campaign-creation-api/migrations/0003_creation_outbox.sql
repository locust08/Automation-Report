CREATE TABLE m04_creation_outbox (
 operation_id TEXT PRIMARY KEY REFERENCES m04_operations(id),
 scope_json TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 enqueued_at INTEGER
);
CREATE TRIGGER m04_outbox_scope_immutable BEFORE UPDATE OF operation_id,scope_json,created_at ON m04_creation_outbox BEGIN SELECT RAISE(ABORT,'Immutable M04 outbox'); END;
