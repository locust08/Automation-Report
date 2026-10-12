import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { buildTrustedRequestContext, M03AccessError } from "@/lib/change-control/request-context";
import { assertM03Operator, getMockChangeRequest, M03RepositoryError } from "@/lib/change-control/repository";
import { m03ProviderActionSchema } from "@/lib/change-control/schema";
import { assertScopedPause } from "./scoped-pause";
import { executeScopedPause } from "./pause-action";
import { ProviderExecutionLockedError } from "./provider-execution-lock";

export async function lockedProviderAction(request: Request, params: Promise<{ id: string }>, action: string) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = m03ProviderActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Select the exact approved revision before this action." }, { status: 400 });
  try {
    if (session.role !== "admin") throw new M03AccessError("Administrator access is required for provider recovery actions.");
    const context = buildTrustedRequestContext(request, session);
    await assertM03Operator(context);
    const detail = await getMockChangeRequest((await params).id);
    const revision = detail.revisions.find((row) => row.id === parsed.data.revision_id);
    const approval = detail.approvals.find((row) => row.revision_id === parsed.data.revision_id && row.revision_hash === parsed.data.revision_hash);
    if (!revision || revision.payload_hash !== parsed.data.revision_hash || !approval) {
      return NextResponse.json({ error: "Select the exact approved revision before this action." }, { status: 409 });
    }
    if (action === "Publish" || action === "Verify") {
      try { assertScopedPause(detail, context); }
      catch (error) { if (!(error instanceof ProviderExecutionLockedError)) throw error; return NextResponse.json({ error: "provider_execution_locked", code: "provider_execution_locked", message: "This campaign is not enabled for the approved pause pilot.", action }, { status: 423 }); }
      const result = await executeScopedPause({ requestId: detail.request.id, revisionId: parsed.data.revision_id, revisionHash: parsed.data.revision_hash, context, reconcileOnly: action === "Verify", reauthorize: async () => {
        const current = await getServerAuthSession();
        if (!current || current.sub !== session.sub || current.role !== "admin") throw new M03AccessError("Current administrator authorization is required.");
      } });
      return NextResponse.json(result);
    }
    // Every other provider action remains locked before constructing transport.
    return NextResponse.json({
      error: "provider_execution_locked",
      code: "provider_execution_locked",
      message: `${providerLabel(detail.request.platform)} provider execution is not enabled for this deployment.`,
      action,
    }, { status: 423 });
  } catch (error) {
    const status = error instanceof M03RepositoryError || error instanceof M03AccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof M03RepositoryError || error instanceof M03AccessError ? error.message : "Pause outcome requires reconciliation; use Verify before another action." }, { status });
  }
}

function providerLabel(platform: "google" | "meta" | "tiktok") {
  if (platform === "meta") return "Meta";
  if (platform === "tiktok") return "TikTok";
  return "Google";
}
