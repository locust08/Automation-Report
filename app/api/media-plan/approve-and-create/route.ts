import { NextResponse } from "next/server";

import {
  createSearchCampaignFromMediaPlan,
  type CreateSearchCampaignFromMediaPlanResult,
} from "@/lib/google-ads/createSearchCampaignFromMediaPlan";
import type {
  MediaPlanApproveAndCreateResponse,
  MediaPlanCreateCampaignResponse,
} from "@/lib/media-plan/schema";
import {
  approveMediaPlanToNotion,
  GoogleAdGroupSetupConfigError,
  GoogleAdGroupSetupValidationError,
  GoogleAdGroupSetupWriteError,
} from "@/lib/notion/googleAdGroupSetupRequests";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request): Promise<NextResponse<MediaPlanApproveAndCreateResponse>> {
  let approved:
    | {
        batchId: string;
        notionPageUrls: string[];
        createdRowCount: number;
        status: "ready_for_setup";
        duplicate: boolean;
      }
    | null = null;

  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const googleCid = readString((body as Record<string, unknown>).googleCid);
    console.info("[media-plan:approve-and-create-route] request_started", {
      hasMediaPlan: Boolean((body as Record<string, unknown>).mediaPlan),
      hasGoogleCid: Boolean(googleCid),
      clientRequestId: readString((body as Record<string, unknown>).clientRequestId) || null,
    });

    approved = await approveMediaPlanToNotion({
      mediaPlan: (body as Record<string, unknown>).mediaPlan as never,
      googleCid,
      source: "media-plan",
      clientRequestId: readString((body as Record<string, unknown>).clientRequestId) || undefined,
      batchId: readString((body as Record<string, unknown>).batchId) || undefined,
    });

    console.info("[media-plan:approve-and-create-route] notion_approval_success", {
      batchId: approved.batchId,
      rowCount: approved.createdRowCount,
      duplicate: approved.duplicate,
    });

    const campaign = await createSearchCampaignFromMediaPlan({
      batchId: approved.batchId,
      googleCid,
      source: "media-plan",
    });

    if (!isDashboardResponse(campaign)) {
      return NextResponse.json(
        {
          success: false,
          source: "media-plan",
          batchId: approved.batchId,
          notionPageUrls: approved.notionPageUrls,
          error: "Dry-run response is not available from the dashboard route.",
          failedStep: "create_campaign",
        },
        { status: 500 }
      );
    }

    if (!campaign.success) {
      console.warn("[media-plan:approve-and-create-route] google_ads_creation_failed", {
        batchId: campaign.batchId ?? approved.batchId,
        failedStep: campaign.failedStep,
        duplicate: campaign.duplicate,
        error: campaign.error,
      });
      return NextResponse.json(
        {
          ...campaign,
          batchId: campaign.batchId ?? approved.batchId,
          notionPageUrls:
            campaign.notionPageUrls && campaign.notionPageUrls.length > 0
              ? campaign.notionPageUrls
              : approved.notionPageUrls,
        },
        { status: campaign.duplicate ? 409 : 500 }
      );
    }

    console.info("[media-plan:approve-and-create-route] request_success", {
      batchId: approved.batchId,
      campaignId: campaign.campaignId,
      campaignStatus: campaign.campaignStatus,
    });

    return NextResponse.json({
      success: true,
      source: "media-plan",
      batchId: approved.batchId,
      notionPageUrls: approved.notionPageUrls,
      createdRowCount: approved.createdRowCount,
      approvalStatus: approved.status,
      duplicateApproval: approved.duplicate,
      customerId: campaign.customerId,
      campaignId: campaign.campaignId,
      campaignResourceName: campaign.campaignResourceName,
      campaignStatus: campaign.campaignStatus,
      createdAdGroups: campaign.createdAdGroups,
      createdAds: campaign.createdAds,
      googleAdsReviewLink: campaign.googleAdsReviewLink,
    });
  } catch (error) {
    if (error instanceof GoogleAdGroupSetupValidationError) {
      console.warn("[media-plan:approve-and-create-route] validation_failed", {
        paths: error.issues.map((issue) => issue.path),
      });
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          issues: error.issues,
          failedStep: "notion_approval",
        },
        { status: error.httpStatus }
      );
    }

    if (error instanceof GoogleAdGroupSetupConfigError || error instanceof GoogleAdGroupSetupWriteError) {
      console.error("[media-plan:approve-and-create-route] notion_approval_failed", {
        error: error.message,
      });
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          failedStep: "notion_approval",
        },
        { status: error.httpStatus }
      );
    }

    console.error("[media-plan:approve-and-create-route] unhandled_failure", {
      batchId: approved?.batchId ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        success: false,
        source: "media-plan",
        batchId: approved?.batchId,
        notionPageUrls: approved?.notionPageUrls,
        error: error instanceof Error ? error.message : "Unable to approve and create Google Ads campaign.",
        failedStep: approved ? "create_campaign" : "notion_approval",
      },
      { status: 500 }
    );
  }
}

function isDashboardResponse(
  result: CreateSearchCampaignFromMediaPlanResult
): result is MediaPlanCreateCampaignResponse {
  return !("dryRun" in result && result.dryRun === true) && !("validateOnly" in result && result.validateOnly === true);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
