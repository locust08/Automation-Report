import {z} from "zod";
import {canonicalM03Hash} from "./provider-contract";

export const confirmationBindingFields = ["subject", "actor", "grant_revision", "service", "client", "connection_revision", "session", "target", "canonical_origin", "network_source", "ingress_ip", "action", "request", "revision", "revision_hash"] as const;
export type ConfirmationBindingField = typeof confirmationBindingFields[number];
export type ConfirmationBindingValues = Record<ConfirmationBindingField, unknown>;
export const confirmationBindingTags = z.record(z.enum(confirmationBindingFields), z.string().regex(/^[a-f0-9]{64}$/));

/** Private signed diagnostics only. These tags never authorize a confirmation. */
export async function tagConfirmationBinding(values: ConfirmationBindingValues, key: Uint8Array, nonce: string) {
  const signingKey = await crypto.subtle.importKey("raw", key as BufferSource, {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
  const rows = await Promise.all(confirmationBindingFields.map(async field => {
    const input = new TextEncoder().encode(`m03-confirmation-binding-v1\0${nonce}\0${field}\0${canonicalM03Hash(values[field] ?? null)}`);
    const tag = await crypto.subtle.sign("HMAC", signingKey, input);
    return [field, Buffer.from(tag).toString("hex")];
  }));
  return confirmationBindingTags.parse(Object.fromEntries(rows));
}

export async function compareConfirmationBinding(tags: z.infer<typeof confirmationBindingTags>, values: ConfirmationBindingValues, key: Uint8Array, nonce: string): Promise<ConfirmationBindingField[]> {
  const actual = await tagConfirmationBinding(values, key, nonce);
  return confirmationBindingFields.filter(field => tags[field] !== actual[field]);
}
