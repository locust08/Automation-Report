import { NextResponse } from "next/server";

import { buildReportingErrorResponse } from "@/lib/reporting/api-error";
import { undoSearchTermRecord } from "@/lib/search-term-optimization/workflow";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ recordId: string }> }
): Promise<NextResponse> {
  try {
    const { recordId } = await context.params;
    return NextResponse.json(await undoSearchTermRecord(recordId));
  } catch (error) {
    return buildReportingErrorResponse(error, "Unable to undo this exact negative.");
  }
}
