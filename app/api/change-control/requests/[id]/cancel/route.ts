import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { cancelMockChangeRequest, M03RepositoryError } from "@/lib/change-control/repository";
import { buildTrustedRequestContext, M03AccessError } from "@/lib/change-control/request-context";
import { m03MutationSchema } from "@/lib/change-control/schema";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = m03MutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid idempotency key is required." }, { status: 400 });
  try { return NextResponse.json(await cancelMockChangeRequest((await params).id, parsed.data.idempotency_key, parsed.data.comment, buildTrustedRequestContext(request, session))); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Cancellation failed." }, { status: error instanceof M03RepositoryError || error instanceof M03AccessError ? error.status : 500 }); }
}
