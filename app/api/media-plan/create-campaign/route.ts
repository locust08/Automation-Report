import { NextResponse } from "next/server";

import {
  createSearchCampaignFromMediaPlan,
  type CreateSearchCampaignFromMediaPlanResult,
} from "@/lib/google-ads/createSearchCampaignFromMediaPlan";
import type { MediaPlanCreateCampaignResponse } from "@/lib/media-plan/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse<MediaPlanCreateCampaignResponse>> {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const batchId = readString((body as Record<string, unknown>).batchId);
    const googleCid = readString((body as Record<string, unknown>).googleCid);
    console.info("[media-plan:create-campaign-route] request_started", {
      batchId: batchId || null,
      hasGoogleCid: Boolean(googleCid),
    });

    if (!batchId.trim()) {
      return NextResponse.json({ success: false, error: "batchId is required.", failedStep: "validation" }, { status: 400 });
    }
    if (!/^MP-\d{8}-\d{6}$/.test(batchId.trim())) {
      return NextResponse.json(
        {
          success: false,
          error: "batchId must use MP-YYYYMMDD-HHMMSS format.",
          failedStep: "validation",
        },
        { status: 400 }
      );
    }
    if (!googleCid.trim()) {
      return NextResponse.json({ success: false, error: "googleCid is required.", failedStep: "validation" }, { status: 400 });
    }
    if (!/^\d{10}$/.test(googleCid.replace(/\D/g, ""))) {
      return NextResponse.json(
        {
          success: false,
          error: "googleCid must contain exactly 10 digits.",
          failedStep: "validation",
        },
        { status: 400 }
      );
    }

    const result = await createSearchCampaignFromMediaPlan({
      batchId,
      googleCid,
      source: "media-plan",
    });

    if (!isDashboardResponse(result)) {
      return NextResponse.json(
        {
          success: false,
          source: "media-plan",
          batchId,
          error: "Dry-run response is not available from the dashboard route.",
          failedStep: "create_campaign",
        },
        { status: 500 }
      );
    }

    if (result.success) {
      console.info("[media-plan:create-campaign-route] request_success", {
        batchId: result.batchId,
        campaignId: result.campaignId,
        campaignStatus: result.campaignStatus,
      });
    } else {
      console.warn("[media-plan:create-campaign-route] request_failed", {
        batchId: result.batchId ?? batchId,
        failedStep: result.failedStep,
        duplicate: result.duplicate,
        error: result.error,
      });
    }
    return NextResponse.json(result, { status: result.success ? 200 : result.duplicate ? 409 : 500 });
  } catch (error) {
    console.error("[media-plan:create-campaign-route] unhandled_failure", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unable to create Google Ads campaign.",
        failedStep: "create_campaign",
      },
      { status: 500 }
    );
  }
}

function isDashboardResponse(
  result: CreateSearchCampaignFromMediaPlanResult
): result is MediaPlanCreateCampaignResponse {
  return !("dryRun" in result && result.dryRun === true);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
