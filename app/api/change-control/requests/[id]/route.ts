import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { assertM03Operator, editMockChangeRequest, getMockChangeRequest, M03RepositoryError } from "@/lib/change-control/repository";
import { m03MockChangeRequestEditSchema } from "@/lib/change-control/schema";
import { assertM03ActionAllowed, buildTrustedRequestContext, M03AccessError } from "@/lib/change-control/request-context";
import { sanitizeM03ChangeRequestDetailForBrowser } from "@/lib/change-control/detail-response";
import { assertScopedPause } from "@/lib/change-control/scoped-pause";
import { getM03ExecutionReceipts } from "@/lib/change-control/repository";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    assertM03ActionAllowed(session, "view"); const context = buildTrustedRequestContext(request, session); await assertM03Operator(context);
    const detail = await getMockChangeRequest((await params).id);
    detail.pause_actions = { publish: false, verify: false };
    let eligible = false;
    try { assertScopedPause(detail, context); eligible = true; } catch { /* Keep the narrow pilot unavailable. */ }
    const revision = detail.revisions[0];
    if (eligible && revision && detail.approvals.some(a => a.revision_id === revision.id && a.revision_hash === revision.payload_hash)) {
      const receipts = await getM03ExecutionReceipts(detail.request.id, revision.id);
      detail.pause_actions = { publish: receipts.length === 0 && ["approved", "ready_to_publish", "provider_execution_locked"].includes(detail.request.status), verify: receipts.length > 0 && ["approved", "ready_to_publish", "publishing", "partially_completed", "provider_execution_locked", "verified"].includes(detail.request.status) };
    }
    return NextResponse.json(sanitizeM03ChangeRequestDetailForBrowser(detail));
  }
  catch (error) { return failure(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = m03MockChangeRequestEditSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid draft update.", issues: parsed.error.issues }, { status: 400 });
  try {
    const id = (await params).id;
    const existing = await getMockChangeRequest(id);
    assertM03ActionAllowed(session, "edit", existing.request);
    if ((parsed.data.source_m04_plan_id ?? null) !== existing.request.source_m04_plan_id || (parsed.data.source_m04_revision_id ?? null) !== existing.request.source_m04_revision_id) {
      throw new M03RepositoryError("The verified M04 or legacy source boundary cannot be changed after request creation.", 409);
    }
    return NextResponse.json(await editMockChangeRequest(id, parsed.data, buildTrustedRequestContext(request, session)));
  }
  catch (error) { return failure(error); }
}
function failure(error: unknown) { return NextResponse.json({ error: error instanceof Error ? error.message : "M03 request failed." }, { status: error instanceof M03RepositoryError || error instanceof M03AccessError ? error.status : 500 }); }
