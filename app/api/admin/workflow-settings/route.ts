import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { resolveTrustedIp } from "@/lib/change-control/request-context";
import { listWorkflowPolicies, setWorkflowPolicy } from "@/lib/workflow-settings/repository";
import { workflowPolicyMutationSchema } from "@/lib/workflow-settings/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  try {
    return NextResponse.json({ policies: await listWorkflowPolicies(), providerExecutionLocked: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load workflow settings." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const parsed = workflowPolicyMutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid workflow setting.", issues: parsed.error.issues }, { status: 400 });
  try {
    return NextResponse.json({
      policy: await setWorkflowPolicy({
        ...parsed.data,
        actor: {
          id: session.sub,
          name: session.fullName?.trim() || session.email,
          email: session.email,
          trustedIp: resolveTrustedIp(request),
          userAgent: request.headers.get("user-agent"),
        },
      }),
      providerExecutionLocked: true,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update workflow setting." }, { status: 409 });
  }
}
