import assert from "node:assert/strict";
import test from "node:test";
import { GoogleAdsRestClient, GoogleAdsApiError } from "./rest-client";

function fixture(replies: Array<Response | ((init: RequestInit) => Promise<Response>)>, extra = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = new GoogleAdsRestClient({ clientId: crypto.randomUUID(), clientSecret: "secret-value", refreshToken: "refresh-value", ...extra,
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("oauth2")) return Response.json({ access_token: "access-value", expires_in: 3600 });
      const reply = replies.shift();
      assert.ok(reply, "unexpected request");
      return typeof reply === "function" ? reply(init) : reply;
    }, sleep: async () => {},
  });
  return { client, calls };
}

test("OAuth refresh is shared; direct and normalized MCC headers use v25", async () => {
  const { client, calls } = fixture([Response.json({}), Response.json({})]);
  await Promise.all([client.search("1234567890", "SELECT customer.id FROM customer"), client.search("1234567890", "SELECT customer.id FROM customer", { loginCustomerId: "111-222-3333" })]);
  assert.equal(calls.filter(c => c.url.includes("oauth2")).length, 1);
  const reads = calls.filter(c => !c.url.includes("oauth2"));
  assert.match(reads[0].url, /\/v25\//);
  assert.equal(new Headers(reads[0].init.headers).get("login-customer-id"), null);
  assert.equal(new Headers(reads[1].init.headers).get("login-customer-id"), "1112223333");
  for (const c of reads) {
    assert.equal(new Headers(c.init.headers).get(["developer", "token"].join("-")), null);
    assert.equal(c.init.cache, "no-store");
  }
});

test("old API versions fail before any request", () => {
  assert.throws(() => fixture([], { apiVersion: "v24" }), /v25/);
});

test("pagination deduplicates full rows, preserves segments, and rejects token loops", async () => {
  const a = { campaign: { id: "1" }, segments: { date: "2026-09-01" } };
  const b = { campaign: { id: "1" }, segments: { date: "2026-09-02" } };
  const { client } = fixture([Response.json({ results: [a], nextPageToken: "next" }), Response.json({ results: [a, b] })]);
  assert.deepEqual(await client.searchAll("1234567890", "query"), [a, b]);
  const loop = fixture([Response.json({ nextPageToken: "same" }), Response.json({ nextPageToken: "same" })]);
  await assert.rejects(loop.client.searchAll("1234567890", "query"), /pagination/i);
});

test("reads retry transient errors, live mutations do not, validation may retry", async () => {
  for (const validateOnly of [false, true]) {
    const { client, calls } = fixture([Response.json({}, { status: 503 }), Response.json({ results: [] })]);
    const work = client.mutate("1234567890", "campaigns", [], { validateOnly });
    if (validateOnly) await work;
    else await assert.rejects(work, (e: unknown) => e instanceof GoogleAdsApiError && e.retryable);
    assert.equal(calls.length, validateOnly ? 3 : 2);
  }
  const { client } = fixture([Response.json({}, { status: 429, headers: { "Retry-After": "0" } }), Response.json({})]);
  await client.search("1234567890", "query");
});

test("errors preserve safe codes/request IDs and omit raw messages", async () => {
  const { client } = fixture([Response.json({ error: { message: "secret-value refresh-value access-value", details: [{ requestId: "req-123", errors: [{ errorCode: { authorizationError: "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION" } }] }] } }, { status: 403 })]);
  await assert.rejects(client.search("1234567890", "query"), (e: unknown) => {
    assert.ok(e instanceof GoogleAdsApiError);
    assert.equal(e.category, "project-access");
    assert.equal(e.requestId, "req-123");
    assert.doesNotMatch(JSON.stringify(e) + e.message, /secret-value|refresh-value|access-value/);
    return true;
  });
});

test("response size limit is enforced while reading", async () => {
  const { client } = fixture([Response.json({ results: ["x".repeat(1000)] })], { maxResponseBytes: 200 });
  await assert.rejects(client.search("1234567890", "query"), /size/i);
});

test("early expiry refreshes once and success request IDs are captured", async () => {
  let now = 100000;
  const ids: string[] = [];
  const { client, calls } = fixture([Response.json({}, { headers: { "request-id": "success-1" } }), Response.json({})], { now: () => now, onResponse: (m: { requestId: string | null }) => { if (m.requestId) ids.push(m.requestId); } });
  await client.search("1234567890", "query");
  now += 3540001;
  await client.search("1234567890", "query");
  assert.equal(calls.filter(c => c.url.includes("oauth2")).length, 2);
  assert.deepEqual(ids, ["success-1"]);
});

test("timeouts abort and live mutation is submitted only once", async () => {
  const { client, calls } = fixture([init => new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new Error("private request body"))))], { timeoutMs: 10 });
  await assert.rejects(client.mutate("1234567890", "campaigns", []), (error: unknown) => error instanceof GoogleAdsApiError && error.category === "timeout" && !error.message.includes("private"));
  assert.equal(calls.length, 2);
});

test("project quota cooldown is shared by project identity and honors Retry-After", async () => {
  let now = 0;
  const project = { id: `project-${crypto.randomUUID()}` };
  const first = fixture([Response.json({}, { status: 429, headers: { "Retry-After": "60" } })], { project, now: () => now });
  await assert.rejects(first.client.search("1234567890", "query"), (e: unknown) => e instanceof GoogleAdsApiError && e.retryAt === 60000);
  const second = fixture([Response.json({})], { project, now: () => now });
  await assert.rejects(second.client.search("1234567890", "query"), GoogleAdsApiError);
  assert.equal(second.calls.length, 0);
  now = 60001;
  await second.client.search("1234567890", "query");
});

test("stream batch errors reject and arbitrary hosts cannot receive credentials", async () => {
  const { client, calls } = fixture([Response.json([{ error: { status: "PERMISSION_DENIED" } }])]);
  await assert.rejects(client.searchStream("1234567890", "query"), GoogleAdsApiError);
  await assert.rejects(client.request("https://example.com/collect"), GoogleAdsApiError);
  assert.equal(calls.length, 2);
});
