import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { assertM03Operator, editMockChangeRequest, getMockChangeRequest, M03RepositoryError } from "@/lib/change-control/repository";
import { m03MockChangeRequestEditSchema } from "@/lib/change-control/schema";
import { assertM03ActionAllowed, buildTrustedRequestContext, M03AccessError } from "@/lib/change-control/request-context";
import { sanitizeM03ChangeRequestDetailForBrowser } from "@/lib/change-control/detail-response";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertM03ActionAllowed(session, "view"); const context = buildTrustedRequestContext(request, session); await assertM03Operator(context); return NextResponse.json(sanitizeM03ChangeRequestDetailForBrowser(await getMockChangeRequest((await params).id))); }
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
