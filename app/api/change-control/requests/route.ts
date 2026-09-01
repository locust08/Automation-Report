import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { assertM03Operator, createPostLaunchChangeRequest, listMockChangeRequests, M03RepositoryError } from "@/lib/change-control/repository";
import { m03ListQuerySchema, m03MockChangeRequestSchema } from "@/lib/change-control/schema";
import { assertM03ActionAllowed, buildTrustedRequestContext, M03AccessError } from "@/lib/change-control/request-context";
import { verifyM03SourceBoundary } from "@/lib/change-control/source-boundary";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = m03ListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request filters.", issues: parsed.error.issues }, { status: 400 });
  try {
    assertM03ActionAllowed(session, "view");
    const context = buildTrustedRequestContext(request, session);
    await assertM03Operator(context);
    return NextResponse.json(await listMockChangeRequests(parsed.data));
  }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = m03MockChangeRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid mock change request.", issues: parsed.error.issues }, { status: 400 });
  try {
    assertM03ActionAllowed(session, "view");
    assertM03ActionAllowed(session, "create");
    const context = buildTrustedRequestContext(request, session);
    await assertM03Operator(context);
    const boundary = await verifyM03SourceBoundary(parsed.data);
    const created = await createPostLaunchChangeRequest(parsed.data, {
      source_kind: boundary.source_kind,
      source_revision_hash: boundary.source_kind === "m04_verified_launch" ? boundary.source_revision_hash : null,
      evidence: boundary.evidence,
      baseline: boundary.source_kind === "legacy_provider_adoption" ? boundary.baseline : undefined,
    }, context);
    return NextResponse.json(created, { status: 201 });
  }
  catch (error) { return failure(error); }
}
function failure(error: unknown) { return NextResponse.json({ error: error instanceof Error ? error.message : "M03 request failed." }, { status: error instanceof M03RepositoryError || error instanceof M03AccessError ? error.status : 500 }); }
