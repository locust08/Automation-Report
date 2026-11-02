import test from "node:test";
import assert from "node:assert/strict";
import { m03PauseEnvironment } from "./mcp-pause-environment";
import { PauseBootstrapError, reportBootstrapFailure, type BootstrapReason, type BootstrapStage } from "./pause-bootstrap-diagnostic";
import { withM03RuntimeEnvironment, m03RuntimeEnvironment } from "./runtime-environment";

const sentinel = "PRIVATE_SENTINEL_DO_NOT_LOG_1234567890";
const env = { M03_PAUSE_MCP_ENABLED: "true", M03_PAUSE_MCP_CREDENTIAL_SOURCE: "doppler", M03_PAUSE_MCP_SECRET_PROJECT: "fixture", M03_PAUSE_MCP_SECRET_CONFIG: "prd", M03_PAUSE_MCP_DOPPLER_TOKEN: sentinel };
const required = ["M03_PAUSE_MCP_SERVICE_TOKEN", "M03_PAUSE_MCP_DELEGATION_KEY", "DIGITALBEE_GRANT_VERIFY_TOKEN"];
const secrets = () => Object.fromEntries(required.map(name => [name, { computed: sentinel }]));
const fails = async (fetcher: typeof fetch, stage: BootstrapStage, reason: BootstrapReason, httpStatus?: number) => {
  let calls = 0;
  await assert.rejects(m03PauseEnvironment(env, async (...args) => { calls++; return fetcher(...args); }), (error: unknown) => {
    assert(error instanceof PauseBootstrapError);
    assert.equal(error.stage, stage); assert.equal(error.reason, reason); assert.equal(error.httpStatus, httpStatus);
    assert.doesNotMatch(JSON.stringify(error), new RegExp(sentinel));
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.equal(calls, 1);
};

for (const [status, reason] of [[301, "upstream_http"], [302, "upstream_http"], [401, "authentication"], [403, "permission"], [429, "upstream_http"], [500, "upstream_http"], [503, "upstream_http"]] as const) {
  test(`credential HTTP ${status} is classified without retry or exposing its body`, async () => {
    await fails(async (_url, init) => {
      assert.equal(init?.redirect, "manual"); assert.equal(init?.cache, "no-store");
      return new Response(sentinel, { status, headers: { Location: "https://untrusted.example/" + sentinel } });
    }, "credential_fetch", reason, status);
  });
}
for (const name of ["TypeError", "TimeoutError", "AbortError"]) {
  test(`credential ${name} retains only a safe reason`, async () => {
    await fails(async () => { const error = new Error(sentinel); error.name = name; throw error; }, "credential_fetch", name === "TypeError" ? "network" : "timeout");
  });
}
test("the existing five-second credential deadline aborts a pending fetch", async () => {
  await fails(async (_url, init) => new Promise<Response>((_resolve, reject) => {
    const keepAlive = setTimeout(() => reject(new Error("deadline not enforced")), 6500);
    init!.signal!.addEventListener("abort", () => { clearTimeout(keepAlive); reject(init!.signal!.reason); }, { once: true });
  }), "credential_fetch", "timeout");
});
test("credential response bounds cancel the stream", async () => {
  let cancelled = false;
  await fails(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(65537)); }, cancel() { cancelled = true; } })), "credential_response", "response_size", 200);
  assert.equal(cancelled, true);
});
test("malformed JSON cannot disclose its parse context", async () => {
  await fails(async () => new Response('{"secrets":' + sentinel), "credential_response", "response_json", 200);
});
for (const value of [null, [], "private", {}, { secrets: null }, { secrets: [] }]) {
  test(`invalid credential envelope ${JSON.stringify(value)} fails closed`, async () => {
    await fails(async () => Response.json(value), "credential_response", "response_shape", 200);
  });
}
test("missing required record cannot use a stale bound override", async () => {
  const values = secrets(); delete values[required[1]!];
  await assert.rejects(m03PauseEnvironment({ ...env, [required[1]!]: sentinel }, async () => Response.json({ secrets: values })), (error: unknown) => error instanceof PauseBootstrapError && error.reason === "required_record_missing");
});
for (const value of [null, 123, [], {}, { computed: "short", raw: sentinel }, "short"]) {
  test(`malformed required record ${JSON.stringify(value)} fails without raw fallback`, async () => {
    await fails(async () => Response.json({ secrets: { ...secrets(), [required[0]!]: value } }), "credential_records", "required_record_malformed", 200);
  });
}
test("valid raw, computed and string records preserve optional credentials and scope", async () => {
  const original = { ...env, META_ACCESS_TOKEN: "existing-meta-binding" };
  const value = await m03PauseEnvironment(original, async url => {
    const names = new URL(String(url)).searchParams.get("secrets")!;
    assert(!names.includes("META_ACCESS_TOKEN")); assert(!names.includes("SUPABASE"));
    return Response.json({ secrets: { [required[0]!]: sentinel, [required[1]!]: { raw: sentinel }, [required[2]!]: { computed: sentinel }, NOTION_TOKEN: { computed: "optional-notion" }, UNRELATED_SECRET: sentinel } });
  });
  assert(required.every(name => value[name] === sentinel));
  assert.equal(value.NOTION_TOKEN, "optional-notion"); assert.equal(value.META_ACCESS_TOKEN, "existing-meta-binding");
  assert.equal(value.UNRELATED_SECRET, undefined); assert.deepEqual(original, { ...env, META_ACCESS_TOKEN: "existing-meta-binding" });
});
test("concurrent credential loads stay invocation-local", async () => {
  await Promise.all(["first", "second"].map(async label => {
    const secret = label.repeat(10);
    const loaded = await m03PauseEnvironment(env, async () => Response.json({ secrets: Object.fromEntries(required.map(name => [name, secret])) }));
    await withM03RuntimeEnvironment(loaded, async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      assert.equal(m03RuntimeEnvironment().M03_PAUSE_MCP_SERVICE_TOKEN, secret);
    });
  }));
});
test("safe logging rebuilds fields, shares correlation, and tolerates logger failure", () => {
  const original = console.error, logs: string[] = [], correlation = crypto.randomUUID();
  console.error = value => logs.push(String(value));
  try {
    const error = new PauseBootstrapError("credential_fetch", "authentication", 401);
    Object.assign(error, { message: sentinel, stack: sentinel, cause: sentinel, token: sentinel });
    reportBootstrapFailure(error, "worker_configuration", performance.now(), correlation);
    const row = JSON.parse(logs[0]!);
    assert.deepEqual(Object.keys(row).sort(), ["event", "stage", "reason", "duration_ms", "http_status", "correlation_id"].sort());
    assert.equal(row.correlation_id, correlation); assert.equal(row.reason, "authentication"); assert.equal(row.http_status, 401);
    assert.doesNotMatch(logs.join(""), new RegExp(sentinel));
    Object.assign(error, { stage: sentinel, reason: sentinel, httpStatus: sentinel });
    reportBootstrapFailure(error, "credential_response", performance.now(), correlation);
    assert.equal(JSON.parse(logs[1]!).reason, "unexpected_failure"); assert.doesNotMatch(logs[1]!, new RegExp(sentinel));
    console.error = () => { throw Error(sentinel); };
    assert.doesNotThrow(() => reportBootstrapFailure(error, "credential_response", performance.now(), correlation));
  } finally { console.error = original; }
});
