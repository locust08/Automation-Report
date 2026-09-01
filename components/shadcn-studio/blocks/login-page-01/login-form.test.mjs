import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Google OAuth uses the Material Google sign-in button", async () => {
  const source = await readFile(new URL("./login-form.tsx", import.meta.url), "utf8");

  assert.match(source, /function GoogleSignInButton\(/);
  assert.match(source, /href="\/api\/auth\/google"/);
  assert.match(source, /Sign in with Google/);
  assert.match(source, /fill="#EA4335"/);
  assert.match(source, /fill="#4285F4"/);
  assert.match(source, /fill="#FBBC05"/);
  assert.match(source, /fill="#34A853"/);
});
