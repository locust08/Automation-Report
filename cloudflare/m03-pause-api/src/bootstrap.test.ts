import test from "node:test";
import assert from "node:assert/strict";
import { handle, type Env } from "./handler";
import type { McpPauseDependencies } from "../../../lib/change-control/mcp-pause-service";

const sentinel = "PRIVATE_SENTINEL_DO_NOT_LOG_1234567890";
const env: Env = { M03_WORKER_ENABLED: "true", M03_CANONICAL_ORIGIN: "https://m03.example", DIGITALBEE_AUTHORITY: { fetch: async () => { throw Error("must not reach authority"); } }, M03_PAUSE_MCP_ENABLED: "true", M03_PAUSE_MCP_CREDENTIAL_SOURCE: "doppler", M03_PAUSE_MCP_SECRET_PROJECT: "fixture", M03_PAUSE_MCP_SECRET_CONFIG: "prd", M03_PAUSE_MCP_DOPPLER_TOKEN: sentinel };
const cases = [
  { name: "missing binding", patch: { DIGITALBEE_AUTHORITY: undefined }, reason: "missing_configuration", calls: 0 },
  { name: "missing canonical origin", patch: { M03_CANONICAL_ORIGIN: undefined }, reason: "missing_configuration", calls: 0 },
  { name: "invalid canonical origin", patch: { M03_CANONICAL_ORIGIN: sentinel }, reason: "invalid_configuration", calls: 0 },
  { name: "insecure canonical origin", patch: { M03_CANONICAL_ORIGIN: "http://m03.example" }, reason: "invalid_configuration", calls: 0 },
  { name: "missing token", patch: { M03_PAUSE_MCP_DOPPLER_TOKEN: undefined }, reason: "missing_configuration", calls: 0 },
  { name: "missing project", patch: { M03_PAUSE_MCP_SECRET_PROJECT: undefined }, reason: "missing_configuration", calls: 0 },
  { name: "missing config", patch: { M03_PAUSE_MCP_SECRET_CONFIG: undefined }, reason: "missing_configuration", calls: 0 },
  { name: "authentication", status: 401, reason: "authentication", calls: 1 },
  { name: "permission", status: 403, reason: "permission", calls: 1 },
  { name: "upstream", status: 503, reason: "upstream_http", calls: 1 },
  { name: "JSON", body: sentinel, reason: "response_json", calls: 1 },
  { name: "shape", body: "null", reason: "response_shape", calls: 1 },
  { name: "required record", body: '{"secrets":{}}', reason: "required_record_missing", calls: 1 },
];
for (const scenario of cases) test(`bootstrap ${scenario.name} returns locked/503 before any workflow access`, async () => {
  const previous = globalThis.fetch, originalLog = console.error, logs: string[] = [];
  let fetches = 0, domainCalls = 0;
  // Any access to a workflow dependency is a failure, even a read.
  const deps = new Proxy({} as McpPauseDependencies, { get() { domainCalls++; throw Error(sentinel); } });
  globalThis.fetch = async input => { fetches++; assert.equal(new URL(String(input)).hostname, "api.doppler.com"); return new Response(scenario.body ?? sentinel, { status: scenario.status ?? 200 }); };
  console.error = message => logs.push(String(message));
  try {
    const response = await handle(new Request("https://private.invalid/api/service/digitalbee/m03-pause", { method: "POST", headers: { Authorization: "Bearer " + sentinel }, body: sentinel }), { ...env, ...scenario.patch }, deps);
    assert.equal(response.status, 503); assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json(); assert.deepEqual(Object.keys(body).sort(), ["outcome", "correlation_id"].sort());
    assert.equal(body.outcome, "locked"); assert.match(body.correlation_id, /^[a-f\d-]{36}$/);
    assert.equal(logs.length, 1); const diagnostic = JSON.parse(logs[0]!);
    assert.equal(diagnostic.reason, scenario.reason); assert.equal(diagnostic.correlation_id, body.correlation_id);
    assert.equal(fetches, scenario.calls); assert.equal(domainCalls, 0);
    assert.doesNotMatch(JSON.stringify({ logs, body }), new RegExp(sentinel));
  } finally { globalThis.fetch = previous; console.error = originalLog; }
});
test("disabled and unrelated routes neither fetch credentials nor log failures", async () => {
  const oldFetch = globalThis.fetch, oldLog = console.error;
  globalThis.fetch = async () => { throw Error("unexpected fetch"); };
  console.error = () => { throw Error("unexpected log"); };
  try {
    for (const [url, method, bindings, status] of [
      ["https://private.invalid/other", "POST", env, 404],
      ["https://private.invalid/api/service/digitalbee/m03-pause", "GET", env, 405],
      ["https://private.invalid/api/service/digitalbee/m03-pause", "POST", { ...env, M03_WORKER_ENABLED: "false" }, 503],
    ] as const) assert.equal((await handle(new Request(url, { method }), bindings)).status, status);
  } finally { globalThis.fetch = oldFetch; console.error = oldLog; }
});
