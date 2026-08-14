import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const databasePath = resolve("tmp/team-lead-monitoring-test.sqlite");
for (const suffix of ["", "-shm", "-wal"]) {
  const file = `${databasePath}${suffix}`;
  if (existsSync(file)) rmSync(file);
}
process.env.SEARCH_TERM_SQLITE_PATH = databasePath;

const repository = await import("../lib/team-lead-monitoring/sqlite-repository");
const initial = repository.loadTeamLeadMonitoring();
if (initial.items.length !== 0 || initial.summary.escalated !== 0) throw new Error("Empty monitoring database returned unexpected data.");

const actor = { id: "team-lead-test", email: "team.lead@example.test" };
const first = repository.createEscalation({ module: "search_term", sourceId: 99, accountId: "1234567890", note: "Urgent test", actor });
const duplicate = repository.createEscalation({ module: "search_term", sourceId: 99, accountId: "1234567890", note: "Duplicate", actor });
if (!first.created || duplicate.created || first.id !== duplicate.id) throw new Error("Escalation idempotency failed.");
const active = repository.listActiveEscalations({ module: "search_term", accountId: "1234567890" });
if (active.length !== 1 || active[0].note !== "Urgent test") throw new Error("Active escalation was not persisted correctly.");
const resolved = repository.resolveEscalation({ id: Number(first.id), actor });
if (resolved.updated !== 1 || repository.listActiveEscalations({ module: "search_term", accountId: "1234567890" }).length !== 0) throw new Error("Escalation resolution failed.");

console.log("Team Lead monitoring SQLite workflow test passed.");

