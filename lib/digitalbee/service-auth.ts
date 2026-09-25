import { createHash, timingSafeEqual } from "node:crypto";
import { jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";

const uuid = z.string().uuid();
const scopeSchema = z.object({
  subject: z.string().min(1).max(255),
  grantRevision: z.number().int().nonnegative(),
  accountPageId: uuid,
  clientId: uuid,
  platform: z.enum(["Google", "Meta", "TikTok"]),
  platformAccountId: z.string().regex(/^\d{1,30}$/),
  connectionRevision: z.string().min(1).max(255),
}).strict();

export type DigitalBeeScope = z.infer<typeof scopeSchema>;

export class DigitalBeeServiceError extends Error {
  constructor(public readonly code: "unavailable" | "access_denied" | "invalid_request", public readonly status: number) {
    super(code);
  }
}

export function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("base64url");
}

export async function readBoundedJson(request: Request | Response, maximumBytes: number): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new DigitalBeeServiceError("invalid_request", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maximumBytes) throw new DigitalBeeServiceError("invalid_request", 413);
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new DigitalBeeServiceError("invalid_request", 400); }
}

export function tokenMatches(actual: string | undefined, expected: string | undefined): boolean {
  if (!actual || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function authenticateDigitalBeeRequest(
  request: Request,
  options: {
    serviceToken: string | undefined;
    delegationKey: string | undefined;
    connectionRevision: string | undefined;
    action: string;
    hash: string;
  },
): Promise<DigitalBeeScope> {
  if (!options.serviceToken || !options.delegationKey || options.delegationKey.length < 32 || !options.connectionRevision) {
    throw new DigitalBeeServiceError("unavailable", 503);
  }
  const bearer = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!tokenMatches(bearer, options.serviceToken)) throw new DigitalBeeServiceError("access_denied", 401);
  if (request.headers.get("x-connection-revision") !== options.connectionRevision) {
    throw new DigitalBeeServiceError("access_denied", 403);
  }
  const jwt = request.headers.get("x-digitalbee-delegation");
  if (!jwt) throw new DigitalBeeServiceError("access_denied", 401);
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(jwt, new TextEncoder().encode(options.delegationKey), {
      algorithms: ["HS256"], issuer: "digitalbee", audience: new URL(request.url).origin,
      maxTokenAge: "30s", clockTolerance: 2,
    }));
  } catch {
    throw new DigitalBeeServiceError("access_denied", 401);
  }
  const parsed = scopeSchema.safeParse(Object.fromEntries(
    Object.keys(scopeSchema.shape).map((key) => [key, payload[key]]),
  ));
  if (!parsed.success || !payload.jti || payload.sub !== parsed.data.subject
    || payload.action !== options.action || payload.requestHash !== options.hash
    || parsed.data.connectionRevision !== options.connectionRevision
    || typeof payload.iat !== "number" || typeof payload.exp !== "number"
    || payload.exp - payload.iat > 30) {
    throw new DigitalBeeServiceError("access_denied", 403);
  }
  return parsed.data;
}

export async function verifyCurrentDigitalBeeGrant(
  scope: DigitalBeeScope,
  action: string,
  options: { url: string | undefined; token: string | undefined },
): Promise<{ email: string }> {
  if (!options.url || !options.token) throw new DigitalBeeServiceError("unavailable", 503);
  let url: URL;
  try { url = new URL(options.url); } catch { throw new DigitalBeeServiceError("unavailable", 503); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
    || url.pathname !== "/v1/internal/grants/verify") {
    throw new DigitalBeeServiceError("unavailable", 503);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, {
      method: "POST", cache: "no-store", redirect: "manual", signal: controller.signal,
      headers: { Authorization: `Bearer ${options.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...scope, action }),
    });
    if (response.status === 403 || response.status === 404) throw new DigitalBeeServiceError("access_denied", 403);
    if (!response.ok) throw new DigitalBeeServiceError("unavailable", 503);
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > 8_192) throw new DigitalBeeServiceError("unavailable", 503);
    const verifiedBody = await readBoundedJson(response, 8_192);
    const value = z.object({ allowed: z.literal(true), ...scopeSchema.shape, action: z.string(), email: z.email() }).strict()
      .safeParse(verifiedBody);
    if (!value.success || value.data.action !== action
      || Object.keys(scope).some((key) => value.data[key as keyof DigitalBeeScope] !== scope[key as keyof DigitalBeeScope])) {
      throw new DigitalBeeServiceError("access_denied", 403);
    }
    return { email: value.data.email };
  } catch (error) {
    if (error instanceof DigitalBeeServiceError) throw error;
    throw new DigitalBeeServiceError("unavailable", 503);
  } finally { clearTimeout(timeout); }
}
