import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { buildTrustedRequestContext, M03AccessError } from "@/lib/change-control/request-context";
import { assertM03Operator, getMockChangeRequest, M03RepositoryError } from "@/lib/change-control/repository";
import { m03ProviderActionSchema } from "@/lib/change-control/schema";

export async function lockedProviderAction(request: Request, params: Promise<{ id: string }>, action: string) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = m03ProviderActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Select the exact approved revision before this action." }, { status: 400 });
  try {
    const context = buildTrustedRequestContext(request, session);
    await assertM03Operator(context);
    const detail = await getMockChangeRequest((await params).id);
    const revision = detail.revisions.find((row) => row.id === parsed.data.revision_id);
    const approval = detail.approvals.find((row) => row.revision_id === parsed.data.revision_id && row.revision_hash === parsed.data.revision_hash);
    if (!revision || revision.payload_hash !== parsed.data.revision_hash || !approval) {
      return NextResponse.json({ error: "Select the exact approved revision before this action." }, { status: 409 });
    }
    // Return before any baseline retrieval or provider transport is constructed.
    return NextResponse.json({
      error: "provider_execution_locked",
      code: "provider_execution_locked",
      message: `${providerLabel(detail.request.platform)} provider execution is not enabled for this deployment.`,
      action,
    }, { status: 423 });
  } catch (error) {
    const status = error instanceof M03RepositoryError || error instanceof M03AccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : `${action} failed.` }, { status });
  }
}

function providerLabel(platform: "google" | "meta" | "tiktok") {
  if (platform === "meta") return "Meta";
  if (platform === "tiktok") return "TikTok";
  return "Google";
}
