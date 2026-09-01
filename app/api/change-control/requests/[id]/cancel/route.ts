import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { cancelMockChangeRequest, getMockChangeRequest, M03RepositoryError } from "@/lib/change-control/repository";
import { assertM03ActionAllowed, buildTrustedRequestContext, M03AccessError } from "@/lib/change-control/request-context";
import { m03MutationSchema } from "@/lib/change-control/schema";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = m03MutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid idempotency key is required." }, { status: 400 });
  try {
    const id = (await params).id;
    const detail = await getMockChangeRequest(id);
    if (!["draft", "validation_failed", "awaiting_approval", "approved"].includes(detail.request.status)) {
      throw new M03AccessError("This request cannot be cancelled from its current state.", 409);
    }
    assertM03ActionAllowed(session, "cancel", detail.request);
    return NextResponse.json(await cancelMockChangeRequest(id, parsed.data.idempotency_key, parsed.data.comment, buildTrustedRequestContext(request, session)));
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Cancellation failed." }, { status: error instanceof M03RepositoryError || error instanceof M03AccessError ? error.status : 500 }); }
}
