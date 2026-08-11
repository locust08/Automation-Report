import {
  createSearchCampaignFromMediaPlan,
  type CreateSearchCampaignFromMediaPlanResult,
} from "@/lib/google-ads/createSearchCampaignFromMediaPlan";
import { mediaPlanHasAssets } from "@/lib/media-plan/assets";
import type {
  MediaPlan,
  MediaPlanApproveAndCreateResponse,
  MediaPlanApproveSuccessResponse,
  MediaPlanCreateCampaignResponse,
  MediaPlanOperationProgress,
  MediaPlanProgressStreamEvent,
} from "@/lib/media-plan/schema";
import { APPROVE_CREATE_PROGRESS_STEPS, createApprovalProgress } from "@/lib/media-plan/progress";
import {
  approveMediaPlanToNotion,
  GoogleAdGroupSetupConfigError,
  GoogleAdGroupSetupValidationError,
  GoogleAdGroupSetupWriteError,
} from "@/lib/notion/googleAdGroupSetupRequests";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        const startedAt = new Date().toISOString();
        const completedStepIds = new Set<string>();
        let activeStepId = "validating_media_plan";
        let hasAssets = false;
        let approved: MediaPlanApproveSuccessResponse | null = null;

        function send(event: MediaPlanProgressStreamEvent) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }

        function currentProgress(input: {
          status?: MediaPlanOperationProgress["status"];
          statusLabel?: string;
          message?: string;
          failedStepId?: string;
        } = {}) {
          return createApprovalProgress({
            startedAt,
            activeStepId,
            completedStepIds: Array.from(completedStepIds),
            failedStepId: input.failedStepId,
            status: input.status,
            statusLabel: input.statusLabel,
            message: input.message,
          });
        }

        function emitStep(stepId: string, message?: string) {
          if (activeStepId && activeStepId !== stepId) {
            completedStepIds.add(activeStepId);
          }
          if (!hasAssets && stepId === "creating_notion_rows") {
            completedStepIds.add("uploading_assets");
          }
          activeStepId = stepId;
          send({ type: "progress", progress: currentProgress({ message }) });
        }

        try {
          send({
            type: "progress",
            progress: currentProgress({ message: "Preparing approval request." }),
          });

          const body = await readApprovalRequest(request);
          const googleCid = body.googleCid;
          hasAssets = mediaPlanHasAssets((body.mediaPlan ?? {}) as MediaPlan);

          approved = await approveMediaPlanToNotion({
            mediaPlan: body.mediaPlan as never,
            googleCid,
            source: "media-plan",
            clientRequestId: body.clientRequestId || undefined,
            batchId: body.batchId || undefined,
            assetFiles: body.assetFiles,
            onProgress: emitStep,
          });

          emitStep("connecting_google_ads", "Connecting to Google Ads.");

          const campaign = await createSearchCampaignFromMediaPlan({
            batchId: approved.batchId,
            googleCid,
            source: "media-plan",
            onProgress: emitStep,
          });

          if (!isDashboardResponse(campaign)) {
            const result: MediaPlanApproveAndCreateResponse = {
              success: false,
              source: "media-plan",
              batchId: approved.batchId,
              notionPageUrls: approved.notionPageUrls,
              error: "Dry-run response is not available from the dashboard route.",
              failedStep: "create_campaign",
            };
            send({
              type: "error",
              error: result.error,
              failedStep: result.failedStep,
              progress: currentProgress({
                status: "failed",
                statusLabel: "Failed",
                failedStepId: activeStepId,
                message: result.error,
              }),
            });
            controller.close();
            return;
          }

          if (!campaign.success) {
            send({
              type: "error",
              error: campaign.error,
              failedStep: campaign.failedStep,
              progress: currentProgress({
                status: "failed",
                statusLabel: "Failed",
                failedStepId: activeStepId,
                message: campaign.error,
              }),
            });
            controller.close();
            return;
          }

          APPROVE_CREATE_PROGRESS_STEPS.forEach((step) => completedStepIds.add(step.id));
          const finalProgress = createApprovalProgress({
            startedAt,
            completedStepIds: Array.from(completedStepIds),
            status: "completed",
            statusLabel: "Completed",
            message: "Paused campaign created successfully.",
          });
          send({ type: "progress", progress: finalProgress });
          send({
            type: "result",
            result: {
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
            },
          });
        } catch (error) {
          const failure = normalizeStreamingFailure(error, approved);
          send({
            type: "error",
            error: failure.error,
            issues: failure.issues,
            failedStep: failure.failedStep,
            progress: currentProgress({
              status: "failed",
              statusLabel: "Failed",
              failedStepId: activeStepId,
              message: failure.error,
            }),
          });
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
      },
    }
  );
}

function normalizeStreamingFailure(
  error: unknown,
  approved: MediaPlanApproveSuccessResponse | null
): {
  error: string;
  issues?: Array<{ path: string; message: string }>;
  failedStep: string;
  notionPageUrls?: string[];
} {
  if (error instanceof GoogleAdGroupSetupValidationError) {
    return {
      error: error.message,
      issues: error.issues,
      failedStep: "notion_approval",
    };
  }
  if (error instanceof GoogleAdGroupSetupConfigError || error instanceof GoogleAdGroupSetupWriteError) {
    return {
      error: error.message,
      failedStep: "notion_approval",
    };
  }
  return {
    error: error instanceof Error ? error.message : "Unable to approve and create Google Ads campaign.",
    failedStep: approved ? "create_campaign" : "notion_approval",
    notionPageUrls: approved?.notionPageUrls,
  };
}

async function readApprovalRequest(request: Request): Promise<{
  mediaPlan: unknown;
  googleCid: string;
  source: string;
  clientRequestId: string;
  batchId: string;
  assetFiles: Map<string, File>;
}> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const mediaPlanText = readString(formData.get("mediaPlan"));
    const assetFiles = new Map<string, File>();
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("assetFile:") && value instanceof File && value.size > 0) {
        assetFiles.set(key.slice("assetFile:".length), value);
      }
    }
    return {
      mediaPlan: safeJsonParse(mediaPlanText),
      googleCid: readString(formData.get("googleCid")),
      source: readString(formData.get("source")),
      clientRequestId: readString(formData.get("clientRequestId")),
      batchId: readString(formData.get("batchId")),
      assetFiles,
    };
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  return {
    mediaPlan: (body as Record<string, unknown>).mediaPlan,
    googleCid: readString((body as Record<string, unknown>).googleCid),
    source: readString((body as Record<string, unknown>).source),
    clientRequestId: readString((body as Record<string, unknown>).clientRequestId),
    batchId: readString((body as Record<string, unknown>).batchId),
    assetFiles: new Map(),
  };
}

function safeJsonParse(value: string): unknown {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
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
