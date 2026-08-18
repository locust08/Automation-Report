import assert from "node:assert/strict";
import test from "node:test";
import * as googleOAuth from "./google-oauth";

test("builds the Supabase Google ID-token grant payload", () => {
  const createPayload = (
    googleOAuth as typeof googleOAuth & {
      createSupabaseGoogleTokenPayload?: (idToken: string, accessToken: string) => unknown;
    }
  ).createSupabaseGoogleTokenPayload;

  assert.equal(typeof createPayload, "function");
  assert.deepEqual(createPayload!("google-id-token", "google-access-token"), {
    provider: "google",
    id_token: "google-id-token",
    access_token: "google-access-token",
  });
});
