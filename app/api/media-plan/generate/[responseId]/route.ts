import { NextResponse } from "next/server";

import {
  MediaPlanConfigError,
  MediaPlanInputError,
  MediaPlanOutputError,
  retrieveMediaPlanGeneration,
} from "@/lib/openai/generateMediaPlan";
import type { MediaPlanGenerateResponse } from "@/lib/media-plan/schema";
import { normalizeMediaPlanFormInput } from "@/lib/media-plan/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ responseId: string }> }
): Promise<NextResponse<MediaPlanGenerateResponse>> {
  try {
    const { responseId } = await params;
    const searchParams = new URL(request.url).searchParams;
    const formDefaults =
      searchParams.size > 0
        ? normalizeMediaPlanFormInput(Object.fromEntries(searchParams.entries()))
        : null;
    const result = await retrieveMediaPlanGeneration(decodeURIComponent(responseId || ""), formDefaults);

    if (result.status === "completed") {
      return NextResponse.json({
        success: true,
        status: result.status,
        plan: result.plan,
        openAi: result.openAi,
      });
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      openAi: result.openAi,
    });
  } catch (error) {
    if (error instanceof MediaPlanInputError || error instanceof MediaPlanOutputError) {
      console.warn("[media-plan:generate-route] poll_failed", {
        error: error.message,
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

    if (error instanceof MediaPlanConfigError) {
      console.error("[media-plan:generate-route] poll_configuration_failed", {
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

    const message = error instanceof Error ? error.message : "Unable to check media plan generation.";
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
