"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MediaPlanEditor } from "@/components/media-plan/MediaPlanEditor";
import { MediaPlanForm } from "@/components/media-plan/MediaPlanForm";
import { MediaPlanProgressCard } from "@/components/media-plan/MediaPlanProgressCard";
import { MediaPlanStatusBar } from "@/components/media-plan/MediaPlanStatus";
import { ReportShell } from "@/components/reporting/report-shell";
import {
  createEmptyMediaPlanAssets,
  getMediaPlanAssets,
} from "@/lib/media-plan/assets";
import {
  DEFAULT_MEDIA_PLAN_LANGUAGE,
  DEFAULT_MEDIA_PLAN_FORM,
  DEFAULT_NETWORK,
  MediaPlan,
  MediaPlanAsset,
  MediaPlanAssetKind,
  MediaPlanApproveAndCreateResponse,
  MediaPlanApproveSuccessResponse,
  MediaPlanCreateCampaignSuccessResponse,
  MediaPlanFormData,
  MediaPlanGenerateResponse,
  MediaPlanLanguage,
  MediaPlanOperationProgress,
  MediaPlanProgressStreamEvent,
  MediaPlanStatus,
  SUPPORTED_CAMPAIGN_TYPE,
} from "@/lib/media-plan/schema";
import { createApprovalProgress, createGenerationProgress } from "@/lib/media-plan/progress";
import {
  MediaPlanValidationIssue,
  validateMediaPlan,
  validateMediaPlanForm,
} from "@/lib/media-plan/validation";

const MEDIA_PLAN_GENERATION_POLL_INTERVAL_MS = 2_000;
const MEDIA_PLAN_HISTORY_LIMIT = 50;
type MediaPlanSource = "generated" | "mockup" | null;
type MediaPlanHistory = {
  past: MediaPlan[];
  future: MediaPlan[];
};

const EMPTY_MEDIA_PLAN_HISTORY: MediaPlanHistory = {
  past: [],
  future: [],
};

