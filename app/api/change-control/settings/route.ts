import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { getWorkflowSettings, M03RepositoryError, updateWorkflowSetting } from "@/lib/change-control/repository";
import { buildTrustedRequestContext, M03AccessError } from "@/lib/change-control/request-context";
import { workflowSettingMutationSchema } from "@/lib/change-control/schema";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { if (session.role !== "admin") throw new M03AccessError("Administrator access is required."); buildTrustedRequestContext(request, session); return NextResponse.json(await getWorkflowSettings()); }
  catch (error) { return failure(error); }
}
export async function PUT(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = workflowSettingMutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid workflow setting.", issues: parsed.error.issues }, { status: 400 });
  try { if (session.role !== "admin") throw new M03AccessError("Administrator access is required."); return NextResponse.json(await updateWorkflowSetting(parsed.data, buildTrustedRequestContext(request, session))); }
  catch (error) { return failure(error); }
}
function failure(error: unknown) { return NextResponse.json({ error: error instanceof Error ? error.message : "Workflow settings request failed." }, { status: error instanceof M03RepositoryError || error instanceof M03AccessError ? error.status : 500 }); }
