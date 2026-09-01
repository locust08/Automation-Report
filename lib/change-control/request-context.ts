import type { AuthSession } from "@/lib/auth/session";
import { resolveCampaignActorId } from "@/lib/campaign-planning/supabase-repository";
import { canPerformM03Action, type M03PermissionAction } from "@/lib/change-control/permissions";
import type { M03ChangeRequestSummary, TrustedRequestContext } from "@/lib/change-control/types";

export class M03AccessError extends Error {
  constructor(message: string, public readonly status = 403) { super(message); this.name = "M03AccessError"; }
}

export function buildTrustedRequestContext(request: Request, session: AuthSession): TrustedRequestContext {
  const actorId = resolveCampaignActorId(session.sub);
  const trustedIp = resolveTrustedIp(request);
  if (!trustedIp) throw new M03AccessError("A trusted server network context is required for M03 workflow changes.");
  return {
    actor_id: actorId,
    actor_name: session.fullName?.trim() || session.email,
    actor_email: session.email,
    actor_role: session.role,
    trusted_ip: trustedIp,
    user_agent: request.headers.get("user-agent")?.slice(0, 1_000) || "unknown",
  };
}

export function assertM03ActionAllowed(
  session: AuthSession,
  action: M03PermissionAction,
  request?: M03ChangeRequestSummary,
): void {
  const actorId = resolveCampaignActorId(session.sub);
  if (action === "approve"
    && session.role !== "admin"
    && request?.created_by_id
    && request.created_by_id === actorId) {
    throw new M03AccessError("A non-administrator cannot approve a request they created.", 409);
  }
  if (!canPerformM03Action(session.role, action, {
    status: request?.status,
    actorId,
    creatorId: request?.created_by_id,
  })) {
    throw new M03AccessError(`Your role is not permitted to ${m03ActionLabel(action)} M03 change requests.`, 403);
  }
}

function m03ActionLabel(action: M03PermissionAction) {
  return action === "view" ? "view" : action === "create" ? "create" : action;
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
