import { NextResponse } from "next/server";

import {
  MediaPlanConfigError,
  MediaPlanInputError,
  MediaPlanOutputError,
  startMediaPlanGeneration,
} from "@/lib/openai/generateMediaPlan";
import type { MediaPlanGenerateResponse } from "@/lib/media-plan/schema";
import { createGenerationProgress } from "@/lib/media-plan/progress";
import { normalizeMediaPlanFormInput } from "@/lib/media-plan/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse<MediaPlanGenerateResponse>> {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const input = normalizeMediaPlanFormInput(body);
    console.info("[media-plan:generate-route] request_started", {
      hasWebsiteUrl: Boolean(input.websiteUrl),
      hasGoogleCid: Boolean(input.googleCid),
      campaignType: input.campaignType,
    });
    const result = await startMediaPlanGeneration(input);
    const startedAt = result.openAi.startedAt || new Date().toISOString();

    if (result.status === "completed") {
      return NextResponse.json({
        success: true,
        status: result.status,
        plan: result.plan,
        openAi: result.openAi,
        progress: createGenerationProgress({
          status: "completed",
          startedAt,
          message: "Media plan generated successfully.",
        }),
      });
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      openAi: result.openAi,
      progress: createGenerationProgress({
        status: result.status,
        startedAt,
      }),
    });
  } catch (error) {
    if (error instanceof MediaPlanInputError || error instanceof MediaPlanOutputError) {
      console.warn("[media-plan:generate-route] request_failed", {
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
      console.error("[media-plan:generate-route] configuration_failed", {
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

    const message = error instanceof Error ? error.message : "Unable to generate media plan.";
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
