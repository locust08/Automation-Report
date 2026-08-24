import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { approveMockChangeRequest, getMockChangeRequest, M03RepositoryError, validateMockChangeRequest } from "@/lib/change-control/repository";
import { m03MutationSchema } from "@/lib/change-control/schema";
import { buildTrustedRequestContext, M03AccessError } from "@/lib/change-control/request-context";
import { isWorkflowApprovalRequired } from "@/lib/workflow-settings/repository";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = m03MutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid idempotency key is required." }, { status: 400 });
  try {
    const id = (await params).id;
    const context = buildTrustedRequestContext(request, session);
    const validation = await validateMockChangeRequest(id, parsed.data.idempotency_key, context);
    if (!await isWorkflowApprovalRequired("m03_change_control_approval")) {
      const detail = await getMockChangeRequest(id);
      if (detail.request.status === "awaiting_approval") {
        return NextResponse.json(await approveMockChangeRequest(id, `${parsed.data.idempotency_key}:auto`, "Approval skipped by Workflow Settings.", context));
      }
    }
    return NextResponse.json(validation);
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Validation failed." }, { status: error instanceof M03RepositoryError || error instanceof M03AccessError ? error.status : 500 }); }
}
