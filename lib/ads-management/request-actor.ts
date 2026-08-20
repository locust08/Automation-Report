import { isIP } from "node:net";
import type { NextRequest } from "next/server";
import type { AuthSession } from "@/lib/auth/session";
import { sessionDisplayName } from "@/lib/auth/session";
import type { WorkflowActor } from "@/lib/ads-management/service";

export function workflowActorFromRequest(request: NextRequest, session: AuthSession): WorkflowActor {
  return {
    id: session.sub,
    name: sessionDisplayName(session),
    trustedIp: trustedProxyIp(request),
    trustedUserAgent: request.headers.get("user-agent")?.slice(0, 1000) ?? null,
  };
}

function trustedProxyIp(request: NextRequest): string | null {
  const candidates = [
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0],
  ];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value && isIP(value)) return value;
  }
  return null;
}
