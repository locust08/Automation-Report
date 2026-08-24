import type { AuthSession } from "@/lib/auth/session";
import { resolveCampaignActorId } from "@/lib/campaign-planning/supabase-repository";
import type { TrustedRequestContext } from "@/lib/change-control/types";

export class M03AccessError extends Error {
  constructor(message: string, public readonly status = 403) { super(message); this.name = "M03AccessError"; }
}

export function buildTrustedRequestContext(request: Request, session: AuthSession): TrustedRequestContext {
  if (session.role !== "admin") throw new M03AccessError("Administrator access is required.");
  const actorId = resolveCampaignActorId(session.sub);
  const trustedIp = resolveTrustedIp(request);
  if (!trustedIp) throw new M03AccessError("A trusted server network context is required for M03 workflow changes.");
  return {
    actor_id: actorId,
    actor_name: session.fullName?.trim() || session.email,
    actor_email: session.email,
    trusted_ip: trustedIp,
    user_agent: request.headers.get("user-agent")?.slice(0, 1_000) || "unknown",
  };
}

export function resolveTrustedIp(request: Request): string | null {
  if (process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "true") return "127.0.0.1";
  if (request.headers.get("cf-ray")) return cleanIp(request.headers.get("cf-connecting-ip"));
  if (request.headers.get("x-vercel-id")) {
    return cleanIp(request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for"));
  }
  return null;
}

function cleanIp(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  if (!first || first.length > 64 || !/^[0-9a-f:.]+$/i.test(first)) return null;
  return first;
}
