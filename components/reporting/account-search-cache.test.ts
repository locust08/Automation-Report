import assert from "node:assert/strict";
import test from "node:test";
import { searchCachedAccounts } from "./account-search-cache";

test("account searches coalesce and reuse normalized queries without sharing mutable rows", async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; await new Promise((resolve) => setTimeout(resolve, 5)); return Response.json({ accounts: [{ accountName: "Test" }] }); };
  try {
    const [first, second] = await Promise.all([searchCachedAccounts<{ accountName: string }>(" Cache Test "), searchCachedAccounts<{ accountName: string }>("cache test")]);
    first[0].accountName = "Changed";
    assert.equal(second[0].accountName, "Test");
    assert.equal((await searchCachedAccounts<{ accountName: string }>("CACHE TEST"))[0].accountName, "Test");
    assert.equal(requests, 1);
  } finally { globalThis.fetch = original; }
});

test("failed account searches are retried instead of cached", async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; return Response.json({ error: "Unavailable" }, { status: 503 }); };
  try {
    await assert.rejects(searchCachedAccounts("failed search"));
    await assert.rejects(searchCachedAccounts("failed search"));
    assert.equal(requests, 2);
  } finally { globalThis.fetch = original; }
});
