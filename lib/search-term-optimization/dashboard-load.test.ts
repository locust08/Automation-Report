import assert from "node:assert/strict";
import test from "node:test";
import { fetchDashboardWithRetry } from "./dashboard-load";

test("retries one storage-unavailable response and returns the successful response", async () => {
  let attempts = 0;
  const response = await fetchDashboardWithRetry("/api/search-term-optimization?accountId=123", {
    fetchImpl: async () => {
      attempts += 1;
      return new Response(attempts === 1 ? "unavailable" : "ok", { status: attempts === 1 ? 503 : 200 });
    },
    timeoutMs: 100,
  });

  assert.equal(attempts, 2);
  assert.equal(response.status, 200);
});

test("retries one network failure", async () => {
  let attempts = 0;
  const response = await fetchDashboardWithRetry("/api/search-term-optimization", {
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError("network unavailable");
      return new Response("ok", { status: 200 });
    },
    timeoutMs: 100,
  });

  assert.equal(attempts, 2);
  assert.equal(response.status, 200);
});

test("does not retry permanent HTTP responses", async () => {
  for (const status of [401, 404, 500]) {
    let attempts = 0;
    const response = await fetchDashboardWithRetry("/api/search-term-optimization", {
      fetchImpl: async () => {
        attempts += 1;
        return new Response("failed", { status });
      },
      timeoutMs: 100,
    });
    assert.equal(response.status, status);
    assert.equal(attempts, 1);
  }
});

test("does not retry when the caller cancels the load", async () => {
  const controller = new AbortController();
  let attempts = 0;
  const promise = fetchDashboardWithRetry("/api/search-term-optimization", {
    fetchImpl: async (_input, init) => {
      attempts += 1;
      controller.abort();
      throw init?.signal?.reason ?? new DOMException("Aborted", "AbortError");
    },
    signal: controller.signal,
    timeoutMs: 100,
  });

  await assert.rejects(promise, /abort/i);
  assert.equal(attempts, 1);
});
