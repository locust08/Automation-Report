import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { getMockChangeRequest, M03RepositoryError, validateMockChangeRequest } from "@/lib/change-control/repository";
import { m03MutationSchema } from "@/lib/change-control/schema";
import { assertM03ActionAllowed, buildTrustedRequestContext, M03AccessError } from "@/lib/change-control/request-context";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = m03MutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid idempotency key is required." }, { status: 400 });
  try {
    const id = (await params).id;
    const detail = await getMockChangeRequest(id);
    assertM03ActionAllowed(session, "validate", detail.request);
    if (!["draft", "validation_failed"].includes(detail.request.status)) {
      throw new M03AccessError("This request is not in a valid state for validation.", 409);
    }
    const context = buildTrustedRequestContext(request, session);
    return NextResponse.json(await validateMockChangeRequest(id, parsed.data.idempotency_key, context));
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Validation failed." }, { status: error instanceof M03RepositoryError || error instanceof M03AccessError ? error.status : 500 }); }
}
