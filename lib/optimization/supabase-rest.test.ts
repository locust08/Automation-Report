import assert from "node:assert/strict";
import test from "node:test";
import { supabaseRestCount } from "./supabase-rest";

test("supabaseRestCount returns the exact total without downloading rows", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret";

  let receivedInit: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    receivedInit = init;
    return new Response(null, {
      status: 200,
      headers: { "Content-Range": "0-0/1375" },
    });
  };

  try {
    const count = await supabaseRestCount("search_terms?job_id=eq.job-1");
    assert.equal(count, 1375);
    assert.equal(receivedInit?.method, "HEAD");
    assert.equal(new Headers(receivedInit?.headers).get("Prefer"), "count=exact");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalKey;
  }
});

test("supabaseRestCount rejects a response without a total", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret";
  globalThis.fetch = async () => new Response(null, { status: 200 });

  try {
    await assert.rejects(
      supabaseRestCount("search_terms?job_id=eq.job-1"),
      /did not include an exact count/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalKey;
  }
});
