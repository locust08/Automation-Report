import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { approveMockChangeRequest, getMockChangeRequest, M03RepositoryError } from "@/lib/change-control/repository";
import { m03ApprovalMutationSchema } from "@/lib/change-control/schema";
import { assertM03ActionAllowed, buildTrustedRequestContext, M03AccessError } from "@/lib/change-control/request-context";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = m03ApprovalMutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid idempotency key and exact revision hash are required." }, { status: 400 });
  try {
    const id = (await params).id;
    const detail = await getMockChangeRequest(id);
    assertM03ActionAllowed(session, "approve", detail.request);
    if (detail.request.status !== "awaiting_approval") throw new M03AccessError("This request is not awaiting approval.", 409);
    if (!detail.revisions[0] || detail.revisions[0].payload_hash !== parsed.data.revision_hash) {
      throw new M03AccessError("A newer validated revision exists. Refresh before approving.", 409);
    }
    return NextResponse.json(await approveMockChangeRequest(id, parsed.data.idempotency_key, parsed.data.comment, buildTrustedRequestContext(request, session)));
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Approval failed." }, { status: error instanceof M03RepositoryError || error instanceof M03AccessError ? error.status : 500 }); }
}