export function MediaPlanPageClient() {
  const [formData, setFormData] = useState<MediaPlanFormData>(DEFAULT_MEDIA_PLAN_FORM);
  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [planSource, setPlanSource] = useState<MediaPlanSource>(null);
  const [generateAttempted, setGenerateAttempted] = useState(false);
  const [edited, setEdited] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingToNotion, setSavingToNotion] = useState(false);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaignErrorLinks, setCampaignErrorLinks] = useState<string[]>([]);
  const [serverIssues, setServerIssues] = useState<MediaPlanValidationIssue[]>([]);
  const [openAiMeta, setOpenAiMeta] = useState<{ responseId: string | null; model: string | null } | null>(null);
  const [clientRequestId, setClientRequestId] = useState<string | null>(null);
  const [approvalResult, setApprovalResult] = useState<MediaPlanApproveSuccessResponse | null>(null);
  const [campaignResult, setCampaignResult] = useState<MediaPlanCreateCampaignSuccessResponse | null>(null);
  const [generationProgress, setGenerationProgress] = useState<MediaPlanOperationProgress | null>(null);
  const [approvalProgress, setApprovalProgress] = useState<MediaPlanOperationProgress | null>(null);
  const [progressClock, setProgressClock] = useState(Date.now());
  const [planHistory, setPlanHistory] = useState<MediaPlanHistory>(EMPTY_MEDIA_PLAN_HISTORY);
  const planRef = useRef<MediaPlan | null>(null);
  const assetFilesRef = useRef<Map<string, File>>(new Map());
  const assetPreviewUrlsRef = useRef<Set<string>>(new Set());

  const formValidation = useMemo(() => validateMediaPlanForm(formData), [formData]);
  const planValidation = useMemo(() => validateMediaPlan(plan), [plan]);
  const visibleFormIssues = useMemo(
    () => resolveVisibleFormIssues(formValidation.issues, generateAttempted, formData),
    [formData, formValidation.issues, generateAttempted]
  );
  const visiblePlanIssues = plan ? planValidation.issues : [];
  const visibleIssues = [...visibleFormIssues, ...visiblePlanIssues, ...serverIssues];
  const failed = Boolean(error) && serverIssues.length === 0;
  const ready = Boolean(plan) && formValidation.valid && planValidation.valid && serverIssues.length === 0;
  const canApprove = ready && !generating && !savingToNotion && !approvalResult;
  const currentStatus = resolveStatus({
    generated: Boolean(plan),
    generating,
    savingToNotion,
    savedToNotion: Boolean(approvalResult),
    creatingCampaign,
    createdCampaign: Boolean(campaignResult),
    failed,
    edited,
    hasValidationError: visibleIssues.length > 0,
    ready,
  });
  const activeStatuses = resolveActiveStatuses({
    generated: Boolean(plan),
    generating,
    savingToNotion,
    savedToNotion: Boolean(approvalResult),
    creatingCampaign,
    createdCampaign: Boolean(campaignResult),
    failed,
    edited,
    hasValidationError: visibleIssues.length > 0,
    ready,
  });
  const canUseHistory = Boolean(plan) && !generating && !savingToNotion && !creatingCampaign;
  const canUndo = canUseHistory && planHistory.past.length > 0;
  const canRedo = canUseHistory && planHistory.future.length > 0;
  const visibleGenerationProgress = useMemo(
    () => refreshProgressTiming(generationProgress, progressClock),
    [generationProgress, progressClock]
  );
  const visibleApprovalProgress = useMemo(
    () => refreshProgressTiming(approvalProgress, progressClock),
    [approvalProgress, progressClock]
  );

  function resetPlanHistory() {
    setPlanHistory(EMPTY_MEDIA_PLAN_HISTORY);
  }

  function clearStagedAssetFiles() {
    assetPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    assetPreviewUrlsRef.current.clear();
    assetFilesRef.current.clear();
  }

  function handleStageAssetFiles(kind: MediaPlanAssetKind, files: File[]): MediaPlanAsset[] {
    return files.map((file) => {
      const id = createClientRequestId();
      const previewUrl = URL.createObjectURL(file);
      assetFilesRef.current.set(id, file);
      assetPreviewUrlsRef.current.add(previewUrl);
      return {
        id,
        kind,
        name: file.name,
        size: file.size,
        type: file.type,
        previewUrl,
      };
    });
  }

  const setCurrentPlan = useCallback((nextPlan: MediaPlan | null) => {
    planRef.current = nextPlan;
    setPlan(nextPlan);
  }, []);

  useEffect(
    () => () => {
      assetPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      assetPreviewUrlsRef.current.clear();
      assetFilesRef.current.clear();
    },
    []
  );

  useEffect(() => {
    const hasRunningProgress =
      generationProgress?.status === "running" || approvalProgress?.status === "running";
    if (!hasRunningProgress) {
      return;
    }
    const interval = window.setInterval(() => setProgressClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [approvalProgress?.status, generationProgress?.status]);

  async function handleGenerate() {
    setGenerateAttempted(true);
    setError(null);
    setServerIssues([]);
    setOpenAiMeta(null);
    setApprovalResult(null);
    setCampaignResult(null);
    setApprovalProgress(null);
    setCampaignErrorLinks([]);

    if (!formValidation.valid) {
      return;
    }

    const generationStartedAt = new Date().toISOString();
    setGenerationProgress(
      createGenerationProgress({
        status: "queued",
        startedAt: generationStartedAt,
      })
    );
    setGenerating(true);
    try {
      const response = await fetch("/api/media-plan/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });
      const payload = (await response.json().catch(() => null)) as MediaPlanGenerateResponse | null;

      if (!payload) {
        throw new Error("Media plan generation returned an unreadable response.");
      }
      if (payload.success && payload.progress) {
        setGenerationProgress(payload.progress);
      }

      const completedPayload = await resolveGeneratedMediaPlan(payload, formData, setGenerationProgress);

      clearStagedAssetFiles();
      setCurrentPlan(completedPayload.plan);
      setPlanSource("generated");
      setOpenAiMeta(completedPayload.openAi);
      setClientRequestId(createClientRequestId());
      setEdited(false);
      resetPlanHistory();
      if (completedPayload.progress) {
        setGenerationProgress(completedPayload.progress);
      }
    } catch (generateError) {
      setServerIssues(readMediaPlanIssues(generateError));
      setError(generateError instanceof Error ? generateError.message : "Unable to generate media plan.");
      setGenerationProgress(
        createGenerationProgress({
          status: "failed",
          startedAt: generationProgress?.startedAt ?? generationStartedAt,
          message: generateError instanceof Error ? generateError.message : "Unable to generate media plan.",
        })
      );
    } finally {
      setGenerating(false);
    }
  }

  function handleMockup() {
    setGenerateAttempted(false);
    setError(null);
    setServerIssues([]);
    setOpenAiMeta(null);
    setApprovalResult(null);
    setCampaignResult(null);
    setGenerationProgress(null);
    setApprovalProgress(null);
    setCampaignErrorLinks([]);

    clearStagedAssetFiles();
    setCurrentPlan(buildMockupMediaPlan(formData));
    setPlanSource("mockup");
    setClientRequestId(createClientRequestId());
    setEdited(false);
    resetPlanHistory();
  }

  function handlePlanChange(nextPlan: MediaPlan) {
    const previousPlan = planRef.current;
    if (previousPlan) {
      setPlanHistory((currentHistory) => ({
        past: [...currentHistory.past, previousPlan].slice(-MEDIA_PLAN_HISTORY_LIMIT),
        future: [],
      }));
    }
    setCurrentPlan(nextPlan);
    setEdited(true);
    if (approvalResult) {
      setApprovalResult(null);
      setCampaignResult(null);
      setClientRequestId(createClientRequestId());
    }
    setError(null);
    setCampaignErrorLinks([]);
    setServerIssues([]);
  }

  const handleUndo = useCallback(() => {
    const currentPlan = planRef.current;
    if (!currentPlan || generating || savingToNotion || creatingCampaign) {
      return;
    }

    const previousPlan = planHistory.past.at(-1);
    if (!previousPlan) {
      return;
    }

    const remainingPast = planHistory.past.slice(0, -1);
    setCurrentPlan(previousPlan);
    setPlanHistory({
      past: remainingPast,
      future: [currentPlan, ...planHistory.future].slice(0, MEDIA_PLAN_HISTORY_LIMIT),
    });
    setEdited(remainingPast.length > 0);
    setError(null);
    setCampaignErrorLinks([]);
    setServerIssues([]);
  }, [creatingCampaign, generating, planHistory.future, planHistory.past, savingToNotion, setCurrentPlan]);

  const handleRedo = useCallback(() => {
    const currentPlan = planRef.current;
    if (!currentPlan || generating || savingToNotion || creatingCampaign) {
      return;
    }

    const nextPlan = planHistory.future[0];
    if (!nextPlan) {
      return;
    }

    setCurrentPlan(nextPlan);
    setPlanHistory({
      past: [...planHistory.past, currentPlan].slice(-MEDIA_PLAN_HISTORY_LIMIT),
      future: planHistory.future.slice(1),
    });
    setEdited(true);
    setError(null);
    setCampaignErrorLinks([]);
    setServerIssues([]);
  }, [creatingCampaign, generating, planHistory.future, planHistory.past, savingToNotion, setCurrentPlan]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        !plan ||
        generating ||
        savingToNotion ||
        creatingCampaign
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const requestsUndo = key === "z" && !event.shiftKey;
      const requestsRedo = key === "y" || (key === "z" && event.shiftKey);

      if (requestsUndo && planHistory.past.length > 0) {
        event.preventDefault();
        handleUndo();
      }
      if (requestsRedo && planHistory.future.length > 0) {
        event.preventDefault();
        handleRedo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    creatingCampaign,
    handleRedo,
    handleUndo,
    plan,
    planHistory.future.length,
    planHistory.past.length,
    generating,
    savingToNotion,
  ]);

  async function handleApprove() {
    setGenerateAttempted(true);
    setError(null);
    setServerIssues([]);
    setApprovalProgress(null);

    if (!plan || !formValidation.valid || !planValidation.valid) {
      return;
    }

    const requestId = clientRequestId || createClientRequestId();
    setClientRequestId(requestId);
    const approvalStartedAt = new Date().toISOString();
    setApprovalProgress(
      createApprovalProgress({
        startedAt: approvalStartedAt,
        activeStepId: "validating_media_plan",
        message: "Preparing approval request.",
      })
    );
    setSavingToNotion(true);
    setCreatingCampaign(true);
    try {
      const activeAssets = getMediaPlanAssets(plan);
      const missingAsset = activeAssets.find((asset) => !assetFilesRef.current.has(asset.id));
      if (missingAsset) {
        setServerIssues([
          {
            path: `assets.${missingAsset.kind}`,
            message: `Upload ${missingAsset.name} again before approval.`,
          },
        ]);
        throw new Error("One or more staged asset files are no longer available.");
      }

      const response = await fetch("/api/media-plan/approve-and-create/progress", buildApprovalRequest({
        mediaPlan: plan,
        googleCid: formData.googleCid,
        clientRequestId: requestId,
        assetFiles: assetFilesRef.current,
      }));
      const payload = await readApproveCreateProgressStream(response, setApprovalProgress);

      if (!payload) {
        const fallbackResponse = await fetch("/api/media-plan/approve-and-create", buildApprovalRequest({
          mediaPlan: plan,
          googleCid: formData.googleCid,
          clientRequestId: requestId,
          assetFiles: assetFilesRef.current,
        }));
        const fallbackPayload = (await fallbackResponse.json().catch(() => null)) as MediaPlanApproveAndCreateResponse | null;
        if (!fallbackPayload) {
          throw new Error("Media plan approval returned an unreadable response.");
        }
        handleApproveCreatePayload(fallbackPayload);
        return;
      }
      handleApproveCreatePayload(payload);
    } catch (approveError) {
      const streamedIssues = readMediaPlanIssues(approveError);
      if (streamedIssues.length > 0) {
        setServerIssues(streamedIssues);
      }
      setApprovalProgress((current) =>
        current
          ? {
              ...current,
              status: "failed",
              statusLabel: "Failed",
              message:
                approveError instanceof Error
                  ? approveError.message
                  : "Unable to save media plan to Notion and create paused campaign.",
              estimatedRemainingMs: null,
            }
          : createApprovalProgress({
              startedAt: approvalStartedAt,
              activeStepId: "validating_media_plan",
              failedStepId: "validating_media_plan",
              status: "failed",
              statusLabel: "Failed",
              message:
                approveError instanceof Error
                  ? approveError.message
                  : "Unable to save media plan to Notion and create paused campaign.",
            })
      );
      setError(
        approveError instanceof Error
          ? approveError.message
          : "Unable to save media plan to Notion and create paused campaign."
      );
    } finally {
      setSavingToNotion(false);
      setCreatingCampaign(false);
    }

    function handleApproveCreatePayload(payload: MediaPlanApproveAndCreateResponse) {
      if (!payload.success) {
        setServerIssues(payload.issues ?? []);
        setCampaignErrorLinks(payload.notionPageUrls ?? []);
        throw new Error(payload.error);
      }

      setApprovalResult({
        success: true,
        batchId: payload.batchId,
        notionPageUrls: payload.notionPageUrls,
        createdRowCount: payload.createdRowCount,
        status: payload.approvalStatus,
        duplicate: payload.duplicateApproval,
      });
      setCampaignResult({
        success: true,
        source: payload.source,
        batchId: payload.batchId,
        customerId: payload.customerId,
        campaignId: payload.campaignId,
        campaignResourceName: payload.campaignResourceName,
        campaignStatus: payload.campaignStatus,
        createdAdGroups: payload.createdAdGroups,
        createdAds: payload.createdAds,
        googleAdsReviewLink: payload.googleAdsReviewLink,
      });
      setEdited(false);
      resetPlanHistory();
      clearStagedAssetFiles();
      setApprovalProgress((current) =>
        current?.status === "completed"
          ? current
          : createApprovalProgress({
              startedAt: current?.startedAt ?? new Date().toISOString(),
              completedStepIds: [
                "validating_media_plan",
                "uploading_assets",
                "creating_notion_rows",
                "connecting_google_ads",
                "creating_paused_campaign",
                "returning_review_link",
              ],
              status: "completed",
              statusLabel: "Completed",
              message: "Paused campaign created successfully.",
            })
      );
    }
  }

  return (
    <ReportShell
      title="Media Plan"
      dateLabel={
        planSource === "mockup"
          ? "Google Search - Manual Mockup"
          : openAiMeta?.model
            ? `Google Search - ${openAiMeta.model}`
            : "Google Search"
      }
      reportReady={!generating && !savingToNotion && !creatingCampaign}
      headerBottomControl={
        <MediaPlanStatusBar
          currentStatus={currentStatus}
          issueCount={visibleIssues.length}
          activeStatuses={activeStatuses}
        />
      }
    >
      <div className="space-y-5">
        <MediaPlanForm
          value={formData}
          issues={visibleFormIssues}
          generateDisabled={savingToNotion}
          generating={generating}
          buttonLabel={resolveGenerateButtonLabel(planSource, Boolean(plan))}
          onChange={setFormData}
          onGenerate={handleGenerate}
          onMockup={handleMockup}
        />

        {visibleGenerationProgress?.status === "running" ? (
          <MediaPlanProgressCard progress={visibleGenerationProgress} />
        ) : null}
        {visibleApprovalProgress?.status === "running" ? (
          <MediaPlanProgressCard progress={visibleApprovalProgress} />
        ) : null}

        {error ? (
          <section className="rounded-2xl border border-[#fecdd3] bg-[#fff1f2] p-4 text-[#9f1239] shadow-sm">
            <p className="text-sm font-semibold">{error}</p>
            {serverIssues.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {serverIssues.map((issue) => (
                  <li key={`${issue.path}:${issue.message}`}>
                    <span className="font-medium">{issue.path}:</span> {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
            {campaignErrorLinks.length > 0 ? (
              <div className="mt-2 grid gap-1 text-sm">
                {campaignErrorLinks.map((url, index) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline underline-offset-4"
                  >
                    Notion row {index + 1}
                  </a>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {approvalResult ? <ApprovalSummary result={approvalResult} /> : null}
        {campaignResult ? <CampaignSummary result={campaignResult} /> : null}

        <MediaPlanEditor
          plan={plan}
          issues={[...visiblePlanIssues, ...serverIssues]}
          canApprove={canApprove}
          savingToNotion={savingToNotion}
          approvalResult={approvalResult}
          creatingCampaign={creatingCampaign}
          campaignResult={campaignResult}
          canUndo={canUndo}
          canRedo={canRedo}
          onChange={handlePlanChange}
          onStageAssetFiles={handleStageAssetFiles}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onApprove={handleApprove}
        />
      </div>
    </ReportShell>
  );
}

function buildMockupMediaPlan(formData: MediaPlanFormData): MediaPlan {
  const websiteUrl = formData.websiteUrl.trim();
  const language = normalizeMockupLanguage(formData.language);

  return {
    batchPreviewId: `MP-MOCKUP-${Date.now()}`,
    campaign: {
      campaignName: "",
      brandOrClientName: "",
      businessName: "",
      campaignObjective: "Leads",
      campaignType: "Search",
      biddingStrategy: "Conversions",
      websiteUrl,
      finalUrl: websiteUrl,
      startDate: getTodayDate(),
      averageDailyBudget: calculateAverageDailyBudget(formData.adBudget),
      targetCPA: null,
      network: [DEFAULT_NETWORK],
      networkNotes: "Google Search only.",
      targetLocation: [formData.targetLocation.trim()],
      language: [language],
    },
    adGroups: [
      {
        adGroupName: "",
        intentType: "",
        keywords: [{ text: "", matchType: "BROAD" }],
        displayPath1: "",
        displayPath2: "",
        headlines: ["", "", ""],
        descriptions: ["", ""],
        sitelinks: [],
      },
    ],
    planningNotes: {
      strategy: formData.specialRemarks.trim(),
      assumptions: [],
      warnings: [],
    },
    assets: createEmptyMediaPlanAssets(),
  };
}

function buildApprovalRequest({
  mediaPlan,
  googleCid,
  clientRequestId,
  assetFiles,
}: {
  mediaPlan: MediaPlan;
  googleCid: string;
  clientRequestId: string;
  assetFiles: Map<string, File>;
}): RequestInit {
  const assets = getMediaPlanAssets(mediaPlan);
  if (assets.length === 0) {
    return {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mediaPlan,
        googleCid,
        source: "media-plan",
        clientRequestId,
      }),
    };
  }

  const formData = new FormData();
  formData.append("mediaPlan", JSON.stringify(mediaPlan));
  formData.append("googleCid", googleCid);
  formData.append("source", "media-plan");
  formData.append("clientRequestId", clientRequestId);
  for (const asset of assets) {
    const file = assetFiles.get(asset.id);
    if (file) {
      formData.append(`assetFile:${asset.id}`, file, asset.name);
    }
  }

  return {
    method: "POST",
    body: formData,
  };
}

function calculateAverageDailyBudget(adBudget: string): number {
  const amount = Number(adBudget.replace(/,/g, "").trim());
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  return Math.round((amount / 30) * 100) / 100;
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeMockupLanguage(value: string): MediaPlanLanguage {
  if (value === "English" || value === "Malay" || value === "Chinese") {
    return value;
  }
  return DEFAULT_MEDIA_PLAN_LANGUAGE;
}

function resolveGenerateButtonLabel(planSource: MediaPlanSource, hasPlan: boolean): string {
  if (!hasPlan || planSource === "mockup") {
    return "Generate Media Plan";
  }
  return "Regenerate Media Plan";
}

async function resolveGeneratedMediaPlan(
  payload: MediaPlanGenerateResponse,
  formData: MediaPlanFormData,
  onProgress?: (progress: MediaPlanOperationProgress) => void
): Promise<Extract<MediaPlanGenerateResponse, { success: true; status: "completed" }>> {
  if (!payload.success) {
    throwMediaPlanResponseError(payload);
  }

  if (payload.status === "completed") {
    if (payload.progress) {
      onProgress?.(payload.progress);
    }
    return payload;
  }

  let current = payload;
  while (true) {
    await sleep(MEDIA_PLAN_GENERATION_POLL_INTERVAL_MS);
    const params = new URLSearchParams({
      websiteUrl: formData.websiteUrl,
      adBudget: formData.adBudget,
      googleCid: formData.googleCid,
      campaignType: formData.campaignType,
      targetLocation: formData.targetLocation,
      language: formData.language,
    });
    const response = await fetch(`/api/media-plan/generate/${encodeURIComponent(current.openAi.responseId)}?${params}`, {
      cache: "no-store",
    });
    const nextPayload = (await response.json().catch(() => null)) as MediaPlanGenerateResponse | null;

    if (!nextPayload) {
      throw new Error("Media plan generation returned an unreadable polling response.");
    }
    if (!nextPayload.success) {
      if (isRetryableMediaPlanPollingError(nextPayload.error)) {
        continue;
      }
      throwMediaPlanResponseError(nextPayload);
    }
    if (nextPayload.progress) {
      onProgress?.(nextPayload.progress);
    }
    if (nextPayload.status === "completed") {
      return nextPayload;
    }

    current = nextPayload;
  }
}

async function readApproveCreateProgressStream(
  response: Response,
  onProgress: (progress: MediaPlanOperationProgress) => void
): Promise<MediaPlanApproveAndCreateResponse | null> {
  if (!response.body) {
    return null;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const event = parseProgressStreamEvent(line);
      if (!event) {
        continue;
      }
      if (event.type === "progress") {
        onProgress(event.progress);
      }
      if (event.type === "result") {
        return event.result;
      }
      if (event.type === "error") {
        if (event.progress) {
          onProgress(event.progress);
        }
        const error = new Error(event.error) as Error & {
          issues?: MediaPlanValidationIssue[];
          notionPageUrls?: string[];
        };
        error.issues = event.issues;
        throw error;
      }
    }

    if (done) {
      break;
    }
  }

  const finalEvent = parseProgressStreamEvent(buffer);
  if (finalEvent?.type === "result") {
    return finalEvent.result;
  }
  if (finalEvent?.type === "progress") {
    onProgress(finalEvent.progress);
  }
  if (finalEvent?.type === "error") {
    if (finalEvent.progress) {
      onProgress(finalEvent.progress);
    }
    throw new Error(finalEvent.error);
  }

  return null;
}

function parseProgressStreamEvent(value: string): MediaPlanProgressStreamEvent | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as MediaPlanProgressStreamEvent;
  } catch {
    return null;
  }
}

function refreshProgressTiming(
  progress: MediaPlanOperationProgress | null,
  now: number
): MediaPlanOperationProgress | null {
  if (!progress) {
    return null;
  }
  if (progress.operation === "generate" && progress.status === "running") {
    return createGenerationProgress({
      status: progress.statusLabel === "Queued" ? "queued" : "in_progress",
      startedAt: progress.startedAt,
      message: progress.message,
      now,
    });
  }

  if (progress.operation === "approve_create") {
    const activeStep = progress.steps.find((step) => step.status === "in_progress");
    const failedStep = progress.steps.find((step) => step.status === "failed");
    return createApprovalProgress({
      startedAt: progress.startedAt,
      activeStepId: activeStep?.id,
      completedStepIds: progress.steps
        .filter((step) => step.status === "completed")
        .map((step) => step.id),
      failedStepId: failedStep?.id,
      status: progress.status,
      statusLabel: progress.statusLabel,
      message: progress.message,
      now,
    });
  }

  return {
    ...progress,
    elapsedMs: Math.max(0, now - Date.parse(progress.startedAt)),
  };
}

function throwMediaPlanResponseError(payload: Extract<MediaPlanGenerateResponse, { success: false }>): never {
  const error = new Error(payload.error) as Error & {
    issues?: MediaPlanValidationIssue[];
  };
  error.issues = payload.issues;
  throw error;
}

function isRetryableMediaPlanPollingError(message: string): boolean {
  return message.toLowerCase().includes("timed out; still no valid response");
}

function readMediaPlanIssues(error: unknown): MediaPlanValidationIssue[] {
  if (!error || typeof error !== "object" || !("issues" in error) || !Array.isArray(error.issues)) {
    return [];
  }

  return error.issues.filter(
    (issue): issue is MediaPlanValidationIssue =>
      Boolean(issue) &&
      typeof issue === "object" &&
      "path" in issue &&
      typeof issue.path === "string" &&
      "message" in issue &&
      typeof issue.message === "string"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveActiveStatuses(input: {
  generated: boolean;
  generating: boolean;
  savingToNotion: boolean;
  savedToNotion: boolean;
  creatingCampaign: boolean;
  createdCampaign: boolean;
  failed: boolean;
  edited: boolean;
  hasValidationError: boolean;
  ready: boolean;
}): MediaPlanStatus[] {
  if (input.failed) {
    return ["Failed"];
  }
  if (input.createdCampaign) {
    return ["Generated", "Saved to Notion", "Created Paused"];
  }
  if (input.creatingCampaign && input.savingToNotion) {
    return ["Generated", "Saving to Notion", "Creating Google Ads Campaign"];
  }
  if (input.creatingCampaign) {
    return ["Generated", "Saved to Notion", "Creating Google Ads Campaign"];
  }
  if (input.savedToNotion) {
    return ["Generated", "Ready for Approval", "Saved to Notion"];
  }
  if (input.savingToNotion) {
    return ["Generated", "Ready for Approval", "Saving to Notion"];
  }
  if (input.generating) {
    return input.generated ? ["Generated", "Generating"] : ["Draft", "Generating"];
  }

  if (!input.generated) {
    return ["Draft"];
  }

  if (input.hasValidationError) {
    return ["Generated", ...(input.edited ? (["Edited"] as MediaPlanStatus[]) : []), "Validation Error"];
  }

  return [
    "Generated",
    ...(input.edited ? (["Edited"] as MediaPlanStatus[]) : []),
    ...(input.ready ? (["Ready for Approval"] as MediaPlanStatus[]) : []),
  ];
}

function resolveVisibleFormIssues(
  issues: MediaPlanValidationIssue[],
  generateAttempted: boolean,
  formData: MediaPlanFormData
): MediaPlanValidationIssue[] {
  if (generateAttempted) {
    return issues;
  }

  return issues.filter(
    (issue) => issue.path === "campaignType" && formData.campaignType.trim() !== SUPPORTED_CAMPAIGN_TYPE
  );
}

function resolveStatus(input: {
  generated: boolean;
  generating: boolean;
  savingToNotion: boolean;
  savedToNotion: boolean;
  creatingCampaign: boolean;
  createdCampaign: boolean;
  failed: boolean;
  edited: boolean;
  hasValidationError: boolean;
  ready: boolean;
}): MediaPlanStatus {
  if (input.failed) {
    return "Failed";
  }
  if (input.createdCampaign) {
    return "Created Paused";
  }
  if (input.creatingCampaign) {
    return "Creating Google Ads Campaign";
  }
  if (input.savedToNotion) {
    return "Saved to Notion";
  }
  if (input.savingToNotion) {
    return "Saving to Notion";
  }
  if (input.generating) {
    return "Generating";
  }
  if (!input.generated) {
    return "Draft";
  }
  if (input.hasValidationError) {
    return "Validation Error";
  }
  if (input.ready) {
    return "Ready for Approval";
  }
  if (input.edited) {
    return "Edited";
  }
  return "Generated";
}

function CampaignSummary({ result }: { result: MediaPlanCreateCampaignSuccessResponse }) {
  return (
    <section className="rounded-2xl border border-[#bfdbfe] bg-[#eff6ff] p-4 text-[#1d4ed8] shadow-sm">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">Created Paused</p>
        <p className="text-sm">
          Campaign ID: <span className="font-semibold">{result.campaignId}</span>
        </p>
        <p className="text-sm">
          Notion batch ID: <span className="font-semibold">{result.batchId}</span>
        </p>
      </div>
      <a
        href={result.googleAdsReviewLink}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex text-sm font-semibold underline underline-offset-4"
      >
        Open Google Ads review
      </a>
    </section>
  );
}

function createClientRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `media-plan-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ApprovalSummary({ result }: { result: MediaPlanApproveSuccessResponse }) {
  return (
    <section className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-4 text-[#166534] shadow-sm">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">
          Status: Ready for Setup{result.duplicate ? " (existing batch reused)" : ""}
        </p>
        <p className="text-sm">
          Batch ID: <span className="font-semibold">{result.batchId}</span>
        </p>
        <p className="text-sm">Created row count: {result.createdRowCount}</p>
      </div>
      {result.notionPageUrls.length > 0 ? (
        <div className="mt-3 grid gap-1 text-sm">
          {result.notionPageUrls.map((url, index) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-4"
            >
              Notion row {index + 1}
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}
