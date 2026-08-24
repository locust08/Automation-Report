import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { assertM03Operator, editMockChangeRequest, getMockChangeRequest, M03RepositoryError } from "@/lib/change-control/repository";
import { m03MockChangeRequestEditSchema } from "@/lib/change-control/schema";
import { buildTrustedRequestContext, M03AccessError } from "@/lib/change-control/request-context";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { const context = buildTrustedRequestContext(request, session); await assertM03Operator(context); return NextResponse.json(await getMockChangeRequest((await params).id)); }
  catch (error) { return failure(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = m03MockChangeRequestEditSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid draft update.", issues: parsed.error.issues }, { status: 400 });
  try { return NextResponse.json(await editMockChangeRequest((await params).id, parsed.data, buildTrustedRequestContext(request, session))); }
  catch (error) { return failure(error); }
}
function failure(error: unknown) { return NextResponse.json({ error: error instanceof Error ? error.message : "M03 request failed." }, { status: error instanceof M03RepositoryError || error instanceof M03AccessError ? error.status : 500 }); }
