import { NextResponse } from "next/server";

import {
  approveMediaPlanToNotion,
  GoogleAdGroupSetupConfigError,
  GoogleAdGroupSetupValidationError,
  GoogleAdGroupSetupWriteError,
} from "@/lib/notion/googleAdGroupSetupRequests";
import type { MediaPlanApproveResponse } from "@/lib/media-plan/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse<MediaPlanApproveResponse>> {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    console.info("[media-plan:approve-route] request_started", {
      hasMediaPlan: Boolean((body as Record<string, unknown>).mediaPlan),
      hasGoogleCid: Boolean(readString((body as Record<string, unknown>).googleCid)),
      clientRequestId: readString((body as Record<string, unknown>).clientRequestId) || null,
    });
    const result = await approveMediaPlanToNotion({
      mediaPlan: (body as Record<string, unknown>).mediaPlan as never,
      googleCid: readString((body as Record<string, unknown>).googleCid),
      source: readString((body as Record<string, unknown>).source) as "media-plan",
      clientRequestId: readString((body as Record<string, unknown>).clientRequestId) || undefined,
      batchId: readString((body as Record<string, unknown>).batchId) || undefined,
    });

    console.info("[media-plan:approve-route] request_success", {
      batchId: result.batchId,
      rowCount: result.createdRowCount,
      duplicate: result.duplicate,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GoogleAdGroupSetupValidationError) {
      console.warn("[media-plan:approve-route] validation_failed", {
        paths: error.issues.map((issue) => issue.path),
      });
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          issues: error.issues,
        },
        { status: error.httpStatus }
      );
    }

    if (error instanceof GoogleAdGroupSetupConfigError || error instanceof GoogleAdGroupSetupWriteError) {
      console.error("[media-plan:approve-route] request_failed", {
        error: error.message,
      });
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: error.httpStatus }
      );
    }

    const message = error instanceof Error ? error.message : "Unable to save media plan to Notion.";
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
