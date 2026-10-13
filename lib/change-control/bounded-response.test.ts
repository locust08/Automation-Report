import assert from "node:assert/strict";
import test from "node:test";
import { m03BoundedText } from "./bounded-response";
test("bounded responses preserve split UTF-8 and reject/cancel oversized streams", async () => {
  const bytes = new TextEncoder().encode("M03 ✓");
  const stream = new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 5)); c.enqueue(bytes.slice(5)); c.close(); } });
  assert.equal(await m03BoundedText(new Response(stream), 20), "M03 ✓");
  let cancelled = false;
  const oversized = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(21)); }, cancel() { cancelled = true; } });
  await assert.rejects(m03BoundedText(new Response(oversized), 20), /response_too_large/);
  assert.equal(cancelled, true);
});
