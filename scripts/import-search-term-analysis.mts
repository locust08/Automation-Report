import { createRequire } from "node:module";

const accountId = process.argv[2]?.replace(/\D/g, "") ?? "";
if (accountId.length !== 10) throw new Error("A 10-digit Google Ads account ID is required.");

const require = createRequire(import.meta.url);
const { ManualRunnerOutputRepository } = require("../lib/search-term-optimization/repository") as typeof import("../lib/search-term-optimization/repository");
const { persistDashboardToSqlite } = require("../lib/search-term-optimization/sqlite-repository") as typeof import("../lib/search-term-optimization/sqlite-repository");

const dashboard = await new ManualRunnerOutputRepository().getDashboard(accountId);
const persisted = persistDashboardToSqlite(dashboard);
console.log(`Imported ${persisted.results.length} analyzed search terms for ${accountId}.`);
