// Key classification prevents treating a modern secret as a JWT. Supabase still
// validates the configured credential; decoding a legacy payload is not auth.
export function supabaseServiceHeaders(key: string): Record<string, string> {
  if (/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) return { apikey: key };
  try {
    const parts = key.split(".");
    if (parts.length !== 3 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
    if (payload.role !== "service_role") throw new Error();
    return { apikey: key, authorization: `Bearer ${key}` };
  } catch { throw new Error("supabase_server_key_required"); }
}
