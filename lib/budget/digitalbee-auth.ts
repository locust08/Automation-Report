import { jwtVerify } from "jose";
import { z } from "zod";
import { DigitalBeeServiceError, tokenMatches, verifyCurrentDigitalBeeGrant } from "@/lib/digitalbee/service-auth";

const uuid = z.string().uuid();
export const budgetScopeSchema = z.object({
  subject: z.string().min(1).max(255), grantRevision: z.number().int().nonnegative(),
  notionAccountId: uuid, clientId: uuid, platform: z.enum(["Google", "Meta", "TikTok"]),
  platformAccountId: z.string().regex(/^\d{1,30}$/), cycleId: uuid.nullable(),
  requested: z.object({ start: z.iso.date(), end: z.iso.date() }).strict(),
}).strict();
export type BudgetScope = z.infer<typeof budgetScopeSchema>;

export async function authenticateBudget(request: Request): Promise<BudgetScope> {
  const token = process.env.M05_SERVICE_TOKEN;
  const key = process.env.M05_DELEGATION_KEY;
  const revision = process.env.M05_CONNECTION_REVISION;
  if (!token || !key || key.length < 32 || !revision) throw new DigitalBeeServiceError("unavailable", 503);
  if (!tokenMatches(request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1], token)
    || request.headers.get("x-connection-revision") !== revision) throw new DigitalBeeServiceError("access_denied", 401);
  const proof = request.headers.get("x-digitalbee-delegation");
  if (!proof) throw new DigitalBeeServiceError("access_denied", 401);
  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(proof, new TextEncoder().encode(key), {
      issuer: "digitalbee", audience: new URL(request.url).origin, algorithms: ["HS256"],
      maxTokenAge: "30s", clockTolerance: 2,
    });
    payload = result.payload;
  } catch { throw new DigitalBeeServiceError("access_denied", 401); }
  const parsed = budgetScopeSchema.safeParse(Object.fromEntries(
    Object.keys(budgetScopeSchema.shape).map((field) => [field, payload[field]]),
  ));
  if (!parsed.success || payload.sub !== parsed.data.subject || !payload.jti
    || typeof payload.iat !== "number" || typeof payload.exp !== "number"
    || payload.exp - payload.iat > 30) throw new DigitalBeeServiceError("access_denied", 403);
  const query = new URL(request.url).searchParams;
  const allowed = new Set(new URL(request.url).pathname.endsWith("/access")
    ? ["account_id", "start", "end", "cycle_id"]
    : ["account_id", "start", "end", "cycle_id", "mode", "limit", "cursor", "revision", "max_age_seconds"]);
  if ([...query.keys()].some((name) => !allowed.has(name) || query.getAll(name).length !== 1)) {
    throw new DigitalBeeServiceError("invalid_request", 400);
  }
  if (query.get("account_id") !== parsed.data.notionAccountId || query.get("start") !== parsed.data.requested.start
    || query.get("end") !== parsed.data.requested.end || (query.get("cycle_id") || null) !== parsed.data.cycleId
    || parsed.data.requested.end < parsed.data.requested.start) throw new DigitalBeeServiceError("access_denied", 403);
  if ((Date.parse(`${parsed.data.requested.end}T00:00:00Z`)
    - Date.parse(`${parsed.data.requested.start}T00:00:00Z`)) / 86_400_000 > 3_660) {
    throw new DigitalBeeServiceError("invalid_request", 400);
  }
  return parsed.data;
}

export async function verifyBudgetGrant(scope: BudgetScope, action: string): Promise<void> {
  await verifyCurrentDigitalBeeGrant({
    subject: scope.subject, grantRevision: scope.grantRevision, accountPageId: scope.notionAccountId,
    clientId: scope.clientId, platform: scope.platform, platformAccountId: scope.platformAccountId,
    connectionRevision: process.env.M05_CONNECTION_REVISION || "",
  }, action, { url: process.env.DIGITALBEE_GRANT_VERIFY_URL, token: process.env.DIGITALBEE_GRANT_VERIFY_TOKEN });
}
