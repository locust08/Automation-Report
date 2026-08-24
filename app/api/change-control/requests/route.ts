import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { assertM03Operator, createMockChangeRequest, listMockChangeRequests, M03RepositoryError } from "@/lib/change-control/repository";
import { m03ListQuerySchema, m03MockChangeRequestSchema } from "@/lib/change-control/schema";
import { buildTrustedRequestContext, M03AccessError } from "@/lib/change-control/request-context";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = m03ListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request filters.", issues: parsed.error.issues }, { status: 400 });
  try {
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
  try { return NextResponse.json(await createMockChangeRequest(parsed.data, buildTrustedRequestContext(request, session)), { status: 201 }); }
  catch (error) { return failure(error); }
}
function failure(error: unknown) { return NextResponse.json({ error: error instanceof Error ? error.message : "M03 request failed." }, { status: error instanceof M03RepositoryError || error instanceof M03AccessError ? error.status : 500 }); }
